// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Same answer as csv-reader 1.0.0 for every input, computed faster: instead of
// walking the text one character at a time, each field jumps straight to its
// next delimiter with one native regex scan (/[,\n\r]/ outside quotes,
// /["\n\r]/ inside them), and slices the field out whole. Nothing is kept
// from one call to the next.
//
// Semantics (csv-reader 1.0.0's written policy, implemented exactly):
// - a U+FEFF at the very start is dropped;
// - a record ends at LF or CRLF; a line left with no characters is no record;
// - outside quotes a CR not followed by LF is dropped (stray_cr);
// - a field opening with a quote runs to the next quote that is not doubled,
//   "" inside it is one quote, and each CRLF or lone CR inside it reads as
//   LF; what follows the closing quote, up to the next comma or line break,
//   is appended as it stands (quote_junk, when the field ends); a quote that
//   never closes is a literal character and the text after it is read again
//   as unquoted (unterminated_quote);
// - a quote inside an unquoted field is a literal character; fields stay
//   strings, never trimmed or converted;
// - columns is the first record when header is true, else null; rows holds
//   the records after it, each padded (short_row, with fields: its count) or
//   cut (long_row, with extra: the cut fields) to the first record's width;
// - each error is {code, line, row}, in the order met: line the 1-based line
//   its record starts on, row its record's index in rows (null for the
//   header).

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// Shared scanners: one native scan finds the next delimiter of either kind.
// lastIndex is set before every exec; run() is synchronous and never
// re-enters itself, so sharing them is safe.
const UNQUOTED_DELIM = /[,\n\r]/g;
const QUOTED_DELIM = /["\n\r]/g;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Every error of the record carries these.
  let recordLine = 1;
  let recordRow = null;

  // How the last field read ended.
  let ended = END;

  // Reads an unquoted field from pos, starting with the characters already in
  // `value` ('' for a fresh field, the quoted value for quote junk, '"' for an
  // unterminated quote read again). Sets `ended` and returns the field.
  // A CR not followed by LF is dropped and records stray_cr; the field goes
  // on after it.
  function unquoted(value) {
    let start = pos;
    const delim = UNQUOTED_DELIM;
    for (;;) {
      delim.lastIndex = pos;
      const m = delim.exec(text);
      if (m === null) {
        if (start < n) value += text.slice(start);
        pos = n;
        ended = END;
        return value;
      }
      const i = m.index;
      const ch = m[0];
      if (ch === ',') {
        if (start < i) value += text.slice(start, i);
        pos = i + 1;
        ended = COMMA;
        return value;
      }
      if (ch === '\n') {
        if (start < i) value += text.slice(start, i);
        pos = i + 1;
        line += 1;
        ended = LINE_BREAK;
        return value;
      }
      // A CR: CRLF ends the field, a lone CR is dropped with stray_cr.
      if (text.charCodeAt(i + 1) === 10) {
        if (start < i) value += text.slice(start, i);
        pos = i + 2;
        line += 1;
        ended = LINE_BREAK;
        return value;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (start < i) value += text.slice(start, i);
      pos = i + 1;
      start = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets `ended` and
  // returns the field.
  function quoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let p = pos + 1; // just past the opening quote
    const qdelim = QUOTED_DELIM;
    for (;;) {
      qdelim.lastIndex = p;
      const m = qdelim.exec(text);
      if (m === null) {
        // No quote and no line break left: the quote never closes. It is a
        // literal character, and the text after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return unquoted('"');
      }
      const i = m.index;
      const ch = m[0];
      if (ch === '"') {
        if (text.charCodeAt(i + 1) === 34) {
          // A doubled quote is one literal quote.
          value += text.slice(p, i);
          value += '"';
          p = i + 2;
          continue;
        }
        // The closing quote.
        value += text.slice(p, i);
        pos = i + 1;
        break;
      }
      // A line break inside quotes reads as one LF.
      value += text.slice(p, i);
      value += '\n';
      line += 1;
      p = ch === '\r' && text.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
    }
    // Closed. What follows decides how the field ends.
    if (pos >= n) {
      ended = END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      ended = COMMA;
      return value;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      ended = LINE_BREAK;
      return value;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      ended = LINE_BREAK;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    const before = value.length;
    const junk = unquoted(value);
    if (junk.length > before) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let isQuoted;
    do {
      isQuoted = text.charCodeAt(pos) === 34;
      fields.push(isQuoted ? quoted() : unquoted(''));
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !isQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}

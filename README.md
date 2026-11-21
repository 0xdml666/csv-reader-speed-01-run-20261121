# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/0xdml666/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/0xdml666/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: it answers exactly as the reference does on every broken CSV input, but reads each field with one native regex scan for its next delimiter instead of walking the text one character at a time. On the kit's practice set (6 cases, ~10 MB of CSV) `run()` takes about a third of csv-reader 1.0.0's CPU time.

## Run it

```sh
mkdir -p /tmp/csv-in /tmp/csv-out && cp cases.json /tmp/csv-in/ && MAKEFUN_INPUT_DIR=/tmp/csv-in MAKEFUN_OUTPUT_DIR=/tmp/csv-out node main.ts
```

`main.ts` (Node 22, no dependencies) reads every case from `cases.json` in the input directory, answers each with `run()` from `solve.js`, and writes `answers.json` to the output directory. Deterministic: two runs on the same input produce byte-identical output.

## How it works

`run({text, header})` returns `{columns, rows, errors}` with csv-reader 1.0.0's exact broken-row policy: BOM dropped, CRLF/LF record ends, lone CR outside quotes dropped (`stray_cr`), quoted fields with doubled quotes and LF-normalised line breaks, junk after a closing quote (`quote_junk`), unterminated quotes re-read as unquoted (`unterminated_quote`), short rows padded and long rows cut to the first record's width. The speed comes from scanning with a shared `/[,\n\r]/` (or `/["\n\r]/` inside quotes) regex for the next delimiter instead of per-character dispatch, so plain fields cost one slice each.

---

<sub>Entered on [make.fun](https://make.fun/?ref=j54m1ph6&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

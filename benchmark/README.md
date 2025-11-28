# @marcbachmann/cel-js Performance Benchmarks

This folder hosts the official benchmarking scripts for @marcbachmann/cel-js. The goal is to
provide a repeatable way to measure parse and evaluation throughput for the expressions we care
about most, capture structured JSON artifacts, and track regressions over time.

## What gets measured?

`benchmark/index.js` keeps a single `TEST_EXPRESSIONS` array that covers literals, arithmetic,
logical expressions, list/map operations, macros, and a few real-world authorization snippets. The
script builds two [`bench-node`](https://www.npmjs.com/package/bench-node) suites from that shared
data:

- **Parsing suite** – runs `parse()` repeatedly for each expression.
- **Evaluation suite** – parses once per expression, then benchmarks repeated evaluations with the
  provided context objects.

Each benchmark emits operations-per-second plus the raw histogram information that bench-node
captures. The suite focuses exclusively on our runtime so we can spot regressions quickly without
juggling extra configuration.

## Setup

```bash
# from the repository root
npm install

# run the full benchmark suite (adds --allow-natives-syntax automatically)
npm run benchmark

# or run manually
node --allow-natives-syntax benchmark/index.js
```

The script refuses to run unless `--allow-natives-syntax` is present, because bench-node relies on a
V8 internal for accurate sampling. The npm script handles this flag for you.

There are no CLI flags anymore—the benchmark always uses the pretty reporter, prints results to the
console, and exits.

## Sample console output

Using the default reporter:

```
════════════════════════════════════════════════════════════
@marcbachmann/cel-js Performance Benchmark Suite
════════════════════════════════════════════════════════════
Node.js: v20.11.0
Platform: darwin arm64
Reporter: pretty
# built-in reporter output only
Test expressions: 32

============================================================
PARSING BENCHMARKS
============================================================
[parse] Simple Number                 7,460,482 ops/sec (11 runs sampled)
[parse] Array Creation                1,471,597 ops/sec (10 runs sampled)
...

============================================================
EVALUATION BENCHMARKS
============================================================
[eval] Simple Number                 50,743,607 ops/sec (10 runs sampled)
[eval] Authorization Check            1,250,031 ops/sec (10 runs sampled)
...
```

Because we now standardize on the pretty reporter, everyone sees the same output, which keeps
comparisons simple when reviewing PRs or CI logs.

## Adding or focusing tests

- Append new cases to `TEST_EXPRESSIONS` in `benchmark/index.js`.
- Set `only: true` on any object to focus the run on those expressions.
- Provide realistic `context` objects so evaluation benchmarks exercise the same paths as real
  workloads.

## Troubleshooting

- **Missing --allow-natives-syntax** – rerun via `npm run benchmark` or add the flag manually.
- **Reporter errors** – double-check the reporter name matches one of the allowed values.
- **Missing output** – the script only writes to stdout; capture the terminal output if you need to
  compare runs later.


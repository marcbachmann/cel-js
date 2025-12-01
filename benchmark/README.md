# Benchmark Suite

This directory contains the micro-benchmark harness for the `cel-js` parser and evaluator. It exercises both parsing and evaluation hot paths for every major language feature and can compare the current branch against previously captured results.

## Layout

- `index.js` – entry point that wires the `bench-node` runner, loads suites, formats output, and optionally persists snapshots.
- `package.json` – local dependency on `bench-node`; benchmarks run with Node 20.19+ and require `--allow-natives-syntax`.
- `suites/*.js` – individual benchmark definitions (arrays of `{name, expression, context}` objects) grouped by feature area.
- `results/<tag>/<suite>.json` – JSON snapshots produced with `--save`; `latest/` is the default compare target.

## Prerequisites

From the repository root, install dependencies and ensure you are on Node 20.19 or newer:

```sh
npm install
```

> **Note:** The benchmark script automatically forwards `--expose-gc --allow-natives-syntax` to Node because `bench-node` relies on V8 native hooks. Running `node benchmark/index.js` manually must include those flags.

## Running benchmarks

- All suites: `npm run benchmark`
- Specific suites: `npm run benchmark -- --suite=macros --suite=logic`
- Direct invocation: `node --expose-gc --allow-natives-syntax benchmark/index.js --suite=macros`

When any test object in a suite file sets `only: true`, only that case (and the resulting parse/eval pair) runs.

## CLI options

| Option | Description |
| --- | --- |
| `--suite <name>` | Limit execution to one or more suite names (matching filenames under `suites/`). Repeat the flag to run multiple suites. |
| `--save <tag>` | Persist snapshots under `benchmark/results/<tag>/`. Accepts `false` (disable, default), `true`/`latest`, or `timestamp` which expands to `YYYY-MM-DDTHH-mm-ss-mmm`. |
| `--compare <tag>` | Annotate console output by comparing against a previously saved snapshot (defaults to `latest` when available). |

Snapshots retain normalized stats (ops/sec, min/max, samples) to keep diffs readable.

## Available suites

| Suite | Focus |
| --- | --- |
| `literals` | Numeric, string, boolean, and identifier literal parsing/evaluation. |
| `arithmetic` | Numeric expressions exercising addition/multiplication overloads. |
| `accessors` | Variable lookups, property traversal, indexing, and membership checks. |
| `collections` | Creation/access of lists/maps plus nested aggregates. |
| `logic` | Logical operators, ternaries, and authorization-style predicates. |
| `functions` | Built-in helpers (string methods, regex, custom calls). |
| `macros` | CEL macro expansions (`has`, `.map`, `.filter`, etc.). |

Each benchmark entry automatically yields `parse/<suite>/<name>` and `eval/<suite>/<name>` measurements.

## Example output

```
$ npm run benchmark -- --suite=macros
Benchmark results for 'macros' (8 total):
Plugins enabled: V8NeverOptimizePlugin
├─ parse
│ └─ general
│   ├─ List .filter and .map                           1,196,079 ops/sec min..max=(831.08ns...838.27ns)  faster (1.01x, 0.79%, was 1,186,756 ops/sec)
│   ├─ Multiple list .map calls                        516,788 ops/sec min..max=(1.93us...1.95us)        slower (1.02x, 2.36%, was 528,989 ops/sec)
│   ├─ Multiple has calls                              542,786 ops/sec min..max=(1.83us...1.86us)        faster (1.02x, 2.20%, was 531,091 ops/sec)
│   └─ Mixed Complex                                   534,205 ops/sec min..max=(1.86us...1.90us)        slower (1.04x, 3.94%, was 555,227 ops/sec)
└─ eval
  └─ general
    ├─ List .filter and .map                           1,042,444 ops/sec min..max=(956.36ns...959.58ns)  faster (1.01x, 1.48%, was 1,027,244 ops/sec)
    ├─ Multiple list .map calls                        453,065 ops/sec min..max=(2.20us...2.22us)        faster (1.10x, 10.14%, was 411,361 ops/sec)
    ├─ Multiple has calls                              997,858 ops/sec min..max=(989.36ns...1.02us)      faster (1.05x, 5.05%, was 949,852 ops/sec)
    └─ Mixed Complex                                   901,903 ops/sec min..max=(1.07us...1.16us)        faster (1.02x, 1.77%, was 886,208 ops/sec)
```

The full JSON snapshot lives at `benchmark/results/latest/macros.json` and updates whenever the suite reruns without a custom `--save` tag.
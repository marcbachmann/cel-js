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
Benchmark results for 'macros' (16 total):
Plugins enabled: V8NeverOptimizePlugin, MemoryPlugin
├─ parse
│ └─ general
│   ├─ List .map                                       3,073,906 ops/sec min..max=(323.73ns...325.56ns)  faster (1.19x, 19.49%, was 2,572,582 ops/sec)
│   ├─ List .map with async                            1,526,257 ops/sec min..max=(651.99ns...656.94ns)  faster (1.18x, 17.73%, was 1,296,415 ops/sec)
│   ├─ List .map 5 times                               759,693 ops/sec min..max=(1.27us...1.40us)        faster (1.34x, 34.01%, was 566,872 ops/sec)
│   ├─ List .filter                                    2,304,237 ops/sec min..max=(431.47ns...435.22ns)  faster (1.15x, 14.84%, was 2,006,460 ops/sec)
│   ├─ List .filter and .map                           1,468,648 ops/sec min..max=(677.48ns...686.87ns)  faster (1.21x, 20.78%, was 1,216,019 ops/sec)
│   ├─ List .map with filter                           2,047,319 ops/sec min..max=(485.73ns...494.17ns)  faster (1.16x, 15.54%, was 1,771,887 ops/sec)
│   ├─ Multiple has calls                              625,853 ops/sec min..max=(1.59us...1.62us)        faster (1.11x, 10.89%, was 564,375 ops/sec)
│   └─ Mixed Complex                                   640,556 ops/sec min..max=(1.55us...1.56us)        faster (1.07x, 6.57%, was 601,087 ops/sec)
└─ eval
  └─ general
    ├─ List .map                                       4,157,649 ops/sec min..max=(232.22ns...241.50ns)  faster (1.49x, 49.34%, was 2,784,025 ops/sec)
    ├─ List .map with async                            2,591,739 ops/sec min..max=(225.41ns...514.60ns)  faster (1.05x, 5.05%, was 2,467,225 ops/sec)
    ├─ List .map 5 times                               923,369 ops/sec min..max=(1.05us...1.13us)        faster (1.38x, 37.98%, was 669,220 ops/sec)
    ├─ List .filter                                    1,403,684 ops/sec min..max=(697.35ns...720.12ns)  faster (1.44x, 43.92%, was 975,310 ops/sec)
    ├─ List .filter and .map                           1,162,760 ops/sec min..max=(841.64ns...869.10ns)  faster (1.43x, 42.96%, was 813,325 ops/sec)
    ├─ List .map with filter                           1,286,515 ops/sec min..max=(758.14ns...788.40ns)  faster (1.46x, 45.81%, was 882,310 ops/sec)
    ├─ Multiple has calls                              1,261,973 ops/sec min..max=(781.47ns...797.60ns)  faster (1.30x, 29.75%, was 972,610 ops/sec)
    └─ Mixed Complex                                   1,215,772 ops/sec min..max=(813.46ns...826.39ns)  faster (1.32x, 32.35%, was 918,634 ops/sec)
```

The full JSON snapshot lives at `benchmark/results/latest/macros.json` and updates whenever the suite reruns without a custom `--save` tag.

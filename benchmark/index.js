#! /usr/bin/env -S node --allow-natives-syntax
import process from 'node:process'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseArgs as parseNodeArgs} from 'node:util'
import {MemoryPlugin, Suite, V8NeverOptimizePlugin} from 'bench-node'
import {toPretty} from 'bench-node/lib/reporter/pretty.js'
import {Environment} from '../lib/index.js'

import literals from './suites/literals.js'
import arithmetic from './suites/arithmetic.js'
import accessors from './suites/accessors.js'
import collections from './suites/collections.js'
import logic from './suites/logic.js'
import functions from './suites/functions.js'
import macros from './suites/macros.js'

const env = new Environment({
  unlistedVariablesAreDyn: true
})
  .registerVariable('items', 'list<dyn>')
  .registerFunction('identityAsync(double): double', async (a) => a)
  .registerFunction('identityAsync(list): list', async (a) => a)

class BenchSuite extends Suite {
  constructor(options) {
    super(options)
    this.name = options.name
  }

  addParse(test) {
    try {
      env.parse(test.expression)
    } catch (err) {
      err.message = `Error in test "${test.name}": ${err.message}`
      throw err
    }
    return this.add(benchLabel('parse', test), env.parse.bind(env, test.expression))
  }

  addEval(test) {
    try {
      const evaluate = env.parse(test.expression)
      return this.add(benchLabel('eval', test), evaluate.bind(null, test.context))
    } catch (err) {
      err.message = `Error in test "${test.name}": ${err.message}`
      throw err
    }
  }
}

const TEST_SUITES = [
  ['literals', literals],
  ['arithmetic', arithmetic],
  ['accessors', accessors],
  ['collections', collections],
  ['logic', logic],
  ['functions', functions],
  ['macros', macros]
]

const CLI_OPTIONS = parseCliArgs(process.argv.slice(2))
const BENCHMARK_DIR = fileURLToPath(new URL('.', import.meta.url))
const RESULT_ROOT = path.join(BENCHMARK_DIR, 'results')
const numberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'standard',
  maximumFractionDigits: 2
})

runBenchmarks().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

async function runBenchmarks() {
  ensureNativesSyntaxFlag()

  const suites = TEST_SUITES.map(([name, tests]) =>
    setupSuite({
      name,
      saveTarget: CLI_OPTIONS.save,
      compareTarget: CLI_OPTIONS.compare,
      tests
    })
  )

  const hasOnly = suites.some((suite) => suite.hasOnly)
  const toRun = hasOnly ? suites.filter((suite) => suite.hasOnly) : suites
  for (const suite of toRun) {
    if (CLI_OPTIONS.suite.length > 0 && !CLI_OPTIONS.suite.includes(suite.name)) {
      continue
    }

    await suite.runAndReport()
  }
}

function setupSuite({name, compareTarget, saveTarget, tests}) {
  const suite = new BenchSuite({
    name,
    minSamples: 10,
    reporter: false,
    plugins: [new V8NeverOptimizePlugin(), new MemoryPlugin()]
  })
  const withOnly = tests.filter((test) => test.only)
  const toRun = withOnly.length > 0 ? withOnly : tests
  suite.hasOnly = withOnly.length > 0

  for (const test of toRun) {
    suite.addParse(test)
    suite.addEval(test)
  }

  suite.runAndReport = async function () {
    const results = await suite.run()

    const snapshot = captureSuiteSnapshot(suite.name, results)
    const report = compareTarget
      ? await compareSuiteSnapshot(snapshot, compareTarget, toPretty(results))
      : toPretty(results)

    process.stdout.write(`${report}\n`)

    if (saveTarget) await persistSuiteSnapshot(snapshot, saveTarget)
    return results
  }

  return suite
}

function benchLabel(kind, test) {
  return `${kind}/${test.suite || 'general'}/${test.name}`
}

function ensureNativesSyntaxFlag() {
  if (process.execArgv.includes('--allow-natives-syntax')) return
  throw new Error(
    `bench-node requires --allow-natives-syntax. ` +
      `Rerun with 'node --allow-natives-syntax benchmark/index.js' or use 'npm run benchmark'.`
  )
}

function parseCliArgs(argv) {
  const {values} = parseNodeArgs({
    args: argv,
    allowPositionals: false,
    options: {
      save: {type: 'string', default: 'false'},
      compare: {type: 'string', default: 'latest'},
      suite: {type: 'string', multiple: true, default: []}
    }
  })

  return {
    save: pathOption(values.save),
    compare: pathOption(values.compare),
    suite: values.suite
  }
}

function pathOption(v) {
  if (v === 'false') return null
  if (v === 'true') return 'latest'
  if (v === 'timestamp') return new Date().toISOString().replace(/[:.]/g, '-')
  return v || 'latest'
}

function captureSuiteSnapshot(name, results) {
  return {
    suite: name,
    capturedAt: new Date().toISOString(),
    nodeVersion: process.version,
    results: results.map(normalizeBenchmarkResult)
  }
}

function normalizeOpsSec(opsSec) {
  if (typeof opsSec !== 'number') return undefined
  return Number(opsSec < 100 ? opsSec.toFixed(2) : opsSec.toFixed(0))
}

function normalizeBenchmarkResult(result) {
  const stats = result.histogram || {}
  return {
    name: result.name,
    opsSec: normalizeOpsSec(result.opsSec),
    totalTime: result.totalTime || undefined,
    runsSampled: (stats.samples ?? stats.count) || undefined,
    min: stats.min ?? undefined,
    max: stats.max ?? undefined,
    baseline: result.baseline ? true : undefined
  }
}

async function persistSuiteSnapshot(snapshot, saveTarget) {
  const filePath = path.join(RESULT_ROOT, saveTarget, `${snapshot.suite}.json`)
  const payload = `${JSON.stringify(snapshot, null, 2)}\n`
  try {
    await fs.writeFile(filePath, payload, 'utf8')
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    await fs.mkdir(path.join(RESULT_ROOT, saveTarget), {recursive: true})
    await fs.writeFile(filePath, payload, 'utf8')
  }
}

async function compareSuiteSnapshot(snapshot, compareTarget, report) {
  const baseline = await loadBaselineSnapshot(snapshot.suite, compareTarget)
  return baseline ? printComparison(snapshot, baseline, report) : report
}

async function loadBaselineSnapshot(suiteName, compareTarget) {
  if (!compareTarget) return null
  const sourcePath = path.join(RESULT_ROOT, compareTarget, `${suiteName}.json`)

  try {
    const raw = await fs.readFile(sourcePath, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    if (err.name === 'SyntaxError') {
      console.error(`[benchmark] Invalid JSON in ${sourcePath}: ${err.message}`)
    } else {
      console.error(`[benchmark] Failed to read baseline for ${suiteName}: ${err.message}`)
    }
    return null
  }
}

function maybePatchLine(lines, i, comparison, maxLength) {
  let line = lines[i]
  if (!line.includes(' runs sampled')) return

  const improvement = comparison.find(
    (c) => line.includes(c.currentValueFormatted) && line.includes(c.shortName)
  )

  line = line.replace(/ \(\d+ runs sampled\)/, '')
  if (!improvement) return (lines[i] = line)

  const padding = ' '.repeat(maxLength - line.length)

  lines[i] =
    `${line}${padding}${improvement.direction} (${improvement.factor.toFixed(2)}x, ` +
    `${improvement.percent.toFixed(2)}%, ` +
    `was ${improvement.previousValueFormatted})`
}

function printComparison(current, base, report) {
  const comparison = buildComparison(current.results, base.results)
  if (!comparison.length) return report
  const lines = report.split('\n')

  // Remove header lines
  const startLine = lines.findIndex((line) => line.includes('Benchmark results'))
  lines.splice(0, startLine)
  lines[0] = lines[0].replace('Benchmark results', `Benchmark results for '${current.suite}'`)

  const maxLength = Math.max(...lines.map((line) => line.length)) - '(10 runs sampled)'.length + 1
  for (let i = 0; i < lines.length; i++) maybePatchLine(lines, i, comparison, maxLength)
  return lines.join('\n')
}

function buildComparison(currentResults, baselineResults) {
  const baselineMap = new Map(baselineResults.map((result) => [result.name, result]))
  const matches = []

  for (const current of currentResults) {
    const previous = baselineMap.get(current.name)
    if (!previous) continue

    baselineMap.delete(current.name)

    const metric = detectComparableMetric(current, previous)
    if (!metric) continue

    const currentValue = current[metric]
    const previousValue = previous[metric]
    if (!(currentValue > 0 && previousValue > 0)) continue

    const improvement =
      metric === 'opsSec' ? currentValue / previousValue : previousValue / currentValue
    const direction = improvement >= 1 ? 'faster' : 'slower'
    const factor = direction === 'faster' ? improvement : 1 / improvement
    const percent = (factor - 1) * 100

    matches.push({
      name: current.name,
      metric,
      direction,
      factor,
      percent,
      currentValue,
      previousValue,

      shortName: current.name.split('/').pop(),
      currentValueFormatted: formatMetric(metric, currentValue),
      previousValueFormatted: formatMetric(metric, previousValue)
    })
  }

  return matches
}

function metricFor(result) {
  if (typeof result.opsSec === 'number') return 'opsSec'
  if (typeof result.totalTime === 'number') return 'totalTime'
  return null
}

function detectComparableMetric(current, previous) {
  const currentMetric = metricFor(current)
  const previousMetric = metricFor(previous)
  if (currentMetric === previousMetric) return currentMetric
  return null
}

function formatMetric(metric, value) {
  if (value === null || value === undefined) return 'n/a'
  if (metric === 'totalTime') return formatDurationSeconds(value)
  return `${numberFormatter.format(value)} ops/sec`
}

function formatDurationSeconds(seconds) {
  if (seconds < 1e-6) return `${(seconds * 1e9).toFixed(2)} ns`
  if (seconds < 1e-3) return `${(seconds * 1e6).toFixed(2)} us`
  if (seconds < 1) return `${(seconds * 1e3).toFixed(2)} ms`
  return `${seconds.toFixed(2)} s`
}

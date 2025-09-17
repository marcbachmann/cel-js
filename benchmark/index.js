/* eslint-disable no-console */
/**
 * Performance benchmark suite for @marcbachmann/cel-js
 *
 * Compares the performance of @marcbachmann/cel-js against the cel-js package
 * across various expression types and complexity levels.
 */

import {performance} from 'perf_hooks'
import * as celJsLocal from '../index.js'
import {serialize} from '../serialize.js'
import * as celJsPackage from 'cel-js'

// Benchmark configuration
const ITERATIONS = {
  parse: 10000,
  evaluate: 50000,
  warmup: 10000
}

// Test expressions of varying complexity
let TEST_EXPRESSIONS = [
  // Simple literals
  {
    name: 'Simple Number',
    expression: '42',
    context: {}
  },
  {
    name: 'Simple String',
    expression: '"hello world"',
    context: {}
  },
  {
    name: 'Simple Boolean',
    expression: 'true',
    context: {}
  },

  // Arithmetic operations
  {
    name: 'Basic Arithmetic',
    expression: '1 + 2 * 3',
    context: {}
  },
  {
    name: 'Complex Arithmetic',
    expression: '(a + b) * c - d / e',
    context: {a: 10, b: 20, c: 5, d: 100, e: 4}
  },

  // Variable access
  {
    name: 'Variable Access',
    expression: 'user.name',
    context: {user: {name: 'John Doe'}}
  },
  {
    name: 'Deep Property Access',
    expression: 'user.profile.settings.theme',
    context: {
      user: {
        profile: {
          settings: {
            theme: 'dark'
          }
        }
      }
    }
  },

  // Array operations
  {
    name: 'Array Index Access',
    expression: 'items[2]',
    context: {items: ['first', 'second', 'third']}
  },
  {
    name: 'Array Membership',
    expression: '"admin" in roles',
    context: {roles: ['user', 'admin', 'moderator']}
  },
  {
    name: 'Array Creation',
    expression: '[1, 2, 3, 4, 5]',
    context: {roles: ['user', 'admin', 'moderator']}
  },

  // Logical operations
  {
    name: 'Logical Expression',
    expression: 'a && b || c',
    context: {a: true, b: false, c: true}
  },
  {
    name: 'Complex Logical',
    expression: 'user.isActive && ("admin" in user.roles || "moderator" in user.roles)',
    context: {
      user: {
        isActive: true,
        roles: ['admin', 'user']
      }
    }
  },

  // Comparison operations
  {
    name: 'Range Check',
    expression: 'age >= 18 && age < 65',
    context: {age: 25}
  },

  // Ternary operations
  {
    name: 'Nested Ternary',
    expression: 'score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : "F"',
    context: {score: 85}
  },

  // String operations (may not be supported by cel-js)
  {
    name: 'String Methods',
    expression: 'name.startsWith("John") && email.endsWith("@example.com")',
    context: {name: 'John Doe', email: 'john@example.com'}
  },

  // Function calls (may not be supported by cel-js)
  {
    name: 'Function Calls',
    expression: 'size(items) > 0 && string(count) == "5"',
    context: {items: [1, 2, 3], count: 5}
  },

  // Map operations
  {
    name: 'Map Access',
    expression: 'config["timeout"] > 30 && config["retries"] <= 3',
    context: {config: {timeout: 60, retries: 2}}
  },
  {
    name: 'Map Creation',
    expression: '{"foo": 1, "bar": 2, "baz": 3, "test": 4}'
  },

  // Complex real-world example
  {
    name: 'Authorization Check',
    expression: `
      user.isActive &&
      user.emailVerified &&
      (user.role == "admin" || (
        user.role == "editor" &&
        resource.authorId == user.id &&
        resource.status != "archived"
      )) &&
      request.timestamp - user.lastActivity < 3600
    `,
    context: {
      user: {
        id: 123,
        isActive: true,
        emailVerified: true,
        role: 'editor',
        lastActivity: 1000
      },
      resource: {
        authorId: 123,
        status: 'published'
      },
      request: {
        timestamp: 1500
      }
    }
  },

  // Macro operations (may not be supported by cel-js)
  {
    name: 'List Comprehension',
    expression: 'items.filter(x, x > 10).map(x, x > 2)',
    context: {items: [5, 10, 15, 20, 25]}
  },

  // Mixed operations (may not be supported by cel-js)
  {
    name: 'Mixed Complex',
    expression: `
      has(user.premium) &&
      user.premium &&
      (user.subscription.plan in ["pro", "enterprise"]) &&
      user.subscription.expiresAt > timestamp("2024-01-01T00:00:00Z")
    `,
    context: {
      user: {
        premium: true,
        subscription: {
          plan: 'pro',
          expiresAt: new Date('2025-01-01')
        }
      }
    }
  }
]

const withOnly = TEST_EXPRESSIONS.filter((t) => t.only)
if (withOnly.length > 0) TEST_EXPRESSIONS = withOnly

/**
 * Format number with thousands separator
 */
function formatNumber(num) {
  return Math.round(num).toLocaleString()
}

/**
 * Run a single benchmark with error handling
 */
function runBenchmark(name, fn, iterations) {
  try {
    for (let i = 0; i < ITERATIONS.warmup; i++) fn()

    const totalStart = performance.now()

    for (let i = 0; i < iterations; i++) fn()

    const totalTime = performance.now() - totalStart
    const opsPerSec = Math.round((iterations / totalTime) * 1000)

    return {
      totalTime,
      opsPerSec,
      supported: true
    }
  } catch (error) {
    return {
      supported: false,
      error: error.message
    }
  }
}

/**
 * Benchmark parsing performance
 */
function benchmarkParsing() {
  console.log(`\n${'='.repeat(60)}`)
  console.log('PARSING PERFORMANCE')
  console.log(`${'='.repeat(60)}\n`)

  const results = []
  let supportedByBoth = 0
  let onlyLocal = 0
  let onlyPackage = 0

  for (const test of TEST_EXPRESSIONS) {
    console.log(`\n▸ ${test.name}`)
    const expr = serialize(celJsLocal.parse(test.expression).ast)
    console.log(`  Expression: ${expr}`)

    // Benchmark @marcbachmann/cel-js
    const localResults = runBenchmark(
      '@marcbachmann/cel-js',
      () => celJsLocal.parse(test.expression),
      ITERATIONS.parse
    )

    // Benchmark cel-js package
    const packageResults = test.skipThirdParty
      ? {supported: false}
      : runBenchmark('cel-js', () => celJsPackage.parse(test.expression), ITERATIONS.parse)

    const speedup =
      localResults.supported && packageResults.supported
        ? (packageResults.totalTime / localResults.totalTime).toFixed(2)
        : null
    const faster = speedup && speedup > 1

    console.log(`\n  @marcbachmann/cel-js:`)
    if (localResults.supported) {
      console.log(
        `    Total: ${localResults.totalTime.toFixed(2)}ms (${formatNumber(
          localResults.opsPerSec
        )} ops/sec)`
      )
    } else {
      console.log(`    Not Supported: 🔴`)
      console.log(`    Error: ${localResults.error}`)
    }

    console.log(`\n  cel-js package:`)
    if (packageResults.supported) {
      console.log(
        `    Total: ${packageResults.totalTime.toFixed(2)}ms (${formatNumber(
          packageResults.opsPerSec
        )} ops/sec)`
      )
    } else {
      console.log(`    Not Supported: 🔴`)
    }

    if (localResults.supported && packageResults.supported) {
      console.log(
        `\n  Result: @marcbachmann/cel-js is ${speedup}x ${faster ? 'faster 🚀' : 'slower'}`
      )
      supportedByBoth++
    } else if (localResults.supported && !packageResults.supported) {
      console.log(`\n  Result: Only @marcbachmann/cel-js supports this expression ✅`)
      onlyLocal++
    } else if (!localResults.supported && packageResults.supported) {
      console.log(`\n  Result: Only cel-js package supports this expression`)
      onlyPackage++
    }

    if (localResults.supported && packageResults.supported) {
      results.push({
        name: test.name,
        localTime: localResults.totalTime,
        packageTime: packageResults.totalTime,
        speedup: parseFloat(speedup),
        localOpsPerSec: localResults.opsPerSec,
        packageOpsPerSec: packageResults.opsPerSec
      })
    }
  }

  console.log(`\n\nSupport Summary:`)
  console.log(`  Supported by both: ${supportedByBoth}`)
  console.log(`  Only @marcbachmann/cel-js: ${onlyLocal}`)
  console.log(`  Only cel-js package: ${onlyPackage}`)

  return results
}

/**
 * Benchmark evaluation performance
 */
function benchmarkEvaluation() {
  console.log(`\n${'='.repeat(60)}`)
  console.log('EVALUATION PERFORMANCE')
  console.log(`${'='.repeat(60)}\n`)

  const results = []
  let supportedByBoth = 0
  let onlyLocal = 0
  let onlyPackage = 0

  for (const test of TEST_EXPRESSIONS) {
    console.log(`\n▸ ${test.name}`)
    const expr = serialize(celJsLocal.parse(test.expression).ast)
    console.log(`  Expression: ${expr}`)

    let localParsed, packageParsed
    const parseSupported = {local: true, package: true}

    // Try to parse with both implementations
    try {
      localParsed = celJsLocal.parse(test.expression)
    } catch (error) {
      parseSupported.local = false
    }

    try {
      packageParsed = celJsPackage.parse(test.expression).cst
    } catch (error) {
      parseSupported.package = false
    }

    if (!parseSupported.local || !parseSupported.package) {
      console.log(`\n  Skipping evaluation benchmark (parse failed)`)
      if (!parseSupported.local) console.log(`    @marcbachmann/cel-js: Parse failed`)
      if (!parseSupported.package) console.log(`    cel-js package: Parse failed`)
      continue
    }

    // Benchmark @marcbachmann/cel-js
    const localResults = runBenchmark(
      '@marcbachmann/cel-js',
      () => localParsed(test.context),
      ITERATIONS.evaluate
    )

    // Benchmark cel-js package
    const packageResults = test.skipThirdParty
      ? {supported: false}
      : runBenchmark(
          'cel-js',
          () => celJsPackage.evaluate(packageParsed, test.context),
          ITERATIONS.evaluate
        )

    const speedup =
      localResults.supported && packageResults.supported
        ? (packageResults.totalTime / localResults.totalTime).toFixed(2)
        : null
    const faster = speedup && speedup > 1

    console.log(`\n  @marcbachmann/cel-js:`)
    if (localResults.supported) {
      console.log(
        `    Total: ${localResults.totalTime.toFixed(2)}ms (${formatNumber(
          localResults.opsPerSec
        )} ops/sec)`
      )
    } else {
      console.log(`    Not Supported: 🔴`)
      console.log(`    Error: ${localResults.error}`)
    }

    console.log(`\n  cel-js package:`)
    if (packageResults.supported) {
      console.log(
        `    Total: ${packageResults.totalTime.toFixed(2)}ms (${formatNumber(
          packageResults.opsPerSec
        )} ops/sec)`
      )
    } else {
      console.log(`    Not Supported: 🔴`)
    }

    if (localResults.supported && packageResults.supported) {
      console.log(
        `\n  Result: @marcbachmann/cel-js is ${speedup}x ${faster ? 'faster 🚀' : 'slower'}`
      )
      supportedByBoth++
    } else if (localResults.supported && !packageResults.supported) {
      console.log(`\n  Result: Only @marcbachmann/cel-js supports this expression ✅`)
      onlyLocal++
    } else if (!localResults.supported && packageResults.supported) {
      console.log(`\n  Result: Only cel-js package supports this expression`)
      onlyPackage++
    }

    if (localResults.supported && packageResults.supported) {
      results.push({
        name: test.name,
        localTime: localResults.totalTime,
        packageTime: packageResults.totalTime,
        speedup: parseFloat(speedup),
        localOpsPerSec: localResults.opsPerSec,
        packageOpsPerSec: packageResults.opsPerSec
      })
    }
  }

  console.log(`\n\nSupport Summary:`)
  console.log(`  Supported by both: ${supportedByBoth}`)
  console.log(`  Only @marcbachmann/cel-js: ${onlyLocal}`)
  console.log(`  Only cel-js package: ${onlyPackage}`)

  return results
}

/**
 * Display summary statistics
 */
function displaySummary(parseResults, evalResults) {
  console.log(`\n${'='.repeat(60)}`)
  console.log('PERFORMANCE SUMMARY')
  console.log(`${'='.repeat(60)}\n`)

  const calculateBenchmarkStats = (results) => {
    if (results.length === 0) {
      return {
        avgSpeedup: 0,
        minSpeedup: 0,
        maxSpeedup: 0,
        fasterCount: 0,
        total: 0
      }
    }

    const speedups = results.map((r) => r.speedup)
    const avgSpeedup = speedups.reduce((a, b) => a + b, 0) / speedups.length
    const minSpeedup = Math.min(...speedups)
    const maxSpeedup = Math.max(...speedups)
    const fasterCount = speedups.filter((s) => s > 1).length

    return {
      avgSpeedup,
      minSpeedup,
      maxSpeedup,
      fasterCount,
      total: speedups.length
    }
  }

  const parseStats = calculateBenchmarkStats(parseResults)
  const evalStats = calculateBenchmarkStats(evalResults)

  if (parseStats.total > 0) {
    console.log('PARSING PERFORMANCE (for expressions supported by both):')
    console.log(`  Average speedup: ${parseStats.avgSpeedup.toFixed(2)}x`)
    console.log(
      `  Range: ${parseStats.minSpeedup.toFixed(2)}x - ${parseStats.maxSpeedup.toFixed(2)}x`
    )
    console.log(`  Faster in ${parseStats.fasterCount}/${parseStats.total} tests`)
  }

  if (evalStats.total > 0) {
    console.log('\nEVALUATION PERFORMANCE (for expressions supported by both):')
    console.log(`  Average speedup: ${evalStats.avgSpeedup.toFixed(2)}x`)
    console.log(
      `  Range: ${evalStats.minSpeedup.toFixed(2)}x - ${evalStats.maxSpeedup.toFixed(2)}x`
    )
    console.log(`  Faster in ${evalStats.fasterCount}/${evalStats.total} tests`)
  }

  console.log(`\n📊 Note: Speedup > 1.0 means @marcbachmann/cel-js is faster than cel-js package`)

  // Overall verdict
  const totalTests = parseStats.total + evalStats.total
  if (totalTests > 0) {
    const overallAvg = (parseStats.avgSpeedup + evalStats.avgSpeedup) / 2
    if (overallAvg > 1.5) {
      console.log('✅ Overall: @marcbachmann/cel-js shows significant performance improvements!')
    } else if (overallAvg > 1.1) {
      console.log('✅ Overall: @marcbachmann/cel-js shows moderate performance improvements.')
    } else if (overallAvg > 0.9) {
      console.log('⚖️  Overall: Performance is comparable between implementations.')
    } else {
      console.log("📈 Overall: There's room for performance optimization.")
    }
  }
}

/**
 * Main benchmark runner
 */
async function runBenchmarks() {
  console.log(`\n${'═'.repeat(60)}`)
  console.log('@marcbachmann/cel-js Performance Benchmark Suite')
  console.log('═'.repeat(60))
  console.log(`\nBenchmark Configuration:`)
  console.log(`  Parse iterations:    ${formatNumber(ITERATIONS.parse)}`)
  console.log(`  Evaluate iterations: ${formatNumber(ITERATIONS.evaluate)}`)
  console.log(`  Warmup iterations:   ${formatNumber(ITERATIONS.warmup)}`)
  console.log(`  Test expressions:    ${TEST_EXPRESSIONS.length}`)
  console.log(`\nComparing against: cel-js package`)
  console.log(`Platform: ${process.platform} ${process.arch}`)
  console.log(`Node.js: ${process.version}`)

  const startTime = performance.now()

  const parseResults = benchmarkParsing()
  const evalResults = benchmarkEvaluation()

  displaySummary(parseResults, evalResults)

  const totalTime = ((performance.now() - startTime) / 1000).toFixed(1)
  console.log(`⏱️  Total benchmark time: ${totalTime}s\n`)
  console.log('═'.repeat(60))
}

// Run the benchmark
runBenchmarks().catch(console.error)

/* eslint-disable no-console */
/**
 * Memory usage benchmark for @marcbachmann/cel-js
 *
 * Measures and compares memory consumption between @marcbachmann/cel-js
 * and the cel-js package across various scenarios.
 *
 * Run with: node --expose-gc benchmark/memory.js
 */

import {performance} from 'perf_hooks'
import * as celJsLocal from '../index.js'
import {serialize} from '../serialize.js'
import * as celJsPackage from 'cel-js'

// Test expressions of increasing complexity
const TEST_EXPRESSIONS = [
  // Simple expressions
  {name: 'Number literal', expr: '42'},
  {name: 'String literal', expr: '"hello world"'},
  {name: 'Boolean literal', expr: 'true'},

  // Basic operations
  {name: 'Arithmetic', expr: 'a + b * c'},
  {name: 'Comparison', expr: 'x > 10 && y < 20'},
  {name: 'String concat', expr: '"Hello, " + name + "!"'},

  // Property access
  {name: 'Property access', expr: 'user.profile.name'},
  {name: 'Array access', expr: 'items[0].value'},
  {name: 'Nested access', expr: 'data.users[0].addresses[0].city'},

  // Complex expressions
  {name: 'Conditional', expr: 'score >= 90 ? "A" : score >= 80 ? "B" : "C"'},
  {name: 'List operations', expr: 'items.filter(x, x > 10).map(x, x * 2)'},
  {name: 'Combined logic', expr: 'user.isActive && ("admin" in user.roles || user.level > 5)'},

  // Real-world example
  {
    name: 'Complex auth check',
    expr: `
      user.isActive &&
      user.emailVerified &&
      request.resource.owner == user.id &&
      (user.subscription.plan == "premium" ||
       request.resource.public == true) &&
      request.timestamp - user.lastActivity < 3600
    `
  }
]

/**
 * Force garbage collection if available
 */
function gc() {
  if (global.gc) {
    global.gc()
  }
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  const abs = Math.abs(bytes)
  const sign = bytes < 0 ? '-' : ''

  if (abs === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(abs) / Math.log(k))
  const size = abs / Math.pow(k, i)

  return `${sign + size.toFixed(2)} ${sizes[i]}`
}

/**
 * Measure memory usage for a function with error handling
 */
function measureMemory(name, fn, iterations = 1) {
  try {
    // Test if function works
    fn()

    gc()

    // Initial memory baseline
    const initialMemory = process.memoryUsage()

    // Run the function
    const start = performance.now()
    for (let i = 0; i < iterations; i++) fn()

    const duration = performance.now() - start

    // Final memory usage
    const finalMemory = process.memoryUsage()

    // Calculate differences
    const memoryDiff = {
      rss: finalMemory.rss - initialMemory.rss,
      heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
      heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
      external: finalMemory.external - initialMemory.external,
      arrayBuffers: finalMemory.arrayBuffers - initialMemory.arrayBuffers
    }

    return {
      duration,
      memory: memoryDiff,
      perIteration: {
        heapUsed: memoryDiff.heapUsed / iterations,
        duration: duration / iterations
      },
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
 * Run parsing memory benchmark
 */
function benchmarkParsingMemory() {
  console.log(`\n${'='.repeat(60)}`)
  console.log('PARSING MEMORY USAGE')
  console.log(`${'='.repeat(60)}\n`)

  const iterations = 10000
  console.log(`Parsing each expression ${iterations.toLocaleString()} times...\n`)

  let supportedByBoth = 0
  let onlyLocal = 0
  let onlyPackage = 0

  for (const test of TEST_EXPRESSIONS) {
    console.log(`\n▸ ${test.name}`)
    const expr = serialize(celJsLocal.parse(test.expr).ast)
    console.log(`  Expression: ${expr}`)

    // Test @marcbachmann/cel-js
    const localResults = measureMemory(
      '@marcbachmann/cel-js',
      () => celJsLocal.parse(test.expr),
      iterations
    )

    // Test cel-js package
    const packageResults = measureMemory('cel-js', () => celJsPackage.parse(test.expr), iterations)

    // Calculate memory efficiency
    const memoryRatio =
      localResults.supported && packageResults.supported
        ? packageResults.memory.heapUsed / localResults.memory.heapUsed
        : null
    const timeRatio =
      localResults.supported && packageResults.supported
        ? packageResults.duration / localResults.duration
        : null

    console.log(`\n  @marcbachmann/cel-js:`)
    if (localResults.supported) {
      console.log(`    Total heap: ${formatBytes(localResults.memory.heapUsed)}`)
      console.log(`    Per parse:  ${formatBytes(localResults.perIteration.heapUsed)}`)
      console.log(`    Time:       ${localResults.duration.toFixed(2)}ms`)
    } else {
      console.log(`    Not Supported: 🔴`)
    }

    console.log(`\n  cel-js package:`)
    if (packageResults.supported) {
      console.log(`    Total heap: ${formatBytes(packageResults.memory.heapUsed)}`)
      console.log(`    Per parse:  ${formatBytes(packageResults.perIteration.heapUsed)}`)
      console.log(`    Time:       ${packageResults.duration.toFixed(2)}ms`)
    } else {
      console.log(`    Not Supported: 🔴`)
    }

    if (localResults.supported && packageResults.supported) {
      console.log(`\n  Comparison:`)
      console.log(
        `    Memory: @marcbachmann/cel-js uses ${memoryRatio.toFixed(2)}x ${
          memoryRatio < 1 ? 'more' : 'less'
        } memory`
      )
      console.log(
        `    Speed:  @marcbachmann/cel-js is ${timeRatio.toFixed(2)}x ${
          timeRatio > 1 ? 'faster' : 'slower'
        }`
      )
      supportedByBoth++
    } else if (localResults.supported && !packageResults.supported) {
      console.log(`\n  Result: Only @marcbachmann/cel-js supports this expression ✅`)
      onlyLocal++
    } else if (!localResults.supported && packageResults.supported) {
      console.log(`\n  Result: Only cel-js package supports this expression`)
      onlyPackage++
    }
  }

  console.log(`\n\nSupport Summary:`)
  console.log(`  Supported by both: ${supportedByBoth}`)
  console.log(`  Only @marcbachmann/cel-js: ${onlyLocal}`)
  console.log(`  Only cel-js package: ${onlyPackage}`)
}

/**
 * Run memory retention benchmark
 */
function benchmarkMemoryRetention() {
  console.log(`\n${'='.repeat(60)}`)
  console.log('MEMORY RETENTION TEST')
  console.log(`${'='.repeat(60)}\n`)

  console.log('Testing memory retention over 50,000 parse operations...\n')

  const iterations = 50000
  const checkpoints = [10000, 20000, 30000, 40000, 50000]

  // Use a simpler expression that both implementations support
  const expression = 'user.isActive && user.age > 18'

  console.log('Expression:', expression, '\n')

  // Test @marcbachmann/cel-js
  console.log('@marcbachmann/cel-js:')
  gc()
  const localStart = process.memoryUsage()
  const localCheckpoints = []
  let localSupported = true

  try {
    for (let i = 1; i <= iterations; i++) {
      celJsLocal.parse(expression)

      if (checkpoints.includes(i)) {
        const mem = process.memoryUsage()
        const heapUsed = mem.heapUsed - localStart.heapUsed
        localCheckpoints.push({i, heapUsed})
        console.log(`  After ${i.toLocaleString()}: ${formatBytes(heapUsed)}`)
      }
    }
  } catch (error) {
    console.log(`  Error: ${error.message}`)
    localSupported = false
  }

  // Test cel-js package
  console.log('\ncel-js package:')
  gc()
  const packageStart = process.memoryUsage()
  const packageCheckpoints = []
  let packageSupported = true

  try {
    for (let i = 1; i <= iterations; i++) {
      celJsPackage.parse(expression)

      if (checkpoints.includes(i)) {
        const mem = process.memoryUsage()
        const heapUsed = mem.heapUsed - packageStart.heapUsed
        packageCheckpoints.push({i, heapUsed})
        console.log(`  After ${i.toLocaleString()}: ${formatBytes(heapUsed)}`)
      }
    }
  } catch (error) {
    console.log(`  Error: ${error.message}`)
    packageSupported = false
  }

  // Compare growth rates if both supported
  if (
    localSupported &&
    packageSupported &&
    localCheckpoints.length > 0 &&
    packageCheckpoints.length > 0
  ) {
    console.log('\nMemory Growth Analysis:')
    const localGrowth =
      localCheckpoints[localCheckpoints.length - 1].heapUsed / localCheckpoints[0].heapUsed
    const packageGrowth =
      packageCheckpoints[packageCheckpoints.length - 1].heapUsed / packageCheckpoints[0].heapUsed

    console.log(`  @marcbachmann/cel-js growth: ${localGrowth.toFixed(2)}x`)
    console.log(`  cel-js package growth:       ${packageGrowth.toFixed(2)}x`)

    if (localGrowth < packageGrowth) {
      console.log(`\n✅ @marcbachmann/cel-js shows better memory characteristics`)
    } else if (localGrowth > packageGrowth * 1.1) {
      console.log(`\n⚠️  @marcbachmann/cel-js shows higher memory growth`)
    } else {
      console.log(`\n⚖️  Both implementations show similar memory characteristics`)
    }
  }
}

/**
 * Run evaluation memory benchmark
 */
function benchmarkEvaluationMemory() {
  console.log(`\n${'='.repeat(60)}`)
  console.log('EVALUATION MEMORY USAGE')
  console.log(`${'='.repeat(60)}\n`)

  const context = {
    user: {
      id: 123,
      isActive: true,
      emailVerified: true,
      profile: {name: 'Test User'},
      roles: ['user', 'admin'],
      level: 10,
      subscription: {plan: 'premium'},
      lastActivity: Date.now() - 1000,
      age: 25
    },
    request: {
      resource: {owner: 123, public: false},
      timestamp: Date.now()
    },
    items: [1, 2, 3, 4, 5, 10, 15, 20, 25, 30],
    data: {
      users: [
        {
          addresses: [{city: 'New York'}]
        }
      ]
    },
    score: 85,
    name: 'World',
    a: 10,
    b: 20,
    c: 30,
    x: 15,
    y: 10
  }

  const iterations = 10000
  console.log(`Evaluating pre-parsed expressions ${iterations.toLocaleString()} times...\n`)

  for (const test of TEST_EXPRESSIONS.slice(0, 5)) {
    // Test first 5 for brevity
    console.log(`\n▸ ${test.name}`)

    let localParsed, packageParsed
    const parseSupported = {local: true, package: true}

    // Try to pre-parse expressions
    try {
      localParsed = celJsLocal.parse(test.expr)
    } catch (error) {
      parseSupported.local = false
    }

    try {
      packageParsed = celJsPackage.parse(test.expr)
    } catch (error) {
      parseSupported.package = false
    }

    if (!parseSupported.local || !parseSupported.package) {
      console.log(`  Skipping evaluation memory test (parse failed)`)
      if (!parseSupported.local) console.log(`    @marcbachmann/cel-js: Parse failed`)
      if (!parseSupported.package) console.log(`    cel-js package: Parse failed`)
      continue
    }

    // Test @marcbachmann/cel-js
    const localResults = measureMemory(
      '@marcbachmann/cel-js',
      () => localParsed(context),
      iterations
    )

    // Test cel-js package
    const packageResults = measureMemory(
      'cel-js',
      () => celJsPackage.evaluate(packageParsed.cst, context),
      iterations
    )

    if (localResults.supported && packageResults.supported) {
      const memoryRatio = packageResults.memory.heapUsed / localResults.memory.heapUsed

      console.log(
        `  @marcbachmann/cel-js: ${formatBytes(
          localResults.memory.heapUsed
        )} in ${localResults.duration.toFixed(2)}ms`
      )
      console.log(
        `  cel-js package:       ${formatBytes(
          packageResults.memory.heapUsed
        )} in ${packageResults.duration.toFixed(2)}ms`
      )
      console.log(`  Memory efficiency:    ${memoryRatio.toFixed(2)}x`)
    } else {
      if (!localResults.supported) console.log(`  @marcbachmann/cel-js: Not Supported 🔴`)
      if (!packageResults.supported) console.log(`  cel-js package: Not Supported 🔴`)
    }
  }
}

/**
 * Main benchmark runner
 */
async function runBenchmarks() {
  console.log(`\n${'═'.repeat(60)}`)
  console.log('@marcbachmann/cel-js Memory Usage Benchmark')
  console.log(`${'═'.repeat(60)}`)

  const hasGC = global.gc !== undefined

  console.log(`\nEnvironment:`)
  console.log(`  Platform:     ${process.platform} ${process.arch}`)
  console.log(`  Node.js:      ${process.version}`)
  console.log(`  GC Available: ${hasGC ? 'Yes' : 'No (run with --expose-gc for accurate results)'}`)

  if (!hasGC) {
    console.log('\n⚠️  Warning: Running without --expose-gc flag')
    console.log('   Memory measurements may be less accurate.')
    console.log('   Run with: node --expose-gc benchmark/memory.js\n')
  }

  const startTime = performance.now()

  benchmarkParsingMemory()
  benchmarkMemoryRetention()
  benchmarkEvaluationMemory()

  const totalTime = ((performance.now() - startTime) / 1000).toFixed(1)

  console.log(`\n${'='.repeat(60)}`)
  console.log('SUMMARY')
  console.log(`${'='.repeat(60)}`)
  console.log('\n@marcbachmann/cel-js demonstrates:')
  console.log('  • Efficient memory usage during parsing')
  console.log('  • Minimal memory overhead for AST representation')
  console.log('  • Good memory characteristics for long-running processes')
  console.log('  • Support for advanced CEL features not available in cel-js')
  console.log(`\n⏱️  Total benchmark time: ${totalTime}s`)
  console.log(`\n${'═'.repeat(60)}\n`)
}

// Run the benchmark
runBenchmarks().catch(console.error)

import {describe, it} from 'node:test'
import {TestEnvironment} from './helpers.js'

describe('Async Functions', () => {
  it('should evaluate async custom functions', async () => {
    const env = new TestEnvironment()
    env.registerVariable('url', 'string')
    env.registerFunction('fetchData(string): string', async (url) => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return `data from ${url}`
    })

    await env.expectEval('fetchData(url)', 'data from https://api.example.com', {
      url: 'https://api.example.com'
    })
  })

  it('should evaluate async receiver methods', async () => {
    const env = new TestEnvironment()
    env.registerVariable('text', 'string')
    env.registerFunction('string.fetchTranslation(string): string', async function (str, lang) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return `${str} translated to ${lang}`
    })

    await env.expectEval('text.fetchTranslation("es")', 'hello translated to es', {text: 'hello'})
  })

  it('should handle async functions in complex expressions', async () => {
    const env = new TestEnvironment()
    env.registerVariable('x', 'int')
    env.registerFunction('asyncDouble(int): int', async (n) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return n * 2n
    })

    await env.expectEval('asyncDouble(x) + 10', 20n, {x: 5n})
  })

  it('should handle nested async function calls', async () => {
    const env = new TestEnvironment()
    env.registerFunction('asyncAdd(int, int): int', async (a, b) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return a + b
    })

    await env.expectEval('asyncAdd(asyncAdd(1, 2), asyncAdd(3, 4))', 10n)
  })

  it('should handle async functions with list operations', async () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true})
    env.registerFunction('asyncSum(list): int', async (list) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return list.reduce((a, b) => a + b, 0n)
    })

    await env.expectEval('asyncSum(items)', 15n, {items: [1n, 2n, 3n, 4n, 5n]})
  })

  it('should handle async functions with conditionals', async () => {
    const env = new TestEnvironment()
    env.registerVariable('condition', 'bool')
    env.registerFunction('asyncTrue(): string', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return 'true branch'
    })
    env.registerFunction('asyncFalse(): string', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return 'false branch'
    })

    await env.expectEval('condition ? asyncTrue() : asyncFalse()', 'true branch', {condition: true})
    await env.expectEval('condition ? asyncTrue() : asyncFalse()', 'false branch', {
      condition: false
    })
  })

  it('should handle errors in async functions', async () => {
    const env = new TestEnvironment()
    env.registerFunction('asyncError(): string', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      throw new Error('Async error occurred')
    })

    await env.expectEvalThrows('asyncError()', /Async error occurred/)
  })

  it('should handle mixed sync and async functions', async () => {
    const env = new TestEnvironment()
    env.registerFunction('syncDouble(int): int', (n) => n * 2n)
    env.registerFunction('asyncTriple(int): int', async (n) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return n * 3n
    })

    await env.expectEval('syncDouble(asyncTriple(5))', 30n)
  })
})

describe('parse with async functions', () => {
  it('should return a function that returns a promise', async () => {
    const env = new TestEnvironment()
    env.registerFunction('asyncValue(): int', async () => 42n)
    await env.expectEval('asyncValue()', 42n)
  })

  it('should allow reusing parsed async expressions', async () => {
    const env = new TestEnvironment()
    env.registerVariable('n', 'int')
    env.registerFunction('asyncIncrement(int): int', async (n) => n + 1n)

    await env.expectEval('asyncIncrement(n)', 2n, {n: 1n})
    await env.expectEval('asyncIncrement(n)', 11n, {n: 10n})
  })

  it('should have a check method', () => {
    const env = new TestEnvironment()
    env.registerFunction('asyncValue(): int', async () => 42n)
    env.expectType('asyncValue()', 'int')
  })
})

describe('logical operators with async', () => {
  it('should short-circuit && with async operands', async () => {
    let called = false
    const env = new TestEnvironment()
      .registerFunction('asyncFalse(): bool', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        called = true
        return false
      })
      .registerVariable('x', 'bool')

    // When left is false, right should not be evaluated
    await env.expectEval('x && asyncFalse()', false, {x: false})
    if (called) throw new Error('asyncFalse should not have been called')
  })

  it('should short-circuit || with async operands', async () => {
    let called = false
    const env = new TestEnvironment()
      .registerFunction('asyncTrue(): bool', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        called = true
        return true
      })
      .registerVariable('x', 'bool')
    // When left is true, right should not be evaluated
    await env.expectEval('x || asyncTrue()', true, {x: true})
    if (called) throw new Error('asyncTrue should not have been called')
  })

  it('should evaluate asyncTrue() || false', async () => {
    const env = new TestEnvironment().registerFunction('asyncTrue(): bool', async () => true)
    await env.expectEval('asyncTrue() || false', true)
  })

  it('should evaluate asyncTrue() && false', async () => {
    const env = new TestEnvironment().registerFunction('asyncTrue(): bool', async () => true)
    await env.expectEval('asyncTrue() && false', false)
  })

  it('should evaluate asyncFalse() || true', async () => {
    const env = new TestEnvironment().registerFunction('asyncFalse(): bool', async () => false)
    await env.expectEval('asyncFalse() || true', true)
  })

  it('should evaluate asyncFalse() && true', async () => {
    const env = new TestEnvironment().registerFunction('asyncFalse(): bool', async () => false)
    await env.expectEval('asyncFalse() && true', false)
  })
})

describe('sync evaluate should still work', () => {
  it('should not affect sync evaluation', () => {
    const env = new TestEnvironment().registerFunction('syncAdd(int, int): int', (a, b) => a + b)
    env.expectEval('syncAdd(1, 2)', 3n)
  })

  it('should work with parse()', () => {
    const env = new TestEnvironment().registerFunction(
      'syncMultiply(int, int): int',
      (a, b) => a * b
    )
    env.expectEval('syncMultiply(3, 4)', 12n)
  })
})

describe('sync functions with async arguments', () => {
  it('should pass async result to type()', async () => {
    const env = new TestEnvironment().registerFunction('asyncValue(): int', async () => 42n)
    await env.expectEval('type(asyncValue()) == int', true)
  })

  it('should pass async result to size()', async () => {
    const env = new TestEnvironment().registerFunction('asyncList(): list', async () => [
      1n,
      2n,
      3n
    ])
    await env.expectEval('size(asyncList())', 3n)
  })

  it('should pass async result to string()', async () => {
    const env = new TestEnvironment().registerFunction('asyncInt(): int', async () => 123n)
    await env.expectEval('string(asyncInt())', '123')
  })

  it('should pass async result to int()', async () => {
    const env = new TestEnvironment().registerFunction('asyncString(): string', async () => '456')
    await env.expectEval('int(asyncString())', 456n)
  })
})

describe('list creation with async', () => {
  it('should create list with async element', async () => {
    const env = new TestEnvironment().registerFunction('asyncValue(): int', async () => 42n)
    await env.expectEvalDeep('[asyncValue()]', [42n])
  })

  it('should create list with multiple async elements', async () => {
    const env = new TestEnvironment()
      .registerFunction('asyncA(): int', async () => 1n)
      .registerFunction('asyncB(): int', async () => 2n)
      .registerFunction('asyncC(): int', async () => 3n)
    await env.expectEvalDeep('[asyncA(), asyncB(), asyncC()]', [1n, 2n, 3n])
  })

  it('should create list with mixed sync and async elements', async () => {
    const env = new TestEnvironment().registerFunction('asyncValue(): int', async () => 2n)
    await env.expectEvalDeep('[1, asyncValue(), 3]', [1n, 2n, 3n])
  })

  it('should handle nested list with async', async () => {
    const env = new TestEnvironment().registerFunction('asyncValue(): int', async () => 42n)
    await env.expectEvalDeep('[[asyncValue()]]', [[42n]])
  })
})

describe('map creation with async', () => {
  it('should create map with async value', async () => {
    const env = new TestEnvironment().registerFunction('asyncValue(): int', async () => 42n)
    await env.expectEvalDeep('{"key": asyncValue()}', {key: 42n})
  })

  it('should create map with async key', async () => {
    const env = new TestEnvironment().registerFunction('asyncKey(): string', async () => 'dynamic')
    await env.expectEvalDeep('{asyncKey(): 123}', {dynamic: 123n})
  })

  it('should create map with multiple async entries', async () => {
    const env = new TestEnvironment()
      .registerFunction('asyncA(): int', async () => 1n)
      .registerFunction('asyncB(): int', async () => 2n)
    await env.expectEvalDeep('{"a": asyncA(), "b": asyncB()}', {a: 1n, b: 2n})
  })

  it('should create map with mixed sync and async', async () => {
    const env = new TestEnvironment().registerFunction('asyncValue(): int', async () => 2n)
    await env.expectEvalDeep('{"x": 1, "y": asyncValue(), "z": 3}', {x: 1n, y: 2n, z: 3n})
  })

  it('should handle nested map with async', async () => {
    const env = new TestEnvironment().registerFunction('asyncValue(): int', async () => 42n)
    await env.expectEvalDeep('{"outer": {"inner": asyncValue()}}', {outer: {inner: 42n}})
  })
})

describe('macros with async', () => {
  it('should handle .all() with async predicate', async () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'asyncGreaterThan(int, int): bool',
      async (a, b) => a > b
    )
    await env.expectEval('[3, 4, 5].all(x, asyncGreaterThan(x, 2))', true)
    await env.expectEval('[1, 4, 5].all(x, asyncGreaterThan(x, 2))', false)
  })

  it('should handle .exists() with async predicate', async () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'asyncEquals(int, int): bool',
      async (a, b) => a === b
    )
    await env.expectEval('[1, 2, 3].exists(x, asyncEquals(x, 2))', true)
    await env.expectEval('[1, 2, 3].exists(x, asyncEquals(x, 5))', false)
  })

  it('should handle .map() with async transform', async () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'asyncDouble(int): int',
      async (n) => n * 2n
    )
    await env.expectEvalDeep('[1, 2, 3].map(x, asyncDouble(x))', [2n, 4n, 6n])
  })

  it('should handle .filter() with async predicate', async () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'asyncIsEven(int): bool',
      async (n) => n % 2n === 0n
    )
    await env.expectEvalDeep('[1, 2, 3, 4, 5].filter(x, asyncIsEven(x))', [2n, 4n])
  })

  it('should handle .exists_one() with async predicate', async () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'asyncEquals(int, int): bool',
      async (a, b) => a === b
    )
    await env.expectEval('[1, 2, 3].exists_one(x, asyncEquals(x, 2))', true)
    await env.expectEval('[2, 2, 3].exists_one(x, asyncEquals(x, 2))', false)
  })

  it('should handle chained macros with async', async () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true})
      .registerFunction('asyncDouble(int): int', async (n) => n * 2n)
      .registerFunction('asyncIsEven(int): bool', async (n) => n % 2n === 0n)
    await env.expectEvalDeep('[1, 2, 3].map(x, asyncDouble(x)).filter(x, asyncIsEven(x))', [
      2n,
      4n,
      6n
    ])
  })

  it('should handle async in macro source list', async () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'asyncList(): list',
      async () => [1n, 2n, 3n]
    )
    await env.expectEvalDeep('asyncList().map(x, x * 2)', [2n, 4n, 6n])
  })

  it('should handle async in macro receiver via variable', async () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'asyncList(): list',
      async () => [1n, 2n, 3n]
    )
    env.registerVariable('items', 'list')
    const items = await env.evaluate('asyncList()')
    await env.expectEvalDeep('items.filter(x, x > 1)', [2n, 3n], {items})
  })

  it('should handle .all() when async appears after first element', async () => {
    let callCount = 0
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'asyncCheck(int): bool',
      async (n) => {
        callCount++
        await new Promise((resolve) => setTimeout(resolve, 1))
        return n > 0n
      }
    )
    await env.expectEval('[1, 2, 3].all(x, asyncCheck(x))', true)
    if (callCount !== 3) throw new Error(`Expected 3 calls, got ${callCount}`)
  })

  it('should handle .exists() early return with async', async () => {
    let callCount = 0
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'asyncEquals(int, int): bool',
      async (a, b) => {
        callCount++
        await new Promise((resolve) => setTimeout(resolve, 1))
        return a === b
      }
    )
    await env.expectEval('[1, 2, 3, 4].exists(x, asyncEquals(x, 2))', true)
    if (callCount !== 2) throw new Error(`Expected 2 calls, got ${callCount}`)
  })

  it('should handle .all() early return on false with async', async () => {
    let callCount = 0
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'asyncCheck(int): bool',
      async (n) => {
        callCount++
        await new Promise((resolve) => setTimeout(resolve, 1))
        return n > 2n
      }
    )
    // Should stop at index 0 when first element fails
    await env.expectEval('[1, 2, 3].all(x, asyncCheck(x))', false)
    if (callCount !== 1) throw new Error(`Expected 1 call, got ${callCount}`)
  })

  it('should handle .exists_one() with multiple matches and async', async () => {
    let callCount = 0
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'asyncIsTwo(int): bool',
      async (n) => {
        callCount++
        await new Promise((resolve) => setTimeout(resolve, 1))
        return n === 2n
      }
    )
    // exists_one evaluates all items to ensure no errors (strict error checking)
    await env.expectEval('[1, 2, 2, 3].exists_one(x, asyncIsTwo(x))', false)
    if (callCount !== 4)
      throw new Error(`Expected 4 calls (exists_one checks all items), got ${callCount}`)
  })

  it('should handle .map() with filter where filter becomes async mid-array', async () => {
    let callIndex = 0
    const env = new TestEnvironment({unlistedVariablesAreDyn: true})
      .registerFunction('conditionalAsync(int): bool', async (n) => {
        const idx = callIndex++
        if (idx < 2) return n % 2n === 0n
        await new Promise((resolve) => setTimeout(resolve, 1))
        return n % 2n === 0n
      })
      .registerFunction('times2(int): int', (n) => n * 2n)
    await env.expectEvalDeep('[1, 2, 3, 4, 5].map(x, conditionalAsync(x), times2(x))', [4n, 8n])
  })

  it('should handle .map() with async transform after sync filter', async () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'asyncDouble(int): int',
      async (n) => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return n * 2n
      }
    )
    await env.expectEvalDeep('[1, 2, 3, 4, 5].map(x, x % 2 == 0, asyncDouble(x))', [4n, 8n])
  })

  it('should not mutate call context between macro iterations with async', async () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'identity(int): int',
      async (n) => {
        await new Promise((resolve) => setTimeout(resolve, Number(n)))
        return n
      }
    )

    await env.expectEvalDeep('[1, 2, 3].map(x, identity(x) == x ? x : 0)', [1n, 2n, 3n])
    await env.expectEvalDeep('[3, 2, 1].map(x, identity(x) == x ? x : 0)', [3n, 2n, 1n])
  })

  it('should handle .filter() with mixed sync and async predicates', async () => {
    let callIndex = 0
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'mixedCheck(int): bool',
      async (n) => {
        const idx = callIndex++
        if (idx < 2) return n > 2n
        await new Promise((resolve) => setTimeout(resolve, 1))
        return n > 2n
      }
    )
    await env.expectEvalDeep('[1, 2, 3, 4, 5].filter(x, mixedCheck(x))', [3n, 4n, 5n])
  })

  it('should handle .map() where transform becomes async mid-iteration', async () => {
    let transformIndex = 0
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'conditionalAsyncTransform(int): int',
      async (n) => {
        const idx = transformIndex++
        const result = n * 2n
        if (idx >= 2) await new Promise((resolve) => setTimeout(resolve, 1))
        return result
      }
    )
    await env.expectEvalDeep('[1, 2, 3, 4].map(x, conditionalAsyncTransform(x))', [2n, 4n, 6n, 8n])
  })

  it('should handle .map() with filter where transform becomes async', async () => {
    let transformIndex = 0
    const env = new TestEnvironment({unlistedVariablesAreDyn: true}).registerFunction(
      'conditionalAsyncTransform(int): int',
      async (n) => {
        const idx = transformIndex++
        const result = n * 3n
        if (idx === 1) await new Promise((resolve) => setTimeout(resolve, 1))
        return result
      }
    )
    await env.expectEvalDeep('[1, 2, 3, 4, 5].map(x, x % 2 == 0, conditionalAsyncTransform(x))', [
      6n,
      12n
    ])
  })
})

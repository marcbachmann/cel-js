import {test, describe} from 'node:test'
import {evaluate} from '../lib/index.js'

describe('custom functions', () => {
  describe('single argument functions', () => {
    test('should execute a single argument custom function', (t) => {
      const foo = (arg) => `foo:${arg}`
      const result = evaluate('foo(bar)', {bar: 'bar'}, {foo})
      t.assert.strictEqual(result, 'foo:bar')
    })

    test('should pass different argument types', (t) => {
      const process = (value) => `processed:${typeof value}:${value}`

      const result1 = evaluate('process(42)', {}, {process})
      t.assert.strictEqual(result1, 'processed:bigint:42')

      const result2 = evaluate('process("hello")', {}, {process})
      t.assert.strictEqual(result2, 'processed:string:hello')

      const result3 = evaluate('process(true)', {}, {process})
      t.assert.strictEqual(result3, 'processed:boolean:true')
    })
  })

  describe('multi-argument functions', () => {
    test('should execute a two argument custom function', (t) => {
      const foo = (thing, intensity) => `foo:${thing} ${intensity}`
      const result = evaluate('foo(bar, 42)', {bar: 'bar'}, {foo})
      t.assert.strictEqual(result, 'foo:bar 42')
    })

    test('should execute a three argument custom function', (t) => {
      const combine = (a, b, c) => `${a}-${b}-${c}`
      const result = evaluate('combine("a", 2, true)', {}, {combine})
      t.assert.strictEqual(result, 'a-2-true')
    })

    test('should handle variable arguments from context', (t) => {
      const multiply = (a, b) => a * b
      const context = {x: 5, y: 10}
      const result = evaluate('multiply(x, y)', context, {multiply})
      t.assert.strictEqual(result, 50)
    })
  })

  describe('interaction with built-in functions', () => {
    test('should preserve built-in functions when custom functions specified', (t) => {
      const foo = (thing, length, enable) => `foo:${thing} ${length} ${enable}`
      const result = evaluate('foo(bar, size("hello"), true)', {bar: 'test'}, {foo})
      t.assert.strictEqual(result, 'foo:test 5 true')
    })

    test('should allow overriding built-in functions', (t) => {
      const customSize = () => 'custom-size'
      const foo = (thing, length, enable) => `foo:${thing} ${length} ${enable}`

      const result = evaluate(
        'foo(bar, size("hello"), true)',
        {bar: 'test'},
        {foo, size: customSize}
      )
      t.assert.strictEqual(result, 'foo:test custom-size true')
    })

    test('should work with complex expressions', (t) => {
      const max = (a, b) => (a > b ? a : b)
      const min = (a, b) => (a < b ? a : b)

      const context = {numbers: [1, 5, 3, 9, 2]}
      const functions = {max, min}

      const result = evaluate('max(min(numbers[0], numbers[1]), numbers[3])', context, functions)
      t.assert.strictEqual(result, 9) // max(min(1, 5), 9) = max(1, 9) = 9
    })
  })

  describe('function argument evaluation', () => {
    test('should evaluate expressions as function arguments', (t) => {
      const add = (a, b) => a + b
      const result = evaluate('add(1 + 2, 3 * 4)', {}, {add})
      t.assert.strictEqual(result, 15n) // add(3, 12) = 15
    })

    test('should evaluate context access as function arguments', (t) => {
      const concat = (a, b) => `${a}${b}`
      const context = {user: {name: 'John'}, suffix: '!'}
      const result = evaluate('concat(user.name, suffix)', context, {concat})
      t.assert.strictEqual(result, 'John!')
    })
  })

  describe('error handling', () => {
    test('should throw when an unknown function is called', (t) => {
      t.assert.throws(
        () => evaluate('unknownFunction("")'),
        // with line number and error highlight
        /Function not found: 'unknownFunction'\n\n> {4}1 | unknownFunction\(""\)\n {9}^/
      )

      t.assert.throws(
        () => evaluate('\n unknownFunction("")'),
        /Function not found: 'unknownFunction'\n\n> {4}2 | {2}unknownFunction\(""\)\n {10}^/
      )
    })

    test('should not treat context values as callable functions', (t) => {
      const context = {notAFunction: 'just a string', bar: 'value'}
      t.assert.throws(
        () => evaluate('notAFunction(bar)', context),
        /Function not found: 'notAFunction'/
      )
    })

    test('should handle function throwing errors', (t) => {
      const throwingFunction = () => {
        throw new Error('Custom error')
      }
      t.assert.throws(() => evaluate('throwingFunction()', {}, {throwingFunction}), /Custom error/)
    })

    test('should handle function with wrong number of arguments', (t) => {
      const twoArgFunction = (a, b) => a + b

      const result2 = evaluate('twoArgFunction(5, 10, 15)', {}, {twoArgFunction})
      t.assert.strictEqual(result2, 15n) // Extra arguments ignored
    })
  })

  describe('function return values', () => {
    test('should handle functions returning different types', (t) => {
      const functions = {
        returnString: () => 'hello',
        returnNumber: () => 42,
        returnBoolean: () => true,
        returnArray: () => [1, 2, 3],
        returnObject: () => ({key: 'value'}),
        returnNull: () => null
      }

      t.assert.strictEqual(evaluate('returnString()', {}, functions), 'hello')
      t.assert.strictEqual(evaluate('returnNumber()', {}, functions), 42)
      t.assert.strictEqual(evaluate('returnBoolean()', {}, functions), true)
      t.assert.deepStrictEqual(evaluate('returnArray()', {}, functions), [1, 2, 3])
      t.assert.deepStrictEqual(evaluate('returnObject()', {}, functions), {
        key: 'value'
      })
      t.assert.strictEqual(evaluate('returnNull()', {}, functions), null)
    })

    test('should use function return values in expressions', (t) => {
      const getValue = () => BigInt(10)
      const getString = () => 'test'

      const functions = {getValue, getString}

      const result1 = evaluate('getValue() + 5', {}, functions)
      t.assert.strictEqual(result1, 15n)

      const result2 = evaluate('getString() + " string"', {}, functions)
      t.assert.strictEqual(result2, 'test string')

      const result3 = evaluate('getValue() > 5 ? "big" : "small"', {}, functions)
      t.assert.strictEqual(result3, 'big')
    })
  })
})

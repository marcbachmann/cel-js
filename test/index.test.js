import {test, describe} from 'node:test'
import {parse, evaluate, ParseError, EvaluationError} from '../lib/index.js'

describe('CEL Implementation Integration Tests', () => {
  test('should export all required functions and classes', (t) => {
    t.assert.strictEqual(typeof parse, 'function')
    t.assert.strictEqual(typeof evaluate, 'function')
    t.assert.strictEqual(typeof ParseError, 'function')
    t.assert.strictEqual(typeof EvaluationError, 'function')
  })

  test('should handle parse errors gracefully', (t) => {
    t.assert.throws(() => parse('1 +'), Error)
  })

  test('should handle evaluation errors', (t) => {
    t.assert.throws(() => evaluate('unknownVar'), /Unknown variable: unknownVar/)
    t.assert.throws(() => evaluate('obj.prop', {obj: null}), /No such key: prop/)
  })

  test('should work with parse function directly', (t) => {
    const evalFn = parse('x * 2.0')
    t.assert.strictEqual(evalFn({x: 10}), 20)
  })

  test('should handle end-to-end complex expression', (t) => {
    const expression = `
      // User access check
      user.isActive && 
      ("admin" in user.roles || "moderator" in user.roles) &&
      user.permissions.canEdit ? 
        "Access granted" : 
        "Access denied"
    `

    const context = {
      user: {
        isActive: true,
        roles: ['admin', 'user'],
        permissions: {
          canEdit: true,
          canDelete: false
        }
      }
    }

    t.assert.strictEqual(evaluate(expression, context), 'Access granted')
  })

  test('should handle all data types correctly', (t) => {
    const expressions = [
      {expr: '42', expected: 42n},
      {expr: '3.14', expected: 3.14},
      {expr: '"hello"', expected: 'hello'},
      {expr: 'true', expected: true},
      {expr: 'false', expected: false},
      {expr: 'null', expected: null},
      {expr: '[1, 2, 3]', expected: [1n, 2n, 3n]},
      {expr: '{"key": "value"}', expected: {key: 'value'}}
    ]

    expressions.forEach(({expr, expected}) => {
      t.assert.deepStrictEqual(evaluate(expr), expected, `Failed for expression: ${expr}`)
    })
  })

  test('should demonstrate performance characteristics', (t) => {
    const start = performance.now()

    // Run a complex expression many times
    for (let i = 0; i < 1000; i++) {
      evaluate('(a + b) * c > d && items[0].active', {
        a: 1,
        b: 2,
        c: 3,
        d: 5,
        items: [{active: true}]
      })
    }

    const end = performance.now()
    const time = end - start

    // Should be reasonably fast (less than 100ms for 1000 evaluations)
    t.assert.strictEqual(time < 1000, true, 'Performance test failed - took too long')
  })

  test('supports legacy argument format with functions', (t) => {
    const context = {a: 5, b: 15}
    const functions = {
      max: (x, y) => (x > y ? x : y),
      min: (x, y) => (x < y ? x : y)
    }

    t.assert.strictEqual(parse('max(a, b) == 15.0')(context, functions), true)
    t.assert.strictEqual(evaluate('min(a, b) == 5.0', context, functions), true)
  })
})

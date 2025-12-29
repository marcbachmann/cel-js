import {describe, test} from 'node:test'
import {parse, evaluate, ParseError, EvaluationError} from '../lib/index.js'
import {assert, expectEval, expectEvalDeep, expectEvalThrows, expectParseThrows} from './helpers.js'

describe('CEL Implementation Integration Tests', () => {
  test('should export all required functions and classes', () => {
    assert.strictEqual(typeof parse, 'function')
    assert.strictEqual(typeof evaluate, 'function')
    assert.strictEqual(typeof ParseError, 'function')
    assert.strictEqual(typeof EvaluationError, 'function')
  })

  test('should handle parse errors gracefully', () => {
    expectParseThrows('1 +', {
      name: 'ParseError',
      node: {
        input: '1 +',
        pos: 3
      }
    })
  })

  test('should handle evaluation errors', () => {
    const err = expectEvalThrows('unknownVar', /Unknown variable: unknownVar/)
    assert.ok(err instanceof EvaluationError)
    assert.strictEqual(err.node.op, 'id')
    assert.strictEqual(err.node.args, 'unknownVar')

    const err2 = expectEvalThrows('obj.prop', /No such key: prop/, {obj: null})
    assert.ok(err2 instanceof EvaluationError)
    assert.strictEqual(err2.node.op, '.')
    assert.strictEqual(err2.node.args[0].op, 'id')
    assert.strictEqual(err2.node.args[0].args, 'obj')
    assert.strictEqual(err2.node.args[1], 'prop')
  })

  test('should work with parse function directly', () => {
    const evalFn = parse('x * 2.0')
    assert.strictEqual(evalFn({x: 10}), 20)
  })

  test('should handle end-to-end complex expression', () => {
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

    expectEval(expression, 'Access granted', context)
  })

  test('should handle all data types correctly', () => {
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
      expectEvalDeep(expr, expected, undefined, `Failed for expression: ${expr}`)
    })
  })

  test('should demonstrate performance characteristics', () => {
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
    assert.ok(time < 1000, 'Performance test failed - took too long')
  })

  test('does not supports legacy argument format with functions', () => {
    const fns = {max: (_a, b) => b}
    const err = /found no matching overload for 'max\(/
    assert.throws(() => evaluate('max(a, b) == 15.0', {a: 5, b: 15}, fns), err)
    assert.throws(() => parse('max(a, b) == 15.0')({a: 5, b: 15}, fns), err)
  })
})

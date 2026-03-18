import {describe, test} from 'node:test'
import assert from 'node:assert/strict'
import {
  Environment,
  EvaluationError,
  ParseError,
  TypeError,
  evaluate,
  parse
} from '../lib/index.js'

describe('Structured diagnostics', () => {
  test('returns machine-readable diagnostics from check()', () => {
    const env = new Environment().registerVariable('str', 'string').registerVariable('num', 'int')
    const result = env.check('str + num')

    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.deepStrictEqual(result.diagnostics, [result.error.diagnostic])
    assert.deepStrictEqual(result.error.range, {start: 0, end: 9})
    assert.deepStrictEqual(result.error.diagnostic, {
      code: 'no_such_overload',
      message: 'no such overload: string + int',
      severity: 'error',
      range: {start: 0, end: 9},
      related: undefined
    })
  })

  test('surfaces parse diagnostics through check()', () => {
    const result = new Environment().check('1 +')

    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof ParseError)
    assert.deepStrictEqual(result.diagnostics, [result.error.diagnostic])
    assert.strictEqual(result.error.summary, 'Unexpected token: EOF')
    assert.deepStrictEqual(result.error.range, {start: 3, end: 3})
  })

  test('attaches AST metadata to runtime evaluation errors', () => {
    assert.throws(() => evaluate('timestamp(1.5)'), (error) => {
      assert.ok(error instanceof EvaluationError)
      assert.strictEqual(error.code, 'invalid_timestamp')
      assert.strictEqual(error.summary, 'timestamp() requires a valid integer unix timestamp')
      assert.deepStrictEqual(error.range, {start: 0, end: 14})
      assert.deepStrictEqual(error.diagnostic, {
        code: 'invalid_timestamp',
        message: 'timestamp() requires a valid integer unix timestamp',
        severity: 'error',
        range: {start: 0, end: 14},
        related: undefined
      })
      assert.strictEqual(error.node.start, 0)
      assert.strictEqual(error.node.end, 14)
      return true
    })
  })
})

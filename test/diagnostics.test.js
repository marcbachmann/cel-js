import {describe, test} from 'node:test'
import assert from 'node:assert/strict'
import {
  Environment,
  EvaluationError,
  ParseError,
  TypeError,
  evaluate
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
    assert.throws(() => evaluate('bytes("a").at(1)'), (error) => {
      assert.ok(error instanceof EvaluationError)
      assert.strictEqual(error.code, 'index_out_of_range')
      assert.strictEqual(error.summary, 'Bytes index out of range')
      assert.deepStrictEqual(error.range, {start: 0, end: 16})
      assert.deepStrictEqual(error.diagnostic, {
        code: 'index_out_of_range',
        message: 'Bytes index out of range',
        severity: 'error',
        range: {start: 0, end: 16},
        related: undefined
      })
      assert.strictEqual(error.node.start, 0)
      assert.strictEqual(error.node.end, 16)
      return true
    })
  })

  test('preserves plain-object causes on evaluation errors', () => {
    const cause = {code: 'ETIMEDOUT'}
    const error = new EvaluationError('boom', undefined, cause)

    assert.strictEqual(error.cause, cause)
    assert.strictEqual(error.code, 'evaluation_error')
    assert.deepStrictEqual(error.diagnostic, {
      code: 'evaluation_error',
      message: 'boom',
      severity: 'error',
      range: undefined,
      related: undefined
    })
  })

  test('accepts unambiguous error option bags', () => {
    const error = new EvaluationError('boom', undefined, {
      code: 'custom_code',
      range: {start: 1, end: 3}
    })

    assert.strictEqual(error.cause, undefined)
    assert.strictEqual(error.code, 'custom_code')
    assert.deepStrictEqual(error.range, {start: 1, end: 3})
    assert.deepStrictEqual(error.diagnostic, {
      code: 'custom_code',
      message: 'boom',
      severity: 'error',
      range: {start: 1, end: 3},
      related: undefined
    })
  })

  test('returns an empty diagnostics list on successful checks', () => {
    const result = new Environment().registerVariable('value', 'int').check('value + 1')

    assert.deepStrictEqual(result, {
      valid: true,
      type: 'int',
      diagnostics: []
    })
  })
})

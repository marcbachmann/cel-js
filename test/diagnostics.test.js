import {describe, test} from 'node:test'
import assert from 'node:assert/strict'
import {EvaluationError, ParseError, TypeError} from '../lib/index.js'
import {TestEnvironment, expectEvalThrows} from './helpers.js'

describe('Structured diagnostics', () => {
  test('returns machine-readable diagnostics from check()', () => {
    const env = new TestEnvironment()
      .registerVariable('str', 'string')
      .registerVariable('num', 'int')

    const error = env.expectCheckThrows('str + num', /no such overload: string \+ int/)
    assert.ok(error instanceof TypeError)
    assert.deepStrictEqual(error.range, {start: 0, end: 9})
    assert.deepStrictEqual(error.diagnostic, {
      code: 'no_such_overload',
      message: 'no such overload: string + int',
      severity: 'error',
      range: {start: 0, end: 9},
      related: undefined
    })
  })

  test('surfaces parse diagnostics through check()', () => {
    const env = new TestEnvironment()

    const error = env.expectCheckThrows('1 +', /Unexpected token: EOF/)
    assert.ok(error instanceof ParseError)
    assert.strictEqual(error.code, 'unexpected_token')
    assert.strictEqual(error.summary, 'Unexpected token: EOF')
    assert.deepStrictEqual(error.range, {start: 3, end: 3})
  })

  test('attaches AST metadata to runtime evaluation errors', () => {
    const error = expectEvalThrows('bytes("a").at(1)', /Bytes index out of range/)
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
  })

  test('attaches call-site ranges to sync and async custom function errors', async () => {
    const syncEnv = new TestEnvironment().registerFunction('syncFail(): string', () => {
      throw new EvaluationError('sync failure')
    })

    const syncError = syncEnv.expectEvalThrows('syncFail()', /sync failure/)
    assert.ok(syncError instanceof EvaluationError)
    assert.deepStrictEqual(syncError.range, {start: 0, end: 10})
    assert.deepStrictEqual(syncError.diagnostic.range, {start: 0, end: 10})
    assert.strictEqual(syncError.node.start, 0)
    assert.strictEqual(syncError.node.end, 10)

    const asyncEnv = new TestEnvironment().registerFunction('asyncFail(): string', async () => {
      throw new EvaluationError('async failure')
    })

    const asyncError = await asyncEnv.expectEvalThrows('asyncFail()', /async failure/)
    assert.ok(asyncError instanceof EvaluationError)
    assert.deepStrictEqual(asyncError.range, {start: 0, end: 11})
    assert.deepStrictEqual(asyncError.diagnostic.range, {start: 0, end: 11})
    assert.strictEqual(asyncError.node.start, 0)
    assert.strictEqual(asyncError.node.end, 11)
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

  test('accepts explicit diagnostic options', () => {
    const error = new EvaluationError('boom', undefined, undefined, {code: 'custom_code'})

    assert.strictEqual(error.cause, undefined)
    assert.strictEqual(error.code, 'custom_code')
    assert.deepStrictEqual(error.diagnostic, {
      code: 'custom_code',
      message: 'boom',
      severity: 'error',
      range: undefined,
      related: undefined
    })
  })

  test('accepts cause and diagnostic options together', () => {
    const cause = new Error('original')
    const related = [{message: 'See the original expression', range: {start: 0, end: 4}}]
    const error = new EvaluationError('boom', undefined, cause, {
      code: 'custom_code',
      range: {start: 1, end: 3},
      related
    })

    assert.strictEqual(error.cause, cause)
    assert.strictEqual(error.code, 'custom_code')
    assert.deepStrictEqual(error.range, {start: 1, end: 3})
    assert.deepStrictEqual(error.diagnostic, {
      code: 'custom_code',
      message: 'boom',
      severity: 'error',
      range: {start: 1, end: 3},
      related
    })
  })

  test('returns an empty diagnostics list on successful checks', () => {
    const result = new TestEnvironment().registerVariable('value', 'int').check('value + 1')

    assert.deepStrictEqual(result, {
      valid: true,
      type: 'int',
      diagnostics: []
    })
  })
})

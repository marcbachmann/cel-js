import {describe, test} from 'node:test'
import assert from 'node:assert/strict'
import {EvaluationError, ParseError, TypeError} from '../lib/index.js'
import {TestEnvironment, expectEvalThrows} from './helpers.js'

describe('Error classes', () => {
  test('exposes code and range on type errors from check()', () => {
    const env = new TestEnvironment()
      .registerVariable('str', 'string')
      .registerVariable('num', 'int')

    const error = env.expectCheckThrows('str + num', /no such overload: string \+ int/)
    assert.ok(error instanceof TypeError)
    assert.strictEqual(error.code, 'no_such_overload')
    assert.deepStrictEqual(error.range, {start: 0, end: 9})
  })

  test('surfaces parse errors through check()', () => {
    const env = new TestEnvironment()

    const error = env.expectCheckThrows('1 +', /Unexpected token: EOF/)
    assert.ok(error instanceof ParseError)
    assert.strictEqual(error.code, 'unexpected_token')
    assert.strictEqual(error.summary, 'Unexpected token: EOF')
    assert.deepStrictEqual(error.range, {start: 3, end: 3})
  })

  test('attaches source range to runtime evaluation errors', () => {
    const error = expectEvalThrows('bytes("a").at(1)', /Bytes index out of range/)
    assert.ok(error instanceof EvaluationError)
    assert.strictEqual(error.code, 'index_out_of_range')
    assert.strictEqual(error.summary, 'Bytes index out of range')
    assert.deepStrictEqual(error.range, {start: 0, end: 16})
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
    assert.strictEqual(syncError.node.start, 0)
    assert.strictEqual(syncError.node.end, 10)

    const asyncEnv = new TestEnvironment().registerFunction('asyncFail(): string', async () => {
      throw new EvaluationError('async failure')
    })

    const asyncError = await asyncEnv.expectEvalThrows('asyncFail()', /async failure/)
    assert.ok(asyncError instanceof EvaluationError)
    assert.deepStrictEqual(asyncError.range, {start: 0, end: 11})
    assert.strictEqual(asyncError.node.start, 0)
    assert.strictEqual(asyncError.node.end, 11)
  })

  test('preserves plain-object causes on evaluation errors', () => {
    const cause = {code: 'ETIMEDOUT'}
    const error = new EvaluationError('boom', undefined, cause)

    assert.strictEqual(error.cause, cause)
    assert.strictEqual(error.code, 'evaluation_error')
  })

  test('accepts explicit error options', () => {
    const error = new EvaluationError({code: 'custom_code'})

    assert.strictEqual(error.cause, undefined)
    assert.strictEqual(error.code, 'custom_code')
  })

  test('accepts cause and options together', () => {
    const cause = new Error('original')
    const error = new EvaluationError({
      code: 'custom_code',
      message: 'boom',
      cause,
      range: {start: 1, end: 3}
    })

    assert.strictEqual(error.cause, cause)
    assert.strictEqual(error.code, 'custom_code')
    assert.deepStrictEqual(error.range, {start: 1, end: 3})
  })
})

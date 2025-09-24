import {test, describe} from 'node:test'
import {evaluate} from '../lib/index.js'

describe('multiplication and division', () => {
  test('should multiply two numbers', (t) => {
    t.assert.strictEqual(evaluate('2 * 3'), 6n)
  })

  test('should divide two numbers', (t) => {
    t.assert.strictEqual(evaluate('6 / 2'), 3n)
  })

  test('should handle modulo operation', (t) => {
    t.assert.strictEqual(evaluate('7 % 3'), 1n)
  })

  test('should handle complex multiplication', (t) => {
    t.assert.strictEqual(evaluate('2 * 3 * 4'), 24n)
  })

  test('should respect operator precedence', (t) => {
    t.assert.strictEqual(evaluate('2 + 3 * 4'), 14n)
  })

  test('should handle parentheses', (t) => {
    t.assert.strictEqual(evaluate('(2 + 3) * 4'), 20n)
  })

  test('should handle float multiplication', (t) => {
    t.assert.strictEqual(evaluate('2.5 * 2.0'), 5)
  })

  test('should handle float division', (t) => {
    t.assert.strictEqual(evaluate('5.5 / 2.0'), 2.75)
  })

  test('rejects int and double combinations', (t) => {
    t.assert.throws(() => evaluate('2.5 * 2'), /EvaluationError: no such overload: double \* int/)
  })

  test('rejects double modulo', (t) => {
    t.assert.throws(
      () => evaluate('5.5 % 2.0'),
      /EvaluationError: no such overload: double % double/
    )

    t.assert.throws(() => evaluate('2 % 2.0'), /EvaluationError: no such overload: int % double/)
  })
})

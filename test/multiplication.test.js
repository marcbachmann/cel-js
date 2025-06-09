import {test, describe} from 'node:test'
import {evaluate} from '../index.js'

describe('multiplication and division', () => {
  test('should multiply two numbers', (t) => {
    t.assert.strictEqual(evaluate('2 * 3'), 6)
  })

  test('should divide two numbers', (t) => {
    t.assert.strictEqual(evaluate('6 / 2'), 3)
  })

  test('should handle modulo operation', (t) => {
    t.assert.strictEqual(evaluate('7 % 3'), 1)
  })

  test('should handle complex multiplication', (t) => {
    t.assert.strictEqual(evaluate('2 * 3 * 4'), 24)
  })

  test('should respect operator precedence', (t) => {
    t.assert.strictEqual(evaluate('2 + 3 * 4'), 14)
  })

  test('should handle parentheses', (t) => {
    t.assert.strictEqual(evaluate('(2 + 3) * 4'), 20)
  })

  test('should handle float multiplication', (t) => {
    t.assert.strictEqual(evaluate('2.5 * 2'), 5)
  })

  test('should handle float division', (t) => {
    t.assert.strictEqual(evaluate('5.5 / 2'), 2.75)
  })
})

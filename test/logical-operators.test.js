import {test, describe} from 'node:test'
import {evaluate} from '../index.js'

describe('logical operators', () => {
  describe('AND', () => {
    test('should return true if both expressions are true', (t) => {
      t.assert.strictEqual(evaluate('true && true'), true)
    })

    test('should return false if second expression is false', (t) => {
      t.assert.strictEqual(evaluate('true && false'), false)
    })

    test('should return false if first expression is false', (t) => {
      t.assert.strictEqual(evaluate('false && true'), false)
    })

    test('should return true if all expressions are true', (t) => {
      t.assert.strictEqual(evaluate('true && true && true'), true)
    })

    test('should return false if at least one expression is false', (t) => {
      t.assert.strictEqual(evaluate('true && false && true'), false)
    })

    test('should short-circuit on false', (t) => {
      t.assert.strictEqual(evaluate('false && (1 / 0)'), false) // Should not evaluate division by zero
    })
  })

  describe('OR', () => {
    test('should return true if at least one expression is true', (t) => {
      t.assert.strictEqual(evaluate('true || false'), true)
    })

    test('should return false if all expressions are false', (t) => {
      t.assert.strictEqual(evaluate('false || false'), false)
    })

    test('should return true if at least one expression is true', (t) => {
      t.assert.strictEqual(evaluate('false || true || false'), true)
    })

    test('should short-circuit on true', (t) => {
      t.assert.strictEqual(evaluate('true || (1 / 0)'), true) // Should not evaluate division by zero
    })
  })

  test('should be able to combine AND and OR', (t) => {
    t.assert.strictEqual(evaluate('true && true || false'), true)
  })

  test('should handle complex logical expressions', (t) => {
    t.assert.strictEqual(evaluate('(true || false) && (false || true)'), true)
  })

  test('should handle NOT operator', (t) => {
    t.assert.strictEqual(evaluate('!true'), false)
  })

  test('should handle NOT with false', (t) => {
    t.assert.strictEqual(evaluate('!false'), true)
  })

  test('should handle double NOT', (t) => {
    t.assert.strictEqual(evaluate('!!true'), true)
  })
})

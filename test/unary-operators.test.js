import {test, describe} from 'node:test'
import {evaluate} from '../index.js'

describe('unary operators', () => {
  describe('logical NOT', () => {
    test('should negate true', (t) => {
      t.assert.strictEqual(evaluate('!true'), false)
    })

    test('should negate false', (t) => {
      t.assert.strictEqual(evaluate('!false'), true)
    })

    test('should handle double negation', (t) => {
      t.assert.strictEqual(evaluate('!!true'), true)
    })

    test('should handle triple negation', (t) => {
      t.assert.strictEqual(evaluate('!!!true'), false)
    })

    test('should handle negation of expressions', (t) => {
      t.assert.strictEqual(evaluate('!(1 == 1)'), false)
    })

    test('should handle negation with variables', (t) => {
      t.assert.strictEqual(evaluate('!isActive', {isActive: true}), false)
    })
  })

  describe('unary minus', () => {
    test('should negate positive number', (t) => {
      t.assert.strictEqual(evaluate('-5'), -5)
    })

    test('should negate negative number', (t) => {
      t.assert.strictEqual(evaluate('-(-5)'), 5)
    })

    test('should handle double negation', (t) => {
      t.assert.strictEqual(evaluate('--5'), 5)
    })

    test('should handle unary minus with expressions', (t) => {
      t.assert.strictEqual(evaluate('-(1 + 2)'), -3)
    })

    test('should handle unary minus with variables', (t) => {
      t.assert.strictEqual(evaluate('-value', {value: 10}), -10)
    })

    test('should handle unary minus with floats', (t) => {
      t.assert.strictEqual(evaluate('-3.14'), -3.14)
    })
  })

  describe('unary plus (should be ignored)', () => {
    test('should handle unary plus with numbers', (t) => {
      t.assert.strictEqual(evaluate('+5'), 5)
    })

    test('should handle unary plus with expressions', (t) => {
      t.assert.strictEqual(evaluate('+(1 + 2)'), 3)
    })
  })

  describe('combined unary operators', () => {
    test('should handle NOT and minus together', (t) => {
      t.assert.strictEqual(evaluate('!(-1 < 0)'), false)
    })

    test('should handle complex unary expressions', (t) => {
      t.assert.strictEqual(evaluate('!!!(false || true)'), false)
    })
  })

  test('supports many repetitions', (t) => {
    t.assert.strictEqual(evaluate(' + 1'.repeat(40).replace(' + ', '')), 40)
  })
})

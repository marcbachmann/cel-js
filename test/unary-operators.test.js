import {test, describe} from 'node:test'
import {evaluate} from '../index.js'

function strictEqualTest(expr, expected) {
  test(expr, (t) => {
    t.assert.strictEqual(evaluate(expr), expected)
  })
}

function testThrows(expr, error) {
  test(expr, (t) => {
    t.assert.throws(() => evaluate(expr), {message: error})
  })
}

describe('unary operators', () => {
  describe('logical NOT', () => {
    strictEqualTest('!true', false)
    strictEqualTest('!false', true)
    strictEqualTest('!!true', true)
    strictEqualTest('!!!true', false)
    strictEqualTest('!(1 == 1)', false)

    test('should handle negation with variables', (t) => {
      t.assert.strictEqual(evaluate('!isActive', {isActive: true}), false)
    })

    strictEqualTest('!false', true)
    strictEqualTest('!(false)', true)
    strictEqualTest('!!false', false)
    strictEqualTest('!true', false)
    strictEqualTest('!(true)', false)
    strictEqualTest('!!true', true)
    strictEqualTest('!!!true', false)
    testThrows(`!""`, 'NOT operator can only be applied to boolean values')
    testThrows(`!1`, 'NOT operator can only be applied to boolean values')
    testThrows(`![]`, 'NOT operator can only be applied to boolean values')
    testThrows(`!{}`, 'NOT operator can only be applied to boolean values')
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

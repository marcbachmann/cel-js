import {test, describe} from 'node:test'
import {evaluate} from '../index.js'

describe('addition and subtraction', () => {
  test('should evaluate addition', (t) => {
    t.assert.strictEqual(evaluate('1 + 1'), 2)
  })

  test('should evaluate subtraction', (t) => {
    t.assert.strictEqual(evaluate('1 - 1'), 0)
  })

  test('should evaluate addition with multiple terms', (t) => {
    t.assert.strictEqual(evaluate('1 + 1 + 1'), 3)
  })

  test('should evaluate addition with multiple terms with different signs', (t) => {
    t.assert.strictEqual(evaluate('1 + 1 - 1'), 1)
  })

  test('should evaluate float addition', (t) => {
    t.assert.strictEqual(evaluate('0.333 + 0.333'), 0.666)
  })

  test('should concatenate strings', (t) => {
    t.assert.strictEqual(evaluate('"a" + "b"'), 'ab')
  })

  test('should handle unary minus', (t) => {
    t.assert.strictEqual(evaluate('-5'), -5)
  })

  test('should handle unary minus with expressions', (t) => {
    t.assert.strictEqual(evaluate('-(1 + 2)'), -3)
  })

  test('should handle complex arithmetic', (t) => {
    t.assert.strictEqual(evaluate('10 - 3 + 2'), 9)
  })
})

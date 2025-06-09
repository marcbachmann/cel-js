import {test, describe} from 'node:test'
import {evaluate} from '../index.js'

describe('conditional ternary operator', () => {
  test('should handle simple ternary expressions', (t) => {
    t.assert.strictEqual(evaluate('true ? 1 : 2'), 1)
    t.assert.strictEqual(evaluate('false ? 1 : 2'), 2)
  })

  test('should handle complex conditions in ternary expressions', (t) => {
    t.assert.strictEqual(evaluate('1 < 2 ? "yes" : "no"'), 'yes')
    t.assert.strictEqual(evaluate('2 < 1 ? "yes" : "no"'), 'no')
    t.assert.strictEqual(evaluate('1 + 1 == 2 ? "correct" : "incorrect"'), 'correct')
  })

  test('should handle nested ternary expressions - true case', (t) => {
    t.assert.strictEqual(evaluate('true ? (true ? 1 : 2) : 3'), 1)
    t.assert.strictEqual(evaluate('true ? true ? 1 : 2 : 3'), 1)
    t.assert.strictEqual(evaluate('true ? (false ? 1 : 2) : 3'), 2)
    t.assert.strictEqual(evaluate('true ? false ? 1 : 2 : 3'), 2)
  })

  test('should handle nested ternary expressions - false case', (t) => {
    t.assert.strictEqual(evaluate('false ? 1 : (true ? 2 : 3)'), 2)
    t.assert.strictEqual(evaluate('false ? 1 : true ? 2 : 3'), 2)
    t.assert.strictEqual(evaluate('false ? 1 : (false ? 2 : 3)'), 3)
    t.assert.strictEqual(evaluate('false ? 1 : false ? 2 : 3'), 3)
  })

  test('should handle complex expressions in all parts of the ternary', (t) => {
    t.assert.strictEqual(evaluate('1 + 1 == 2 ? 3 * 2 : 5 * 2'), 6)
    t.assert.strictEqual(evaluate('1 + 1 != 2 ? 3 * 2 : 5 * 2'), 10)
  })

  test('should work with variables', (t) => {
    t.assert.strictEqual(evaluate('user.admin ? "Admin" : "User"', {user: {admin: true}}), 'Admin')
    t.assert.strictEqual(evaluate('user.admin ? "Admin" : "User"', {user: {admin: false}}), 'User')
  })

  test('should support logical operators in condition', (t) => {
    t.assert.strictEqual(evaluate('true && true ? "yes" : "no"'), 'yes')
    t.assert.strictEqual(evaluate('true && false ? "yes" : "no"'), 'no')
    t.assert.strictEqual(evaluate('false && true ? "yes" : "no"'), 'no')
    t.assert.strictEqual(evaluate('false || true ? "yes" : "no"'), 'yes')
    t.assert.strictEqual(evaluate('true || false ? "yes" : "no"'), 'yes')
    t.assert.strictEqual(evaluate('false || false ? "yes" : "no"'), 'no')
  })

  test('should handle null conditions properly', (t) => {
    t.assert.strictEqual(evaluate('null ? "true" : "false"'), 'false')
    t.assert.strictEqual(evaluate('!null ? "true" : "false"'), 'true')
  })

  test('should handle empty string as truthy in ternary (CEL semantics)', (t) => {
    t.assert.strictEqual(evaluate('"" ? "true" : "false"'), 'true')
    t.assert.strictEqual(evaluate('"hello" ? "true" : "false"'), 'true')
  })

  test('should handle zero as truthy in ternary (CEL semantics)', (t) => {
    t.assert.strictEqual(evaluate('0 ? "true" : "false"'), 'true')
    t.assert.strictEqual(evaluate('1 ? "true" : "false"'), 'true')
  })
})

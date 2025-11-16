import {test, describe} from 'node:test'
import {evaluate} from '../lib/index.js'

describe('conditional ternary operator', () => {
  test('should handle simple ternary expressions', (t) => {
    t.assert.strictEqual(evaluate('true ? 1 : 2'), 1n)
    t.assert.strictEqual(evaluate('false ? 1 : 2'), 2n)
  })

  test('should handle complex conditions in ternary expressions', (t) => {
    t.assert.strictEqual(evaluate('1 < 2 ? "yes" : "no"'), 'yes')
    t.assert.strictEqual(evaluate('2 < 1 ? "yes" : "no"'), 'no')
    t.assert.strictEqual(evaluate('1 + 1 == 2 ? "correct" : "incorrect"'), 'correct')
  })

  test('should handle nested ternary expressions - true case', (t) => {
    t.assert.strictEqual(evaluate('true ? (true ? 1 : 2) : 3'), 1n)
    t.assert.strictEqual(evaluate('true ? true ? 1 : 2 : 3'), 1n)
    t.assert.strictEqual(evaluate('true ? (false ? 1 : 2) : 3'), 2n)
    t.assert.strictEqual(evaluate('true ? false ? 1 : 2 : 3'), 2n)
  })

  test('should handle nested ternary expressions - false case', (t) => {
    t.assert.strictEqual(evaluate('false ? 1 : (true ? 2 : 3)'), 2n)
    t.assert.strictEqual(evaluate('false ? 1 : true ? 2 : 3'), 2n)
    t.assert.strictEqual(evaluate('false ? 1 : (false ? 2 : 3)'), 3n)
    t.assert.strictEqual(evaluate('false ? 1 : false ? 2 : 3'), 3n)
  })

  test('should handle complex expressions in all parts of the ternary', (t) => {
    t.assert.strictEqual(evaluate('1 + 1 == 2 ? 3 * 2 : 5 * 2'), 6n)
    t.assert.strictEqual(evaluate('1 + 1 != 2 ? 3 * 2 : 5 * 2'), 10n)
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
    t.assert.strictEqual(evaluate('null == null ? "true" : "false"'), 'true')
    t.assert.strictEqual(evaluate('null != null ? "true" : "false"'), 'false')
  })

  test('does not allow non-boolean values', (t) => {
    t.assert.throws(
      () => evaluate('"" ? "true" : "false"'),
      /Ternary condition must be bool, got 'string'/
    )
    t.assert.throws(
      () => evaluate('0 ? "true" : "false"'),
      /Ternary condition must be bool, got 'int'/
    )
    t.assert.throws(
      () => evaluate('b"0" ? "true" : "false"'),
      /Ternary condition must be bool, got 'bytes'/
    )
    t.assert.throws(
      () => evaluate('null ? "true" : "false"'),
      /Ternary condition must be bool, got 'null'/
    )
  })
})

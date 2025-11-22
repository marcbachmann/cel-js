import {test, describe} from 'node:test'
import {expectEval, expectEvalThrows} from './helpers.js'

describe('conditional ternary operator', () => {
  test('should handle simple ternary expressions', () => {
    expectEval('true ? 1 : 2', 1n)
    expectEval('false ? 1 : 2', 2n)
  })

  test('should handle complex conditions in ternary expressions', () => {
    expectEval('1 < 2 ? "yes" : "no"', 'yes')
    expectEval('2 < 1 ? "yes" : "no"', 'no')
    expectEval('1 + 1 == 2 ? "correct" : "incorrect"', 'correct')
  })

  test('should handle nested ternary expressions - true case', () => {
    expectEval('true ? (true ? 1 : 2) : 3', 1n)
    expectEval('true ? true ? 1 : 2 : 3', 1n)
    expectEval('true ? (false ? 1 : 2) : 3', 2n)
    expectEval('true ? false ? 1 : 2 : 3', 2n)
  })

  test('should handle nested ternary expressions - false case', () => {
    expectEval('false ? 1 : (true ? 2 : 3)', 2n)
    expectEval('false ? 1 : true ? 2 : 3', 2n)
    expectEval('false ? 1 : (false ? 2 : 3)', 3n)
    expectEval('false ? 1 : false ? 2 : 3', 3n)
  })

  test('should handle complex expressions in all parts of the ternary', () => {
    expectEval('1 + 1 == 2 ? 3 * 2 : 5 * 2', 6n)
    expectEval('1 + 1 != 2 ? 3 * 2 : 5 * 2', 10n)
  })

  test('should work with variables', () => {
    expectEval('user.admin ? "Admin" : "User"', 'Admin', {user: {admin: true}})
    expectEval('user.admin ? "Admin" : "User"', 'User', {user: {admin: false}})
  })

  test('should support logical operators in condition', () => {
    expectEval('true && true ? "yes" : "no"', 'yes')
    expectEval('true && false ? "yes" : "no"', 'no')
    expectEval('false && true ? "yes" : "no"', 'no')
    expectEval('false || true ? "yes" : "no"', 'yes')
    expectEval('true || false ? "yes" : "no"', 'yes')
    expectEval('false || false ? "yes" : "no"', 'no')
  })

  test('should handle null conditions properly', () => {
    expectEval('null == null ? "true" : "false"', 'true')
    expectEval('null != null ? "true" : "false"', 'false')
  })

  test('does not allow non-boolean values', () => {
    expectEvalThrows('"" ? "true" : "false"', /Ternary condition must be bool, got 'string'/)
    expectEvalThrows('0 ? "true" : "false"', /Ternary condition must be bool, got 'int'/)
    expectEvalThrows('b"0" ? "true" : "false"', /Ternary condition must be bool, got 'bytes'/)
    expectEvalThrows('null ? "true" : "false"', /Ternary condition must be bool, got 'null'/)
  })
})

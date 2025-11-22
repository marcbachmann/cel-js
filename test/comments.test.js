import {test, describe} from 'node:test'
import {expectEval, expectParseAst} from './helpers.js'

describe('comments', () => {
  test('should ignore single line comments at the end', () =>
    expectEval('1 + 2 // This is a comment', 3n))

  test('should ignore single line comments at the beginning', () =>
    expectEval('// This is a comment\n1 + 2', 3n))

  test('should ignore single line comments in the middle', () =>
    expectEval('1 + // comment\n2', 3n))

  test('should handle multiple comments', () => {
    const expr = `
      // First comment
      1 + // Second comment
      2   // Third comment
    `
    expectEval(expr, 3n)
  })

  test('should handle comments with complex expressions', () => {
    const expr = `
      // Calculate user permissions
      user.isAdmin && // Check admin status
      user.isActive   // Check if active
    `
    expectEval(expr, true, {user: {isAdmin: true, isActive: true}})
  })

  test('should not treat comments inside strings as comments', () =>
    expectEval('"This // is not a comment"', 'This // is not a comment'))

  test('should handle empty comment lines', () => {
    const expr = `
      (1 + 2) //
      // 
      * 3
    `
    expectEval(expr, 9n)
  })

  test('should parse expressions with comments successfully', () =>
    expectParseAst('42 // Ultimate answer', ['value', 42n]))
})

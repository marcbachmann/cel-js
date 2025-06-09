import {test, describe} from 'node:test'
import {evaluate, parse} from '../index.js'

describe('comments', () => {
  test('should ignore single line comments at the end', (t) => {
    t.assert.strictEqual(evaluate('1 + 2 // This is a comment'), 3)
  })

  test('should ignore single line comments at the beginning', (t) => {
    t.assert.strictEqual(evaluate('// This is a comment\n1 + 2'), 3)
  })

  test('should ignore single line comments in the middle', (t) => {
    t.assert.strictEqual(evaluate('1 + // comment\n2'), 3)
  })

  test('should handle multiple comments', (t) => {
    const expr = `
      // First comment
      1 + // Second comment
      2   // Third comment
    `
    t.assert.strictEqual(evaluate(expr), 3)
  })

  test('should handle comments with complex expressions', (t) => {
    const expr = `
      // Calculate user permissions
      user.isAdmin && // Check admin status
      user.isActive   // Check if active
    `
    t.assert.strictEqual(evaluate(expr, {user: {isAdmin: true, isActive: true}}), true)
  })

  test('should not treat comments inside strings as comments', (t) => {
    t.assert.strictEqual(evaluate('"This // is not a comment"'), 'This // is not a comment')
  })

  test('should handle empty comment lines', (t) => {
    const expr = `
      (1 + 2) //
      // 
      * 3
    `
    t.assert.strictEqual(evaluate(expr), 9)
  })

  test('should parse expressions with comments successfully', (t) => {
    const result = parse('42 // Ultimate answer')
    t.assert.strictEqual(typeof result, 'function')
    t.assert.strictEqual(result.ast, 42)
  })
})

import {test, describe} from 'node:test'
import {evaluate, parse} from '../index.js'

describe('operator precedence', () => {
  test('ternary should have lower precedence than logical AND', (t) => {
    // This should parse as: (true && false) ? "wrong" : "right"
    // Not as: true && (false ? "wrong" : "right")
    const result = evaluate('true && false ? "wrong" : "right"')
    t.assert.strictEqual(result, 'right')
  })

  test('ternary should have lower precedence than logical OR', (t) => {
    // This should parse as: (false || true) ? "right" : "wrong"
    const result = evaluate('false || true ? "right" : "wrong"')
    t.assert.strictEqual(result, 'right')
  })

  test('ternary should be right-associative', (t) => {
    // This should parse as: a ? (b ? "ab" : "a") : "none"
    const result = evaluate(`a ? b ? "ab" : "a" : "none"`, {
      a: true,
      b: true
    })
    t.assert.strictEqual(result, 'ab')

    const result2 = evaluate(`a ? b ? "ab" : "a" : "none"`, {
      a: true,
      b: false
    })
    t.assert.strictEqual(result2, 'a')

    const result3 = evaluate(`a ? b ? "ab" : "a" : "none"`, {
      a: false,
      b: true
    })
    t.assert.strictEqual(result3, 'none')
  })

  test('complex expression with correct precedence', (t) => {
    const expression = `
      user.isActive &&
      user.permissions.canEdit &&
      (request.method == "PUT" || request.method == "PATCH") &&
      resource.ownerId == user.id
        ? "allowed"
        : "denied"
    `

    const context = {
      user: {
        isActive: true,
        permissions: {canEdit: true},
        id: 123
      },
      request: {method: 'PUT'},
      resource: {ownerId: 123}
    }

    const result = evaluate(expression, context)
    t.assert.strictEqual(result, 'allowed')

    // Test when condition is false
    const contextFalse = {
      ...context,
      user: {...context.user, isActive: false}
    }

    const result2 = evaluate(expression, contextFalse)
    t.assert.strictEqual(result2, 'denied')
  })

  test('ternary AST structure should be correct', (t) => {
    const parsed = parse('a && b ? "yes" : "no"')

    // Should be: ["?:", ["&&", ["id", "a"], ["id", "b"]], "yes", "no"]
    const ast = parsed.ast
    t.assert.strictEqual(ast[0], '?:')
    t.assert.strictEqual(ast[2], 'yes')
    t.assert.strictEqual(ast[3], 'no')

    // The condition should be an AND operation
    const condition = ast[1]
    t.assert.strictEqual(condition[0], '&&')
    t.assert.deepStrictEqual(condition[1], ['id', 'a'])
    t.assert.deepStrictEqual(condition[2], ['id', 'b'])
  })

  test('arithmetic precedence in ternary', (t) => {
    // Should parse as: ((1 + (2 * 3)) > 5) ? "big" : "small"
    const result = evaluate('1 + 2 * 3 > 5 ? "big" : "small"')
    t.assert.strictEqual(result, 'big')
  })
})

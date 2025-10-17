import {test, describe} from 'node:test'
import {evaluate, parse} from '../lib/index.js'

describe('operator precedence', () => {
  test('ternary should have lower precedence than logical AND', (t) => {
    t.assert.strictEqual(evaluate('true && false ? "wrong" : "right"'), 'right')
  })

  test('ternary should have lower precedence than logical OR', (t) => {
    t.assert.strictEqual(evaluate('false || true ? "right" : "wrong"'), 'right')
  })

  test('ternary should be right-associative', (t) => {
    t.assert.strictEqual(evaluate(`a ? b ? "ab" : "a" : "none"`, {a: true, b: true}), 'ab')
    t.assert.strictEqual(evaluate(`a ? b ? "ab" : "a" : "none"`, {a: true, b: false}), 'a')
    t.assert.strictEqual(evaluate(`a ? b ? "ab" : "a" : "none"`, {a: false, b: true}), 'none')
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

    const result2 = evaluate(expression, {...context, user: {...context.user, isActive: false}})
    t.assert.strictEqual(result2, 'denied')
  })

  test('ternary AST structure should be correct', (t) => {
    const parsed = parse('a && b ? "yes" : "no"')
    t.assert.deepEqual(parsed.ast, [
      '?:',
      ['&&', ['id', 'a'], ['id', 'b']],
      ['value', 'yes'],
      ['value', 'no']
    ])
  })

  test('arithmetic precedence in ternary', (t) => {
    t.assert.strictEqual(evaluate('1 + 2 * 3 > 5 ? "big" : "small"'), 'big')
  })
})

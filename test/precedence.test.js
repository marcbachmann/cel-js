import {test, describe} from 'node:test'
import {expectEval, expectParseAst} from './helpers.js'

describe('operator precedence', () => {
  test('ternary should have lower precedence than logical AND', () => {
    expectEval('true && false ? "wrong" : "right"', 'right')
  })

  test('ternary should have lower precedence than logical OR', () => {
    expectEval('false || true ? "right" : "wrong"', 'right')
  })

  test('ternary should be right-associative', () => {
    expectEval(`a ? b ? "ab" : "a" : "none"`, 'ab', {a: true, b: true})
    expectEval(`a ? b ? "ab" : "a" : "none"`, 'a', {a: true, b: false})
    expectEval(`a ? b ? "ab" : "a" : "none"`, 'none', {a: false, b: true})
  })

  test('complex expression with correct precedence', () => {
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

    expectEval(expression, 'allowed', context)
    expectEval(expression, 'denied', {...context, user: {...context.user, isActive: false}})
  })

  test('ternary AST structure should be correct', () => {
    expectParseAst('a && b ? "yes" : "no"', {
      op: '?:',
      args: [
        {
          op: '&&',
          args: [
            {op: 'id', args: 'a'},
            {op: 'id', args: 'b'}
          ]
        },
        {op: 'value', args: 'yes'},
        {op: 'value', args: 'no'}
      ]
    })
  })

  test('arithmetic precedence in ternary', () => {
    expectEval('1 + 2 * 3 > 5 ? "big" : "small"', 'big')
  })
})

import {test, describe} from 'node:test'
import {expectEval} from './helpers.js'

describe('miscellaneous', () => {
  test('order of arithmetic operations', () => expectEval('1 + 2 * 3 + 1', 8n))

  describe('parentheses', () => {
    test('should prioritize parentheses expression', () => expectEval('(1 + 2) * 3 + 1', 10n))
    test('should allow multiple expressions', () => expectEval('(1 + 2) * (3 + 1)', 12n))
    test('should handle nested parentheses', () => expectEval('((1 + 2) * 3) + (4 / 2)', 11n))
    test('should handle complex nested expressions', () => {
      expectEval('(1 + (2 * (3 + 4))) - (5 - 3)', 13n)
    })
  })

  describe('operator precedence', () => {
    test('multiplication before addition', () => expectEval('2 + 3 * 4', 14n))
    test('division before subtraction', () => expectEval('10 - 8 / 2', 6n))
    test('comparison operators', () => expectEval('1 + 2 == 3 && 4 > 2', true))
    // && has higher precedence than ||
    test('logical operators precedence', () => expectEval('true || false && false', true))
  })

  describe('whitespace handling', () => {
    test('should handle extra whitespace', () => expectEval('  1   +   2  ', 3n))
    test('should handle tabs and newlines', () => expectEval('1\t+\n2', 3n))
    test('should handle no whitespace', () => expectEval('1+2*3', 7n))
  })

  describe('complex expressions', () => {
    test('should handle complex mixed operations', () => {
      expectEval('(a + b) * c > d && e || f == g', true, {
        a: 1,
        b: 2,
        c: 3,
        d: 8,
        e: false,
        f: 'hello',
        g: 'hello'
      })
    })

    test('should handle deeply nested property access', () => {
      expectEval('user.profile.settings.theme.color', 'blue', {
        user: {
          profile: {
            settings: {
              theme: {
                color: 'blue'
              }
            }
          }
        }
      })
    })

    test('should handle mixed array and object access', () => {
      expectEval('data.users[0].roles[1].permissions["read"]', true, {
        data: {
          users: [
            {
              roles: [{permissions: {read: false}}, {permissions: {read: true, write: false}}]
            }
          ]
        }
      })
    })
  })
})

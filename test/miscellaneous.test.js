import {test, describe} from 'node:test'
import {evaluate} from '../index.js'

describe('miscellaneous', () => {
  test('order of arithmetic operations', (t) => {
    t.assert.strictEqual(evaluate('1 + 2 * 3 + 1'), 8)
  })

  describe('parentheses', () => {
    test('should prioritize parentheses expression', (t) => {
      t.assert.strictEqual(evaluate('(1 + 2) * 3 + 1'), 10)
    })

    test('should allow multiple expressions', (t) => {
      t.assert.strictEqual(evaluate('(1 + 2) * (3 + 1)'), 12)
    })

    test('should handle nested parentheses', (t) => {
      t.assert.strictEqual(evaluate('((1 + 2) * 3) + (4 / 2)'), 11)
    })

    test('should handle complex nested expressions', (t) => {
      t.assert.strictEqual(evaluate('(1 + (2 * (3 + 4))) - (5 - 3)'), 13)
    })
  })

  describe('operator precedence', () => {
    test('multiplication before addition', (t) => {
      t.assert.strictEqual(evaluate('2 + 3 * 4'), 14)
    })

    test('division before subtraction', (t) => {
      t.assert.strictEqual(evaluate('10 - 8 / 2'), 6)
    })

    test('comparison operators', (t) => {
      t.assert.strictEqual(evaluate('1 + 2 == 3 && 4 > 2'), true)
    })

    test('logical operators precedence', (t) => {
      t.assert.strictEqual(evaluate('true || false && false'), true) // && has higher precedence than ||
    })
  })

  describe('whitespace handling', () => {
    test('should handle extra whitespace', (t) => {
      t.assert.strictEqual(evaluate('  1   +   2  '), 3)
    })

    test('should handle tabs and newlines', (t) => {
      t.assert.strictEqual(evaluate('1\t+\n2'), 3)
    })

    test('should handle no whitespace', (t) => {
      t.assert.strictEqual(evaluate('1+2*3'), 7)
    })
  })

  describe('complex expressions', () => {
    test('should handle complex mixed operations', (t) => {
      const context = {
        a: 1,
        b: 2,
        c: 3,
        d: 8,
        e: false,
        f: 'hello',
        g: 'hello'
      }
      t.assert.strictEqual(evaluate('(a + b) * c > d && e || f == g', context), true)
    })

    test('should handle deeply nested property access', (t) => {
      const context = {
        user: {
          profile: {
            settings: {
              theme: {
                color: 'blue'
              }
            }
          }
        }
      }
      t.assert.strictEqual(evaluate('user.profile.settings.theme.color', context), 'blue')
    })

    test('should handle mixed array and object access', (t) => {
      const context = {
        data: {
          users: [
            {
              roles: [{permissions: {read: false}}, {permissions: {read: true, write: false}}]
            }
          ]
        }
      }
      t.assert.strictEqual(evaluate('data.users[0].roles[1].permissions["read"]', context), true)
    })
  })
})

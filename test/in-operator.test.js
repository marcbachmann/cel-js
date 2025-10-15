import {test, describe} from 'node:test'
import {evaluate} from '../lib/index.js'

describe('in operator and membership tests', () => {
  describe('arrays', () => {
    test('should check if element is in array', (t) => {
      t.assert.strictEqual(evaluate('1 in [1, 2, 3]'), true)
    })

    test('should check if element is not in array', (t) => {
      t.assert.strictEqual(evaluate('4 in [1, 2, 3]'), false)
    })

    test('should check string in array', (t) => {
      t.assert.strictEqual(evaluate('"hello" in ["hello", "world"]'), true)
    })

    test('should handle empty array', (t) => {
      t.assert.strictEqual(evaluate('1 in []'), false)
    })

    test('should work with variables', (t) => {
      t.assert.strictEqual(
        evaluate('item in items', {
          item: 'apple',
          items: ['apple', 'banana', 'orange']
        }),
        true
      )
    })
  })

  describe('objects/maps', () => {
    test('should check if key exists in object', (t) => {
      t.assert.strictEqual(evaluate('"name" in {"name": "John", "age": 30}'), true)
    })

    test('should check if key does not exist in object', (t) => {
      t.assert.strictEqual(evaluate('"address" in {"name": "John", "age": 30}'), false)
    })

    test('should handle empty object', (t) => {
      t.assert.strictEqual(evaluate('"key" in {}'), false)
    })

    test('should work with variables for objects', (t) => {
      t.assert.strictEqual(
        evaluate('key in obj', {
          key: 'name',
          obj: {name: 'Alice', age: 25}
        }),
        true
      )
    })

    test('should check numeric keys in objects', (t) => {
      t.assert.strictEqual(evaluate('1 in {1: "one", 2: "two"}'), true)
    })
  })

  describe('complex expressions', () => {
    test('should work with complex left operand', (t) => {
      t.assert.strictEqual(evaluate('(1 + 1) in [1, 2, 3]'), true)
    })

    test('should work with complex right operand', (t) => {
      t.assert.strictEqual(evaluate('2 in ([1] + [2, 3])'), true)
    })

    test('should work in logical expressions', (t) => {
      const context = {
        roles: ['admin', 'user'],
        status: {active: true, verified: false}
      }
      t.assert.strictEqual(evaluate('"admin" in roles && "active" in status', context), true)
    })

    test('should work with ternary operator', (t) => {
      t.assert.strictEqual(
        evaluate('"admin" in roles ? "Admin User" : "Regular User"', {
          roles: ['admin', 'moderator']
        }),
        'Admin User'
      )
    })
  })

  describe('edge cases', () => {
    test('should handle nested arrays', (t) => {
      t.assert.strictEqual(evaluate('[1, 2] in [[1, 2], [3, 4]]'), true)
      t.assert.strictEqual(evaluate('[1] in [[1, 2], [3, 4]]'), false)
    })

    test('should handle null values', (t) => {
      t.assert.strictEqual(evaluate('null in [null, 1, 2]'), true)
      t.assert.strictEqual(evaluate('null in [[null], 1, 2]'), false)
    })

    test('should handle boolean values', (t) => {
      t.assert.strictEqual(evaluate('true in [true, false]'), true)
      t.assert.strictEqual(evaluate('true in [[true], false]'), false)
    })
  })
})

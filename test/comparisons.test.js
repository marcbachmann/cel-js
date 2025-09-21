import {test, describe} from 'node:test'
import {evaluate} from '../lib/index.js'

describe('comparison operators', () => {
  describe('equality', () => {
    test('should compare equal numbers', (t) => {
      t.assert.strictEqual(evaluate('1 == 1'), true)
    })

    test('should compare unequal numbers', (t) => {
      t.assert.strictEqual(evaluate('1 == 2'), false)
    })

    test('should compare equal strings', (t) => {
      t.assert.strictEqual(evaluate('"hello" == "hello"'), true)
    })

    test('should compare unequal strings', (t) => {
      t.assert.strictEqual(evaluate('"hello" == "world"'), false)
    })

    test('should compare equal booleans', (t) => {
      t.assert.strictEqual(evaluate('true == true'), true)
    })

    test('should compare unequal booleans', (t) => {
      t.assert.strictEqual(evaluate('true == false'), false)
    })
  })

  describe('inequality', () => {
    test('should compare unequal numbers', (t) => {
      t.assert.strictEqual(evaluate('1 != 2'), true)
    })

    test('should compare equal numbers', (t) => {
      t.assert.strictEqual(evaluate('1 != 1'), false)
    })
  })

  describe('less than', () => {
    test('should compare numbers', (t) => {
      t.assert.strictEqual(evaluate('1 < 2'), true)
    })

    test('should compare equal numbers', (t) => {
      t.assert.strictEqual(evaluate('2 < 2'), false)
    })

    test('should compare greater numbers', (t) => {
      t.assert.strictEqual(evaluate('3 < 2'), false)
    })
  })

  describe('less than or equal', () => {
    test('should compare smaller numbers', (t) => {
      t.assert.strictEqual(evaluate('1 <= 2'), true)
    })

    test('should compare equal numbers', (t) => {
      t.assert.strictEqual(evaluate('2 <= 2'), true)
    })

    test('should compare greater numbers', (t) => {
      t.assert.strictEqual(evaluate('3 <= 2'), false)
    })
  })

  describe('greater than', () => {
    test('should compare numbers', (t) => {
      t.assert.strictEqual(evaluate('2 > 1'), true)
    })

    test('should compare equal numbers', (t) => {
      t.assert.strictEqual(evaluate('2 > 2'), false)
    })

    test('should compare smaller numbers', (t) => {
      t.assert.strictEqual(evaluate('1 > 2'), false)
    })
  })

  describe('greater than or equal', () => {
    test('should compare greater numbers', (t) => {
      t.assert.strictEqual(evaluate('2 >= 1'), true)
    })

    test('should compare equal numbers', (t) => {
      t.assert.strictEqual(evaluate('2 >= 2'), true)
    })

    test('should compare smaller numbers', (t) => {
      t.assert.strictEqual(evaluate('1 >= 2'), false)
    })
  })

  describe('string comparisons', () => {
    test('should compare strings lexicographically', (t) => {
      t.assert.strictEqual(evaluate('"a" < "b"'), true)
    })

    test('should compare equal strings', (t) => {
      t.assert.strictEqual(evaluate('"hello" >= "hello"'), true)
    })
  })
})

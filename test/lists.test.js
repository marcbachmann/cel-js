import {test, describe} from 'node:test'
import {evaluate} from '../index.js'

describe('lists expressions', () => {
  describe('literals', () => {
    test('should create an empty list', (t) => {
      t.assert.deepStrictEqual(evaluate('[]'), [])
    })

    test('should create a one element list', (t) => {
      t.assert.deepStrictEqual(evaluate('[1]'), [1])
    })

    test('should create a many element list', (t) => {
      t.assert.deepStrictEqual(evaluate('[1, 2, 3]'), [1, 2, 3])
    })

    test('should create a list with mixed types', (t) => {
      t.assert.deepStrictEqual(evaluate('[1, "hello", true, null]'), [1, 'hello', true, null])
    })
  })

  describe('nested lists', () => {
    test('should create a one element nested list', (t) => {
      t.assert.deepStrictEqual(evaluate('[[1]]'), [[1]])
    })

    test('should create a many element nested list', (t) => {
      t.assert.deepStrictEqual(evaluate('[[1], [2], [3]]'), [[1], [2], [3]])
    })
  })

  describe('index access', () => {
    test('should access list by index', (t) => {
      t.assert.strictEqual(evaluate('a[1]', {a: [1, 2, 3]}), 2)
    })

    test('should access list by index if literal used', (t) => {
      t.assert.strictEqual(evaluate('[1, 2, 3][1]'), 2)
    })

    test('should access list on zero index', (t) => {
      t.assert.strictEqual(evaluate('[7, 8, 9][0]'), 7)
    })

    test('should access list a singleton', (t) => {
      t.assert.strictEqual(evaluate('["foo"][0]'), 'foo')
    })

    test('should access list on the last index', (t) => {
      t.assert.strictEqual(evaluate('[7, 8, 9][2]'), 9)
    })

    test('should access the list on middle values', (t) => {
      t.assert.strictEqual(evaluate('[0, 1, 1, 2, 3, 5, 8, 13][4]'), 3)
    })

    test('throws on string lookup', (t) => {
      t.assert.throws(() => evaluate('[1, 2, 3]["0"]'), /No such key: 0/)
    })

    test('throws on negative indices', (t) => {
      t.assert.throws(
        () => evaluate('[1, 2, 3][-1]'),
        /No such key: index out of bounds, index -1 < 0/
      )
    })

    test('throws out of bounds indices', (t) => {
      t.assert.throws(
        () => evaluate('[1][1]'),
        /No such key: index out of bounds, index 1 >= size 1/
      )

      t.assert.throws(
        () => evaluate('[1][5]'),
        /No such key: index out of bounds, index 5 >= size 1/
      )
    })

    test('throws out of bounds indices', (t) => {
      t.assert.throws(
        () => evaluate('[1][1]'),
        /No such key: index out of bounds, index 1 >= size 1/
      )

      t.assert.throws(
        () => evaluate('[1][5]'),
        /No such key: index out of bounds, index 5 >= size 1/
      )
    })

    test('throws on invalid identifier access', (t) => {
      t.assert.throws(() => evaluate('[1, 2, 3].1'), /Expected IDENTIFIER, got NUMBER/)
      t.assert.throws(() => evaluate('list.1', {list: []}), /Expected IDENTIFIER, got NUMBER/)
    })
  })

  describe('concatenation with arrays', () => {
    test('should concatenate two lists', (t) => {
      t.assert.deepStrictEqual(evaluate('[1, 2] + [3, 4]'), [1, 2, 3, 4])
    })

    test('should concatenate two lists with the same element', (t) => {
      t.assert.deepStrictEqual(evaluate('[2] + [2]'), [2, 2])
    })

    test('should return empty list if both elements are empty', (t) => {
      t.assert.deepStrictEqual(evaluate('[] + []'), [])
    })

    test('should return correct list if left side is empty', (t) => {
      t.assert.deepStrictEqual(evaluate('[] + [1, 2]'), [1, 2])
    })

    test('should return correct list if right side is empty', (t) => {
      t.assert.deepStrictEqual(evaluate('[1, 2] + []'), [1, 2])
    })
  })

  describe('with variables', () => {
    test('should use variables in list construction', (t) => {
      t.assert.deepStrictEqual(evaluate('[x, y, z]', {x: 1, y: 2, z: 3}), [1, 2, 3])
    })

    test('should access list element using variable index', (t) => {
      t.assert.strictEqual(evaluate('items[index]', {items: ['a', 'b', 'c'], index: 1}), 'b')
    })
  })
})

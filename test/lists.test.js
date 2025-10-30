import {test, describe} from 'node:test'
import {evaluate, Environment} from '../lib/index.js'

describe('lists expressions', () => {
  describe('literals', () => {
    test('should create an empty list', (t) => {
      t.assert.deepStrictEqual(evaluate('[]'), [])
    })

    test('should create a one element list', (t) => {
      t.assert.deepStrictEqual(evaluate('[1]'), [1n])
    })

    test('should create a many element list', (t) => {
      t.assert.deepStrictEqual(evaluate('[1, 2, 3]'), [1n, 2n, 3n])
    })

    test('should create a list with mixed types', (t) => {
      t.assert.deepStrictEqual(evaluate('[1, "hello", true, null]'), [1n, 'hello', true, null])
    })
  })

  describe('nested lists', () => {
    test('should create a one element nested list', (t) => {
      t.assert.deepStrictEqual(evaluate('[[1]]'), [[1n]])
    })

    test('should create a many element nested list', (t) => {
      t.assert.deepStrictEqual(evaluate('[[1], [2], [3]]'), [[1n], [2n], [3n]])
    })
  })

  describe('index access', () => {
    test('should access list by index', (t) => {
      t.assert.strictEqual(evaluate('a[1]', {a: [1, 2, 3]}), 2)
    })

    test('should access list by index if literal used', (t) => {
      t.assert.strictEqual(evaluate('[1, 5678, 3][1]'), 5678n)
    })

    test('should access list on zero index', (t) => {
      t.assert.strictEqual(evaluate('[7, 8, 9][0]'), 7n)
    })

    test('should access list a singleton', (t) => {
      t.assert.strictEqual(evaluate('["foo"][0]'), 'foo')
    })

    test('should access list on the last index', (t) => {
      t.assert.strictEqual(evaluate('[7, 8, 9][2]'), 9n)
    })

    test('should access the list on middle values', (t) => {
      t.assert.strictEqual(evaluate('[0, 1, 1, 2, 3, 5, 8, 13][4]'), 3n)
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
      t.assert.deepStrictEqual(evaluate('[1, 2] + [3, 4]'), [1n, 2n, 3n, 4n])
    })

    test('should concatenate two lists with the same element', (t) => {
      t.assert.deepStrictEqual(evaluate('[2] + [2]'), [2n, 2n])
    })

    test('should return empty list if both elements are empty', (t) => {
      t.assert.deepStrictEqual(evaluate('[] + []'), [])
    })

    test('should return correct list if left side is empty', (t) => {
      t.assert.deepStrictEqual(evaluate('[] + [1, 2]'), [1n, 2n])
    })

    test('should return correct list if right side is empty', (t) => {
      t.assert.deepStrictEqual(evaluate('[1, 2] + []'), [1n, 2n])
    })

    test('does not support mixed list types', (t) => {
      t.assert.throws(() => evaluate('[1] + [1.0]'), /no such overload: list<int> \+ list<double>/)
    })

    test('does not support in check with invalid types', (t) => {
      class User {
        constructor({name, age}) {
          this.name = name
          this.age = age
        }
      }

      const env = new Environment()
        .registerType('User', {ctor: User, fields: {name: 'string', age: 'double'}})
        .registerOperator('User == User', (a, b) => a.name === b.name && a.age === b.age)
        .registerOperator('User in list<User>', (a, b) =>
          b.some((u) => a.name === u.name && a.age === u.age)
        )
        .registerVariable('likeUser', 'map')
        .registerVariable('existingUser', 'User')
        .registerVariable('otherUser', 'User')
        .registerVariable('users', 'list<User>')
        .registerVariable('dynUser', 'dyn')

      const context = {
        likeUser: {name: 'Alice', age: 25},
        otherUser: new User({name: 'Dave', age: 22}),
        existingUser: new User({name: 'Alice', age: 25}),
        dynUser: new User({name: 'Alice', age: 25}),
        users: [
          new User({name: 'Alice', age: 25}),
          new User({name: 'Bob', age: 16}),
          new User({name: 'Charlie', age: 30})
        ]
      }

      t.assert.deepStrictEqual(env.evaluate('users[0] in users', context), true)
      t.assert.deepStrictEqual(env.evaluate('existingUser in users', context), true)
      t.assert.deepStrictEqual(env.evaluate('otherUser in users', context), false)

      t.assert.deepStrictEqual(env.evaluate('existingUser == existingUser', context), true)
      t.assert.deepStrictEqual(env.evaluate('existingUser == users[0]', context), true)
      t.assert.deepStrictEqual(env.evaluate('existingUser == dynUser', context), true)

      t.assert.throws(
        () => env.evaluate('likeUser in users', context),
        /no such overload: map<dyn, dyn> in list<User>/
      )
    })

    test('does not support equality check with invalid types', (t) => {
      t.assert.throws(
        () => evaluate('[1] == [1.0]'),
        /no such overload: list<int> == list<double>/
      )
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

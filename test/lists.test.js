import {test, describe} from 'node:test'
import {TestEnvironment, expectEval, expectEvalDeep, expectEvalThrows} from './helpers.js'

class User {
  constructor({name, age}) {
    this.name = name
    this.age = age
  }
}

const envWithUser = new TestEnvironment()
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

describe('lists expressions', () => {
  describe('literals', () => {
    test('should create an empty list', () => {
      expectEvalDeep('[]', [])
    })

    test('should create a one element list', () => {
      expectEvalDeep('[1]', [1n])
    })

    test('should create a many element list', () => {
      expectEvalDeep('[1, 2, 3]', [1n, 2n, 3n])
    })

    test('rejects mixed lists by default', () => {
      expectEvalThrows(
        '[1, 1.0]',
        /List elements must have the same type, expected type 'int' but found 'double'/
      )

      expectEvalThrows(
        '[[1], [1.0]]',
        /List elements must have the same type, expected type 'list<int>' but found 'list<double>'/
      )

      expectEvalThrows(
        '[[1], [i]]',
        /List elements must have the same type, expected type 'list<int>' but found 'list<dyn>'/,
        {i: 2}
      )

      expectEvalThrows(
        '[1, "hello", true, null]',
        /List elements must have the same type, expected type 'int' but found 'string'/
      )

      expectEvalThrows(
        '[dyn(1), "hello", true, null]',
        /List elements must have the same type, expected type 'dyn' but found 'string'/
      )

      expectEvalDeep('[dyn(1), dyn("hello"), dyn(true), dyn(null)]', [1n, 'hello', true, null])
    })

    test('allows mixed lists when explicitly disabled', () => {
      const env = new TestEnvironment({
        homogeneousAggregateLiterals: false,
        unlistedVariablesAreDyn: true
      })

      env.expectEvalDeep('[1, 1.0]', [1n, 1])
      env.expectEvalDeep('[[1], [1.0]]', [[1n], [1]])
      env.expectEvalDeep('[[1], [i]]', [[1n], [2]], {i: 2})
      env.expectEvalDeep('[1, "hello", true, null]', [1n, 'hello', true, null])
      env.expectEvalDeep('[dyn(1), "hello", true, null]', [1n, 'hello', true, null])
      env.expectEvalDeep('[dyn(1), dyn("hello"), dyn(true), dyn(null)]', [1n, 'hello', true, null])
    })
  })

  describe('nested lists', () => {
    test('should create a one element nested list', () => {
      expectEvalDeep('[[1]]', [[1n]])
    })

    test('should create a many element nested list', () => {
      expectEvalDeep('[[1], [2], [3]]', [[1n], [2n], [3n]])
    })
  })

  describe('index access', () => {
    test('should access list by index', () => {
      expectEval('a[1]', 2, {a: [1, 2, 3]})
    })

    test('should access list by index if literal used', () => {
      expectEval('[1, 5678, 3][1]', 5678n)
    })

    test('should access list on zero index', () => {
      expectEval('[7, 8, 9][0]', 7n)
    })

    test('should access list a singleton', () => {
      expectEval('["foo"][0]', 'foo')
    })

    test('should access list on the last index', () => {
      expectEval('[7, 8, 9][2]', 9n)
    })

    test('should access the list on middle values', () => {
      expectEval('[0, 1, 1, 2, 3, 5, 8, 13][4]', 3n)
    })

    test('throws on string lookup', () => {
      expectEvalThrows('[1, 2, 3]["0"]', /List index must be int, got 'string'/)
    })

    test('throws on negative indices', () => {
      expectEvalThrows('[1, 2, 3][-1]', /No such key: index out of bounds, index -1 < 0/)
    })

    test('throws out of bounds indices', () => {
      expectEvalThrows('[1][1]', /No such key: index out of bounds, index 1 >= size 1/)
      expectEvalThrows('[1][5]', /No such key: index out of bounds, index 5 >= size 1/)
    })

    test('throws out of bounds indices', () => {
      expectEvalThrows('[1][1]', /No such key: index out of bounds, index 1 >= size 1/)
      expectEvalThrows('[1][5]', /No such key: index out of bounds, index 5 >= size 1/)
    })

    test('throws on invalid identifier access', () => {
      expectEvalThrows('[1, 2, 3].1', /Expected IDENTIFIER, got NUMBER/)
      expectEvalThrows('list.1', /Expected IDENTIFIER, got NUMBER/, {list: []})
    })
  })

  describe('concatenation with arrays', () => {
    test('should concatenate two lists', () => {
      expectEvalDeep('[1, 2] + [3, 4]', [1n, 2n, 3n, 4n])
    })

    test('should concatenate two lists with the same element', () => {
      expectEvalDeep('[2] + [2]', [2n, 2n])
    })

    test('should return empty list if both elements are empty', () => {
      expectEvalDeep('[] + []', [])
    })

    test('should return correct list if left side is empty', () => {
      expectEvalDeep('[] + [1, 2]', [1n, 2n])
    })

    test('should return correct list if right side is empty', () => {
      expectEvalDeep('[1, 2] + []', [1n, 2n])
    })

    test('does not support mixed list types', () => {
      expectEvalThrows('[1] + [1.0]', /no such overload: list<int> \+ list<double>/)
      expectEvalThrows('[""] + [1.0]', /no such overload: list<string> \+ list<double>/)
    })

    test('supports mixed types with dyn', () => {
      expectEvalDeep('[1] + dyn([2.0])', [1n, 2])
      expectEvalDeep('[dyn(1)] + [2.0]', [1n, 2])
      expectEvalDeep('dyn([1]) + [2.0]', [1n, 2])
      expectEvalDeep('dyn([1]) + dyn([2.0])', [1n, 2])
      expectEvalDeep('i + [2.0]', [1n, 2], {i: [1n]})
    })
  })

  describe('value in list', () => {
    test('does not support in check with invalid types', () => {
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

      envWithUser.expectEval('users[0] in users', true, context)
      envWithUser.expectEval('existingUser in users', true, context)
      envWithUser.expectEval('otherUser in users', false, context)
      envWithUser.expectEval('existingUser == existingUser', true, context)
      envWithUser.expectEval('existingUser == users[0]', true, context)
      envWithUser.expectEval('existingUser == dynUser', true, context)
      envWithUser.expectEvalThrows(
        'likeUser in users',
        /no such overload: map<dyn, dyn> in list<User>/,
        context
      )
    })
  })

  describe('equality checks', () => {
    test('does not support equality check with invalid types', () => {
      expectEvalThrows('[1] == [1.0]', /no such overload: list<int> == list<double>/)
    })
  })

  describe('with variables', () => {
    test('should use variables in list construction', () => {
      expectEvalDeep('[x, y, z]', [1, 2, 3], {x: 1, y: 2, z: 3})
    })

    test('should access list element using variable index', () => {
      expectEval('items[index]', 'b', {items: ['a', 'b', 'c'], index: 1})
    })
  })

  describe('list.join():', () => {
    test('should join list elements into a string', () => {
      expectEval('["1", "2", "3"].join(", ")', '1, 2, 3')
    })
    test('should work with an empty list', () => {
      expectEval('[].join(", ")', '')
    })
  })
})

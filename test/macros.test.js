import {test, describe} from 'node:test'
import {expectEval, expectEvalDeep, expectEvalThrows} from './helpers.js'

describe('macros', () => {
  describe('has macro', () => {
    const context = {
      object: {property: true, 0: 'zero', keytoprop: 'property'},
      user: {
        profile: {
          name: 'John',
          email: null,
          foo: {bar: 'hello'}
        }
      }
    }

    test('should return true when nested property exists', () => {
      expectEval('has(object.property)', true, context)
    })

    test('should return false when property does not exist', () => {
      expectEval('has(object.nonExisting)', false, context)
    })

    test('should return false when property does not exist in logical expression', () => {
      expectEval('has(object.nonExisting) && object.nonExisting', false, context)
    })

    test('should work with nested properties', () => {
      expectEval('has(user.profile.name)', true, context)
      expectEval('has(user.profile.email)', true, context)
      expectEval('has(user.profile.foo.bar)', true, context)
      expectEval('has(user.profile.age)', false, context)
    })

    test('should throw when a nested property does not exist', () => {
      expectEvalThrows('has(user.nonExisting.foo)', /No such key: nonExisting/, context)
      expectEvalThrows('has(user.profile.nonExisting.bar)', /No such key: nonExisting/, context)
    })

    test('should throw when no arguments are passed', () => {
      expectEvalThrows('has()', /Function not found: 'has'/)
    })

    test('should throw when multiple arguments are passed', () => {
      expectEvalThrows('has(a, b)', /Function not found: 'has'/, {
        a: 1,
        b: 2
      })
    })

    test('should throw when argument is not a field selection', () => {
      const error = /has\(\) invalid argument/
      expectEvalThrows('has(object)', error, context)
      expectEvalThrows('has(nonexistent)', error, context)
      expectEvalThrows('has(size({}))', error, context)
      expectEvalThrows('has("foo".size())', error, context)
      expectEvalThrows('has(user["pro" + "file"].email)', error, context)
      expectEvalThrows('has(user["profile"])', error, context)
      expectEvalThrows('has(object[0])', error, context)
      expectEvalThrows('has([1][0])', error, context)
      expectEvalThrows('has({"foo":"bar"}["foo"])', error, context)
      expectEvalThrows('has(object[object.keytoprop])', error, context)
      expectEvalThrows('has([1][1])', error, context)
      expectEvalThrows('has({"foo":"bar"}["bar"])', error, context)
      expectEvalThrows('has(object[object.nonexistent])', error, context)
    })

    test('should throw when variable does not exist', () => {
      expectEvalThrows('has(nonexistent.foo)', /Unknown variable: nonexistent/)
    })

    describe('should throw when argument is an atomic expression', () => {
      const error = /has\(\) invalid argument/

      test('string literals', () => {
        expectEvalThrows('has("")', error)
        expectEvalThrows('has("a")', error)
      })

      test('array literals', () => {
        expectEvalThrows('has([])', error)
        expectEvalThrows('has([1])', error)
      })

      test('boolean literals', () => {
        expectEvalThrows('has(true)', error)
        expectEvalThrows('has(false)', error)
      })

      test('number literals', () => {
        expectEvalThrows('has(42)', error)
        expectEvalThrows('has(0)', error)
        expectEvalThrows('has(0.3)', error)
      })
    })
  })

  describe('all macro', () => {
    const context = {
      numbers: [1, 2, 3, 4, 5],
      emptyList: [],
      strings: ['hello', 'world', 'test'],
      mixed: [1, 'two', 3, 'four'],
      users: [
        {name: 'Alice', age: 25, active: true},
        {name: 'Bob', age: 30, active: true},
        {name: 'Charlie', age: 35, active: true}
      ],
      products: [
        {name: 'laptop', price: 999, inStock: true},
        {name: 'mouse', price: 25, inStock: false},
        {name: 'keyboard', price: 75, inStock: true}
      ],
      number: 42
    }

    test('is not supported on non-maps or lists', () => {
      const err = /cannot be range of a comprehension/
      expectEvalThrows('(true).all(x, x > 0)', err, context)
      expectEvalThrows('"hello".all(x, x > 0)', err, context)
      expectEvalThrows('b"hello".all(x, x <= 5)', err, context)
    })

    test('should return true when all elements match predicate', () => {
      expectEval('numbers.all(x, x > 0)', true, context)
      expectEval('numbers.all(x, x <= 5)', true, context)
      expectEval('users.all(u, u.active)', true, context)
    })

    test('should return false when not all elements match predicate', () => {
      expectEval('numbers.all(x, x > 3)', false, context)
      expectEval('products.all(p, p.inStock)', false, context)
    })

    test('should return true for empty list', () => {
      expectEval('emptyList.all(x, x > 0)', true, context)
    })

    test('should work with string operations', () => {
      expectEval('strings.all(s, s.size() > 3)', true, context)
      expectEval('strings.all(s, s.size() > 5)', false, context)
    })

    test('should work with complex predicates', () => {
      expectEval('users.all(u, u.age >= 25 && u.name.size() > 2)', true, context)
      expectEval('products.all(p, p.price > 20 || p.inStock)', true, context)
    })

    test('should throw with wrong number of arguments', () => {
      const err = /Function not found: 'all' for receiver of type 'dyn'/
      expectEvalThrows('numbers.all()', err, context)
      expectEvalThrows('numbers.all(x)', err, context)
      expectEvalThrows(
        'numbers.all(x > 0, y < 10)',
        /all\(var, predicate\) invalid predicate iteration variable/,
        context
      )
    })

    test('should throw with non-list argument', () => {
      const err = /cannot be range of a comprehension/
      expectEvalThrows('42.all(x, x > 0)', err, context)
      expectEvalThrows('"string".all(x, x > 0)', err, context)
    })

    test('should throw with invalid operation', () => {
      expectEvalThrows('mixed.all(x, x > 0)', /no such overload: dyn<string> > int/, context)
    })

    test('does not expose function for non-receiver call', () => {
      expectEvalThrows('all(numbers, x, x > 4)', /Function not found: 'all'/)
    })
  })

  describe('exists macro', () => {
    const context = {
      numbers: [1, 2, 3, 4, 5],
      emptyList: [],
      strings: ['hello', 'world', 'test'],
      users: [
        {name: 'Alice', age: 25, active: true},
        {name: 'Bob', age: 30, active: false},
        {name: 'Charlie', age: 35, active: true}
      ]
    }

    test('should return true when at least one element matches', () => {
      expectEval('numbers.exists(x, x > 4)', true, context)
      expectEval('users.exists(u, u.age > 30)', true, context)
      expectEval('users.exists(u, !u.active)', true, context)
    })

    test('should return false when no elements match', () => {
      expectEval('numbers.exists(x, x > 10)', false, context)
      expectEval('users.exists(u, u.age > 40)', false, context)
      expectEval('strings.exists(s, s == "missing")', false, context)
    })

    test('should return false for empty list', () => {
      expectEval('emptyList.exists(x, x > 0)', false, context)
    })

    test('should work with string operations', () => {
      expectEval('strings.exists(s, s.startsWith("h"))', true, context)
      expectEval('strings.exists(s, s.startsWith("z"))', false, context)
    })

    test('should throw if no boolean is returned', () => {
      const error = /exists\(var, predicate\) predicate must return bool, got/
      expectEvalThrows('numbers.exists(x, x)', error, context)
      expectEvalThrows('[0, 1, 2].exists(x, 0)', error, context)
      expectEvalThrows('[0, 1, 2].exists(x, "")', error, context)
      expectEvalThrows('[0, 1, 2].exists(x, {"nr": x})', error, context)
    })

    test('should throw with wrong number of arguments', () => {
      const err = /Function not found: 'exists' for receiver of type 'dyn'/
      expectEvalThrows('numbers.exists()', err, context)
      expectEvalThrows('numbers.exists(x)', err, context)
    })

    test('does not expose function for non-receiver call', () => {
      expectEvalThrows('exists(numbers, x, x > 4)', /Function not found: 'exists'/)
    })
  })

  describe('exists_one macro', () => {
    const context = {
      numbers: [1, 2, 3, 4, 5],
      duplicates: [1, 2, 2, 3, 4],
      emptyList: [],
      users: [
        {name: 'Alice', age: 25, admin: false},
        {name: 'Bob', age: 30, admin: true},
        {name: 'Charlie', age: 35, admin: false}
      ]
    }

    test('should return true when exactly one element matches', () => {
      expectEval('numbers.exists_one(x, x == 3)', true, context)
      expectEval('users.exists_one(u, u.admin)', true, context)
      expectEval('numbers.exists_one(x, x > 4)', true, context)
    })

    test('should return false when no elements match', () => {
      expectEval('numbers.exists_one(x, x > 10)', false, context)
      expectEval('users.exists_one(u, u.age > 40)', false, context)
    })

    test('should return false when multiple elements match', () => {
      expectEval('numbers.exists_one(x, x > 2)', false, context)
      expectEval('duplicates.exists_one(x, x == 2)', false, context)
      expectEval('users.exists_one(u, !u.admin)', false, context)
    })

    test('should return false for empty list', () => {
      expectEval('emptyList.exists_one(x, x > 0)', false, context)
    })

    test('should throw if no boolean is returned', () => {
      const error = /exists_one\(var, predicate\) predicate must return bool, got/
      expectEvalThrows('numbers.exists_one(x, x)', error, context)
      expectEvalThrows('[0, 1, 2].exists_one(x, 0)', error, context)
      expectEvalThrows('[0, 1, 2].exists_one(x, "")', error, context)
      expectEvalThrows('[0, 1, 2].exists_one(x, {"nr": x})', error, context)
    })

    test('should throw with wrong number of arguments', () => {
      const err = /Function not found: 'exists_one' for receiver of type 'dyn'/
      expectEvalThrows('numbers.exists_one()', err, context)
      expectEvalThrows('numbers.exists_one(x)', err, context)
    })

    test('does not expose function for non-receiver call', () => {
      expectEvalThrows('exists_one(numbers, x, x > 4)', /Function not found: 'exists_one'/)
    })
  })

  describe('map macro', () => {
    const context = {
      numbers: [1, 2, 3, 4, 5],
      emptyList: [],
      strings: ['hello', 'world'],
      users: [
        {name: 'Alice', age: 25},
        {name: 'Bob', age: 30}
      ],
      object: {key1: 'value1', key2: 'value2'}
    }

    test('should transform all elements', () => {
      expectEvalDeep('numbers.map(x, x * 2.0)', [2, 4, 6, 8, 10], context)
      expectEvalDeep('numbers.map(x, x + 10.0)', [11, 12, 13, 14, 15], context)

      expectEvalDeep('object.map(x, x)', ['key1', 'key2'], context)
      expectEvalDeep('object.map(x, x + ":" + object[x])', ['key1:value1', 'key2:value2'], context)
    })

    test('supports three-arg form with filter', () => {
      expectEvalDeep('numbers.map(x, x > 2, x * 2.0)', [6, 8, 10], context)
      expectEvalDeep('numbers.map(x, x < 4, x * 2.0)', [2, 4, 6], context)
      expectEvalDeep('numbers.map(x, true, x + 1.0)', [2, 3, 4, 5, 6], context)
      expectEvalDeep('numbers.map(x, false, x + 1.0)', [], context)

      expectEvalDeep('object.map(x, x.endsWith("1"), x)', ['key1'], context)
      expectEvalDeep('object.map(x, x.endsWith("1"), object[x])', ['value1'], context)
    })

    test('should work with string transformations', () => {
      expectEvalDeep('strings.map(s, s.size())', [5n, 5n], context)
    })

    test('should work with object property access', () => {
      expectEvalDeep('users.map(u, u.name)', ['Alice', 'Bob'], context)
      expectEvalDeep('users.map(u, u.age * 2.0)', [50, 60], context)
    })

    test('should work with complex transformations', () => {
      expectEvalDeep('users.map(u, u.age > 25.0)', [false, true], context)
    })

    test('should return empty list for empty input', () => {
      expectEvalDeep('emptyList.map(x, x * 2.0)', [], context)
    })

    test('supports combination with other macros', () => {
      expectEvalDeep('numbers.filter(x, x < 5.0).map(x, x * 2.0)', [2, 4, 6, 8], context)
      expectEvalDeep(
        'users.map(u, numbers.filter(x, x < 2).map(n, n + u.age)[0])',
        [26, 31],
        context
      )
    })

    test('should throw with wrong number of arguments', () => {
      const err = /Function not found: 'map' for receiver of type 'dyn'/
      expectEvalThrows('numbers.map()', err, context)
      expectEvalThrows('numbers.map(x)', err, context)
      expectEvalThrows('numbers.map(x, x, x, x)', err, context)
    })

    test('must return a boolean in filter of map(var, filter, transform)', () => {
      expectEvalThrows(
        'numbers.map(x, x, x)',
        /map\(var, filter, transform\) predicate must return bool, got/,
        context
      )

      expectEvalDeep('numbers.map(x, x == x, x)', context.numbers, context)
    })

    test('does not expose function for non-receiver call', () => {
      expectEvalThrows('map(numbers, x, x > 4)', /Function not found: 'map'/)
    })
  })

  describe('filter macro', () => {
    const context = {
      numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      emptyList: [],
      strings: ['hello', 'world', 'test', 'example'],
      users: [
        {name: 'Alice', age: 25, active: true},
        {name: 'Bob', age: 30, active: false},
        {name: 'Charlie', age: 35, active: true},
        {name: 'David', age: 20, active: false}
      ],
      object: {key1: 'value1', key2: 'value2'}
    }

    test('should filter elements based on predicate', () => {
      expectEvalDeep('numbers.filter(x, true)', context.numbers, context)
      expectEvalDeep('numbers.filter(x, false)', [], context)
      expectEvalDeep('numbers.filter(x, x > 5)', [6, 7, 8, 9, 10], context)

      expectEvalDeep('numbers.filter(number, int(number) % 2 == 0)', [0, 2, 4, 6, 8, 10], context)
    })

    test('should work with string filtering', () => {
      expectEvalDeep('strings.filter(s, s.size() > 4)', ['hello', 'world', 'example'], context)
      expectEvalDeep('strings.filter(s, s.startsWith("t"))', ['test'], context)
    })

    test('should work with object property filtering', () => {
      const activeUsers = [
        {name: 'Alice', age: 25, active: true},
        {name: 'Charlie', age: 35, active: true}
      ]
      expectEvalDeep('users.filter(u, u.active)', activeUsers, context)

      const youngUsers = [
        {name: 'Alice', age: 25, active: true},
        {name: 'David', age: 20, active: false}
      ]
      expectEvalDeep('users.filter(u, u.age < 30)', youngUsers, context)
    })

    test('should work with complex predicates', () => {
      const result = [{name: 'Alice', age: 25, active: true}]
      expectEvalDeep('users.filter(u, u.active && u.age < 30)', result, context)
    })

    test('should return empty list when no elements match', () => {
      expectEvalDeep('numbers.filter(x, x > 20)', [], context)
      expectEvalDeep('users.filter(u, u.age > 50)', [], context)
    })

    test('should return empty list for empty input', () => {
      expectEvalDeep('emptyList.filter(x, x > 0)', [], context)
    })

    test('should filter keys of a map', () => {
      expectEvalDeep('object.filter(x, x.startsWith("key"))', ['key1', 'key2'], context)
      expectEvalDeep('object.filter(x, x.endsWith("y2"))', ['key2'], context)
      expectEvalDeep(
        '{"key1": "value1", "key2": "value2"}.filter(x, x.endsWith("y2"))',
        ['key2'],
        context
      )
    })

    test('should throw if no boolean is returned', () => {
      const error = /filter\(var, predicate\) predicate must return bool, got/
      expectEvalThrows('numbers.filter(x, x)', error, context)
      expectEvalThrows('[0, 1, 2].filter(x, 0)', error, context)
      expectEvalThrows('[0, 1, 2].filter(x, "")', error, context)
      expectEvalThrows('[0, 1, 2].filter(x, {"nr": x})', error, context)
    })

    test('should throw with wrong number of arguments', () => {
      const err = /Function not found: 'filter' for receiver of type 'dyn'/
      expectEvalThrows('numbers.filter()', err, context)
      expectEvalThrows('numbers.filter(x)', err, context)
    })

    test('does not expose function for non-receiver call', () => {
      expectEvalThrows('filter(numbers, x, x > 4)', /Function not found: 'filter'/)
    })
  })

  describe('macro chaining and composition', () => {
    const context = {
      numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      users: [
        {name: 'Alice', age: 25, scores: [85, 90, 88]},
        {name: 'Bob', age: 30, scores: [75, 80, 85]},
        {name: 'Charlie', age: 35, scores: [95, 92, 98]}
      ]
    }

    test('should chain filter and map', () => {
      const evenNumbers = [2, 4, 6, 8, 10]
      const doubledEvens = [4n, 8n, 12n, 16n, 20n]

      expectEvalDeep('numbers.filter(x, int(x) % 2 == 0)', evenNumbers, context)
      expectEvalDeep('numbers.filter(x, int(x) % 2 == 0).map(x, int(x) * 2)', doubledEvens, context)
    })

    test('should use all with filtered results', () => {
      expectEval('users.filter(u, u.age > 30).all(u, u.name.size() > 3)', true, context)
    })

    test('should combine multiple macros', () => {
      expectEval('users.filter(u, u.age > 30).all(u, u.name.size() > 3)', true, context)
    })

    test('should throw if no boolean is returned', () => {
      const error = /all\(var, predicate\) predicate must return bool, got/
      expectEvalThrows('numbers.all(x, x)', error, context)
      expectEvalThrows('[0, 1, 2].all(x, 0)', error, context)
      expectEvalThrows('[0, 1, 2].all(x, "")', error, context)
      expectEvalThrows('[0, 1, 2].all(x, {"nr": x})', error, context)
    })
  })

  describe('macro error handling', () => {
    test('should handle invalid expressions in predicates', () => {
      expectEvalThrows('[1, 2, 3].all(x, nonexistent > 0)', /Unknown variable: nonexistent/)
    })

    test('should handle type errors in predicates', () => {
      expectEvalThrows(
        '[1, 2].filter(s, s.startsWith("w"))',
        /found no matching overload for 'int.startsWith/
      )
    })
  })

  describe('macro with maps and objects', () => {
    test('should work with object iteration', (t) => {
      const context = {
        scores: {alice: 85, bob: 90, charlie: 75},
        mapScores: new Map([
          ['alice', 85],
          ['bob', 90],
          ['charlie', 75]
        ])
      }

      expectEval('scores.all(s, scores[s] > 70)', true, context)
      expectEval('scores.exists(s, scores[s] > 85)', true, context)
      expectEvalDeep('scores.filter(s, scores[s] > 80)', ['alice', 'bob'], context)

      expectEval('mapScores.all(s, mapScores[s] > 70)', true, context)
      expectEval('mapScores.exists(s, mapScores[s] > 85)', true, context)
      expectEvalDeep('mapScores.filter(s, mapScores[s] > 80)', ['alice', 'bob'], context)
    })
  })
})

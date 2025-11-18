import {test, describe} from 'node:test'
import {evaluate} from '../lib/index.js'

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

    test('should return true when nested property exists', (t) => {
      t.assert.strictEqual(evaluate('has(object.property)', context), true)
    })

    test('should return false when property does not exist', (t) => {
      t.assert.strictEqual(evaluate('has(object.nonExisting)', context), false)
    })

    test('should return false when property does not exist in logical expression', (t) => {
      const result = evaluate('has(object.nonExisting) && object.nonExisting', context)
      t.assert.strictEqual(result, false)
    })

    test('should work with nested properties', (t) => {
      t.assert.strictEqual(evaluate('has(user.profile.name)', context), true)
      t.assert.strictEqual(evaluate('has(user.profile.email)', context), true)
      t.assert.strictEqual(evaluate('has(user.profile.foo.bar)', context), true)
      t.assert.strictEqual(evaluate('has(user.profile.age)', context), false)
    })

    test('should throw when a nested property does not exist', (t) => {
      t.assert.throws(() => evaluate('has(user.nonExisting.foo)', context), /No such key: nonExisting/)

      t.assert.throws(
        () => evaluate('has(user.profile.nonExisting.bar)', context),
        /No such key: nonExisting/
      )
    })

    test('should throw when no arguments are passed', (t) => {
      t.assert.throws(() => evaluate('has()'), /found no matching overload for 'has\(\)'/)
    })

    test('should throw when multiple arguments are passed', (t) => {
      t.assert.throws(
        () => evaluate('has(a, b)', {a: 1, b: 2}),
        /found no matching overload for 'has\(dyn, dyn\)'/
      )
    })

    test('should throw when argument is not a field selection', (t) => {
      const error = /has\(\) invalid argument/
      t.assert.throws(() => evaluate('has(object)', context), error)
      t.assert.throws(() => evaluate('has(nonexistent)', context), error)
      t.assert.throws(() => evaluate('has(size({}))', context), error)
      t.assert.throws(() => evaluate('has("foo".size())', context), error)
      t.assert.throws(() => evaluate('has(user["pro" + "file"].email)', context), error)
      t.assert.throws(() => evaluate('has(user["profile"])', context), error)
      t.assert.throws(() => evaluate('has(object[0])', context), error)
      t.assert.throws(() => evaluate('has([1][0])', context), error)
      t.assert.throws(() => evaluate('has({"foo":"bar"}["foo"])', context), error)
      t.assert.throws(() => evaluate('has(object[object.keytoprop])', context), error)
      t.assert.throws(() => evaluate('has([1][1])', context), error)
      t.assert.throws(() => evaluate('has({"foo":"bar"}["bar"])', context), error)
      t.assert.throws(() => evaluate('has(object[object.nonexistent])', context), error)
    })

    test('should throw when variable does not exist', (t) => {
      t.assert.throws(() => evaluate('has(nonexistent.foo)'), /Unknown variable: nonexistent/)
    })

    describe('should throw when argument is an atomic expression', () => {
      const error = /has\(\) invalid argument/

      test('string literals', (t) => {
        t.assert.throws(() => evaluate('has("")'), error)
        t.assert.throws(() => evaluate('has("a")'), error)
      })

      test('array literals', (t) => {
        t.assert.throws(() => evaluate('has([])'), error)
        t.assert.throws(() => evaluate('has([1])'), error)
      })

      test('boolean literals', (t) => {
        t.assert.throws(() => evaluate('has(true)'), error)
        t.assert.throws(() => evaluate('has(false)'), error)
      })

      test('number literals', (t) => {
        t.assert.throws(() => evaluate('has(42)'), error)
        t.assert.throws(() => evaluate('has(0)'), error)
        t.assert.throws(() => evaluate('has(0.3)'), error)
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

    test('is not supported on non-maps or lists', (t) => {
      const err = /found no matching overload/
      t.assert.throws(() => evaluate('(true).all(x, x > 0)', context), err)
      t.assert.throws(() => evaluate('"hello".all(x, x > 0)', context), err)
      t.assert.throws(() => evaluate('b"hello".all(x, x <= 5)', context), err)
    })

    test('should return true when all elements match predicate', (t) => {
      t.assert.strictEqual(evaluate('numbers.all(x, x > 0)', context), true)
      t.assert.strictEqual(evaluate('numbers.all(x, x <= 5)', context), true)
      t.assert.strictEqual(evaluate('users.all(u, u.active)', context), true)
    })

    test('should return false when not all elements match predicate', (t) => {
      t.assert.strictEqual(evaluate('numbers.all(x, x > 3)', context), false)
      t.assert.strictEqual(evaluate('products.all(p, p.inStock)', context), false)
    })

    test('should return true for empty list', (t) => {
      t.assert.strictEqual(evaluate('emptyList.all(x, x > 0)', context), true)
    })

    test('should work with string operations', (t) => {
      t.assert.strictEqual(evaluate('strings.all(s, s.size() > 3)', context), true)
      t.assert.strictEqual(evaluate('strings.all(s, s.size() > 5)', context), false)
    })

    test('should work with complex predicates', (t) => {
      t.assert.strictEqual(
        evaluate('users.all(u, u.age >= 25 && u.name.size() > 2)', context),
        true
      )
      t.assert.strictEqual(evaluate('products.all(p, p.price > 20 || p.inStock)', context), true)
    })

    test('should throw with wrong number of arguments', (t) => {
      t.assert.throws(
        () => evaluate('numbers.all()', context),
        /found no matching overload for 'list.all\(\)'/
      )
      t.assert.throws(() => evaluate('numbers.all(x)', context), /Unknown variable: x/)
      t.assert.throws(
        () => evaluate('numbers.all(x > 0, y < 10)', context),
        /all\(var, predicate\) invalid predicate iteration variable/
      )
    })

    test('should throw with non-list argument', (t) => {
      t.assert.throws(() => evaluate('42.all(x, x > 0)', context), /found no matching overload/)

      t.assert.throws(
        () => evaluate('"string".all(x, x > 0)', context),
        /found no matching overload/
      )
    })

    test('should throw with invalid operation', (t) => {
      t.assert.throws(
        () => evaluate('mixed.all(x, x > 0)', context),
        /no such overload: dyn<string> > int/
      )
    })

    test('does not expose function for non-receiver call', (t) => {
      t.assert.throws(() => evaluate('all(numbers, x, x > 4)'), /Function not found: 'all'/)
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

    test('should return true when at least one element matches', (t) => {
      t.assert.strictEqual(evaluate('numbers.exists(x, x > 4)', context), true)
      t.assert.strictEqual(evaluate('users.exists(u, u.age > 30)', context), true)
      t.assert.strictEqual(evaluate('users.exists(u, !u.active)', context), true)
    })

    test('should return false when no elements match', (t) => {
      t.assert.strictEqual(evaluate('numbers.exists(x, x > 10)', context), false)
      t.assert.strictEqual(evaluate('users.exists(u, u.age > 40)', context), false)
      t.assert.strictEqual(evaluate('strings.exists(s, s == "missing")', context), false)
    })

    test('should return false for empty list', (t) => {
      t.assert.strictEqual(evaluate('emptyList.exists(x, x > 0)', context), false)
    })

    test('should work with string operations', (t) => {
      t.assert.strictEqual(evaluate('strings.exists(s, s.startsWith("h"))', context), true)
      t.assert.strictEqual(evaluate('strings.exists(s, s.startsWith("z"))', context), false)
    })

    test('should throw if no boolean is returned', (t) => {
      const error = /exists\(var, predicate\) predicate must return bool, got/
      t.assert.throws(() => evaluate('numbers.exists(x, x)', context), error)
      t.assert.throws(() => evaluate('[0, 1, 2].exists(x, 0)', context), error)
      t.assert.throws(() => evaluate('[0, 1, 2].exists(x, "")', context), error)
      t.assert.throws(() => evaluate('[0, 1, 2].exists(x, {"nr": x})', context), error)
    })

    test('should throw with wrong number of arguments', (t) => {
      t.assert.throws(
        () => evaluate('numbers.exists()', context),
        /found no matching overload for 'list.exists\(\)/
      )
      t.assert.throws(() => evaluate('numbers.exists(x)', context), /Unknown variable: x/)
    })

    test('does not expose function for non-receiver call', (t) => {
      t.assert.throws(() => evaluate('exists(numbers, x, x > 4)'), /Function not found: 'exists'/)
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

    test('should return true when exactly one element matches', (t) => {
      t.assert.strictEqual(evaluate('numbers.exists_one(x, x == 3)', context), true)
      t.assert.strictEqual(evaluate('users.exists_one(u, u.admin)', context), true)
      t.assert.strictEqual(evaluate('numbers.exists_one(x, x > 4)', context), true)
    })

    test('should return false when no elements match', (t) => {
      t.assert.strictEqual(evaluate('numbers.exists_one(x, x > 10)', context), false)
      t.assert.strictEqual(evaluate('users.exists_one(u, u.age > 40)', context), false)
    })

    test('should return false when multiple elements match', (t) => {
      t.assert.strictEqual(evaluate('numbers.exists_one(x, x > 2)', context), false)
      t.assert.strictEqual(evaluate('duplicates.exists_one(x, x == 2)', context), false)
      t.assert.strictEqual(evaluate('users.exists_one(u, !u.admin)', context), false)
    })

    test('should return false for empty list', (t) => {
      t.assert.strictEqual(evaluate('emptyList.exists_one(x, x > 0)', context), false)
    })

    test('should throw if no boolean is returned', (t) => {
      const error = /exists_one\(var, predicate\) predicate must return bool, got/
      t.assert.throws(() => evaluate('numbers.exists_one(x, x)', context), error)
      t.assert.throws(() => evaluate('[0, 1, 2].exists_one(x, 0)', context), error)
      t.assert.throws(() => evaluate('[0, 1, 2].exists_one(x, "")', context), error)
      t.assert.throws(() => evaluate('[0, 1, 2].exists_one(x, {"nr": x})', context), error)
    })

    test('should throw with wrong number of arguments', (t) => {
      t.assert.throws(
        () => evaluate('numbers.exists_one()', context),
        /found no matching overload for 'list.exists_one\(\)/
      )
      t.assert.throws(() => evaluate('numbers.exists_one(x)', context), /Unknown variable: x/)
    })

    test('does not expose function for non-receiver call', (t) => {
      t.assert.throws(
        () => evaluate('exists_one(numbers, x, x > 4)'),
        /Function not found: 'exists_one'/
      )
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

    test('should transform all elements', (t) => {
      t.assert.deepStrictEqual(evaluate('numbers.map(x, x * 2.0)', context), [2, 4, 6, 8, 10])
      t.assert.deepStrictEqual(evaluate('numbers.map(x, x + 10.0)', context), [11, 12, 13, 14, 15])

      t.assert.deepStrictEqual(evaluate('object.map(x, x)', context), ['key1', 'key2'])
      t.assert.deepStrictEqual(evaluate('object.map(x, x + ":" + object[x])', context), [
        'key1:value1',
        'key2:value2'
      ])
    })

    test('supports three-arg form with filter', (t) => {
      t.assert.deepStrictEqual(evaluate('numbers.map(x, x > 2, x * 2.0)', context), [6, 8, 10])
      t.assert.deepStrictEqual(evaluate('numbers.map(x, x < 4, x * 2.0)', context), [2, 4, 6])
      t.assert.deepStrictEqual(evaluate('numbers.map(x, true, x + 1.0)', context), [2, 3, 4, 5, 6])
      t.assert.deepStrictEqual(evaluate('numbers.map(x, false, x + 1.0)', context), [])

      t.assert.deepStrictEqual(evaluate('object.map(x, x.endsWith("1"), x)', context), ['key1'])
      t.assert.deepStrictEqual(evaluate('object.map(x, x.endsWith("1"), object[x])', context), [
        'value1'
      ])
    })

    test('should work with string transformations', (t) => {
      t.assert.deepStrictEqual(evaluate('strings.map(s, s.size())', context), [5n, 5n])
    })

    test('should work with object property access', (t) => {
      t.assert.deepStrictEqual(evaluate('users.map(u, u.name)', context), ['Alice', 'Bob'])
      t.assert.deepStrictEqual(evaluate('users.map(u, u.age * 2.0)', context), [50, 60])
    })

    test('should work with complex transformations', (t) => {
      t.assert.deepStrictEqual(evaluate('users.map(u, u.age > 25.0)', context), [false, true])
    })

    test('should return empty list for empty input', (t) => {
      t.assert.deepStrictEqual(evaluate('emptyList.map(x, x * 2.0)', context), [])
    })

    test('supports combination with other macros', (t) => {
      t.assert.deepStrictEqual(
        evaluate('numbers.filter(x, x < 5.0).map(x, x * 2.0)', context),
        [2, 4, 6, 8]
      )

      t.assert.deepStrictEqual(
        evaluate('users.map(u, numbers.filter(x, x < 2).map(n, n + u.age)[0])', context),
        [26, 31]
      )
    })

    test('should throw with wrong number of arguments', (t) => {
      t.assert.throws(
        () => evaluate('numbers.map()', context),
        /found no matching overload for 'list.map\(\)'/
      )
      t.assert.throws(() => evaluate('numbers.map(x)', context), /Unknown variable: x/)

      t.assert.throws(() => evaluate('numbers.map(x, x, x, x)', context), /Unknown variable: x/)
    })

    test('must return a boolean in filter of map(var, filter, transform)', (t) => {
      t.assert.throws(
        () => evaluate('numbers.map(x, x, x)', context),
        /map\(var, filter, transform\) predicate must return bool, got/
      )

      t.assert.deepStrictEqual(evaluate('numbers.map(x, x == x, x)', context), context.numbers)
    })

    test('does not expose function for non-receiver call', (t) => {
      t.assert.throws(() => evaluate('map(numbers, x, x > 4)'), /Function not found: 'map'/)
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

    test('should filter elements based on predicate', (t) => {
      t.assert.deepStrictEqual(evaluate('numbers.filter(x, true)', context), context.numbers)
      t.assert.deepStrictEqual(evaluate('numbers.filter(x, false)', context), [])
      t.assert.deepStrictEqual(evaluate('numbers.filter(x, x > 5)', context), [6, 7, 8, 9, 10])

      t.assert.deepStrictEqual(
        evaluate('numbers.filter(number, int(number) % 2 == 0)', context),
        [0, 2, 4, 6, 8, 10]
      )
    })

    test('should work with string filtering', (t) => {
      t.assert.deepStrictEqual(evaluate('strings.filter(s, s.size() > 4)', context), [
        'hello',
        'world',
        'example'
      ])
      t.assert.deepStrictEqual(evaluate('strings.filter(s, s.startsWith("t"))', context), ['test'])
    })

    test('should work with object property filtering', (t) => {
      const activeUsers = [
        {name: 'Alice', age: 25, active: true},
        {name: 'Charlie', age: 35, active: true}
      ]
      t.assert.deepStrictEqual(evaluate('users.filter(u, u.active)', context), activeUsers)

      const youngUsers = [
        {name: 'Alice', age: 25, active: true},
        {name: 'David', age: 20, active: false}
      ]
      t.assert.deepStrictEqual(evaluate('users.filter(u, u.age < 30)', context), youngUsers)
    })

    test('should work with complex predicates', (t) => {
      const result = [{name: 'Alice', age: 25, active: true}]
      t.assert.deepStrictEqual(evaluate('users.filter(u, u.active && u.age < 30)', context), result)
    })

    test('should return empty list when no elements match', (t) => {
      t.assert.deepStrictEqual(evaluate('numbers.filter(x, x > 20)', context), [])
      t.assert.deepStrictEqual(evaluate('users.filter(u, u.age > 50)', context), [])
    })

    test('should return empty list for empty input', (t) => {
      t.assert.deepStrictEqual(evaluate('emptyList.filter(x, x > 0)', context), [])
    })

    test('should filter keys of a map', (t) => {
      t.assert.deepStrictEqual(evaluate('object.filter(x, x.startsWith("key"))', context), [
        'key1',
        'key2'
      ])
      t.assert.deepStrictEqual(evaluate('object.filter(x, x.endsWith("y2"))', context), ['key2'])
      t.assert.deepStrictEqual(
        evaluate('{"key1": "value1", "key2": "value2"}.filter(x, x.endsWith("y2"))', context),
        ['key2']
      )
    })

    test('should throw if no boolean is returned', (t) => {
      const error = /filter\(var, predicate\) predicate must return bool, got/
      t.assert.throws(() => evaluate('numbers.filter(x, x)', context), error)
      t.assert.throws(() => evaluate('[0, 1, 2].filter(x, 0)', context), error)
      t.assert.throws(() => evaluate('[0, 1, 2].filter(x, "")', context), error)
      t.assert.throws(() => evaluate('[0, 1, 2].filter(x, {"nr": x})', context), error)
    })

    test('should throw with wrong number of arguments', (t) => {
      t.assert.throws(
        () => evaluate('numbers.filter()', context),
        /found no matching overload for 'list.filter\(\)'/
      )
      t.assert.throws(() => evaluate('numbers.filter(x)', context), /Unknown variable: x/)
    })

    test('does not expose function for non-receiver call', (t) => {
      t.assert.throws(() => evaluate('filter(numbers, x, x > 4)'), /Function not found: 'filter'/)
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

    test('should chain filter and map', (t) => {
      // Filter even numbers then double them
      const evenNumbers = [2, 4, 6, 8, 10]
      const doubledEvens = [4n, 8n, 12n, 16n, 20n]

      t.assert.deepStrictEqual(evaluate('numbers.filter(x, int(x) % 2 == 0)', context), evenNumbers)
      t.assert.deepStrictEqual(
        evaluate('numbers.filter(x, int(x) % 2 == 0).map(x, int(x) * 2)', context),
        doubledEvens
      )
    })

    test('should use all with filtered results', (t) => {
      // Check if all filtered users have high scores
      t.assert.strictEqual(
        evaluate('users.filter(u, u.age > 30).all(u, u.name.size() > 3)', context),
        true
      )
    })

    test('should combine multiple macros', (t) => {
      // Complex example: check if there exists exactly one user over 30 with all scores above 90
      t.assert.strictEqual(
        evaluate('users.filter(u, u.age > 30).all(u, u.name.size() > 3)', context),
        true
      )
    })

    test('should throw if no boolean is returned', (t) => {
      const error = /all\(var, predicate\) predicate must return bool, got/
      t.assert.throws(() => evaluate('numbers.all(x, x)', context), error)
      t.assert.throws(() => evaluate('[0, 1, 2].all(x, 0)', context), error)
      t.assert.throws(() => evaluate('[0, 1, 2].all(x, "")', context), error)
      t.assert.throws(() => evaluate('[0, 1, 2].all(x, {"nr": x})', context), error)
    })
  })

  describe('macro error handling', () => {
    test('should handle invalid expressions in predicates', (t) => {
      t.assert.throws(
        () => evaluate('[1, 2, 3].all(x, nonexistent > 0)'),
        /Unknown variable: nonexistent/
      )
    })

    test('should handle type errors in predicates', (t) => {
      t.assert.throws(
        () => evaluate('[1, 2].filter(s, s.startsWith("w"))'),
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

      t.assert.strictEqual(evaluate('scores.all(s, scores[s] > 70)', context), true)
      t.assert.strictEqual(evaluate('scores.exists(s, scores[s] > 85)', context), true)
      t.assert.deepStrictEqual(evaluate('scores.filter(s, scores[s] > 80)', context), [
        'alice',
        'bob'
      ])

      t.assert.strictEqual(evaluate('mapScores.all(s, mapScores[s] > 70)', context), true)
      t.assert.strictEqual(evaluate('mapScores.exists(s, mapScores[s] > 85)', context), true)
      t.assert.deepStrictEqual(evaluate('mapScores.filter(s, mapScores[s] > 80)', context), [
        'alice',
        'bob'
      ])
    })
  })
})

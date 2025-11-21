import {test, describe} from 'node:test'
import {evaluate, Environment} from '../lib/index.js'

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

    test('should work with dyn in dyn<list> variables', (t) => {
      const ctx = {item: 'apple', items: ['apple', 'banana', 'orange']}
      t.assert.strictEqual(evaluate('1 in items', ctx), false)
      t.assert.strictEqual(evaluate('dyn("apple") in dyn(items)', ctx), true)
      t.assert.strictEqual(evaluate('"apple" in items', ctx), true)
      t.assert.strictEqual(evaluate('item in items', ctx), true)
      t.assert.strictEqual(evaluate('dyn(item) in items', ctx), true)
      t.assert.strictEqual(evaluate('dyn("apple") in items', ctx), true)
    })

    test('should work if dyn in list<string>', (t) => {
      const ctx = {plan: 'pro'}
      t.assert.strictEqual(evaluate('plan in ["pro", "enterprise"]', ctx), true)
      t.assert.strictEqual(evaluate('dyn(plan) in ["pro", "enterprise"]', ctx), true)
      t.assert.strictEqual(evaluate('dyn("pro") in ["pro", "enterprise"]', ctx), true)
      t.assert.strictEqual(evaluate('dyn(1) in ["pro", "enterprise"]', ctx), false)

      t.assert.strictEqual(evaluate('bool in [dyn(1.0), dyn(bool)]', ctx), true)
      t.assert.strictEqual(evaluate('dyn(bool) in [dyn(1.0), dyn(bool)]', ctx), true)

      t.assert.strictEqual(evaluate('false in [dyn(1.0), dyn(false)]', ctx), true)
      t.assert.strictEqual(evaluate('dyn(false) in [dyn(1.0), dyn(false)]', ctx), true)

      t.assert.strictEqual(evaluate('1 in [dyn(1.0), dyn(false)]', ctx), true)
      t.assert.strictEqual(evaluate('dyn(1) in [dyn(1.0), dyn(false)]', ctx), true)

      t.assert.strictEqual(evaluate('1 in dyn([2.0, 3.0])', ctx), false)
      t.assert.strictEqual(evaluate('true in dyn([2.0, 3.0])', ctx), false)
      t.assert.strictEqual(evaluate('dyn(1) in dyn([2.0, 3.0])', ctx), false)
      t.assert.strictEqual(evaluate('dyn(1) in dyn(["1"])', ctx), false)
    })

    test('throws for non-matching types', (t) => {
      const ethrows = (expr, pattern) => t.assert.throws(() => evaluate(expr), pattern)
      ethrows('1 in ["pro", "enterprise"]', /no such overload: int in list<string>/)
      ethrows('1 in [1.0, 1.2]', /no such overload: int in list<double>/)
      ethrows('true in [1.0, 1.2]', /no such overload: bool in list<double>/)
      ethrows('"true" in [true, false]', /no such overload: string in list<bool>/)
      ethrows('1 in [[1], [2]]', /no such overload: int in list<list<int>>/)
      ethrows('"test" in [[1], [2]]', /no such overload: string in list<list<int>>/)
      ethrows('true in [[true], [false]]', /no such overload: bool in list<list<bool>>/)
      ethrows('null in [[null]]', /no such overload: null in list<list<null>>/)
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

    test('throws for non-matching map key types', (t) => {
      const ethrows = (expr, pattern) => t.assert.throws(() => evaluate(expr), pattern)
      ethrows('1 in {"a": 1, "b": 2}', /no such overload: int in map<string, int>/)
      ethrows('true in {1: "a", 2: "b"}', /no such overload: bool in map<int, string>/)
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
    })

    test('should handle boolean values', (t) => {
      t.assert.strictEqual(evaluate('true in [true, false]'), true)
    })
  })

  describe('generic overloads', () => {
    test('supports timestamp membership without enumerated overloads', (t) => {
      t.assert.strictEqual(
        evaluate('timestamp("2024-01-01T00:00:00Z") in [timestamp("2024-01-01T00:00:00Z")]'),
        true
      )
    })

    test('supports custom types in typed environments', (t) => {
      class Widget {
        constructor(id) {
          this.id = id
        }
      }

      const shared = new Widget('beta')
      const env = new Environment()
        .registerType('Widget', Widget)
        .registerVariable('widgets', 'list<Widget>')
        .registerVariable('candidate', 'Widget')

      const ctx = {
        widgets: [new Widget('alpha'), shared],
        candidate: shared
      }

      t.assert.strictEqual(env.evaluate('candidate in widgets', ctx), true)
    })

    test('supports map membership with custom key types', (t) => {
      class Key {
        constructor(id) {
          this.id = id
        }
      }

      const key = new Key('primary')
      const env = new Environment()
        .registerType('Key', Key)
        .registerVariable('key', 'Key')
        .registerVariable('lookup', 'map<Key, string>')

      const ctx = {
        key,
        lookup: new Map([[key, 'value']])
      }

      t.assert.strictEqual(env.evaluate('key in lookup', ctx), true)
    })
  })

  describe('with typed environments', () => {
    test('validates types with declared list variables', (t) => {
      const env = new Environment()
        .registerVariable('names', 'list<string>')
        .registerVariable('numbers', 'list<int>')

      const ctx = {names: ['Alice', 'Bob'], numbers: [1n, 2n, 3n]}

      t.assert.strictEqual(env.evaluate('"Alice" in names', ctx), true)
      t.assert.strictEqual(env.evaluate('1 in numbers', ctx), true)

      t.assert.throws(
        () => env.evaluate('1 in names', ctx),
        /no such overload: int in list<string>/
      )
      t.assert.throws(
        () => env.evaluate('"test" in numbers', ctx),
        /no such overload: string in list<int>/
      )
    })

    test('validates types with declared map variables', (t) => {
      const env = new Environment()
        .registerVariable('config', 'map<string, bool>')
        .registerVariable('scores', 'map<string, int>')

      const ctx = {config: {enabled: true}, scores: {alice: 100n}}

      t.assert.strictEqual(env.evaluate('"enabled" in config', ctx), true)
      t.assert.strictEqual(env.evaluate('"alice" in scores', ctx), true)

      t.assert.throws(
        () => env.evaluate('1 in config', ctx),
        /no such overload: int in map<string, bool>/
      )
    })
  })
})

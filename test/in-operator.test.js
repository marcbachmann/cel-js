import {test, describe} from 'node:test'
import {TestEnvironment, expectEval, expectEvalThrows} from './helpers.js'

describe('in operator and membership tests', () => {
  describe('arrays', () => {
    test('should check if element is in array', () => {
      expectEval('1 in [1, 2, 3]', true)
    })

    test('should check if element is not in array', () => {
      expectEval('4 in [1, 2, 3]', false)
    })

    test('should check string in array', () => {
      expectEval('"hello" in ["hello", "world"]', true)
    })

    test('should handle empty array', () => {
      expectEval('1 in []', false)
    })

    test('should work with dyn in dyn<list> variables', () => {
      const ctx = {item: 'apple', items: ['apple', 'banana', 'orange']}
      expectEval('1 in items', false, ctx)
      expectEval('dyn("apple") in dyn(items)', true, ctx)
      expectEval('"apple" in items', true, ctx)
      expectEval('item in items', true, ctx)
      expectEval('dyn(item) in items', true, ctx)
      expectEval('dyn("apple") in items', true, ctx)
    })

    test('should work if dyn in list<string>', () => {
      const ctx = {plan: 'pro'}
      expectEval('plan in ["pro", "enterprise"]', true, ctx)
      expectEval('dyn(plan) in ["pro", "enterprise"]', true, ctx)
      expectEval('dyn("pro") in ["pro", "enterprise"]', true, ctx)
      expectEval('dyn(1) in ["pro", "enterprise"]', false, ctx)

      expectEval('bool in [dyn(1.0), dyn(bool)]', true, ctx)
      expectEval('dyn(bool) in [dyn(1.0), dyn(bool)]', true, ctx)

      expectEval('false in [dyn(1.0), dyn(false)]', true, ctx)
      expectEval('dyn(false) in [dyn(1.0), dyn(false)]', true, ctx)

      expectEval('1 in [dyn(1.0), dyn(false)]', true, ctx)
      expectEval('dyn(1) in [dyn(1.0), dyn(false)]', true, ctx)

      expectEval('1 in dyn([2.0, 3.0])', false, ctx)
      expectEval('true in dyn([2.0, 3.0])', false, ctx)
      expectEval('dyn(1) in dyn([2.0, 3.0])', false, ctx)
      expectEval('dyn(1) in dyn(["1"])', false, ctx)
    })

    test('throws for non-matching types', () => {
      const ethrows = (expr, pattern) => expectEvalThrows(expr, pattern)
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
    test('should check if key exists in object', () => {
      expectEval('"name" in {"name": "John", "age": "30", "role": "admin"}', true)
    })

    test('should check if key does not exist in object', () => {
      expectEval('"address" in {"name": "John", "age": "30", "role": "admin"}', false)
    })

    test('should handle empty object', () => {
      expectEval('"key" in {}', false)
    })

    test('should work with variables for objects', () => {
      expectEval('key in obj', true, {
        key: 'name',
        obj: {name: 'Alice', age: 25}
      })
    })

    test('should check numeric keys in objects', () => {
      expectEval('1 in {1: "one", 2: "two"}', true)
    })

    test('throws for non-matching map key types', () => {
      const ethrows = (expr, pattern) => expectEvalThrows(expr, pattern)
      ethrows('1 in {"a": 1, "b": 2}', /no such overload: int in map<string, int>/)
      ethrows('true in {1: "a", 2: "b"}', /no such overload: bool in map<int, string>/)
    })
  })

  describe('complex expressions', () => {
    test('should work with complex left operand', () => {
      expectEval('(1 + 1) in [1, 2, 3]', true)
    })

    test('should work with complex right operand', () => {
      expectEval('2 in ([1] + [2, 3])', true)
    })

    test('should work in logical expressions', () => {
      const context = {
        roles: ['admin', 'user'],
        status: {active: true, verified: false}
      }
      expectEval('"admin" in roles && "active" in status', true, context)
    })

    test('should work with ternary operator', () => {
      expectEval('"admin" in roles ? "Admin User" : "Regular User"', 'Admin User', {
        roles: ['admin', 'moderator']
      })
    })
  })

  describe('edge cases', () => {
    test('should handle nested arrays', () => {
      expectEval('[1, 2] in [[1, 2], [3, 4]]', true)
      expectEval('[1] in [[1, 2], [3, 4]]', false)
    })

    test('should handle null values', () => {
      expectEval('null in [null]', true)
    })

    test('should handle boolean values', () => {
      expectEval('true in [true, false]', true)
    })
  })

  describe('generic overloads', () => {
    test('supports timestamp membership without enumerated overloads', () => {
      expectEval('timestamp("2024-01-01T00:00:00Z") in [timestamp("2024-01-01T00:00:00Z")]', true)
    })

    test('supports custom types in typed environments', () => {
      class Widget {
        constructor(id) {
          this.id = id
        }
      }

      const shared = new Widget('beta')
      const env = new TestEnvironment()
        .registerType('Widget', Widget)
        .registerVariable('widgets', 'list<Widget>')
        .registerVariable('candidate', 'Widget')

      const ctx = {
        widgets: [new Widget('alpha'), shared],
        candidate: shared
      }

      env.expectEval('candidate in widgets', true, ctx)
    })

    test('supports map membership with custom key types', () => {
      class Key {
        constructor(id) {
          this.id = id
        }
      }

      const key = new Key('primary')
      const env = new TestEnvironment()
        .registerType('Key', Key)
        .registerVariable('key', 'Key')
        .registerVariable('lookup', 'map<Key, string>')

      const ctx = {
        key,
        lookup: new Map([[key, 'value']])
      }

      env.expectEval('key in lookup', true, ctx)
    })
  })

  describe('with typed environments', () => {
    test('validates types with declared list variables', () => {
      const env = new TestEnvironment()
        .registerVariable('names', 'list<string>')
        .registerVariable('numbers', 'list<int>')

      const ctx = {names: ['Alice', 'Bob'], numbers: [1n, 2n, 3n]}

      env.expectEval('"Alice" in names', true, ctx)
      env.expectEval('1 in numbers', true, ctx)
      env.expectEvalThrows('1 in names', /no such overload: int in list<string>/, ctx)
      env.expectEvalThrows('"test" in numbers', /no such overload: string in list<int>/, ctx)
    })

    test('validates types with declared map variables', () => {
      const env = new TestEnvironment()
        .registerVariable('config', 'map<string, bool>')
        .registerVariable('scores', 'map<string, int>')

      const ctx = {config: {enabled: true}, scores: {alice: 100n}}
      env.expectEval('"enabled" in config', true, ctx)
      env.expectEval('"alice" in scores', true, ctx)
      env.expectEvalThrows('1 in config', /no such overload: int in map<string, bool>/, ctx)
    })
  })
})

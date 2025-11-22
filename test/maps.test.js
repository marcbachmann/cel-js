import {test, describe} from 'node:test'
import {evaluate, Environment} from '../lib/index.js'

describe('maps/objects expressions', () => {
  describe('literals', () => {
    test('should create an empty map', (t) => {
      t.assert.deepStrictEqual(evaluate('{}'), {})
    })

    test('should create a simple map', (t) => {
      t.assert.deepStrictEqual(evaluate('{"key": "value"}'), {key: 'value'})
    })

    test('should create a map with multiple properties', (t) => {
      t.assert.deepStrictEqual(evaluate('{"first": "John", "last": "Doe", "city": "Berlin"}'), {
        first: 'John',
        last: 'Doe',
        city: 'Berlin'
      })
    })

    test('should handle numeric keys', (t) => {
      t.assert.deepStrictEqual(evaluate('{1: "one", 2: "two"}'), {
        1: 'one',
        2: 'two'
      })
    })

    test('should handle computed keys', (t) => {
      t.assert.deepStrictEqual(evaluate('{("key" + "1"): "value1"}'), {
        key1: 'value1'
      })
    })

    test('supports equality checks', (t) => {
      t.assert.deepStrictEqual(evaluate('{"foo": "bar"} == {"foo": "bar"}'), true)
      t.assert.deepStrictEqual(evaluate('{dyn("foo"): "bar"} == {dyn("foo"): "bar"}'), true)
      t.assert.deepStrictEqual(evaluate('{"foo": "bar"} == dyn({"foo": "bar"})'), true)
      t.assert.deepStrictEqual(evaluate('{dyn("foo"): "bar"} == dyn({"foo": "bar"})'), true)

      t.assert.deepStrictEqual(evaluate('{"foo": "bar"} == {"foo": "hello"}'), false)

      t.assert.deepStrictEqual(evaluate('{"foo": "bar"} != {"foo": "bar"}'), false)
      t.assert.deepStrictEqual(evaluate('{"foo": "bar"} != {"foo": "hello"}'), true)
      t.assert.deepStrictEqual(evaluate('{"foo": dyn(1)} != {"foo": "hello"}'), true)
      t.assert.deepStrictEqual(
        evaluate('{"foo": dyn(1), "hello": dyn("bar")} != {"foo": "hello", "hello": "bar"}'),
        true
      )
    })

    test('does not support equality checks with mixed types', (t) => {
      t.assert.throws(
        () => evaluate('{"foo": "bar"} == ["foo", "bar"]'),
        /no such overload: map<string, string> == list<string>/
      )
      t.assert.throws(
        () => evaluate('{"foo": "bar"} != ["foo", "bar"]'),
        /no such overload: map<string, string> != list<string>/
      )
      t.assert.throws(
        () => evaluate('{1: "foo"} == {"foo": "bar"}'),
        /no such overload: map<int, string> == map<string, string>/
      )
    })
  })

  describe('nested maps', () => {
    test('should create nested maps', (t) => {
      t.assert.deepStrictEqual(evaluate('{"user": {"first": "John", "last": "Doe"}}'), {
        user: {first: 'John', last: 'Doe'}
      })
    })

    test('should create deeply nested maps', (t) => {
      t.assert.deepStrictEqual(evaluate('{"a": {"b": {"c": "deep"}}}'), {
        a: {b: {c: 'deep'}}
      })
    })
  })

  describe('maps with arrays', () => {
    test('should create map with array values', (t) => {
      t.assert.deepStrictEqual(evaluate('{"items": [1, 2, 3], "more": [4, 5]}'), {
        items: [1n, 2n, 3n],
        more: [4n, 5n]
      })
    })

    test('rejects mixed value types by default', (t) => {
      t.assert.throws(
        () => evaluate('{"name": "John", "age": 30, "active": true}'),
        /Map value uses wrong type/
      )
    })

    test('allows mixed value types when explicitly disabled', (t) => {
      const env = new Environment({homogeneousAggregateLiterals: false})
      t.assert.deepStrictEqual(env.evaluate('{"name": "John", "age": 30, "active": true}'), {
        name: 'John',
        age: 30n,
        active: true
      })
    })

    test('allows mixed value types when wrapped with dyn', (t) => {
      t.assert.deepStrictEqual(
        evaluate('{"name": dyn("John"), "age": dyn(30), "active": dyn(true)}'),
        {name: 'John', age: 30n, active: true}
      )
    })

    test('still enforces map values when explicitly enabled', (t) => {
      const env = new Environment({homogeneousAggregateLiterals: true})
      t.assert.throws(
        () => env.evaluate('{"name": "John", "age": 30}'),
        /Map value uses wrong type/
      )
    })

    test('rejects mixed key types by default', (t) => {
      t.assert.throws(() => evaluate('{"name": "John", 1: "duplicate"}'), /Map key uses wrong type/)
    })

    test('allows mixed key types when explicitly disabled', (t) => {
      const env = new Environment({homogeneousAggregateLiterals: false})
      t.assert.deepStrictEqual(env.evaluate('{"name": "John", 1: "duplicate"}'), {
        name: 'John',
        1: 'duplicate'
      })
    })

    test('allows mixed key types when wrapped with dyn', (t) => {
      t.assert.deepStrictEqual(evaluate('{dyn("name"): "John", dyn(1): "one"}'), {
        name: 'John',
        1: 'one'
      })
    })

    test('still enforces map keys when explicitly enabled', (t) => {
      const env = new Environment({homogeneousAggregateLiterals: true})
      t.assert.throws(
        () => env.evaluate('{"name": "John", 1: "duplicate"}'),
        /Map key uses wrong type/
      )
    })

    test('should create array of maps', (t) => {
      t.assert.deepStrictEqual(evaluate('[{"name": "John"}, {"name": "Jane"}]'), [
        {name: 'John'},
        {name: 'Jane'}
      ])
    })
  })

  describe('with variables', () => {
    test('should use variables as values', (t) => {
      t.assert.deepStrictEqual(
        evaluate('{"name": userName, "age": userAge}', {
          userName: 'Alice',
          userAge: 25
        }),
        {name: 'Alice', age: 25}
      )
    })

    test('should use variables as keys', (t) => {
      t.assert.deepStrictEqual(evaluate('{keyName: "value"}', {keyName: 'dynamicKey'}), {
        dynamicKey: 'value'
      })
    })
  })

  describe('property access', () => {
    test('should access map property with dot notation', (t) => {
      t.assert.strictEqual(evaluate('obj.name', {obj: {name: 'John'}}), 'John')
    })

    test('should access map property with bracket notation', (t) => {
      t.assert.strictEqual(evaluate('obj["name"]', {obj: {name: 'John'}}), 'John')
      t.assert.strictEqual(evaluate('obj["$"]', {obj: {$: 'John'}}), 'John')
      t.assert.strictEqual(evaluate('obj["0"]', {obj: {0: 'John'}}), 'John')
    })

    test('should access nested properties', (t) => {
      t.assert.strictEqual(
        evaluate('user.profile.name', {user: {profile: {name: 'Alice'}}}),
        'Alice'
      )
    })

    test('allows property access on maps in list', (t) => {
      t.assert.strictEqual(evaluate('[{"name": "John"}, {"name": "Jane"}][0].name'), 'John')
    })

    test('throws on invalid property access (no_such_field)', (t) => {
      t.assert.throws(() => evaluate('{"foo": "bar"}.hello'), /No such key: hello/)
      t.assert.throws(() => evaluate('foo.hello', {foo: {}}), /No such key: hello/)
    })

    test('throws on invalid identifier access', (t) => {
      t.assert.throws(() => evaluate('{"0": "bar"}.0'), /Expected IDENTIFIER, got NUMBER/)
    })
  })

  describe('mixed access patterns', () => {
    test('should handle mixed dot and bracket notation', (t) => {
      const context = {
        data: {
          users: [{profile: {'full-name': 'John Doe'}}]
        }
      }
      t.assert.strictEqual(evaluate('data.users[0].profile["full-name"]', context), 'John Doe')
    })
  })
})

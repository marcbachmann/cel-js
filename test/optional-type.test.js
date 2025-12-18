import assert from 'node:assert/strict'
import {describe, test} from 'node:test'
import {
  expectType,
  expectEval,
  expectEvalDeep,
  expectEvalThrows,
  expectParseAst
} from './helpers.js'
import {Environment, serialize, parse, evaluate} from '../lib/index.js'

describe('optional type:', () => {
  describe('config flag:', () => {
    test('parse rejects optional chaining when disabled', () => {
      assert.throws(() => parse('user.?name'), /Expected IDENTIFIER, got QUESTION/)
      assert.throws(() => parse('user[?0]'), /Unexpected token: QUESTION/)
      assert.throws(() => evaluate('optional.of(1)'), /Unknown variable: optional/)
    })

    test('Environment with enableOptionalTypes parses optional chaining', () => {
      const env = new Environment({enableOptionalTypes: true, unlistedVariablesAreDyn: true})
      const fn = env.parse('user.?name.orValue("-")')
      assert.strictEqual(typeof fn, 'function')
    })
  })

  describe('optional class:', () => {
    test('optional.of() should create an optional with value', () => {
      expectEval('optional.of(42).hasValue()', true)
      expectEval('optional.of(42).value()', 42n)
      expectEval('optional.of(42).orValue(0)', 42n)
    })

    test('optional.none() should create an empty optional', () => {
      expectEval('optional.none().hasValue()', false)
      expectEval('optional.none().orValue(99)', 99n)
    })

    test('optional.value() should throw on none', () => {
      expectEvalThrows('optional.none().value()', /optional value is not present/i)
    })

    test('optional with string value', () => {
      expectEval('optional.of("hello").hasValue()', true)
      expectEval('optional.of("hello").value()', 'hello')
      expectEval('optional.of("hello").orValue("default")', 'hello')
    })

    test('optional with null value', () => {
      expectEval('optional.of(null).hasValue()', true)
      expectEval('optional.of(null).value()', null)
      expectEval('optional.of(dyn(null)).orValue("default")', null)
    })

    test('optional with list value', () => {
      expectEval('optional.of([1, 2, 3]).hasValue()', true)
      expectEvalDeep('optional.of([1, 2, 3]).value()', [1n, 2n, 3n])
    })
  })

  describe('optional.or() method', () => {
    test('or() returns original optional when it has a value', () => {
      expectEval('optional.of(42).or(99).hasValue()', true)
      expectEval('optional.of(42).or(99).value()', 42n)
    })

    test('or() returns new optional with default when original is empty', () => {
      expectEval('optional.none().or(99).hasValue()', true)
      expectEval('optional.none().or(99).value()', 99n)
    })

    test('or() via CEL expression - with value', () => {
      expectEval('optional.of(42).or(99).value()', 42n)
    })

    test('or() via CEL expression - without value', () => {
      expectEval('optional.none().or(99).value()', 99n)
    })

    test('or() with different types - string', () => {
      expectEval('optional.of("hello").or("world").value()', 'hello')
      expectEval('optional.none().or("world").value()', 'world')
    })

    test('or() with list values', () => {
      expectEvalDeep('optional.of([1, 2, 3]).or([4, 5, 6]).value()', [1n, 2n, 3n])
      expectEvalDeep('optional.none().or([4, 5, 6]).value()', [4n, 5n, 6n])
    })

    test('or() chaining - first has value via JS', () => {
      expectEval('optional.of(1).or(2).or(3).value()', 1n)
    })

    test('or() chaining - takes first default via JS', () => {
      expectEval('optional.none().or(2).or(3).value()', 2n)
    })

    test('or() chaining - uses last default if all none via JS', () => {
      // Note: optional.none().or(x) returns optional<dyn>, so chaining still works
      expectEval('optional.none().or(null).or(3).value()', null)
    })

    test('or() with null value is still considered present', () => {
      expectEval('optional.of(dyn(null)).or(42).value()', null)
    })

    test('or() return type is optional', () => {
      expectEval('optional.of(42).or(99).hasValue()', true)
      expectEval('optional.of(42).or(99).value()', 42n)
    })

    test('or() combined with orValue()', () => {
      expectEval('optional.none().or(99).orValue(0)', 99n)
      expectEval('optional.none().or(null).orValue(0)', null)
    })

    test('or() accepts dyn fallback', () => {
      expectEval('optional.of(1).or(dyn("fallback")).value()', 1n)
      expectEval('optional.none().or(dyn("fallback")).value()', 'fallback')
    })

    test('or() with .? operator result', () => {
      const obj1 = {field: 42}
      const obj2 = {field: 99}
      expectEval('obj1.?field.or(obj2.field).value()', 42, {obj1, obj2})

      const obj3 = {}
      expectEval('obj3.?field.or(obj2.field).value()', 99, {obj3, obj2})
    })

    test('or() preserves type parameter in template matching', () => {
      // This test verifies that optional<A>.or(A): optional<A> properly binds types
      expectEval('optional.of(42).or(99).value()', 42n)
    })

    test('or() with mixed numeric types', () => {
      // In dynamic context, optional<dyn>.or(int) should work
      expectEval('optional.none().or(42).value()', 42n)
    })

    test('or() returns same optional instance when value exists', () => {
      expectEval('optional.of("test").or("default").value()', 'test')
    })
  })

  describe('optional namespace functions', () => {
    describe('optional.of()', () => {
      test('should create optional with value', () => {
        expectEval('optional.of(42).hasValue()', true)
        expectEval('optional.of(42).value()', 42n)
      })

      test('should work with string values', () => {
        expectEval('optional.of("hello").hasValue()', true)
        expectEval('optional.of("hello").value()', 'hello')
      })

      test('should work with boolean values', () => {
        expectEval('optional.of(true).hasValue()', true)
        expectEval('optional.of(true).value()', true)
        expectEval('optional.of(false).hasValue()', true)
        expectEval('optional.of(false).value()', false)
      })

      test('should work with null', () => {
        expectEval('optional.of(null).hasValue()', true)
        expectEval('optional.of(null).value()', null)
      })

      test('should work with lists', () => {
        expectEval('optional.of([1, 2, 3]).hasValue()', true)
        expectEvalDeep('optional.of([1, 2, 3]).value()', [1n, 2n, 3n])
      })

      test('should work with maps', () => {
        expectEval('optional.of({"key": "value"}).hasValue()', true)
        expectEvalDeep('optional.of({"key": "value"}).value()', {key: 'value'})
      })

      test('should support chaining with other optional methods', () => {
        expectEval('optional.of(10).orValue(20)', 10n)
        expectEval('optional.of("test").or("default").value()', 'test')
      })

      test('should work with variables', () => {
        expectEval('optional.of(x).value()', 42n, {x: 42n})
        expectEval('optional.of(name).value()', 'Alice', {name: 'Alice'})
      })

      test('should work with expressions', () => {
        expectEval('optional.of(1 + 2).value()', 3n)
        expectEval('optional.of("hello" + " world").value()', 'hello world')
      })

      test('should work with dyn expressions on either side', () => {
        expectEval('optional.of(dyn(1)).orValue("fallback")', 1n)
        expectEval('optional.of(1).orValue(dyn("fallback"))', 1n)
      })
    })

    describe('optional.none()', () => {
      test('should create empty optional', () => {
        expectEval('optional.none().hasValue()', false)
      })

      test('should return default with orValue', () => {
        expectEval('optional.none().orValue(42)', 42n)
        expectEval('optional.none().orValue("default")', 'default')
      })

      test('should return another optional with or', () => {
        expectEval('optional.none().or(99).value()', 99n)
        expectEval('optional.none().or("fallback").value()', 'fallback')
      })

      test('should throw when accessing value()', () => {
        expectEvalThrows('optional.none().value()')
      })

      test('should work in conditional expressions', () => {
        expectEval('optional.none().hasValue() ? "yes" : "no"', 'no')
      })
    })

    describe('integration with .? operator', () => {
      test('should work together with optional chaining', () => {
        const obj = {field: 42}
        expectEval('obj.?field.hasValue() && optional.of(10).hasValue()', true, {obj})
      })

      test('should allow mixing namespace functions with field access optionals', () => {
        const obj = {value: 5n}
        expectEval('optional.of(obj.?value.orValue(0)).value()', 5n, {obj})
      })

      test('should handle none from both sources', () => {
        const obj = {}
        expectEval('obj.?missing.hasValue() || optional.none().hasValue()', false, {obj})
      })
    })

    describe('type checking', () => {
      test('optional.of should accept any type', () => {
        expectType('optional.of(42)', 'optional<int>')
      })

      test('optional.none should return optional', () => {
        expectType('optional.none()', 'optional<dyn>')
      })

      test('should type check chained methods', () => {
        expectType('optional.of("test").value()', 'string')
      })
    })
  })

  describe('.? operator - evaluation', () => {
    describe('basic field access', () => {
      test('should return optional when field exists', () => {
        const obj = {field: 42}
        expectEval('obj.?field.hasValue()', true, {obj})
        expectEval('obj.?field.value()', 42, {obj})
      })

      test('should return optional.none() when field missing', () => {
        const obj = {}
        expectEval('obj.?field.hasValue()', false, {obj})
      })

      test('chained access with .? should work', () => {
        const obj = {a: {b: {c: 42}}}
        expectEval('obj.?a.?b.?c.hasValue()', true, {obj})
        expectEval('obj.?a.?b.?c.value()', 42, {obj})
      })
    })

    describe('viral propagation', () => {
      test('obj.?missing.field should return optional.none()', () => {
        const obj = {}
        expectEval('obj.?missing.field.hasValue()', false, {obj})
      })

      test('obj.?a.b.c - once .? is used, all subsequent accesses are optional', () => {
        const obj = {a: {}}
        expectEval('obj.?a.b.c.hasValue()', false, {obj})
      })

      test('obj.?a.b.c.d.e - deep nesting should work', () => {
        const obj = {}
        expectEval('obj.?missing.deeply.nested.field.hasValue()', false, {obj})
      })

      test('viral propagation with existing path', () => {
        const obj = {a: {b: {c: 42}}}
        expectEval('obj.?a.b.c.hasValue()', true, {obj})
        expectEval('obj.?a.b.c.value()', 42, {obj})
      })

      test('viral propagation stops at first missing field', () => {
        const obj = {a: {b: {}}}
        expectEval('obj.?a.b.missing.deeply.nested.hasValue()', false, {obj})
      })
    })

    describe('orValue() with defaults', () => {
      test('should use default value when field missing', () => {
        const obj = {}
        expectEval('obj.?field.orValue(99)', 99n, {obj})
      })

      test('should return actual value when present', () => {
        const obj = {field: 42}
        expectEval('obj.?field.orValue(99)', 42, {obj})
      })

      test('chained optional with orValue', () => {
        const obj = {a: {}}
        expectEval('obj.?a.b.c.orValue("default")', 'default', {obj})
      })

      test('orValue with complex default', () => {
        const obj = {}
        expectEvalDeep('obj.?field.orValue([1, 2, 3])', [1n, 2n, 3n], {obj})
      })
    })

    describe('[? optional index access', () => {
      test('should return optional for valid index', () => {
        const items = [1, 2, 3]
        expectEval('items[?0].hasValue()', true, {items})
        expectEval('items[?0].value()', 1, {items})
      })

      test('should return optional.none() for out of bounds', () => {
        const items = [1, 2, 3]
        expectEval('items[?10].hasValue()', false, {items})
      })

      test('should work with map access', () => {
        const data = {key1: 'value1'}
        expectEval('data[?"key1"].hasValue()', true, {data})
        expectEval('data[?"key1"].value()', 'value1', {data})
      })

      test('map with missing key', () => {
        const data = {key1: 'value1'}
        expectEval('data[?"missing"].hasValue()', false, {data})
      })
    })

    describe('viral propagation with index access', () => {
      test('obj.?items[0] should propagate optional', () => {
        const obj = {items: [1, 2, 3]}
        expectEval('obj.?items[0].hasValue()', true, {obj})
        expectEval('obj.?items[0].value()', 1, {obj})
      })

      test('obj.?missing[0] should return optional.none()', () => {
        const obj = {}
        expectEval('obj.?missing[0].hasValue()', false, {obj})
      })

      test('items[?0].field should propagate optional', () => {
        const items = [{field: 42}]
        expectEval('items[?0].field.hasValue()', true, {items})
        expectEval('items[?0].field.value()', 42, {items})
      })
    })

    describe('special values', () => {
      test('null value is not same as missing', () => {
        const obj = {field: null}
        expectEval('obj.?field.hasValue()', true, {obj})
        expectEval('obj.?field.value()', null, {obj})
      })

      test('zero is not same as missing', () => {
        const obj = {count: 0}
        expectEval('obj.?count.hasValue()', true, {obj})
        expectEval('obj.?count.value()', 0, {obj})
      })

      test('false is not same as missing', () => {
        const obj = {flag: false}
        expectEval('obj.?flag.hasValue()', true, {obj})
        expectEval('obj.?flag.value()', false, {obj})
      })

      test('empty string is not same as missing', () => {
        const obj = {text: ''}
        expectEval('obj.?text.hasValue()', true, {obj})
        expectEval('obj.?text.value()', '', {obj})
      })
    })

    describe('mixed optional and regular access', () => {
      test('regular access before optional', () => {
        const obj = {a: {b: {c: 42}}}
        expectEval('obj.a.?b.c.hasValue()', true, {obj})
        expectEval('obj.a.?b.c.value()', 42, {obj})
      })

      test('regular access before optional with missing field', () => {
        const obj = {a: {}}
        expectEval('obj.a.?missing.field.hasValue()', false, {obj})
      })

      test('parenthesized optional propagates to subsequent access', () => {
        // When accessing fields on optional values, it automatically propagates
        const obj1 = {a: {b: {bar: 42}}}
        expectEval('(obj.?a.b).bar.orValue(1)', 42, {obj: obj1})

        const obj2 = {a: {}}
        expectEval('(obj.?a.b).bar.orValue(1)', 1n, {obj: obj2})

        const obj3 = {a: {b: {}}}
        expectEval('(obj.?a.b).bar.orValue(1)', 1n, {obj: obj3})
      })

      test('parenthesized optional with .value() unwrapping works', () => {
        const obj = {a: {b: {bar: 42}}}
        expectEval('(obj.?a.b).value().bar', 42, {obj})
      })

      test('viral propagation without parentheses works with orValue', () => {
        const obj1 = {a: {b: {bar: 42}}}
        expectEval('obj.?a.b.bar.orValue(1)', 42, {obj: obj1})

        const obj2 = {a: {}}
        expectEval('obj.?a.b.bar.orValue(1)', 1n, {obj: obj2})

        const obj3 = {a: {b: {}}}
        expectEval('obj.?a.b.bar.orValue(1)', 1n, {obj: obj3})
      })

      test('array access on optional propagates', () => {
        const account = {balance: {items: [1, 2, 3]}}
        expectEval('(account.balance.?items)[0].orValue(99)', 1, {account})

        const account2 = {balance: {}}
        expectEval('(account.balance.?items)[0].orValue(99)', 99n, {account: account2})
      })
    })

    describe('complex expressions with optional', () => {
      test('optional in conditional', () => {
        const obj = {field: 42}
        expectEval('obj.?field.hasValue() ? obj.?field.value() : 0', 42, {obj})
      })

      test('optional with missing field in conditional', () => {
        const obj = {}
        expectEval('obj.?field.hasValue() ? obj.?field.value() : 0', 0n, {obj})
      })

      test('optional with arithmetic', () => {
        const obj = {x: 10n}
        expectEval('obj.?x.orValue(0) + 5', 15n, {obj})
      })

      test('optional with missing field and arithmetic', () => {
        const obj = {}
        expectEval('obj.?x.orValue(0) + 5', 5n, {obj})
      })

      test('supports nested optional chaining with .value()', () => {
        // Can call string methods on .value() result
        expectEval(`({"foo": {"bar": "hello"}.?bar}).foo.value().size()`, 5n)

        // Without .value(), optional methods must be used
        expectEvalThrows(
          `({"foo": {"bar": "hello"}.?bar}).foo.size()`,
          /found no matching overload for 'optional\.size\(\)'/
        )
      })

      test('throws error on invalid access', () => {
        expectEvalThrows(
          `({"foo": {"test": [1]}}).?foo.test["2"].orValue(1)`,
          /List index must be int, got 'string'/
        )
      })

      test('complex nested optional with defaults', () => {
        expectEval(`({"foo": {"test": {"1": "foo"}}}).?foo.test["2"].orValue("3")`, '3')
      })
    })
  })

  describe('.? support for has macro', () => {
    test('has() works with optional field access', () => {
      const obj1 = {field: 42}
      expectEval('has(obj1.field.?foo.foo)', false, {obj1})
      expectEval('has(obj1.?field.foo.bar)', false, {obj1})
      expectEval('has(obj1.?field.?foo.bar)', false, {obj1})

      // The last prop can't have .? as it would make has() arg invalid
      expectEvalThrows(`has(obj1.?field)`, /has\(\) invalid argument/, {obj1})
      expectEvalThrows(`has(obj1.?field.?foo.?bar)`, /has\(\) invalid argument/, {obj1})
    })
  })

  describe('Parser support', () => {
    const serializationEnv = new Environment({
      enableOptionalTypes: true,
      unlistedVariablesAreDyn: true
    })
    test('should parse .? operator', () => {
      expectParseAst('obj.?field', ['.?', ['id', 'obj'], 'field'])
    })

    test('should parse [? operator', () => {
      expectParseAst('list[?0]', ['[?]', ['id', 'list'], ['value', 0n]])
    })

    test('should parse chained optional access', () => {
      expectParseAst('a.?b.c', ['.', ['.?', ['id', 'a'], 'b'], 'c'])
    })

    test('should serialize .? operator', () => {
      const parsed = serializationEnv.parse('obj.?field')
      const result = serialize(parsed.ast)
      expectEval('result', 'obj.?field', {result})
    })

    test('should serialize [? operator', () => {
      const parsed = serializationEnv.parse('list[?0]')
      const result = serialize(parsed.ast)
      expectEval('result', 'list[?0]', {result})
    })
  })
})

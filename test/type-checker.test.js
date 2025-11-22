import {test, describe} from 'node:test'
import assert from 'node:assert'
import {TypeError} from '../lib/errors.js'
import {Environment} from '../lib/evaluator.js'

function expectType(env, exp, type) {
  const result = env.check(exp)
  if (!result.valid) throw result.error
  assert.strictEqual(result.type, type)
}

function expectTypeError(env, exp, matcher) {
  const {valid, error} = env.check(exp)
  assert.strictEqual(valid, false)
  assert.ok(error instanceof TypeError)
  if (!matcher) return error
  if (matcher instanceof RegExp) {
    assert.match(error.message, matcher)
  } else if (typeof matcher === 'string') {
    assert.ok(
      error.message.includes(matcher),
      `Expected error message to include "${matcher}" but got "${error.message}"`
    )
  } else if (typeof matcher === 'function') {
    matcher(error)
  }
  return error
}

describe('Type Checker', () => {
  test('valid variable references', () => {
    const env = new Environment()
      .registerVariable('name', 'string')
      .registerVariable('age', 'int')
      .registerVariable('active', 'bool')

    expectType(env, 'name', 'string')
    expectType(env, 'age', 'int')
    expectType(env, 'active', 'bool')
  })

  test('unknown variable', () => {
    const env = new Environment().registerVariable('x', 'int')

    const error = expectTypeError(env, 'unknownVar', /Unknown variable: unknownVar/)
    assert.strictEqual(error.node[0], 'id')
    assert.strictEqual(error.node[1], 'unknownVar')
  })

  test('literals', () => {
    const env = new Environment()

    expectType(env, '42', 'int')
    expectType(env, '3.14', 'double')
    expectType(env, '"hello"', 'string')
    expectType(env, 'true', 'bool')
    expectType(env, 'false', 'bool')
    expectType(env, 'null', 'null')
    expectType(env, '[1, 2, 3]', 'list<int>')
    // Map literals need key-value pairs
    expectType(env, '{"a": 1}', 'map<string, int>')
  })

  test('list literal enforces homogeneous elements by default', () => {
    const env = new Environment()
    expectTypeError(env, '[1, "two", true]', /List elements must have the same type/)
  })

  test('list literal allows mixed element types when explicitly disabled', () => {
    const env = new Environment({homogeneousAggregateLiterals: false})
    expectType(env, '[1, "two"]', 'list')
  })

  test('list literal rejects assignable nested types by default', () => {
    const env = new Environment()
    expectTypeError(
      env,
      '[[], [1]]',
      /List elements must have the same type, expected type 'list<dyn>' but found 'list<int>'/
    )
  })

  test('list literal rejects mixing dyn elements with concrete ones', () => {
    const env = new Environment()

    expectTypeError(
      env,
      '[dyn(1), 2]',
      /List elements must have the same type, expected type 'dyn' but found 'int'/
    )

    expectTypeError(
      env,
      '[1, dyn(2)]',
      /List elements must have the same type, expected type 'int' but found 'dyn'/
    )
  })

  test('map literal enforces homogeneous value types by default', () => {
    const env = new Environment()
    expectTypeError(env, '{"name": "John", "age": 30}', /Map value uses wrong type/)
  })

  test('map literal allows mixed value types when explicitly disabled', () => {
    const env = new Environment({homogeneousAggregateLiterals: false})
    expectType(env, '{"name": "John", "age": 30}', 'map<string, dyn>')
  })

  test('map literal accepts mixed value types when wrapped with dyn', () => {
    const env = new Environment()
    expectType(env, '{"name": dyn("John"), "age": dyn(30)}', 'map<string, dyn>')
  })

  test('map literal enforces homogeneous key types by default', () => {
    const env = new Environment()
    expectTypeError(env, '{"name": "John", 1: "other"}', /Map key uses wrong type/)
  })

  test('map literal allows mixed key types when explicitly disabled', () => {
    const env = new Environment({homogeneousAggregateLiterals: false})
    expectType(env, '{"name": "John", 1: "other"}', 'map<dyn, string>')
  })

  test('map literal accepts mixed key types when wrapped with dyn', () => {
    const env = new Environment()
    expectType(env, '{dyn("name"): "John", dyn(1): "other"}', 'map<dyn, string>')
  })

  test('map literal rejects assignable nested map types by default', () => {
    const env = new Environment()
    expectTypeError(
      env,
      '{"primary": {}, "secondary": {"id": 1}}',
      /Map value uses wrong type, expected type 'map<dyn, dyn>' but found 'map<string, int>'/
    )
  })

  test('map literal rejects mixing dyn keys or values with concrete ones', () => {
    const env = new Environment()

    expectTypeError(
      env,
      '{"name": "John", "age": dyn(30)}',
      /Map value uses wrong type, expected type 'string' but found 'dyn'/
    )

    expectTypeError(
      env,
      '{"name": "John", dyn(1): "other"}',
      /Map key uses wrong type, expected type 'string' but found 'dyn'/
    )
  })

  test('arithmetic operators with matching types', () => {
    const env = new Environment()
      .registerVariable('x', 'int')
      .registerVariable('y', 'int')
      .registerVariable('a', 'double')
      .registerVariable('b', 'double')

    expectType(env, 'x + y', 'int')
    expectType(env, 'x - y', 'int')
    expectType(env, 'x * y', 'int')
    expectType(env, 'x / y', 'int')
    expectType(env, 'x % y', 'int')

    expectType(env, 'a + b', 'double')
    expectType(env, 'a - b', 'double')
    expectType(env, 'a * b', 'double')
    expectType(env, 'a / b', 'double')
  })

  test('arithmetic operators with mixed int/double', () => {
    const env = new Environment().registerVariable('x', 'int').registerVariable('a', 'double')

    // Mixed int/double operations are not defined in overloads
    // They would require runtime type coercion
    expectTypeError(env, 'x + a', /no such overload: int \+ double/)
    expectTypeError(env, 'a + x', /no such overload: double \+ int/)
    expectTypeError(env, 'x * a', /no such overload: int \* double/)
  })

  test('string concatenation', () => {
    const env = new Environment()
      .registerVariable('first', 'string')
      .registerVariable('last', 'string')

    expectType(env, 'first + " " + last', 'string')
  })

  test('list concatenation', () => {
    const env = new Environment()
      .registerVariable('list1', 'list')
      .registerVariable('list2', 'list')

    expectType(env, 'list1 + list2', 'list')
  })

  test('invalid arithmetic (string + int)', () => {
    const env = new Environment().registerVariable('str', 'string').registerVariable('num', 'int')

    const error = expectTypeError(env, 'str + num', /no such overload: string \+ int/)
    assert.strictEqual(error.node[0], '+')
    assert.strictEqual(error.node[1][0], 'id')
    assert.strictEqual(error.node[1][1], 'str')
    assert.strictEqual(error.node[2][0], 'id')
    assert.strictEqual(error.node[2][1], 'num')
  })

  test('comparison operators', () => {
    const env = new Environment().registerVariable('x', 'int').registerVariable('y', 'int')

    expectType(env, 'x < y', 'bool')
    expectType(env, 'x <= y', 'bool')
    expectType(env, 'x > y', 'bool')
    expectType(env, 'x >= y', 'bool')
    expectType(env, 'x == y', 'bool')
    expectType(env, 'x != y', 'bool')
  })

  test('comparison with incompatible types', () => {
    const env = new Environment().registerVariable('str', 'string').registerVariable('num', 'int')

    expectTypeError(env, 'str < num')
  })

  test('logical operators', () => {
    const env = new Environment().registerVariable('a', 'bool').registerVariable('b', 'bool')

    expectType(env, 'a && b', 'bool')
    expectType(env, 'a || b', 'bool')
    expectType(env, '!a', 'bool')
  })

  test('logical operators with non-bool', () => {
    const env = new Environment().registerVariable('x', 'int').registerVariable('y', 'int')

    expectTypeError(env, 'x && y', /Logical operator requires bool operands/)
  })

  test('ternary operator', () => {
    const env = new Environment()
      .registerVariable('condition', 'bool')
      .registerVariable('x', 'int')
      .registerVariable('y', 'int')

    expectType(env, 'condition ? x : y', 'int')
  })

  test('ternary with non-bool condition', () => {
    const env = new Environment().registerVariable('x', 'int')

    expectTypeError(env, 'x ? 1 : 2', /Ternary condition must be bool/)
  })

  test('ternary with different branch types', () => {
    const env = new Environment().registerVariable('condition', 'bool')
    expectType(env, 'condition ? dyn("yes") : 42', 'dyn')
    expectType(env, 'condition ? "yes" : dyn(42)', 'dyn')
  })

  test('ternary with different branch types', () => {
    const env = new Environment().registerVariable('condition', 'bool')

    expectTypeError(
      env,
      'condition ? "yes" : 42',
      /Ternary branches must have the same type, got 'string' and 'int'/
    )
  })

  test('property access on map', () => {
    const env = new Environment().registerVariable('obj', 'map')

    expectType(env, 'obj.field', 'dyn')
  })

  test('property access on invalid type', () => {
    const env = new Environment().registerVariable('someNum', 'int')

    expectTypeError(env, 'someNum.field')
  })

  test('index access on list', () => {
    const env = new Environment()
      .registerVariable('someList', 'list')
      .registerVariable('idx', 'int')

    expectType(env, 'someList[idx]', 'dyn')
  })

  test('index access with invalid index type', () => {
    const env = new Environment()
      .registerVariable('someList', 'list')
      .registerVariable('str', 'string')

    expectTypeError(env, 'someList[str]', /List index must be int/)
  })

  test('string indexing is not supported', () => {
    const env = new Environment().registerVariable('str', 'string').registerVariable('idx', 'int')

    // String indexing is NOT supported in CEL
    expectTypeError(env, 'str[idx]', /Cannot index type 'string'/)
  })

  test('in operator with list', () => {
    const env = new Environment().registerVariable('item', 'int').registerVariable('items', 'list')

    expectType(env, 'item in items', 'bool')
  })

  test('in operator rejects mismatched list element types', () => {
    const env = new Environment()
      .registerVariable('name', 'string')
      .registerVariable('numbers', 'list<int>')

    expectTypeError(env, 'name in numbers', /no such overload: string in list<int>/)
  })

  test('in operator rejects mismatched map key types', () => {
    const env = new Environment()
      .registerVariable('id', 'int')
      .registerVariable('usersByName', 'map<string, int>')

    expectTypeError(env, 'id in usersByName', /no such overload: int in map<string, int>/)
  })

  test('list equality rejects mismatched element types', () => {
    const env = new Environment()

    expectTypeError(env, '[1] == [1.0]', /no such overload: list<int> == list<double>/)
  })

  test('dyn operands with multiple list overloads still resolve to list<dyn>', () => {
    const env = new Environment({unlistedVariablesAreDyn: true})
      .registerVariable('dynList', 'list')
      .registerOperator('list<string> + list<string>: list<string>', (a, b) => a.concat(b))
      .registerOperator('list<int> + list<int>: list<int>', (a, b) => a.concat(b))

    expectType(env, 'dynList + dynList', 'list')
  })

  test('registering new overload invalidates cached lookup results', () => {
    class User {}
    class Group {}

    const env = new Environment()
      .registerType('User', User)
      .registerType('Group', Group)
      .registerVariable('user', 'User')
      .registerVariable('groups', 'list<Group>')

    expectTypeError(env, 'user in groups')

    env.registerOperator('User in list<Group>', () => false)

    expectType(env, 'user in groups', 'bool')
  })

  test('in operator with string', () => {
    const env = new Environment()
      .registerVariable('substr', 'string')
      .registerVariable('str', 'string')

    // String in string is NOT supported via the 'in' operator
    // Use .contains() method instead
    expectTypeError(env, 'substr in str', /no such overload: string in string/)

    // This is the correct way:
    expectType(env, 'str.contains(substr)', 'bool')
  })

  test('built-in function size()', () => {
    const env = new Environment()
      .registerVariable('str', 'string')
      .registerVariable('someList', 'list')

    expectType(env, 'size(str)', 'int')
    expectType(env, 'size(someList)', 'int')
  })

  test('built-in function string()', () => {
    const env = new Environment().registerVariable('someNum', 'int')

    expectType(env, 'string(someNum)', 'string')
  })

  test('built-in method startsWith()', () => {
    const env = new Environment().registerVariable('str', 'string')

    expectType(env, 'str.startsWith("hello")', 'bool')
  })

  test('method on wrong type', () => {
    const env = new Environment().registerVariable('num', 'int')

    expectTypeError(env, 'num.startsWith("test")', /found no matching overload/)
  })

  test('custom function', () => {
    const env = new Environment()
      .registerVariable('x', 'int')
      .registerFunction('myDouble(int): int', (x) => x * 2n)

    expectType(env, 'myDouble(x)', 'int')
  })

  test('custom function with wrong argument type', () => {
    const env = new Environment()
      .registerVariable('str', 'string')
      .registerFunction('myDouble(int): int', (x) => x * 2n)

    expectTypeError(env, 'myDouble(str)', /found no matching overload/)
  })

  test('unknown function', () => {
    const env = new Environment()

    expectTypeError(env, 'unknownFunc()', /Function not found/)
  })

  test('function overloads', () => {
    const env = new Environment()
      .registerVariable('x', 'int')
      .registerVariable('y', 'double')
      .registerFunction('convert(int): string', (x) => String(x))
      .registerFunction('convert(double): string', (x) => String(x))

    expectType(env, 'convert(x)', 'string')
    expectType(env, 'convert(y)', 'string')
  })

  test('complex expression', () => {
    const env = new Environment().registerVariable('user', 'map').registerVariable('minAge', 'int')

    expectType(env, 'user.age >= minAge && user.active', 'bool')
  })

  test('macro functions', () => {
    const env = new Environment().registerVariable('items', 'list')

    // Macros should be accepted (detailed checking happens at runtime)
    expectType(env, 'items.all(i, i > 0)', 'bool')
    expectType(env, 'items.exists(i, i > 10)', 'bool')
    expectType(env, 'items.map(i, i * 2)', 'list<int>')
    expectType(env, 'items.filter(i, i > 5)', 'list')
  })

  test('macro functions ', () => {
    const env = new Environment()
      .registerVariable('items', 'list')
      .registerVariable('someint', 'int')

    expectType(env, '[1, 2, 3].map(i, i)[0]', 'int')
    expectType(env, '[1, 2, 3].map(i, i > 2)[0]', 'bool')
    expectType(env, '[[1, 2, 3]].map(i, i)[0]', 'list<int>')
    expectType(env, '[[someint, 2, 3]].map(i, i)[0]', 'list<int>')
    expectType(env, '[dyn([someint, 2, 3])].map(i, i)[0]', 'dyn')
    expectType(env, '[[dyn(someint), dyn(2), dyn(3)]].map(i, i)[0]', 'list')
  })

  test('map macro with three-arg form', () => {
    const env = new Environment().registerVariable('numbers', 'list<int>')

    // Valid: filter returns bool, transform returns int
    expectType(env, 'numbers.map(i, i > 2, i * 2)', 'list<int>')

    // Valid: filter returns bool, transform returns bool
    expectType(env, 'numbers.map(i, i > 2, i < 10)', 'list<bool>')

    // Invalid: filter returns non-bool
    expectTypeError(
      env,
      'numbers.map(i, i, i * 2)',
      /map\(var, filter, transform\) filter predicate must return bool, got 'int'/
    )

    expectTypeError(
      env,
      'numbers.map(i, i + 1, i * 2)',
      /map\(var, filter, transform\) filter predicate must return bool/
    )
  })

  test('map macro requires identifier', () => {
    const env = new Environment().registerVariable('numbers', 'list<int>')

    // Invalid: first argument is not an identifier
    expectTypeError(
      env,
      'numbers.map(1, i)',
      /map\(var, transform\) requires first argument to be an identifier/
    )

    expectTypeError(
      env,
      'numbers.map("x", i)',
      /map\(var, transform\) requires first argument to be an identifier/
    )
  })

  test('predicate macro validation with typed lists', () => {
    const env = new Environment().registerVariable('numbers', 'list<int>')

    // Valid: predicates return bool
    expectType(env, 'numbers.all(i, i > 0)', 'bool')
    expectType(env, 'numbers.exists(i, i > 10)', 'bool')
    expectType(env, 'numbers.exists_one(i, i == 5)', 'bool')
    expectType(env, 'numbers.filter(i, i > 5)', 'list<int>')

    // Invalid: predicates return non-bool
    expectTypeError(
      env,
      'numbers.all(i, i + 1)',
      /all\(var, predicate\) predicate must return bool, got 'int'/
    )

    expectTypeError(
      env,
      'numbers.exists(i, i * 2)',
      /exists\(var, predicate\) predicate must return bool, got 'int'/
    )

    expectTypeError(
      env,
      'numbers.exists_one(i, i)',
      /exists_one\(var, predicate\) predicate must return bool, got 'int'/
    )

    expectTypeError(
      env,
      'numbers.filter(i, i)',
      /filter\(var, predicate\) predicate must return bool, got 'int'/
    )
  })

  test('predicate macro validation with string lists', () => {
    const env = new Environment().registerVariable('strings', 'list<string>')

    // Valid: predicates use string methods
    expectType(env, 'strings.all(s, s.startsWith("a"))', 'bool')
    expectType(env, 'strings.exists(s, s.contains("test"))', 'bool')
    expectType(env, 'strings.filter(s, s.size() > 5)', 'list<string>')

    // Invalid: predicate returns string
    expectTypeError(
      env,
      'strings.all(s, s + "x")',
      /all\(var, predicate\) predicate must return bool, got 'string'/
    )
  })

  test('predicate macro with invalid variable', () => {
    const env = new Environment().registerVariable('items', 'list')

    // Invalid: first argument is not an identifier
    expectTypeError(
      env,
      'items.all(1, true)',
      /all\(var, predicate\) requires first argument to be an identifier/
    )

    expectTypeError(
      env,
      'items.filter("x", true)',
      /filter\(var, predicate\) requires first argument to be an identifier/
    )
  })

  test('predicate macro with dynamic types', () => {
    const env = new Environment().registerVariable('items', 'list')

    // Valid: dyn is allowed in predicates
    expectType(env, 'items.all(i, i > 0)', 'bool')
    expectType(env, 'items.filter(i, i != null)', 'list')
  })

  test('predicate macro with map types', () => {
    const env = new Environment().registerVariable('data', 'map<string, int>')

    // Valid: map macros iterate over keys
    expectType(env, 'data.all(k, k.size() > 0)', 'bool')
    expectType(env, 'data.exists(k, k.startsWith("a"))', 'bool')
    expectType(env, 'data.filter(k, k.contains("test"))', 'list<string>')

    // Invalid: predicate returns non-bool
    expectTypeError(
      env,
      'data.all(k, k)',
      /all\(var, predicate\) predicate must return bool, got 'string'/
    )
  })

  test('unary minus', () => {
    const env = new Environment().registerVariable('x', 'int').registerVariable('y', 'double')

    expectType(env, '-x', 'int')
    expectType(env, '-y', 'double')
  })

  test('unary minus on invalid type', () => {
    const env = new Environment().registerVariable('str', 'string')

    expectTypeError(env, '-str', /no such overload: -string/)
  })

  test('dynamic type defines return type based on operator', () => {
    const env = new Environment({unlistedVariablesAreDyn: true})
    expectType(env, 'unknownVar + 10', 'int')
  })

  test('dynamic type defines return type based on operator (multiple matches)', () => {
    const env = new Environment({unlistedVariablesAreDyn: true})
      .registerType('User', class User {})
      .registerOperator('User + int: User')

    expectType(env, 'unknownVar + 10', 'dyn')
  })

  test('nested expressions', () => {
    const env = new Environment()
      .registerVariable('a', 'int')
      .registerVariable('b', 'int')
      .registerVariable('c', 'int')

    expectType(env, '(a + b) * c - 10', 'int')
  })

  test('method chaining', () => {
    const env = new Environment().registerVariable('str', 'string')

    expectType(env, 'str.substring(0, 5).size()', 'int')
  })

  test('custom types', () => {
    class Vector {
      constructor(x, y) {
        this.x = x
        this.y = y
      }
    }

    const env = new Environment()
      .registerType('Vector', Vector)
      .registerVariable('v1', 'Vector')
      .registerVariable('v2', 'Vector')
      .registerFunction('Vector.magnitude(): double', function () {
        return Math.sqrt(this.x * this.x + this.y * this.y)
      })

    expectType(env, 'v1.magnitude()', 'double')
  })

  test('bytes type', () => {
    const env = new Environment().registerVariable('data', 'bytes')

    expectType(env, 'data.size()', 'int')
    expectType(env, 'data.string()', 'string')
  })

  test('timestamp type', () => {
    const env = new Environment().registerVariable('ts', 'google.protobuf.Timestamp')

    expectType(env, 'ts.getHours()', 'int')
    expectType(env, 'ts.getFullYear()', 'int')
  })

  test('duration type', () => {
    const env = new Environment().registerVariable('dur', 'google.protobuf.Duration')

    expectType(env, 'dur.getHours()', 'int')
    expectType(env, 'dur.getMinutes()', 'int')
  })

  test('duration arithmetic', () => {
    const env = new Environment()
      .registerVariable('dur1', 'google.protobuf.Duration')
      .registerVariable('dur2', 'google.protobuf.Duration')

    expectType(env, 'dur1 + dur2', 'google.protobuf.Duration')
    expectType(env, 'dur1 - dur2', 'google.protobuf.Duration')
  })

  test('timestamp and duration arithmetic', () => {
    const env = new Environment()
      .registerVariable('ts', 'google.protobuf.Timestamp')
      .registerVariable('dur', 'google.protobuf.Duration')

    expectType(env, 'ts + dur', 'google.protobuf.Timestamp')
    expectType(env, 'ts - dur', 'google.protobuf.Timestamp')

    // Timestamp - Timestamp is NOT supported in overloads
    expectTypeError(env, 'ts - ts')
  })

  test('error includes source position', () => {
    const env = new Environment()

    const error = expectTypeError(env, 'unknownVar', /Unknown variable: unknownVar/)
    // Error message should include position highlighting
    assert.ok(error.message.includes('|'))
    assert.ok(error.message.includes('^'))
  })

  test('complex nested validation', () => {
    const env = new Environment()
      .registerType('User', {ctor: class User {}, fields: {name: 'string', age: 'int'}})
      .registerVariable('users', 'list<User>')
      .registerVariable('minAge', 'int')

    // Complex expression with macros and comparisons
    expectType(env, 'users.filter(u, u.age >= minAge).map(u, u.name)', 'list<string>')
    expectType(env, 'users.map(u, {"related": users})', 'list<map<string, list<User>>>')
  })

  test('equality operators support all types', () => {
    const env = new Environment().registerVariable('str', 'string').registerVariable('num', 'int')

    // Equality works for same types
    expectType(env, 'str == str', 'bool')
    expectType(env, 'num == num', 'bool')

    // Cross-type equality is NOT supported (no overload for string == int)
    expectTypeError(env, 'str == num', /no such overload: string == int/)
  })

  test('parse errors are caught', () => {
    const env = new Environment()

    const result = env.check('invalid + + syntax')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error)
  })

  test('empty expression', () => {
    const env = new Environment()

    const result = env.check('')
    assert.strictEqual(result.valid, false)
  })

  test('uint type support', () => {
    const env = new Environment().registerVariable('x', 'uint').registerVariable('y', 'uint')

    expectType(env, 'x + y', 'uint')
    expectType(env, 'x < y', 'bool')
  })

  test('list index access', () => {
    const env = new Environment()
      .registerVariable('someList', 'list')
      .registerVariable('intIndex', 'int')
      .registerVariable('uintIndex', 'uint')
      .registerVariable('doubleIndex', 'double')
      .registerVariable('stringIndex', 'string')

    expectType(env, 'someList[0]', 'dyn')
    expectType(env, 'someList[intIndex]', 'dyn')

    for (const t of ['uintIndex', '0u', 'doubleIndex', '1.5', 'stringIndex', '"0"']) {
      expectTypeError(env, `someList[${t}]`, 'List index must be int')
    }
  })

  test('list index with dynamic variable', () => {
    const env = new Environment()
      .registerVariable('someList', 'list')
      .registerVariable('dynVar', 'dyn')

    for (const t of ['dynVar', 'dyn(0u)', 'dyn(0.0)', 'dyn("0")']) {
      expectType(env, `someList[${t}]`, 'dyn')
    }
  })

  test('map index access', () => {
    const env = new Environment()
      .registerVariable('someMap', 'map')
      .registerVariable('intKey', 'int')
      .registerVariable('stringKey', 'string')
      .registerVariable('doubleKey', 'double')

    // All types are valid as map keys
    expectType(env, 'someMap["key"]', 'dyn')
    expectType(env, 'someMap[intKey]', 'dyn')
    expectType(env, 'someMap[stringKey]', 'dyn')
    expectType(env, 'someMap[doubleKey]', 'dyn')
    expectType(env, 'someMap[0]', 'dyn')
  })

  test('property access', () => {
    const env = new Environment()
      .registerVariable('someMap', 'map')
      .registerVariable('someList', 'list')
      .registerVariable('someNum', 'int')

    // Property access allowed on maps
    expectType(env, 'someMap.property', 'dyn')

    // Property access not allowed on lists (only numeric indexing works)
    expectTypeError(env, 'someList.size')

    // Property access not allowed on primitives
    expectTypeError(env, 'someNum.property', 'Cannot index type')
  })

  test('string indexing not supported', () => {
    const env = new Environment().registerVariable('str', 'string').registerVariable('index', 'int')

    // String indexing is not supported in CEL
    expectTypeError(env, 'str[0]', 'Cannot index type')
    expectTypeError(env, 'str[index]', 'Cannot index type')
  })

  test('custom type property access', () => {
    class Point {
      constructor(x, y) {
        this.x = x
        this.y = y
      }
    }

    const env = new Environment().registerType('Point', Point).registerVariable('p', 'Point')

    // Property access allowed on custom types
    expectType(env, 'p.x', 'dyn')
  })
})

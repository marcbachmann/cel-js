import {test, describe} from 'node:test'
import assert from 'node:assert'
import {TestEnvironment} from './helpers.js'

describe('Type Checker', () => {
  test('valid variable references', () => {
    const env = new TestEnvironment()
      .registerVariable('name', 'string')
      .registerVariable('age', 'int')
      .registerVariable('active', 'bool')

    env.expectType('name', 'string')
    env.expectType('age', 'int')
    env.expectType('active', 'bool')
  })

  test('unknown variable', () => {
    const env = new TestEnvironment().registerVariable('x', 'int')

    const error = env.expectCheckThrows('unknownVar', /Unknown variable: unknownVar/)
    assert.strictEqual(error.node.op, 'id')
    assert.strictEqual(error.node.args, 'unknownVar')
  })

  test('literals', () => {
    const env = new TestEnvironment()

    env.expectType('42', 'int')
    env.expectType('3.14', 'double')
    env.expectType('"hello"', 'string')
    env.expectType('true', 'bool')
    env.expectType('false', 'bool')
    env.expectType('null', 'null')
    env.expectType('[1, 2, 3]', 'list<int>')
    // Map literals need key-value pairs
    env.expectType('{"a": 1}', 'map<string, int>')
  })

  test('list literal enforces homogeneous elements by default', () => {
    const env = new TestEnvironment()
    env.expectCheckThrows('[1, "two", true]', /List elements must have the same type/)
  })

  test('list literal allows mixed element types when explicitly disabled', () => {
    const env = new TestEnvironment({homogeneousAggregateLiterals: false})
    env.expectType('[1, "two"]', 'list')
  })

  test('list literal infers nested types after empty literal', () => {
    const env = new TestEnvironment()
    env.expectType('[[], [1]]', 'list<list<int>>')
  })

  test('list literal still rejects mismatched nested types by default', () => {
    const env = new TestEnvironment()
    env.expectCheckThrows(
      '[[1], [1.0]]',
      /List elements must have the same type, expected type 'list<int>' but found 'list<double>'/
    )
  })

  test('list literal rejects mixing dyn elements with concrete ones', () => {
    const env = new TestEnvironment()

    env.expectCheckThrows(
      '[dyn(1), 2]',
      /List elements must have the same type, expected type 'dyn' but found 'int'/
    )

    env.expectCheckThrows(
      '[1, dyn(2)]',
      /List elements must have the same type, expected type 'int' but found 'dyn'/
    )
  })

  test('map literal enforces homogeneous value types by default', () => {
    const env = new TestEnvironment()
    env.expectCheckThrows('{"name": "John", "age": 30}', /Map value uses wrong type/)
  })

  test('map literal allows mixed value types when explicitly disabled', () => {
    const env = new TestEnvironment({homogeneousAggregateLiterals: false})
    env.expectType('{"name": "John", "age": 30}', 'map<string, dyn>')
  })

  test('map literal accepts empty map as value together with more specific types', () => {
    const env = new TestEnvironment()
    env.expectType('{"a": {}, "b": {"id": 1}}', 'map<string, map<string, int>>')
    env.expectType('{"a": {"id": 1}, "b": {}}', 'map<string, map<string, int>>')
    env.expectType('{"a": {}, "b": ({"c": {}}).c, "d": {"c": 1}}', 'map<string, map<string, int>>')
  })

  test('map literal accepts mixed value types when wrapped with dyn', () => {
    const env = new TestEnvironment()
    env.expectType('{"name": dyn("John"), "age": dyn(30)}', 'map<string, dyn>')
  })

  test('map literal enforces homogeneous key types by default', () => {
    const env = new TestEnvironment()
    env.expectCheckThrows('{"name": "John", 1: "other"}', /Map key uses wrong type/)
  })

  test('map literal allows mixed key types when explicitly disabled', () => {
    const env = new TestEnvironment({homogeneousAggregateLiterals: false})
    env.expectType('{"name": "John", 1: "other"}', 'map<dyn, string>')
  })

  test('map literal accepts mixed key types when wrapped with dyn', () => {
    const env = new TestEnvironment()
    env.expectType('{dyn("name"): "John", dyn(1): "other"}', 'map<dyn, string>')
  })

  test('map literal rejects mixed types', () => {
    const env = new TestEnvironment()
    env.expectCheckThrows(
      '{"primary": {"id": 1.0}, "secondary": {"id": 1}}',
      /Map value uses wrong type, expected type 'map<string, double>' but found 'map<string, int>'/
    )

    env.expectCheckThrows(
      '{"name": "John", "age": dyn(30)}',
      /Map value uses wrong type, expected type 'string' but found 'dyn'/
    )

    env.expectCheckThrows(
      '{"name": "John", dyn(1): "other"}',
      /Map key uses wrong type, expected type 'string' but found 'dyn'/
    )
  })

  test('arithmetic operators with matching types', () => {
    const env = new TestEnvironment()
      .registerVariable('x', 'int')
      .registerVariable('y', 'int')
      .registerVariable('a', 'double')
      .registerVariable('b', 'double')

    env.expectType('x + y', 'int')
    env.expectType('x - y', 'int')
    env.expectType('x * y', 'int')
    env.expectType('x / y', 'int')
    env.expectType('x % y', 'int')

    env.expectType('a + b', 'double')
    env.expectType('a - b', 'double')
    env.expectType('a * b', 'double')
    env.expectType('a / b', 'double')
  })

  test('arithmetic operators with mixed int/double', () => {
    const env = new TestEnvironment().registerVariable('x', 'int').registerVariable('a', 'double')

    // Mixed int/double operations are not defined in overloads
    // They would require runtime type coercion
    env.expectCheckThrows('x + a', /no such overload: int \+ double/)
    env.expectCheckThrows('a + x', /no such overload: double \+ int/)
    env.expectCheckThrows('x * a', /no such overload: int \* double/)
  })

  test('string concatenation', () => {
    const env = new TestEnvironment()
      .registerVariable('first', 'string')
      .registerVariable('last', 'string')

    env.expectType('first + " " + last', 'string')
  })

  test('list concatenation', () => {
    const env = new TestEnvironment()
      .registerVariable('list1', 'list')
      .registerVariable('list2', 'list')

    env.expectType('list1 + list2', 'list')
  })

  test('invalid arithmetic (string + int)', () => {
    const env = new TestEnvironment()
      .registerVariable('str', 'string')
      .registerVariable('num', 'int')

    const error = env.expectCheckThrows('str + num', /no such overload: string \+ int/)
    assert.strictEqual(error.node.op, '+')
    assert.strictEqual(error.node.args[0].op, 'id')
    assert.strictEqual(error.node.args[0].args, 'str')
    assert.strictEqual(error.node.args[1].op, 'id')
    assert.strictEqual(error.node.args[1].args, 'num')
  })

  test('comparison operators', () => {
    const env = new TestEnvironment().registerVariable('x', 'int').registerVariable('y', 'int')

    env.expectType('x < y', 'bool')
    env.expectType('x <= y', 'bool')
    env.expectType('x > y', 'bool')
    env.expectType('x >= y', 'bool')
    env.expectType('x == y', 'bool')
    env.expectType('x != y', 'bool')
  })

  test('comparison with incompatible types', () => {
    const env = new TestEnvironment()
      .registerVariable('str', 'string')
      .registerVariable('num', 'int')

    env.expectCheckThrows('str < num')
  })

  test('logical operators', () => {
    const env = new TestEnvironment().registerVariable('a', 'bool').registerVariable('b', 'bool')

    env.expectType('a && b', 'bool')
    env.expectType('a || b', 'bool')
    env.expectType('!a', 'bool')
  })

  test('logical operators with non-bool', () => {
    const env = new TestEnvironment().registerVariable('x', 'int').registerVariable('y', 'int')

    env.expectCheckThrows('x && y', /Logical operator requires bool operands/)
  })

  test('ternary operator', () => {
    const env = new TestEnvironment()
      .registerVariable('condition', 'bool')
      .registerVariable('x', 'int')
      .registerVariable('y', 'int')

    env.expectType('condition ? x : y', 'int')
  })

  test('ternary with non-bool condition', () => {
    const env = new TestEnvironment().registerVariable('x', 'int')

    env.expectCheckThrows('x ? 1 : 2', /Ternary condition must be bool/)
  })

  test('ternary with different branch types', () => {
    const env = new TestEnvironment().registerVariable('condition', 'bool')
    env.expectType('condition ? dyn("yes") : 42', 'dyn')
    env.expectType('condition ? "yes" : dyn(42)', 'dyn')
    env.expectType('condition ? "yes" : dyn({"foo": "bar"}).foo', 'dyn')
  })

  test('ternary with incompatible branch types', () => {
    const env = new TestEnvironment().registerVariable('condition', 'bool')

    env.expectCheckThrows(
      'condition ? "yes" : 42',
      /Ternary branches must have the same type, got 'string' and 'int'/
    )
  })

  test('property access on map', () => {
    const env = new TestEnvironment().registerVariable('obj', 'map')

    env.expectType('obj.field', 'dyn')
  })

  test('property access on invalid type', () => {
    const env = new TestEnvironment().registerVariable('someNum', 'int')

    env.expectCheckThrows('someNum.field')
  })

  test('index access on list', () => {
    const env = new TestEnvironment()
      .registerVariable('someList', 'list')
      .registerVariable('idx', 'int')

    env.expectType('someList[idx]', 'dyn')
  })

  test('index access with invalid index type', () => {
    const env = new TestEnvironment()
      .registerVariable('someList', 'list')
      .registerVariable('str', 'string')

    env.expectCheckThrows('someList[str]', /List index must be int/)
  })

  test('string indexing is not supported', () => {
    const env = new TestEnvironment()
      .registerVariable('str', 'string')
      .registerVariable('idx', 'int')

    // String indexing is NOT supported in CEL
    env.expectCheckThrows('str[idx]', /Cannot index type 'string'/)
  })

  test('in operator with list', () => {
    const env = new TestEnvironment()
      .registerVariable('item', 'int')
      .registerVariable('items', 'list')

    env.expectType('item in items', 'bool')
  })

  test('in operator rejects mismatched list element types', () => {
    const env = new TestEnvironment()
      .registerVariable('name', 'string')
      .registerVariable('numbers', 'list<int>')

    env.expectCheckThrows('name in numbers', /no such overload: string in list<int>/)
  })

  test('in operator rejects mismatched map key types', () => {
    const env = new TestEnvironment()
      .registerVariable('id', 'int')
      .registerVariable('usersByName', 'map<string, int>')

    env.expectCheckThrows('id in usersByName', /no such overload: int in map<string, int>/)
  })

  test('list equality rejects mismatched element types', () => {
    const env = new TestEnvironment()

    env.expectCheckThrows('[1] == [1.0]', /no such overload: list<int> == list<double>/)
  })

  test('dyn operands with multiple list overloads still resolve to list<dyn>', () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true})
      .registerVariable('dynList', 'list')
      .registerOperator('list<string> + list<string>: list<string>', (a, b) => a.concat(b))
      .registerOperator('list<int> + list<int>: list<int>', (a, b) => a.concat(b))

    env.expectType('dynList + dynList', 'list')
  })

  test('registering new overload invalidates cached lookup results', () => {
    class User {}
    class Group {}

    const env = new TestEnvironment()
      .registerType('User', User)
      .registerType('Group', Group)
      .registerVariable('user', 'User')
      .registerVariable('groups', 'list<Group>')

    env.expectCheckThrows('user in groups')

    env.registerOperator('User in list<Group>', () => false)

    env.expectType('user in groups', 'bool')
  })

  test('in operator with string', () => {
    const env = new TestEnvironment()
      .registerVariable('substr', 'string')
      .registerVariable('str', 'string')

    // String in string is NOT supported via the 'in' operator
    // Use .contains() method instead
    env.expectCheckThrows('substr in str', /no such overload: string in string/)

    // This is the correct way:
    env.expectType('str.contains(substr)', 'bool')
  })

  test('built-in function size()', () => {
    const env = new TestEnvironment()
      .registerVariable('str', 'string')
      .registerVariable('someList', 'list')

    env.expectType('size(str)', 'int')
    env.expectType('size(someList)', 'int')
  })

  test('built-in function string()', () => {
    const env = new TestEnvironment().registerVariable('someNum', 'int')

    env.expectType('string(someNum)', 'string')
  })

  test('built-in method startsWith()', () => {
    const env = new TestEnvironment().registerVariable('str', 'string')

    env.expectType('str.startsWith("hello")', 'bool')
  })

  test('method on wrong type', () => {
    const env = new TestEnvironment().registerVariable('num', 'int')

    env.expectCheckThrows('num.startsWith("test")', /found no matching overload/)
  })

  test('custom function', () => {
    const env = new TestEnvironment()
      .registerVariable('x', 'int')
      .registerFunction('myDouble(int): int', (x) => x * 2n)

    env.expectType('myDouble(x)', 'int')
  })

  test('custom function with wrong argument type', () => {
    const env = new TestEnvironment()
      .registerVariable('str', 'string')
      .registerFunction('myDouble(int): int', (x) => x * 2n)

    env.expectCheckThrows('myDouble(str)', /found no matching overload/)
  })

  test('unknown function', () => {
    const env = new TestEnvironment()
    env.expectCheckThrows('unknownFunc()', /found no matching overload for 'unknownFunc/)
  })

  test('function overloads', () => {
    const env = new TestEnvironment()
      .registerVariable('x', 'int')
      .registerVariable('y', 'double')
      .registerFunction('convert(int): string', (x) => String(x))
      .registerFunction('convert(double): string', (x) => String(x))

    env.expectType('convert(x)', 'string')
    env.expectType('convert(y)', 'string')
  })

  test('complex expression', () => {
    const env = new TestEnvironment()
      .registerVariable('user', 'map')
      .registerVariable('minAge', 'int')

    env.expectType('user.age >= minAge && user.active', 'bool')
  })

  test('macro functions', () => {
    const env = new TestEnvironment().registerVariable('items', 'list')

    // Macros should be accepted (detailed checking happens at runtime)
    env.expectType('items.all(i, i > 0)', 'bool')
    env.expectType('items.exists(i, i > 10)', 'bool')
    env.expectType('items.map(i, i * 2)', 'list<int>')
    env.expectType('items.filter(i, i > 5)', 'list')
  })

  test('macro functions ', () => {
    const env = new TestEnvironment()
      .registerVariable('items', 'list')
      .registerVariable('someint', 'int')

    env.expectType('[1, 2, 3].map(i, i)[0]', 'int')
    env.expectType('[1, 2, 3].map(i, i > 2)[0]', 'bool')
    env.expectType('[[1, 2, 3]].map(i, i)[0]', 'list<int>')
    env.expectType('[[someint, 2, 3]].map(i, i)[0]', 'list<int>')
    env.expectType('[dyn([someint, 2, 3])].map(i, i)[0]', 'dyn')
    env.expectType('[[dyn(someint), dyn(2), dyn(3)]].map(i, i)[0]', 'list')
  })

  test('map macro with three-arg form', () => {
    const env = new TestEnvironment().registerVariable('numbers', 'list<int>')

    // Valid: filter returns bool, transform returns int
    env.expectType('numbers.map(i, i > 2, i * 2)', 'list<int>')

    // Valid: filter returns bool, transform returns bool
    env.expectType('numbers.map(i, i > 2, i < 10)', 'list<bool>')

    // Invalid: filter returns non-bool
    env.expectCheckThrows(
      'numbers.map(i, i, i * 2)',
      /map\(var, filter, transform\) filter predicate must return bool, got 'int'/
    )

    env.expectCheckThrows(
      'numbers.map(i, i + 1, i * 2)',
      /map\(var, filter, transform\) filter predicate must return bool/
    )
  })

  test('map macro requires identifier', () => {
    const env = new TestEnvironment().registerVariable('numbers', 'list<int>')

    // Invalid: first argument is not an identifier
    env.expectParseThrows(
      'numbers.map(1, i)',
      /map\(var, transform\) invalid predicate iteration variable/
    )

    env.expectParseThrows(
      'numbers.map("x", i)',
      /map\(var, transform\) invalid predicate iteration variable/
    )
  })

  test('predicate macro validation with typed lists', () => {
    const env = new TestEnvironment().registerVariable('numbers', 'list<int>')

    // Valid: predicates return bool
    env.expectType('numbers.all(i, i > 0)', 'bool')
    env.expectType('numbers.exists(i, i > 10)', 'bool')
    env.expectType('numbers.exists_one(i, i == 5)', 'bool')
    env.expectType('numbers.filter(i, i > 5)', 'list<int>')

    // Invalid: predicates return non-bool
    env.expectCheckThrows(
      'numbers.all(i, i + 1)',
      /all\(var, predicate\) predicate must return bool, got 'int'/
    )

    env.expectCheckThrows(
      'numbers.exists(i, i * 2)',
      /exists\(var, predicate\) predicate must return bool, got 'int'/
    )

    env.expectCheckThrows(
      'numbers.exists_one(i, i)',
      /exists_one\(var, predicate\) predicate must return bool, got 'int'/
    )

    env.expectCheckThrows(
      'numbers.filter(i, i)',
      /filter\(var, predicate\) predicate must return bool, got 'int'/
    )
  })

  test('predicate macro validation with string lists', () => {
    const env = new TestEnvironment().registerVariable('strings', 'list<string>')

    // Valid: predicates use string methods
    env.expectType('strings.all(s, s.startsWith("a"))', 'bool')
    env.expectType('strings.exists(s, s.contains("test"))', 'bool')
    env.expectType('strings.filter(s, s.size() > 5)', 'list<string>')

    // Invalid: predicate returns string
    env.expectCheckThrows(
      'strings.all(s, s + "x")',
      /all\(var, predicate\) predicate must return bool, got 'string'/
    )
  })

  test('predicate macro with invalid variable', () => {
    const env = new TestEnvironment().registerVariable('items', 'list')

    // Invalid: first argument is not an identifier
    env.expectParseThrows(
      'items.all(1, true)',
      /all\(var, predicate\) invalid predicate iteration variable/
    )

    env.expectParseThrows(
      'items.filter("x", true)',
      /filter\(var, predicate\) invalid predicate iteration variable/
    )
  })

  test('predicate macro with dynamic types', () => {
    const env = new TestEnvironment().registerVariable('items', 'list')

    // Valid: dyn is allowed in predicates
    env.expectType('items.all(i, i > 0)', 'bool')
    env.expectType('items.filter(i, i != null)', 'list')
  })

  test('predicate macro with map types', () => {
    const env = new TestEnvironment().registerVariable('data', 'map<string, int>')

    // Valid: map macros iterate over keys
    env.expectType('data.all(k, k.size() > 0)', 'bool')
    env.expectType('data.exists(k, k.startsWith("a"))', 'bool')
    env.expectType('data.filter(k, k.contains("test"))', 'list<string>')

    // Invalid: predicate returns non-bool
    env.expectCheckThrows(
      'data.all(k, k)',
      /all\(var, predicate\) predicate must return bool, got 'string'/
    )
  })

  test('unary minus', () => {
    const env = new TestEnvironment().registerVariable('x', 'int').registerVariable('y', 'double')

    env.expectType('-x', 'int')
    env.expectType('-y', 'double')
  })

  test('unary minus on invalid type', () => {
    const env = new TestEnvironment().registerVariable('str', 'string')

    env.expectCheckThrows('-str', /no such overload: -string/)
  })

  test('dynamic type defines return type based on operator', () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true})
    env.expectType('unknownVar + 10', 'int')
  })

  test('dynamic type defines return type based on operator (multiple matches)', () => {
    const env = new TestEnvironment({unlistedVariablesAreDyn: true})
      .registerType('User', class User {})
      .registerOperator('User + int: User')

    env.expectType('unknownVar + 10', 'dyn')
  })

  test('nested expressions', () => {
    const env = new TestEnvironment()
      .registerVariable('a', 'int')
      .registerVariable('b', 'int')
      .registerVariable('c', 'int')

    env.expectType('(a + b) * c - 10', 'int')
  })

  test('method chaining', () => {
    const env = new TestEnvironment().registerVariable('str', 'string')

    env.expectType('str.substring(0, 5).size()', 'int')
  })

  test('custom types', () => {
    class Vector {
      constructor(x, y) {
        this.x = x
        this.y = y
      }
    }

    const env = new TestEnvironment()
      .registerType('Vector', Vector)
      .registerVariable('v1', 'Vector')
      .registerVariable('v2', 'Vector')
      .registerFunction('Vector.magnitude(): double', function () {
        return Math.sqrt(this.x * this.x + this.y * this.y)
      })

    env.expectType('v1.magnitude()', 'double')
  })

  test('bytes type', () => {
    const env = new TestEnvironment().registerVariable('data', 'bytes')

    env.expectType('data.size()', 'int')
    env.expectType('data.string()', 'string')
  })

  test('timestamp type', () => {
    const env = new TestEnvironment().registerVariable('ts', 'google.protobuf.Timestamp')

    env.expectType('ts.getHours()', 'int')
    env.expectType('ts.getFullYear()', 'int')
  })

  test('duration type', () => {
    const env = new TestEnvironment().registerVariable('dur', 'google.protobuf.Duration')

    env.expectType('dur.getHours()', 'int')
    env.expectType('dur.getMinutes()', 'int')
  })

  test('duration arithmetic', () => {
    const env = new TestEnvironment()
      .registerVariable('dur1', 'google.protobuf.Duration')
      .registerVariable('dur2', 'google.protobuf.Duration')

    env.expectType('dur1 + dur2', 'google.protobuf.Duration')
    env.expectType('dur1 - dur2', 'google.protobuf.Duration')
  })

  test('timestamp and duration arithmetic', () => {
    const env = new TestEnvironment()
      .registerVariable('ts', 'google.protobuf.Timestamp')
      .registerVariable('dur', 'google.protobuf.Duration')

    env.expectType('ts + dur', 'google.protobuf.Timestamp')
    env.expectType('ts - dur', 'google.protobuf.Timestamp')
  })

  test('error includes source position', () => {
    const env = new TestEnvironment()

    const error = env.expectCheckThrows('unknownVar', /Unknown variable: unknownVar/)
    // Error message should include position highlighting
    assert.ok(error.message.includes('|'))
    assert.ok(error.message.includes('^'))
  })

  test('complex nested validation', () => {
    const env = new TestEnvironment()
      .registerType('User', {ctor: class User {}, fields: {name: 'string', age: 'int'}})
      .registerVariable('users', 'list<User>')
      .registerVariable('minAge', 'int')

    // Complex expression with macros and comparisons
    env.expectType('users.filter(u, u.age >= minAge).map(u, u.name)', 'list<string>')
    env.expectType('users.map(u, {"related": users})', 'list<map<string, list<User>>>')
  })

  test('equality operators support all types', () => {
    const env = new TestEnvironment()
      .registerVariable('str', 'string')
      .registerVariable('num', 'int')

    // Equality works for same types
    env.expectType('str == str', 'bool')
    env.expectType('num == num', 'bool')

    // Cross-type equality is NOT supported (no overload for string == int)
    env.expectCheckThrows('str == num', /no such overload: string == int/)
  })

  test('parse errors are caught', () => {
    const env = new TestEnvironment()

    const result = env.check('invalid + + syntax')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error)
  })

  test('empty expression', () => {
    const env = new TestEnvironment()

    const result = env.check('')
    assert.strictEqual(result.valid, false)
  })

  test('uint type support', () => {
    const env = new TestEnvironment().registerVariable('x', 'uint').registerVariable('y', 'uint')

    env.expectType('x + y', 'uint')
    env.expectType('x < y', 'bool')
  })

  test('list index access', () => {
    const env = new TestEnvironment()
      .registerVariable('someList', 'list')
      .registerVariable('intIndex', 'int')
      .registerVariable('uintIndex', 'uint')
      .registerVariable('doubleIndex', 'double')
      .registerVariable('stringIndex', 'string')

    env.expectType('someList[0]', 'dyn')
    env.expectType('someList[intIndex]', 'dyn')

    for (const t of ['uintIndex', '0u', 'doubleIndex', '1.5', 'stringIndex', '"0"']) {
      env.expectCheckThrows(`someList[${t}]`, 'List index must be int')
    }
  })

  test('list index with dynamic variable', () => {
    const env = new TestEnvironment()
      .registerVariable('someList', 'list')
      .registerVariable('dynVar', 'dyn')

    for (const t of ['dynVar', 'dyn(0u)', 'dyn(0.0)', 'dyn("0")']) {
      env.expectType(`someList[${t}]`, 'dyn')
    }
  })

  test('map index access', () => {
    const env = new TestEnvironment()
      .registerVariable('someMap', 'map')
      .registerVariable('intKey', 'int')
      .registerVariable('stringKey', 'string')
      .registerVariable('doubleKey', 'double')

    // All types are valid as map keys
    env.expectType('someMap["key"]', 'dyn')
    env.expectType('someMap[intKey]', 'dyn')
    env.expectType('someMap[stringKey]', 'dyn')
    env.expectType('someMap[doubleKey]', 'dyn')
    env.expectType('someMap[0]', 'dyn')
  })

  test('property access', () => {
    const env = new TestEnvironment()
      .registerVariable('someMap', 'map')
      .registerVariable('someList', 'list')
      .registerVariable('someNum', 'int')

    // Property access allowed on maps
    env.expectType('someMap.property', 'dyn')

    // Property access not allowed on lists (only numeric indexing works)
    env.expectCheckThrows('someList.size')

    // Property access not allowed on primitives
    env.expectCheckThrows('someNum.property', 'Cannot index type')
  })

  test('string indexing not supported', () => {
    const env = new TestEnvironment()
      .registerVariable('str', 'string')
      .registerVariable('index', 'int')

    // String indexing is not supported in CEL
    env.expectCheckThrows('str[0]', 'Cannot index type')
    env.expectCheckThrows('str[index]', 'Cannot index type')
  })

  test('custom type property access', () => {
    class Point {
      constructor(x, y) {
        this.x = x
        this.y = y
      }
    }

    const env = new TestEnvironment().registerType('Point', Point).registerVariable('p', 'Point')

    // Property access allowed on custom types
    env.expectType('p.x', 'dyn')
  })
})

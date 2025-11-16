import {test, describe} from 'node:test'
import assert from 'node:assert'
import {TypeError} from '../lib/errors.js'
import {Environment} from '../lib/evaluator.js'

describe('Type Checker', () => {
  test('valid variable references', () => {
    const env = new Environment()
      .registerVariable('name', 'string')
      .registerVariable('age', 'int')
      .registerVariable('active', 'bool')

    const result1 = env.check('name')
    assert.strictEqual(result1.valid, true)
    assert.strictEqual(result1.type, 'string')

    const result2 = env.check('age')
    assert.strictEqual(result2.valid, true)
    assert.strictEqual(result2.type, 'int')

    const result3 = env.check('active')
    assert.strictEqual(result3.valid, true)
    assert.strictEqual(result3.type, 'bool')
  })

  test('unknown variable', () => {
    const env = new Environment().registerVariable('x', 'int')

    const result = env.check('unknownVar')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /Unknown variable: unknownVar/)
    assert.strictEqual(result.error.node[0], 'id')
    assert.strictEqual(result.error.node[1], 'unknownVar')
  })

  test('literals', () => {
    const env = new Environment()

    assert.strictEqual(env.check('42').type, 'int')
    assert.strictEqual(env.check('3.14').type, 'double')
    assert.strictEqual(env.check('"hello"').type, 'string')
    assert.strictEqual(env.check('true').type, 'bool')
    assert.strictEqual(env.check('false').type, 'bool')
    assert.strictEqual(env.check('null').type, 'null')
    assert.strictEqual(env.check('[1, 2, 3]').type, 'list<int>')
    // Map literals need key-value pairs
    const mapResult = env.check('{"a": 1}')
    assert.strictEqual(mapResult.type, 'map<string, int>')
  })

  test('arithmetic operators with matching types', () => {
    const env = new Environment()
      .registerVariable('x', 'int')
      .registerVariable('y', 'int')
      .registerVariable('a', 'double')
      .registerVariable('b', 'double')

    assert.strictEqual(env.check('x + y').type, 'int')
    assert.strictEqual(env.check('x - y').type, 'int')
    assert.strictEqual(env.check('x * y').type, 'int')
    assert.strictEqual(env.check('x / y').type, 'int')
    assert.strictEqual(env.check('x % y').type, 'int')

    assert.strictEqual(env.check('a + b').type, 'double')
    assert.strictEqual(env.check('a - b').type, 'double')
    assert.strictEqual(env.check('a * b').type, 'double')
    assert.strictEqual(env.check('a / b').type, 'double')
  })

  test('arithmetic operators with mixed int/double', () => {
    const env = new Environment().registerVariable('x', 'int').registerVariable('a', 'double')

    // Mixed int/double operations are not defined in overloads
    // They would require runtime type coercion
    const result1 = env.check('x + a')
    assert.strictEqual(result1.valid, false)
    assert.match(result1.error.message, /no such overload: int \+ double/)

    const result2 = env.check('a + x')
    assert.strictEqual(result2.valid, false)
    assert.match(result2.error.message, /no such overload: double \+ int/)

    const result3 = env.check('x * a')
    assert.strictEqual(result3.valid, false)
    assert.match(result3.error.message, /no such overload: int \* double/)
  })

  test('string concatenation', () => {
    const env = new Environment()
      .registerVariable('first', 'string')
      .registerVariable('last', 'string')

    const result = env.check('first + " " + last')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'string')
  })

  test('list concatenation', () => {
    const env = new Environment()
      .registerVariable('list1', 'list')
      .registerVariable('list2', 'list')

    const result = env.check('list1 + list2')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'list')
  })

  test('invalid arithmetic (string + int)', () => {
    const env = new Environment().registerVariable('str', 'string').registerVariable('num', 'int')

    const result = env.check('str + num')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /no such overload: string \+ int/)
    assert.strictEqual(result.error.node[0], '+')
    assert.strictEqual(result.error.node[1][0], 'id')
    assert.strictEqual(result.error.node[1][1], 'str')
    assert.strictEqual(result.error.node[2][0], 'id')
    assert.strictEqual(result.error.node[2][1], 'num')
  })

  test('comparison operators', () => {
    const env = new Environment().registerVariable('x', 'int').registerVariable('y', 'int')

    assert.strictEqual(env.check('x < y').type, 'bool')
    assert.strictEqual(env.check('x <= y').type, 'bool')
    assert.strictEqual(env.check('x > y').type, 'bool')
    assert.strictEqual(env.check('x >= y').type, 'bool')
    assert.strictEqual(env.check('x == y').type, 'bool')
    assert.strictEqual(env.check('x != y').type, 'bool')
  })

  test('comparison with incompatible types', () => {
    const env = new Environment().registerVariable('str', 'string').registerVariable('num', 'int')

    const result = env.check('str < num')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
  })

  test('logical operators', () => {
    const env = new Environment().registerVariable('a', 'bool').registerVariable('b', 'bool')

    assert.strictEqual(env.check('a && b').type, 'bool')
    assert.strictEqual(env.check('a || b').type, 'bool')
    assert.strictEqual(env.check('!a').type, 'bool')
  })

  test('logical operators with non-bool', () => {
    const env = new Environment().registerVariable('x', 'int').registerVariable('y', 'int')

    const result = env.check('x && y')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /Logical operator requires bool operands/)
  })

  test('ternary operator', () => {
    const env = new Environment()
      .registerVariable('condition', 'bool')
      .registerVariable('x', 'int')
      .registerVariable('y', 'int')

    const result = env.check('condition ? x : y')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'int')
  })

  test('ternary with non-bool condition', () => {
    const env = new Environment().registerVariable('x', 'int')

    const result = env.check('x ? 1 : 2')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /Ternary condition must be bool/)
  })

  test('ternary with different branch types', () => {
    const env = new Environment().registerVariable('condition', 'bool')
    assert.strictEqual(env.check('condition ? dyn("yes") : 42').type, 'dyn')
    assert.strictEqual(env.check('condition ? "yes" : dyn(42)').type, 'dyn')
  })

  test('ternary with different branch types', () => {
    const env = new Environment().registerVariable('condition', 'bool')

    const result = env.check('condition ? "yes" : 42')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(
      result.error.message,
      /Ternary branches must have the same type, got 'string' and 'int'/
    )
  })

  test('property access on map', () => {
    const env = new Environment().registerVariable('obj', 'map')

    const result = env.check('obj.field')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'dyn')
  })

  test('property access on invalid type', () => {
    const env = new Environment().registerVariable('someNum', 'int')

    const result = env.check('someNum.field')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
  })

  test('index access on list', () => {
    const env = new Environment()
      .registerVariable('someList', 'list')
      .registerVariable('idx', 'int')

    const result = env.check('someList[idx]')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'dyn')
  })

  test('index access with invalid index type', () => {
    const env = new Environment()
      .registerVariable('someList', 'list')
      .registerVariable('str', 'string')

    const result = env.check('someList[str]')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /List index must be int/)
  })

  test('string indexing is not supported', () => {
    const env = new Environment().registerVariable('str', 'string').registerVariable('idx', 'int')

    // String indexing is NOT supported in CEL
    const result = env.check('str[idx]')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /Cannot index type 'string'/)
  })

  test('in operator with list', () => {
    const env = new Environment().registerVariable('item', 'int').registerVariable('items', 'list')

    const result = env.check('item in items')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'bool')
  })

  test('in operator rejects mismatched list element types', () => {
    const env = new Environment()
      .registerVariable('name', 'string')
      .registerVariable('numbers', 'list<int>')

    const result = env.check('name in numbers')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /no such overload: string in list<int>/)
  })

  test('in operator rejects mismatched map key types', () => {
    const env = new Environment()
      .registerVariable('id', 'int')
      .registerVariable('usersByName', 'map<string, int>')

    const result = env.check('id in usersByName')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /no such overload: int in map<string, int>/)
  })

  test('list equality rejects mismatched element types', () => {
    const env = new Environment()

    const result = env.check('[1] == [1.0]')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /no such overload: list<int> == list<double>/)
  })

  test('dyn operands with multiple list overloads still resolve to list<dyn>', () => {
    const env = new Environment({unlistedVariablesAreDyn: true})
      .registerVariable('dynList', 'list')
      .registerOperator('list<string> + list<string>: list<string>', (a, b) => a.concat(b))
      .registerOperator('list<int> + list<int>: list<int>', (a, b) => a.concat(b))

    const result = env.check('dynList + dynList')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'list')
  })

  test('registering new overload invalidates cached lookup results', () => {
    class User {}

    const env = new Environment()
      .registerType('User', User)
      .registerVariable('user', 'User')
      .registerVariable('users', 'list<User>')

    const initial = env.check('user in users')
    assert.strictEqual(initial.valid, false)
    assert.ok(initial.error instanceof TypeError)

    env.registerOperator('User in list<User>', () => false)

    const afterRegistration = env.check('user in users')
    assert.strictEqual(afterRegistration.valid, true)
    assert.strictEqual(afterRegistration.type, 'bool')
  })

  test('in operator with string', () => {
    const env = new Environment()
      .registerVariable('substr', 'string')
      .registerVariable('str', 'string')

    // String in string is NOT supported via the 'in' operator
    // Use .contains() method instead
    const result = env.check('substr in str')
    assert.strictEqual(result.valid, false)
    assert.match(result.error.message, /no such overload: string in string/)

    // This is the correct way:
    const result2 = env.check('str.contains(substr)')
    assert.strictEqual(result2.valid, true)
    assert.strictEqual(result2.type, 'bool')
  })

  test('built-in function size()', () => {
    const env = new Environment()
      .registerVariable('str', 'string')
      .registerVariable('someList', 'list')

    assert.strictEqual(env.check('size(str)').type, 'int')
    assert.strictEqual(env.check('size(someList)').type, 'int')
  })

  test('built-in function string()', () => {
    const env = new Environment().registerVariable('someNum', 'int')

    const result = env.check('string(someNum)')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'string')
  })

  test('built-in method startsWith()', () => {
    const env = new Environment().registerVariable('str', 'string')

    const result = env.check('str.startsWith("hello")')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'bool')
  })

  test('method on wrong type', () => {
    const env = new Environment().registerVariable('num', 'int')

    const result = env.check('num.startsWith("test")')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /found no matching overload/)
  })

  test('custom function', () => {
    const env = new Environment()
      .registerVariable('x', 'int')
      .registerFunction('myDouble(int): int', (x) => x * 2n)

    const result = env.check('myDouble(x)')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'int')
  })

  test('custom function with wrong argument type', () => {
    const env = new Environment()
      .registerVariable('str', 'string')
      .registerFunction('myDouble(int): int', (x) => x * 2n)

    const result = env.check('myDouble(str)')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /found no matching overload/)
  })

  test('unknown function', () => {
    const env = new Environment()

    const result = env.check('unknownFunc()')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /Function not found/)
  })

  test('function overloads', () => {
    const env = new Environment()
      .registerVariable('x', 'int')
      .registerVariable('y', 'double')
      .registerFunction('convert(int): string', (x) => String(x))
      .registerFunction('convert(double): string', (x) => String(x))

    assert.strictEqual(env.check('convert(x)').type, 'string')
    assert.strictEqual(env.check('convert(y)').type, 'string')
  })

  test('complex expression', () => {
    const env = new Environment().registerVariable('user', 'map').registerVariable('minAge', 'int')

    const result = env.check('user.age >= minAge && user.active')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'bool')
  })

  test('macro functions', () => {
    const env = new Environment().registerVariable('items', 'list')

    // Macros should be accepted (detailed checking happens at runtime)
    assert.strictEqual(env.check('items.all(i, i > 0)').type, 'bool')
    assert.strictEqual(env.check('items.exists(i, i > 10)').type, 'bool')
    assert.strictEqual(env.check('items.map(i, i * 2)').type, 'list<int>')
    assert.strictEqual(env.check('items.filter(i, i > 5)').type, 'list')
  })

  test('macro functions ', () => {
    const env = new Environment()
      .registerVariable('items', 'list')
      .registerVariable('someint', 'int')
    assert.strictEqual(env.check('[1, 2, 3].map(i, i)[0]').type, 'int')
    assert.strictEqual(env.check('[1, 2, 3].map(i, i > 2)[0]').type, 'bool')
    assert.strictEqual(env.check('[[1, 2, 3]].map(i, i)[0]').type, 'list<int>')

    assert.strictEqual(env.check('[[someint, 2, 3]].map(i, i)[0]').type, 'list<int>')
    assert.strictEqual(env.check('[[someint, dyn(2), 3]].map(i, i)[0]').type, 'list')
  })

  test('map macro with three-arg form', () => {
    const env = new Environment().registerVariable('numbers', 'list<int>')

    // Valid: filter returns bool, transform returns int
    assert.strictEqual(env.check('numbers.map(i, i > 2, i * 2)').type, 'list<int>')

    // Valid: filter returns bool, transform returns bool
    assert.strictEqual(env.check('numbers.map(i, i > 2, i < 10)').type, 'list<bool>')

    // Invalid: filter returns non-bool
    const result1 = env.check('numbers.map(i, i, i * 2)')
    assert.strictEqual(result1.valid, false)
    assert.match(
      result1.error.message,
      /map\(var, filter, transform\) filter predicate must return bool, got 'int'/
    )

    const result2 = env.check('numbers.map(i, i + 1, i * 2)')
    assert.strictEqual(result2.valid, false)
    assert.match(
      result2.error.message,
      /map\(var, filter, transform\) filter predicate must return bool/
    )
  })

  test('map macro requires identifier', () => {
    const env = new Environment().registerVariable('numbers', 'list<int>')

    // Invalid: first argument is not an identifier
    const result1 = env.check('numbers.map(1, i)')
    assert.strictEqual(result1.valid, false)
    assert.match(
      result1.error.message,
      /map\(var, transform\) requires first argument to be an identifier/
    )

    const result2 = env.check('numbers.map("x", i)')
    assert.strictEqual(result2.valid, false)
    assert.match(
      result2.error.message,
      /map\(var, transform\) requires first argument to be an identifier/
    )
  })

  test('predicate macro validation with typed lists', () => {
    const env = new Environment().registerVariable('numbers', 'list<int>')

    // Valid: predicates return bool
    assert.strictEqual(env.check('numbers.all(i, i > 0)').type, 'bool')
    assert.strictEqual(env.check('numbers.exists(i, i > 10)').type, 'bool')
    assert.strictEqual(env.check('numbers.exists_one(i, i == 5)').type, 'bool')
    assert.strictEqual(env.check('numbers.filter(i, i > 5)').type, 'list<int>')

    // Invalid: predicates return non-bool
    const result1 = env.check('numbers.all(i, i + 1)')
    assert.strictEqual(result1.valid, false)
    assert.match(
      result1.error.message,
      /all\(var, predicate\) predicate must return bool, got 'int'/
    )

    const result2 = env.check('numbers.exists(i, i * 2)')
    assert.strictEqual(result2.valid, false)
    assert.match(
      result2.error.message,
      /exists\(var, predicate\) predicate must return bool, got 'int'/
    )

    const result3 = env.check('numbers.exists_one(i, i)')
    assert.strictEqual(result3.valid, false)
    assert.match(
      result3.error.message,
      /exists_one\(var, predicate\) predicate must return bool, got 'int'/
    )

    const result4 = env.check('numbers.filter(i, i)')
    assert.strictEqual(result4.valid, false)
    assert.match(
      result4.error.message,
      /filter\(var, predicate\) predicate must return bool, got 'int'/
    )
  })

  test('predicate macro validation with string lists', () => {
    const env = new Environment().registerVariable('strings', 'list<string>')

    // Valid: predicates use string methods
    assert.strictEqual(env.check('strings.all(s, s.startsWith("a"))').type, 'bool')
    assert.strictEqual(env.check('strings.exists(s, s.contains("test"))').type, 'bool')
    assert.strictEqual(env.check('strings.filter(s, s.size() > 5)').type, 'list<string>')

    // Invalid: predicate returns string
    const result = env.check('strings.all(s, s + "x")')
    assert.strictEqual(result.valid, false)
    assert.match(
      result.error.message,
      /all\(var, predicate\) predicate must return bool, got 'string'/
    )
  })

  test('predicate macro with invalid variable', () => {
    const env = new Environment().registerVariable('items', 'list')

    // Invalid: first argument is not an identifier
    const result1 = env.check('items.all(1, true)')
    assert.strictEqual(result1.valid, false)
    assert.match(
      result1.error.message,
      /all\(var, predicate\) requires first argument to be an identifier/
    )

    const result2 = env.check('items.filter("x", true)')
    assert.strictEqual(result2.valid, false)
    assert.match(
      result2.error.message,
      /filter\(var, predicate\) requires first argument to be an identifier/
    )
  })

  test('predicate macro with dynamic types', () => {
    const env = new Environment().registerVariable('items', 'list')

    // Valid: dyn is allowed in predicates
    assert.strictEqual(env.check('items.all(i, i > 0)').type, 'bool')
    assert.strictEqual(env.check('items.filter(i, i != null)').type, 'list')
  })

  test('predicate macro with map types', () => {
    const env = new Environment().registerVariable('data', 'map<string, int>')

    // Valid: map macros iterate over keys
    assert.strictEqual(env.check('data.all(k, k.size() > 0)').type, 'bool')
    assert.strictEqual(env.check('data.exists(k, k.startsWith("a"))').type, 'bool')
    assert.strictEqual(env.check('data.filter(k, k.contains("test"))').type, 'list<string>')

    // Invalid: predicate returns non-bool
    const result = env.check('data.all(k, k)')
    assert.strictEqual(result.valid, false)
    assert.match(
      result.error.message,
      /all\(var, predicate\) predicate must return bool, got 'string'/
    )
  })

  test('unary minus', () => {
    const env = new Environment().registerVariable('x', 'int').registerVariable('y', 'double')

    assert.strictEqual(env.check('-x').type, 'int')
    assert.strictEqual(env.check('-y').type, 'double')
  })

  test('unary minus on invalid type', () => {
    const env = new Environment().registerVariable('str', 'string')

    const result = env.check('-str')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error instanceof TypeError)
    assert.match(result.error.message, /no such overload: -string/)
  })

  test('dynamic type defines return type based on operator', () => {
    const env = new Environment({unlistedVariablesAreDyn: true})
    const result = env.check('unknownVar + 10')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'int')
  })

  test('dynamic type defines return type based on operator (multiple matches)', () => {
    const env = new Environment({unlistedVariablesAreDyn: true})
      .registerType('User', class User {})
      .registerOperator('User + int: User')

    const result = env.check('unknownVar + 10')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'dyn')
  })

  test('nested expressions', () => {
    const env = new Environment()
      .registerVariable('a', 'int')
      .registerVariable('b', 'int')
      .registerVariable('c', 'int')

    const result = env.check('(a + b) * c - 10')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'int')
  })

  test('method chaining', () => {
    const env = new Environment().registerVariable('str', 'string')

    const result = env.check('str.substring(0, 5).size()')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'int')
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

    const result = env.check('v1.magnitude()')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'double')
  })

  test('bytes type', () => {
    const env = new Environment().registerVariable('data', 'bytes')

    assert.strictEqual(env.check('data.size()').type, 'int')
    assert.strictEqual(env.check('data.string()').type, 'string')
  })

  test('timestamp type', () => {
    const env = new Environment().registerVariable('ts', 'google.protobuf.Timestamp')

    assert.strictEqual(env.check('ts.getHours()').type, 'int')
    assert.strictEqual(env.check('ts.getFullYear()').type, 'int')
  })

  test('duration type', () => {
    const env = new Environment().registerVariable('dur', 'google.protobuf.Duration')

    assert.strictEqual(env.check('dur.getHours()').type, 'int')
    assert.strictEqual(env.check('dur.getMinutes()').type, 'int')
  })

  test('duration arithmetic', () => {
    const env = new Environment()
      .registerVariable('dur1', 'google.protobuf.Duration')
      .registerVariable('dur2', 'google.protobuf.Duration')

    assert.strictEqual(env.check('dur1 + dur2').type, 'google.protobuf.Duration')
    assert.strictEqual(env.check('dur1 - dur2').type, 'google.protobuf.Duration')
  })

  test('timestamp and duration arithmetic', () => {
    const env = new Environment()
      .registerVariable('ts', 'google.protobuf.Timestamp')
      .registerVariable('dur', 'google.protobuf.Duration')

    assert.strictEqual(env.check('ts + dur').type, 'google.protobuf.Timestamp')
    assert.strictEqual(env.check('ts - dur').type, 'google.protobuf.Timestamp')

    // Timestamp - Timestamp is NOT supported in overloads
    const result = env.check('ts - ts')
    assert.strictEqual(result.valid, false)
  })

  test('error includes source position', () => {
    const env = new Environment()

    const result = env.check('unknownVar')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error)
    assert.ok(result.error.message.includes('Unknown variable: unknownVar'))
    // Error message should include position highlighting
    assert.ok(result.error.message.includes('|'))
    assert.ok(result.error.message.includes('^'))
  })

  test('complex nested validation', () => {
    const env = new Environment()
      .registerType('User', {ctor: class User {}, fields: {name: 'string', age: 'int'}})
      .registerVariable('users', 'list<User>')
      .registerVariable('minAge', 'int')

    // Complex expression with macros and comparisons
    assert.strictEqual(
      env.check('users.filter(u, u.age >= minAge).map(u, u.name)').type,
      'list<string>'
    )

    assert.strictEqual(
      env.check('users.map(u, {"related": users})').type,
      'list<map<string, list<User>>>'
    )
  })

  test('equality operators support all types', () => {
    const env = new Environment().registerVariable('str', 'string').registerVariable('num', 'int')

    // Equality works for same types
    assert.strictEqual(env.check('str == str').type, 'bool')
    assert.strictEqual(env.check('num == num').type, 'bool')

    // Cross-type equality is NOT supported (no overload for string == int)
    const result = env.check('str == num')
    assert.strictEqual(result.valid, false)
    assert.match(result.error.message, /no such overload: string == int/)
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

    assert.strictEqual(env.check('x + y').type, 'uint')
    assert.strictEqual(env.check('x < y').type, 'bool')
  })

  test('list index access', () => {
    const env = new Environment()
      .registerVariable('someList', 'list')
      .registerVariable('intIndex', 'int')
      .registerVariable('uintIndex', 'uint')
      .registerVariable('doubleIndex', 'double')
      .registerVariable('stringIndex', 'string')

    assert.strictEqual(env.check('someList[0]').valid, true)
    assert.strictEqual(env.check('someList[intIndex]').valid, true)

    for (const t of ['uintIndex', '0u', 'doubleIndex', '1.5', 'stringIndex', '"0"']) {
      const result = env.check(`someList[${t}]`)
      assert.strictEqual(result.valid, false)
      assert.ok(result.error.message.includes('List index must be int'))
    }
  })

  test('list index with dynamic variable', () => {
    const env = new Environment()
      .registerVariable('someList', 'list')
      .registerVariable('dynVar', 'dyn')

    for (const t of ['dynVar', 'dyn(0u)', 'dyn(0.0)', 'dyn("0")']) {
      const result = env.check(`someList[${t}]`)
      assert.strictEqual(result.valid, true)
      assert.strictEqual(result.type, 'dyn')
    }
  })

  test('map index access', () => {
    const env = new Environment()
      .registerVariable('someMap', 'map')
      .registerVariable('intKey', 'int')
      .registerVariable('stringKey', 'string')
      .registerVariable('doubleKey', 'double')

    // All types are valid as map keys
    assert.strictEqual(env.check('someMap["key"]').valid, true)
    assert.strictEqual(env.check('someMap[intKey]').valid, true)
    assert.strictEqual(env.check('someMap[stringKey]').valid, true)
    assert.strictEqual(env.check('someMap[doubleKey]').valid, true)
    assert.strictEqual(env.check('someMap[0]').valid, true)
  })

  test('property access', () => {
    const env = new Environment()
      .registerVariable('someMap', 'map')
      .registerVariable('someList', 'list')
      .registerVariable('someNum', 'int')

    // Property access allowed on maps
    assert.strictEqual(env.check('someMap.property').valid, true)

    // Property access not allowed on lists (only numeric indexing works)
    assert.strictEqual(env.check('someList.size').valid, false)

    // Property access not allowed on primitives
    const result = env.check('someNum.property')
    assert.strictEqual(result.valid, false)
    assert.ok(result.error.message.includes('Cannot index type'))
  })

  test('string indexing not supported', () => {
    const env = new Environment().registerVariable('str', 'string').registerVariable('index', 'int')

    // String indexing is not supported in CEL
    const result1 = env.check('str[0]')
    assert.strictEqual(result1.valid, false)
    assert.ok(result1.error.message.includes('Cannot index type'))

    const result2 = env.check('str[index]')
    assert.strictEqual(result2.valid, false)
    assert.ok(result2.error.message.includes('Cannot index type'))
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
    const result = env.check('p.x')
    assert.strictEqual(result.valid, true)
    assert.strictEqual(result.type, 'dyn')
  })
})

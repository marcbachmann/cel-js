import {test} from 'node:test'
import assert from 'node:assert'
import {Environment, TypeError} from '../lib/evaluator.js'

test('TypeChecker - valid variable references', () => {
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

test('TypeChecker - unknown variable', () => {
  const env = new Environment().registerVariable('x', 'int')

  const result = env.check('unknownVar')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error instanceof TypeError)
  assert.match(result.error.message, /Unknown variable: unknownVar/)
})

test('TypeChecker - literals', () => {
  const env = new Environment()

  assert.strictEqual(env.check('42').type, 'int')
  assert.strictEqual(env.check('3.14').type, 'double')
  assert.strictEqual(env.check('"hello"').type, 'string')
  assert.strictEqual(env.check('true').type, 'bool')
  assert.strictEqual(env.check('false').type, 'bool')
  assert.strictEqual(env.check('null').type, 'null')
  assert.strictEqual(env.check('[1, 2, 3]').type, 'list')
  // Map literals need key-value pairs
  const mapResult = env.check('{"a": 1}')
  assert.strictEqual(mapResult.type, 'map')
})

test('TypeChecker - arithmetic operators with matching types', () => {
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

test('TypeChecker - arithmetic operators with mixed int/double', () => {
  const env = new Environment()
    .registerVariable('x', 'int')
    .registerVariable('a', 'double')

  // Mixed int/double operations are not defined in overloads
  // They would require runtime type coercion
  const result1 = env.check('x + a')
  assert.strictEqual(result1.valid, false)
  assert.match(result1.error.message, /Operator '\+' not defined/)

  const result2 = env.check('a + x')
  assert.strictEqual(result2.valid, false)

  const result3 = env.check('x * a')
  assert.strictEqual(result3.valid, false)
})

test('TypeChecker - string concatenation', () => {
  const env = new Environment()
    .registerVariable('first', 'string')
    .registerVariable('last', 'string')

  const result = env.check('first + " " + last')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'string')
})

test('TypeChecker - list concatenation', () => {
  const env = new Environment()
    .registerVariable('list1', 'list')
    .registerVariable('list2', 'list')

  const result = env.check('list1 + list2')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'list')
})

test('TypeChecker - invalid arithmetic (string + int)', () => {
  const env = new Environment()
    .registerVariable('str', 'string')
    .registerVariable('num', 'int')

  const result = env.check('str + num')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error instanceof TypeError)
  assert.match(result.error.message, /Operator '\+' not defined/)
})

test('TypeChecker - comparison operators', () => {
  const env = new Environment()
    .registerVariable('x', 'int')
    .registerVariable('y', 'int')

  assert.strictEqual(env.check('x < y').type, 'bool')
  assert.strictEqual(env.check('x <= y').type, 'bool')
  assert.strictEqual(env.check('x > y').type, 'bool')
  assert.strictEqual(env.check('x >= y').type, 'bool')
  assert.strictEqual(env.check('x == y').type, 'bool')
  assert.strictEqual(env.check('x != y').type, 'bool')
})

test('TypeChecker - comparison with incompatible types', () => {
  const env = new Environment()
    .registerVariable('str', 'string')
    .registerVariable('num', 'int')

  const result = env.check('str < num')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error instanceof TypeError)
})

test('TypeChecker - logical operators', () => {
  const env = new Environment()
    .registerVariable('a', 'bool')
    .registerVariable('b', 'bool')

  assert.strictEqual(env.check('a && b').type, 'bool')
  assert.strictEqual(env.check('a || b').type, 'bool')
  assert.strictEqual(env.check('!a').type, 'bool')
})

test('TypeChecker - logical operators with non-bool', () => {
  const env = new Environment()
    .registerVariable('x', 'int')
    .registerVariable('y', 'int')

  const result = env.check('x && y')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error instanceof TypeError)
  assert.match(result.error.message, /Logical operator requires bool operands/)
})

test('TypeChecker - ternary operator', () => {
  const env = new Environment()
    .registerVariable('condition', 'bool')
    .registerVariable('x', 'int')
    .registerVariable('y', 'int')

  const result = env.check('condition ? x : y')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'int')
})

test('TypeChecker - ternary with non-bool condition', () => {
  const env = new Environment()
    .registerVariable('x', 'int')

  const result = env.check('x ? 1 : 2')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error instanceof TypeError)
  assert.match(result.error.message, /Ternary condition must be bool/)
})

test('TypeChecker - ternary with different branch types', () => {
  const env = new Environment()
    .registerVariable('condition', 'bool')

  const result = env.check('condition ? "yes" : 42')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'dyn') // Mixed types return dyn
})

test('TypeChecker - property access on map', () => {
  const env = new Environment().registerVariable('obj', 'map')

  const result = env.check('obj.field')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'dyn')
})

test('TypeChecker - property access on invalid type', () => {
  const env = new Environment().registerVariable('num', 'int')

  const result = env.check('num.field')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error instanceof TypeError)
})

test('TypeChecker - index access on list', () => {
  const env = new Environment()
    .registerVariable('list', 'list')
    .registerVariable('idx', 'int')

  const result = env.check('list[idx]')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'dyn')
})

test('TypeChecker - index access with invalid index type', () => {
  const env = new Environment()
    .registerVariable('list', 'list')
    .registerVariable('str', 'string')

  const result = env.check('list[str]')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error instanceof TypeError)
  assert.match(result.error.message, /List index must be int/)
})

test('TypeChecker - string indexing is not supported', () => {
  const env = new Environment()
    .registerVariable('str', 'string')
    .registerVariable('idx', 'int')

  // String indexing is NOT supported in CEL
  const result = env.check('str[idx]')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error instanceof TypeError)
  assert.match(result.error.message, /Cannot index type 'string'/)
})

test('TypeChecker - in operator with list', () => {
  const env = new Environment()
    .registerVariable('item', 'int')
    .registerVariable('items', 'list')

  const result = env.check('item in items')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'bool')
})

test('TypeChecker - in operator with string', () => {
  const env = new Environment()
    .registerVariable('substr', 'string')
    .registerVariable('str', 'string')

  // String in string is NOT supported via the 'in' operator
  // Use .contains() method instead
  const result = env.check('substr in str')
  assert.strictEqual(result.valid, false)
  assert.match(result.error.message, /Operator 'in' not defined/)

  // This is the correct way:
  const result2 = env.check('str.contains(substr)')
  assert.strictEqual(result2.valid, true)
  assert.strictEqual(result2.type, 'bool')
})

test('TypeChecker - built-in function size()', () => {
  const env = new Environment()
    .registerVariable('str', 'string')
    .registerVariable('list', 'list')

  assert.strictEqual(env.check('size(str)').type, 'int')
  assert.strictEqual(env.check('size(list)').type, 'int')
})

test('TypeChecker - built-in function string()', () => {
  const env = new Environment().registerVariable('num', 'int')

  const result = env.check('string(num)')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'string')
})

test('TypeChecker - built-in method startsWith()', () => {
  const env = new Environment().registerVariable('str', 'string')

  const result = env.check('str.startsWith("hello")')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'bool')
})

test('TypeChecker - method on wrong type', () => {
  const env = new Environment().registerVariable('num', 'int')

  const result = env.check('num.startsWith("test")')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error instanceof TypeError)
  assert.match(result.error.message, /Method not found/)
})

test('TypeChecker - custom function', () => {
  const env = new Environment()
    .registerVariable('x', 'int')
    .registerFunction('myDouble(int): int', (x) => x * 2n)

  const result = env.check('myDouble(x)')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'int')
})

test('TypeChecker - custom function with wrong argument type', () => {
  const env = new Environment()
    .registerVariable('str', 'string')
    .registerFunction('myDouble(int): int', (x) => x * 2n)

  const result = env.check('myDouble(str)')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error instanceof TypeError)
  assert.match(result.error.message, /No matching overload/)
})

test('TypeChecker - unknown function', () => {
  const env = new Environment()

  const result = env.check('unknownFunc()')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error instanceof TypeError)
  assert.match(result.error.message, /Function not found/)
})

test('TypeChecker - function overloads', () => {
  const env = new Environment()
    .registerVariable('x', 'int')
    .registerVariable('y', 'double')
    .registerFunction('convert(int): string', (x) => String(x))
    .registerFunction('convert(double): string', (x) => String(x))

  assert.strictEqual(env.check('convert(x)').type, 'string')
  assert.strictEqual(env.check('convert(y)').type, 'string')
})

test('TypeChecker - complex expression', () => {
  const env = new Environment()
    .registerVariable('user', 'map')
    .registerVariable('minAge', 'int')

  const result = env.check('user.age >= minAge && user.active')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'bool')
})

test('TypeChecker - macro functions', () => {
  const env = new Environment().registerVariable('items', 'list')

  // Macros should be accepted (detailed checking happens at runtime)
  assert.strictEqual(env.check('items.all(i, i > 0)').type, 'bool')
  assert.strictEqual(env.check('items.exists(i, i > 10)').type, 'bool')
  assert.strictEqual(env.check('items.map(i, i * 2)').type, 'list')
  assert.strictEqual(env.check('items.filter(i, i > 5)').type, 'list')
})

test('TypeChecker - unary minus', () => {
  const env = new Environment()
    .registerVariable('x', 'int')
    .registerVariable('y', 'double')

  assert.strictEqual(env.check('-x').type, 'int')
  assert.strictEqual(env.check('-y').type, 'double')
})

test('TypeChecker - unary minus on invalid type', () => {
  const env = new Environment().registerVariable('str', 'string')

  const result = env.check('-str')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error instanceof TypeError)
  assert.match(result.error.message, /Unary operator '-' not defined for type/)
})

test('TypeChecker - dynamic type (dyn)', () => {
  const env = new Environment({unlistedVariablesAreDyn: true})

  // Unlisted variables are treated as dyn
  const result = env.check('unknownVar + 10')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'dyn')
})

test('TypeChecker - nested expressions', () => {
  const env = new Environment()
    .registerVariable('a', 'int')
    .registerVariable('b', 'int')
    .registerVariable('c', 'int')

  const result = env.check('(a + b) * c - 10')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'int')
})

test('TypeChecker - method chaining', () => {
  const env = new Environment().registerVariable('str', 'string')

  const result = env.check('str.substring(0, 5).size()')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'int')
})

test('TypeChecker - custom types', () => {
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

test('TypeChecker - bytes type', () => {
  const env = new Environment().registerVariable('data', 'bytes')

  assert.strictEqual(env.check('data.size()').type, 'int')
  assert.strictEqual(env.check('data.string()').type, 'string')
})

test('TypeChecker - timestamp type', () => {
  const env = new Environment().registerVariable('ts', 'google.protobuf.Timestamp')

  assert.strictEqual(env.check('ts.getHours()').type, 'int')
  assert.strictEqual(env.check('ts.getFullYear()').type, 'int')
})

test('TypeChecker - duration type', () => {
  const env = new Environment().registerVariable('dur', 'google.protobuf.Duration')

  assert.strictEqual(env.check('dur.getHours()').type, 'int')
  assert.strictEqual(env.check('dur.getMinutes()').type, 'int')
})

test('TypeChecker - duration arithmetic', () => {
  const env = new Environment()
    .registerVariable('dur1', 'google.protobuf.Duration')
    .registerVariable('dur2', 'google.protobuf.Duration')

  assert.strictEqual(env.check('dur1 + dur2').type, 'google.protobuf.Duration')
  assert.strictEqual(env.check('dur1 - dur2').type, 'google.protobuf.Duration')
})

test('TypeChecker - timestamp and duration arithmetic', () => {
  const env = new Environment()
    .registerVariable('ts', 'google.protobuf.Timestamp')
    .registerVariable('dur', 'google.protobuf.Duration')

  assert.strictEqual(env.check('ts + dur').type, 'google.protobuf.Timestamp')
  assert.strictEqual(env.check('ts - dur').type, 'google.protobuf.Timestamp')

  // Timestamp - Timestamp is NOT supported in overloads
  const result = env.check('ts - ts')
  assert.strictEqual(result.valid, false)
})

test('TypeChecker - error includes source position', () => {
  const env = new Environment()

  const result = env.check('unknownVar')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error)
  assert.ok(result.error.message.includes('Unknown variable: unknownVar'))
  // Error message should include position highlighting
  assert.ok(result.error.message.includes('|'))
  assert.ok(result.error.message.includes('^'))
})

test('TypeChecker - complex nested validation', () => {
  const env = new Environment()
    .registerVariable('users', 'list')
    .registerVariable('minAge', 'int')

  // Complex expression with macros and comparisons
  const result = env.check('users.filter(u, u.age >= minAge).map(u, u.name)')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'list')
})

test('TypeChecker - equality operators support all types', () => {
  const env = new Environment()
    .registerVariable('str', 'string')
    .registerVariable('num', 'int')

  // Equality works for same types
  assert.strictEqual(env.check('str == str').type, 'bool')
  assert.strictEqual(env.check('num == num').type, 'bool')

  // Cross-type equality is NOT supported (no overload for string == int)
  const result = env.check('str == num')
  assert.strictEqual(result.valid, false)
  assert.match(result.error.message, /Operator '==' not defined/)
})

test('TypeChecker - parse errors are caught', () => {
  const env = new Environment()

  const result = env.check('invalid + + syntax')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error)
})

test('TypeChecker - empty expression', () => {
  const env = new Environment()

  const result = env.check('')
  assert.strictEqual(result.valid, false)
})

test('TypeChecker - uint type support', () => {
  const env = new Environment()
    .registerVariable('x', 'uint')
    .registerVariable('y', 'uint')

  assert.strictEqual(env.check('x + y').type, 'uint')
  assert.strictEqual(env.check('x < y').type, 'bool')
})

test('TypeChecker - list index access', () => {
  const env = new Environment()
    .registerVariable('list', 'list')
    .registerVariable('intIndex', 'int')
    .registerVariable('uintIndex', 'uint')
    .registerVariable('doubleIndex', 'double')
    .registerVariable('stringIndex', 'string')

  // Valid: int and uint indices
  assert.strictEqual(env.check('list[0]').valid, true)
  assert.strictEqual(env.check('list[intIndex]').valid, true)
  assert.strictEqual(env.check('list[uintIndex]').valid, true)

  // Invalid: double index
  const result1 = env.check('list[doubleIndex]')
  assert.strictEqual(result1.valid, false)
  assert.ok(result1.error.message.includes('List index must be int or uint'))

  // Invalid: string index
  const result2 = env.check('list[stringIndex]')
  assert.strictEqual(result2.valid, false)
  assert.ok(result2.error.message.includes('List index must be int or uint'))

  // Invalid: double literal
  const result3 = env.check('list[1.5]')
  assert.strictEqual(result3.valid, false)
  assert.ok(result3.error.message.includes('List index must be int or uint'))
})

test('TypeChecker - list index with dynamic variable', () => {
  const env = new Environment({unlistedVariablesAreDyn: true})
    .registerVariable('list', 'list')

  // Dynamic variable is allowed as index (runtime will check)
  const result = env.check('list[unknownVar]')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'dyn')
})

test('TypeChecker - map index access', () => {
  const env = new Environment()
    .registerVariable('map', 'map')
    .registerVariable('intKey', 'int')
    .registerVariable('stringKey', 'string')
    .registerVariable('doubleKey', 'double')

  // All types are valid as map keys
  assert.strictEqual(env.check('map["key"]').valid, true)
  assert.strictEqual(env.check('map[intKey]').valid, true)
  assert.strictEqual(env.check('map[stringKey]').valid, true)
  assert.strictEqual(env.check('map[doubleKey]').valid, true)
  assert.strictEqual(env.check('map[0]').valid, true)
})

test('TypeChecker - property access', () => {
  const env = new Environment()
    .registerVariable('map', 'map')
    .registerVariable('list', 'list')
    .registerVariable('num', 'int')

  // Property access allowed on maps and lists
  assert.strictEqual(env.check('map.property').valid, true)
  assert.strictEqual(env.check('list.size').valid, true)

  // Property access not allowed on primitives
  const result = env.check('num.property')
  assert.strictEqual(result.valid, false)
  assert.ok(result.error.message.includes('Cannot access property on type'))
})

test('TypeChecker - string indexing not supported', () => {
  const env = new Environment()
    .registerVariable('str', 'string')
    .registerVariable('index', 'int')

  // String indexing is not supported in CEL
  const result1 = env.check('str[0]')
  assert.strictEqual(result1.valid, false)
  assert.ok(result1.error.message.includes('Cannot index type'))

  const result2 = env.check('str[index]')
  assert.strictEqual(result2.valid, false)
  assert.ok(result2.error.message.includes('Cannot index type'))
})

test('TypeChecker - custom type property access', () => {
  class Point {
    constructor(x, y) {
      this.x = x
      this.y = y
    }
  }

  const env = new Environment()
    .registerType('Point', Point)
    .registerVariable('p', 'Point')

  // Property access allowed on custom types
  const result = env.check('p.x')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'dyn')
})

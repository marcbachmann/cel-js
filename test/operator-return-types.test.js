import {test} from 'node:test'
import assert from 'node:assert'
import {Environment} from '../lib/evaluator.js'

test('Operator return types - explicit return type declaration', () => {
  class Vector {
    constructor(x, y) {
      this.x = x
      this.y = y
    }
    add(other) {
      return new Vector(this.x + other.x, this.y + other.y)
    }
    dot(other) {
      return this.x * other.x + this.y * other.y
    }
  }

  const env = new Environment()
    .registerType('Vector', Vector)
    .registerVariable('v1', 'Vector')
    .registerVariable('v2', 'Vector')
    .registerOperator('Vector + Vector: Vector', (a, b) => a.add(b))
    .registerOperator('Vector * Vector: double', (a, b) => a.dot(b))

  // Vector + Vector should return Vector
  const addResult = env.check('v1 + v2')
  assert.strictEqual(addResult.valid, true)
  assert.strictEqual(addResult.type, 'Vector')

  // Vector * Vector (dot product) should return double
  const dotResult = env.check('v1 * v2')
  assert.strictEqual(dotResult.valid, true)
  assert.strictEqual(dotResult.type, 'double')

  // Verify it works at runtime
  const v1 = new Vector(3, 4)
  const v2 = new Vector(1, 2)
  const sum = env.evaluate('v1 + v2', {v1, v2})
  assert.strictEqual(sum.x, 4)
  assert.strictEqual(sum.y, 6)

  const dot = env.evaluate('v1 * v2', {v1, v2})
  assert.strictEqual(dot, 11) // 3*1 + 4*2
})

test('Operator return types - default to left operand type', () => {
  class Point {
    constructor(x, y) {
      this.x = x
      this.y = y
    }
    scale(factor) {
      return new Point(this.x * factor, this.y * factor)
    }
  }

  const env = new Environment()
    .registerType('Point', Point)
    .registerVariable('p', 'Point')
    .registerVariable('scale', 'double')
    .registerOperator('Point * double', (p, s) => p.scale(s))

  // Point * double should default to Point (left operand type)
  const result = env.check('p * scale')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'Point')

  // Verify at runtime
  const p = new Point(2, 3)
  const scaled = env.evaluate('p * scale', {p, scale: 2.5})
  assert.strictEqual(scaled.x, 5)
  assert.strictEqual(scaled.y, 7.5)
})

test('Operator return types - unary operators', () => {
  class Complex {
    constructor(real, imag) {
      this.real = real
      this.imag = imag
    }
    negate() {
      return new Complex(-this.real, -this.imag)
    }
  }

  const env = new Environment()
    .registerType('Complex', Complex)
    .registerVariable('c', 'Complex')
    .registerOperator('-Complex: Complex', (c) => c.negate())

  // -Complex should return Complex
  const result = env.check('-c')
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.type, 'Complex')

  // Verify at runtime
  const c = new Complex(3, 4)
  const negated = env.evaluate('-c', {c})
  assert.strictEqual(negated.real, -3)
  assert.strictEqual(negated.imag, -4)
})

test('Operator return types - comparison operators always return bool', () => {
  class Money {
    constructor(amount) {
      this.amount = amount
    }
  }

  const env = new Environment()
    .registerType('Money', Money)
    .registerVariable('m1', 'Money')
    .registerVariable('m2', 'Money')
    .registerOperator('Money == Money', (a, b) => a.amount === b.amount)
    .registerOperator('Money < Money', (a, b) => a.amount < b.amount)

  // Comparison operators should return bool
  assert.strictEqual(env.check('m1 == m2').type, 'bool')
  assert.strictEqual(env.check('m1 != m2').type, 'bool')
  assert.strictEqual(env.check('m1 < m2').type, 'bool')

  // Verify at runtime
  const m1 = new Money(100)
  const m2 = new Money(200)
  assert.strictEqual(env.evaluate('m1 < m2', {m1, m2}), true)
  assert.strictEqual(env.evaluate('m1 == m2', {m1, m2}), false)
  assert.strictEqual(env.evaluate('m1 != m2', {m1, m2}), true)
})

test('Operator return types - mixed with built-in operators', () => {
  class Counter {
    constructor(value) {
      this.value = value
    }
    increment() {
      return new Counter(this.value + 1)
    }
  }

  const env = new Environment()
    .registerType('Counter', Counter)
    .registerVariable('c', 'Counter')
    .registerVariable('n', 'int')
    .registerOperator('Counter + Counter: Counter', (a, b) => new Counter(a.value + b.value))

  // Counter + Counter returns Counter
  const result1 = env.check('c + c')
  assert.strictEqual(result1.valid, true)
  assert.strictEqual(result1.type, 'Counter')

  // int + int still returns int (built-in)
  const result2 = env.check('n + n')
  assert.strictEqual(result2.valid, true)
  assert.strictEqual(result2.type, 'int')

  // Verify at runtime
  const c = new Counter(5)
  const sum = env.evaluate('c + c', {c})
  assert.strictEqual(sum.value, 10)
})

test('Operator return types - invalid return type rejected', () => {
  class Foo {}

  const env = new Environment().registerType('Foo', Foo)

  // Should throw when registering operator with invalid return type
  assert.throws(
    () => {
      env.registerOperator('Foo + Foo: InvalidType', () => {})
    },
    /Invalid return type 'InvalidType'/
  )

  // Should throw when trying to specify non-bool return type for comparison operators
  assert.throws(
    () => {
      env.registerOperator('Foo < Foo: Foo', () => {})
    },
    /Comparison operator '<' must return 'bool', got 'Foo'/
  )

  assert.throws(
    () => {
      env.registerOperator('Foo == Foo: int', () => {})
    },
    /Comparison operator '==' must return 'bool', got 'int'/
  )

  assert.throws(
    () => {
      env.registerOperator('Foo in Foo: Foo', () => {})
    },
    /Comparison operator 'in' must return 'bool', got 'Foo'/
  )
})

test('Operator return types - complex chained operations', () => {
  class Vec2 {
    constructor(x, y) {
      this.x = x
      this.y = y
    }
    add(other) {
      return new Vec2(this.x + other.x, this.y + other.y)
    }
    scale(s) {
      return new Vec2(this.x * s, this.y * s)
    }
    magnitude() {
      return Math.sqrt(this.x * this.x + this.y * this.y)
    }
  }

  const env = new Environment()
    .registerType('Vec2', Vec2)
    .registerVariable('v1', 'Vec2')
    .registerVariable('v2', 'Vec2')
    .registerVariable('scale', 'double')
    .registerOperator('Vec2 + Vec2: Vec2', (a, b) => a.add(b))
    .registerOperator('Vec2 * double: Vec2', (v, s) => v.scale(s))
    .registerFunction('Vec2.magnitude(): double', (vec) => vec.magnitude())

  // (v1 + v2) * scale should return Vec2
  const result1 = env.check('(v1 + v2) * scale')
  assert.strictEqual(result1.valid, true)
  assert.strictEqual(result1.type, 'Vec2')

  // (v1 + v2).magnitude() should return double
  const result2 = env.check('(v1 + v2).magnitude()')
  assert.strictEqual(result2.valid, true)
  assert.strictEqual(result2.type, 'double')

  // Verify at runtime
  const v1 = new Vec2(3, 4)
  const v2 = new Vec2(1, 2)
  const scaled = env.evaluate('(v1 + v2) * scale', {v1, v2, scale: 2})
  assert.strictEqual(scaled.x, 8)
  assert.strictEqual(scaled.y, 12)

  const mag = env.evaluate('(v1 + v2).magnitude()', {v1, v2})
  assert.strictEqual(mag, Math.sqrt(16 + 36))
})

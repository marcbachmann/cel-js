import {test} from 'node:test'
import assert from 'node:assert'
import {Environment} from '../lib/evaluator.js'

// Define a custom Vector type
class Vector {
  constructor(x, y) {
    this.x = Number(x)
    this.y = Number(y)
  }

  add(other) {
    return new Vector(this.x + other.x, this.y + other.y)
  }

  subtract(other) {
    return new Vector(this.x - other.x, this.y - other.y)
  }

  magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  equals(other) {
    return this.x === other.x && this.y === other.y
  }

  toString() {
    return `Vector(${this.x}, ${this.y})`
  }
}

// Define a custom Point type
class Point {
  constructor(x, y) {
    this.x = x
    this.y = y
  }

  distanceTo(other) {
    const dx = this.x - other.x
    const dy = this.y - other.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  toString() {
    return `Point(${this.x}, ${this.y})`
  }
}

test('Custom Type Registration - Vector type', () => {
  const env = new Environment()
    .registerType('Vector', Vector)
    .registerVariable('v1', 'Vector')
    .registerVariable('v2', 'Vector')
    .registerOperator('Vector + Vector', (a, b) => {
      return a.add(b)
    })
    .registerOperator('Vector - Vector', (a, b) => {
      return a.subtract(b)
    })
    .registerOperator('Vector == Vector', (a, b) => a.equals(b))
    .registerFunction('magnitude(Vector): double', (vec) => vec.magnitude())
    .registerFunction('Vector.magnitude(): double', (vec) => vec.magnitude())

  const context = {
    v1: new Vector(3, 4),
    v2: new Vector(1, 2)
  }

  // Test type recognition
  const result1 = env.evaluate('v1 + v2', context)
  assert.ok(result1 instanceof Vector)
  assert.strictEqual(result1.x, 4)
  assert.strictEqual(result1.y, 6)

  // Test subtraction
  const result2 = env.evaluate('v1 - v2', context)
  assert.ok(result2 instanceof Vector)
  assert.strictEqual(result2.x, 2)
  assert.strictEqual(result2.y, 2)

  // Test equality
  const result3 = env.evaluate('v1 == v2', context)
  assert.strictEqual(result3, false)

  const result4 = env.evaluate('v1 == v1', context)
  assert.strictEqual(result4, true)

  // Test method calls
  const result5 = env.evaluate('v1.magnitude()', context)
  assert.strictEqual(result5, 5) // sqrt(3^2 + 4^2) = 5
})

test('Custom Type Registration - type checking', () => {
  const env = new Environment()
    .registerType('Point', Point)
    .registerType('Vector', Vector)
    .registerVariable('p1', 'Point')

  const context = {
    p1: new Point(10, 20)
  }

  // Should work with correct type
  const result1 = env.evaluate('p1.x', context)
  assert.strictEqual(result1, 10)

  // Should fail with wrong type
  assert.throws(
    () => {
      env.evaluate('p1', {p1: new Vector(1, 2)})
    },
    {
      name: 'EvaluationError',
      message: /Variable 'p1' is not of type 'Point'/
    }
  )
})

test('Custom Type Registration - mixed with built-in types', () => {
  const env = new Environment()
    .registerType('Vector', Vector)
    .registerVariable('vec', 'Vector')
    .registerVariable('scale', 'double')
    .registerOperator(
      'Vector * double',
      (vec, scalar) => new Vector(vec.x * scalar, vec.y * scalar)
    )
    .registerOperator(
      'double * Vector',
      (scalar, vec) => new Vector(vec.x * scalar, vec.y * scalar)
    )

  const context = {
    vec: new Vector(2, 3),
    scale: 2.5
  }

  // Test vector * scalar
  const result1 = env.evaluate('vec * scale', context)
  assert.ok(result1 instanceof Vector)
  assert.strictEqual(result1.x, 5)
  assert.strictEqual(result1.y, 7.5)

  // Test scalar * vector
  const result2 = env.evaluate('scale * vec', context)
  assert.ok(result2 instanceof Vector)
  assert.strictEqual(result2.x, 5)
  assert.strictEqual(result2.y, 7.5)
})

test('Custom Type Registration - with functions', () => {
  const env = new Environment()
    .registerType('Vector', Vector)
    .registerFunction('createVector(int, int): Vector', (x, y) => new Vector(x, y))
    .registerFunction('length(Vector): double', (vec) => vec.magnitude())

  // Test function that creates custom type
  const result1 = env.evaluate('createVector(3, 4)')
  assert.ok(result1 instanceof Vector)
  assert.strictEqual(result1.x, 3)
  assert.strictEqual(result1.y, 4)

  // Test method on custom type
  const result2 = env.evaluate('length(createVector(3, 4))')
  assert.strictEqual(result2, 5)
})

test('Custom Type Registration - inheritance from built-in overloads', () => {
  const env = new Environment()
    .registerVariable('str', 'string')
    .registerType('Vector', Vector)
    .registerVariable('vec', 'Vector')

  const context = {
    vec: new Vector(1, 2),
    str: 'hello'
  }

  // Built-in string operations should still work
  const result1 = env.evaluate('str + " world"', context)
  assert.strictEqual(result1, 'hello world')

  // Built-in numeric operations should still work
  const result2 = env.evaluate('1 + 2')
  assert.strictEqual(result2, 3n)
})

test('Custom Type Registration - multiple custom types', () => {
  const env = new Environment()
    .registerType('Vector', Vector)
    .registerType('Point', Point)
    .registerVariable('vec', 'Vector')
    .registerVariable('point', 'Point')
    .registerOperator('Point + Vector', (point, vec) => new Point(point.x + vec.x, point.y + vec.y))

  const context = {
    vec: new Vector(2, 3),
    point: new Point(10, 20)
  }

  const result = env.evaluate('point + vec', context)
  assert.ok(result instanceof Point)
  assert.strictEqual(result.x, 12)
  assert.strictEqual(result.y, 23)
})

test('Custom Type Registration - error handling', () => {
  const env = new Environment().registerType('Vector', Vector).registerVariable('vec', 'Vector')

  const context = {
    vec: new Vector(1, 2)
  }

  // Should throw error for unsupported operation
  assert.throws(
    () => {
      env.evaluate('vec * "invalid"', context)
    },
    {
      name: 'EvaluationError',
      message: /no such overload: Vector \* string/
    }
  )
})

test('Custom Type Registration - complex expressions', () => {
  const env = new Environment()
    .registerType('Vector', Vector)
    .registerVariable('vectors', 'list')
    .registerOperator('Vector + Vector', (a, b) => a.add(b))
    .registerFunction('magnitude(Vector): double', (vec) => vec.magnitude())

  const context = {
    vectors: [new Vector(1, 0), new Vector(0, 1), new Vector(1, 1)]
  }

  // Complex expression with custom types
  const expr = 'vectors.filter(v, magnitude(v) > 1.0).size()'
  const result = env.evaluate(expr, context)
  assert.strictEqual(result, 1n) // Only Vector(1,1) has magnitude > 1.0
})

test('Custom Type Registration - instance methods', () => {
  const env = new Environment()
    .registerType('Vector', Vector)
    .registerVariable('vec', 'Vector')
    .registerFunction('Vector.add(Vector): Vector', (vec, other) => {
      return vec.add(other)
    })
    .registerFunction('Vector.subtract(Vector): Vector', (vec, other) => {
      return vec.subtract(other)
    })

  const context = {
    vec: new Vector(5, 7)
  }

  const result1 = env.evaluate('vec.add(vec)', context)
  assert.ok(result1 instanceof Vector)
  assert.strictEqual(result1.x, 10)
  assert.strictEqual(result1.y, 14)

  const result2 = env.evaluate('vec.subtract(vec)', context)
  assert.ok(result2 instanceof Vector)
  assert.strictEqual(result2.x, 0)
  assert.strictEqual(result2.y, 0)
})

test('Custom Type Registration - nested custom types', () => {
  class Container {
    constructor(items) {
      this.items = items
    }
  }

  const env = new Environment()
    .registerType('Vector', Vector)
    .registerType('Container', Container)
    .registerVariable('container', 'Container')
    .registerOperator('Vector + Vector', (a, b) => a.add(b))

  const context = {
    container: new Container([new Vector(1, 2), new Vector(3, 4)])
  }

  const result = env.evaluate('container.items[0] + container.items[1]', context)
  assert.ok(result instanceof Vector)
  assert.strictEqual(result.x, 4)
  assert.strictEqual(result.y, 6)
})

test('Custom Type Registration - type validation in function return', () => {
  const env = new Environment()
    .registerType('Vector', Vector)
    .registerType('Point', Point)
    .registerFunction('makePoint(int, int): Point', (x, y) => new Point(Number(x), Number(y)))
    .registerFunction('makeVector(int, int): Vector', (x, y) => new Vector(Number(x), Number(y)))

  const point = env.evaluate('makePoint(10, 20)')
  assert.ok(point instanceof Point)
  assert.strictEqual(point.x, 10)
  assert.strictEqual(point.y, 20)

  const vector = env.evaluate('makeVector(5, 15)')
  assert.ok(vector instanceof Vector)
  assert.strictEqual(vector.x, 5)
  assert.strictEqual(vector.y, 15)
})

test('Custom Type Registration - method chaining on custom types', () => {
  class Builder {
    constructor(value = 0) {
      this.value = value
    }
    add(n) {
      return new Builder(this.value + n)
    }
    multiply(n) {
      return new Builder(this.value * n)
    }
    build() {
      return this.value
    }
  }

  const env = new Environment()
    .registerType('Builder', Builder)
    .registerVariable('builder', 'Builder')
    .registerFunction('Builder.add(int): Builder', (builder, n) => {
      return builder.add(Number(n))
    })
    .registerFunction('Builder.multiply(int): Builder', (builder, n) => {
      return builder.multiply(Number(n))
    })
    .registerFunction('Builder.build(): int', (builder) => {
      return BigInt(builder.build())
    })

  const context = {
    builder: new Builder(5)
  }

  const result = env.evaluate('builder.add(3).multiply(2).build()', context)
  assert.strictEqual(result, 16n) // (5 + 3) * 2 = 16
})

test('Custom Type Registration - type checking with wrong constructor', () => {
  const env = new Environment()
    .registerType('Vector', Vector)
    .registerType('Point', Point)
    .registerVariable('vec', 'Vector')

  // Should accept Vector instances
  const result1 = env.evaluate('vec.x', {vec: new Vector(1, 2)})
  assert.strictEqual(result1, 1)

  // Should reject Point instances for Vector variable
  assert.throws(
    () => {
      env.evaluate('vec.x', {vec: new Point(1, 2)})
    },
    {
      name: 'EvaluationError',
      message: /Variable 'vec' is not of type 'Vector'/
    }
  )
})

test('Custom Type Registration - map operations with custom types', () => {
  const env = new Environment()
    .registerType('Vector', Vector)
    .registerVariable('vectors', 'list')
    .registerFunction('magnitude(Vector): double', (vec) => vec.magnitude())

  const context = {
    vectors: [new Vector(3, 4), new Vector(5, 12), new Vector(8, 15)]
  }

  const result = env.evaluate('vectors.map(v, magnitude(v))', context)
  assert.deepStrictEqual(result, [5, 13, 17])
})

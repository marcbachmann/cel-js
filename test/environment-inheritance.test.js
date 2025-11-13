import {describe, test} from 'node:test'
import assert from 'node:assert'
import {Environment} from '../lib/evaluator.js'

describe('Environment inheritance', () => {
  test('environments inherit built-in functions from global registry', () => {
    const env1 = new Environment()
    const env2 = new Environment()
    const env3 = env1.clone()
    assert.strictEqual(env1.evaluate('size("test")'), 4n)
    assert.strictEqual(env2.evaluate('size("test")'), 4n)
    assert.strictEqual(env3.evaluate('size("test")'), 4n)
  })

  test('environments inherits unlistedVariablesAreDyn', () => {
    const env1 = new Environment({unlistedVariablesAreDyn: true})
    const env2 = env1.clone()
    const ctx = {foo: 'hello'}
    assert.equal(env1.check('foo + foo', ctx).type, 'dyn')
    assert.equal(env2.check('foo + foo', ctx).type, 'dyn')
    assert.equal(env1.check('"hello" + foo', ctx).type, 'string')
    assert.equal(env2.check('"hello" + foo', ctx).type, 'string')

    const env3 = new Environment({unlistedVariablesAreDyn: false})
    const env4 = env3.clone()
    assert.match(env3.check('foo + foo', ctx).error.message, /Unknown variable: foo/)
    assert.match(env4.check('foo + foo', ctx).error.message, /Unknown variable: foo/)
  })

  test('evaluation against cloned environments is still possible', () => {
    const env1 = new Environment({unlistedVariablesAreDyn: true})
    env1.clone()
    const ctx = {foo: 'hello'}
    assert.equal(env1.evaluate('foo + foo', ctx), 'hellohello')
  })

  test('environments do not support registration after cloning', () => {
    const env1 = new Environment()
    const env2 = env1.clone()

    const err = /Cannot modify frozen registry/
    assert.throws(() => env1.registerFunction('triple(int): int', (value) => value * 3n), err)
    assert.throws(() => env1.registerType('foo', class Foo {}), err)
    assert.throws(() => env1.registerOperator('int + type', () => {}), err)
    assert.throws(() => env1.registerVariable('foo', 'dyn'), err)

    env2.registerFunction('triple(int): int', (value) => value * 3n)
    env2.registerType('foo', class Foo {})
    env2.registerOperator('int + type', () => {})
    env2.registerVariable('foo', 'dyn')
  })

  test('functions are isolated between environments', () => {
    const env1 = new Environment()
      .registerFunction('greet(string): string', (name) => `Hello ${name}`)
      .registerVariable('name', 'string')

    const env2 = new Environment()
      .registerFunction('greet(string): string', (name) => `Hi ${name}`)
      .registerVariable('name', 'string')

    const env3 = env2.clone()
    assert.strictEqual(env1.evaluate('greet(name)', {name: 'Alice'}), 'Hello Alice')
    assert.strictEqual(env2.evaluate('greet(name)', {name: 'Bob'}), 'Hi Bob')
    assert.strictEqual(env3.evaluate('greet(name)', {name: 'Bob'}), 'Hi Bob')
  })

  test('operators are isolated between environments', () => {
    class Vec2 {
      constructor(x, y) {
        this.x = x
        this.y = y
      }
    }

    const env1 = new Environment()
      .registerType('Vec2', Vec2)
      .registerVariable('a', 'Vec2')
      .registerVariable('b', 'Vec2')
      .registerOperator('Vec2 + Vec2', (a, b) => new Vec2(a.x + b.x, a.y + b.y))

    const env2 = new Environment()
      .registerType('Vec2', Vec2)
      .registerVariable('a', 'Vec2')
      .registerVariable('b', 'Vec2')
      .registerOperator('Vec2 + Vec2', (a, b) => new Vec2(a.x * b.x, a.y * b.y)) // multiply instead

    const vec1 = new Vec2(1, 2)
    const vec2 = new Vec2(3, 4)

    const result1 = env1.evaluate('a + b', {a: vec1, b: vec2})
    const result2 = env2.evaluate('a + b', {a: vec1, b: vec2})

    assert.strictEqual(result1.x, 4)
    assert.strictEqual(result1.y, 6)
    assert.strictEqual(result2.x, 3)
    assert.strictEqual(result2.y, 8)
  })

  test('variables are isolated between environments', () => {
    const env1 = new Environment().registerVariable('x', 'int')
    const env2 = new Environment().registerVariable('y', 'string')

    assert.ok(env1.hasVariable('x'))
    assert.ok(!env1.hasVariable('y'))
    assert.ok(env2.hasVariable('y'))
    assert.ok(!env2.hasVariable('x'))

    assert.strictEqual(env1.evaluate('x + 1', {x: 5n}), 6n)
    assert.strictEqual(env2.evaluate('y + "!"', {y: 'test'}), 'test!')
  })

  test('custom types are isolated between environments', () => {
    class TypeA {
      constructor(value) {
        this.value = value
      }
    }

    class TypeB {
      constructor(value) {
        this.value = value
      }
    }

    const env1 = new Environment()
      .registerType('CustomType', TypeA)
      .registerVariable('obj', 'CustomType')
      .registerFunction('CustomType.getValue(): int', function (receiver) {
        return BigInt(receiver.value)
      })

    const env2 = new Environment()
      .registerType('CustomType', TypeB)
      .registerVariable('obj', 'CustomType')
      .registerFunction('CustomType.getValue(): string', function (receiver) {
        return String(receiver.value)
      })

    const objA = new TypeA(42)
    const objB = new TypeB(99)

    const result1 = env1.evaluate('obj.getValue()', {obj: objA})
    const result2 = env2.evaluate('obj.getValue()', {obj: objB})

    assert.strictEqual(result1, 42n)
    assert.strictEqual(result2, '99')
  })
})

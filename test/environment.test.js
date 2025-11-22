import {describe, test} from 'node:test'
import assert from 'node:assert'
import {ParseError, EvaluationError} from '../lib/errors.js'
import {Environment} from '../lib/evaluator.js'

describe('Environment', () => {
  test('basic usage', () => {
    const env = new Environment()
    const result = env.evaluate('1 + 2')
    assert.strictEqual(result, 3n)
  })

  test('variable registration and type checking', () => {
    const env = new Environment()
      .registerVariable('name', 'string')
      .registerVariable('age', 'int')
      .registerVariable('isActive', 'bool')

    // Test with correct types
    const result1 = env.evaluate('name + " is " + string(age)', {
      name: 'John',
      age: 30n
    })
    assert.strictEqual(result1, 'John is 30')

    // Test with incorrect type should throw
    assert.throws(() => {
      env.evaluate('name', {name: 123}) // number instead of string
    }, EvaluationError)
  })

  test('context variables without explicit type get dyn', () => {
    const env = new Environment({unlistedVariablesAreDyn: true}).registerVariable(
      'explicitVar',
      'string'
    )

    const result = env.evaluate('explicitVar + string(implicitVar)', {
      explicitVar: 'Hello ',
      implicitVar: 42
    })
    assert.strictEqual(result, 'Hello 42')
  })

  test('custom function registration', () => {
    const env = new Environment()
      .registerFunction('multiplyBy2(int): int', (x) => x * 2n)
      .registerFunction('greet(string): string', (name) => `Hello, ${name}!`)

    const result1 = env.evaluate('multiplyBy2(21)')
    assert.strictEqual(result1, 42n)
  })

  test('chaining methods', () => {
    const env = new Environment()
      .registerVariable('x', 'int')
      .registerVariable('y', 'int')
      .registerFunction('add(double, double): double', (a, b) => a + b)

    assert.ok(env instanceof Environment)
    assert.ok(env.hasVariable('x'))
    assert.ok(env.hasVariable('y'))
    assert.ok(env.evaluate('add(1.5, 2.5)') === 4)
  })

  test('evaluate with string expression', () => {
    const env = new Environment().registerVariable('name', 'string')

    const result = env.evaluate('name + " World"', {name: 'Hello'})
    assert.strictEqual(result, 'Hello World')
  })

  test('complex expression with multiple features', () => {
    class User {
      #age
      constructor({name, age}) {
        this.name = name
        this.#age = age
      }

      get age() {
        return this.#age
      }
    }

    const env = new Environment()
      .registerType('User', {ctor: User, fields: {name: 'string', age: 'double'}})
      .registerVariable('users', 'list<User>')
      .registerVariable('minAge', 'int')
      .registerFunction('isAdult(User): bool', (u) => u.age >= 18)

    const context = {
      users: [
        new User({name: 'Alice', age: 25}),
        new User({name: 'Bob', age: 16}),
        new User({name: 'Charlie', age: 30})
      ],
      minAge: 18n
    }

    assert.deepStrictEqual(
      env.evaluate('users.filter(u, u.age >= minAge).map(u, u.name)', context),
      ['Alice', 'Charlie']
    )

    assert.deepStrictEqual(env.evaluate('users.filter(u, isAdult(u)).map(u, u.name)', context), [
      'Alice',
      'Charlie'
    ])
  })

  test('error handling with context', () => {
    const env = new Environment().registerVariable('x', 'int')

    assert.throws(() => env.evaluate('y + 1', {x: 5n}), /Unknown variable: y/)
    assert.throws(() => env.evaluate('x + 1', {x: 'not a number'}), EvaluationError)
  })

  test('function overloads', () => {
    const env = new Environment()
      .registerFunction('convert(double): string', (v) => String(v))
      .registerFunction('convert(int): string', (v) => String(v))
      .registerFunction('int.convert(): string', (v) => v.toString())
      .registerFunction('double.convert(): string', (v) => v.toString())
      .registerFunction('convert(string): string', (v) => v)
      .registerFunction('string.convert(): string', (v) => v)

    assert.strictEqual(env.evaluate('convert("foo")'), 'foo')
    assert.strictEqual(env.evaluate('convert(42)'), '42')
    assert.strictEqual(env.evaluate('convert(1.1)'), '1.1')
    assert.strictEqual(env.evaluate('convert(1)'), '1')
    assert.throws(() => env.evaluate('convert("foo", ")'), ParseError)
    assert.throws(() => env.evaluate('convert("foo", "bar")'), /found no matching overload/)
  })

  test('inheritance from global functions', () => {
    const env = new Environment()

    // Built-in functions should still work
    const result1 = env.evaluate('size("hello")')
    assert.strictEqual(result1, 5n)

    const result2 = env.evaluate('"world".size()')
    assert.strictEqual(result2, 5n)

    const result3 = env.evaluate('string(42)')
    assert.strictEqual(result3, '42')
  })

  test('mixed built-in and custom functions', () => {
    const env = new Environment()
      .registerFunction('multiplyBy2(int): int', (x) => x * 2n)
      .registerVariable('text', 'string')

    const result = env.evaluate('multiplyBy2(size(text))', {text: 'hello'})
    assert.strictEqual(result, 10n) // size('hello') = 5n, double(5n) = 10n
  })

  test('variable type validation', () => {
    const env = new Environment()
      .registerVariable('count', 'int')
      .registerVariable('name', 'string')

    // Valid types should work
    const result1 = env.evaluate('count + 1', {count: 42n})
    assert.strictEqual(result1, 43n)

    const result2 = env.evaluate('name + "!"', {name: 'test'})
    assert.strictEqual(result2, 'test!')

    // Invalid types should throw
    assert.throws(() => {
      env.evaluate('count + 1', {count: 'not an int'})
    }, EvaluationError)

    assert.throws(() => {
      env.evaluate('name + "!"', {name: 123})
    }, EvaluationError)
  })

  test('empty context', () => {
    const env = new Environment()

    const result = env.evaluate('1 + 2 * 3')
    assert.strictEqual(result, 7n)
  })

  test('no context parameter', () => {
    const env = new Environment()

    const result = env.evaluate('true && false')
    assert.strictEqual(result, false)
  })

  test('custom operator registration with Vector types', () => {
    class Vec2 {
      constructor(x, y) {
        this.x = x
        this.y = y
      }
    }

    const env = new Environment()
      .registerType('Vec2', Vec2)
      .registerVariable('a', 'Vec2')
      .registerVariable('b', 'Vec2')
      .registerOperator('Vec2 * Vec2', (a, b) => a.x * b.x + a.y * b.y) // Dot product

    const result = env.evaluate('a * b', {a: new Vec2(3, 4), b: new Vec2(2, 1)})
    assert.strictEqual(result, 10) // 3*2 + 4*1 = 10
  })

  test('parse() method for AST reuse', () => {
    const env = new Environment().registerVariable('x', 'int')

    const parsed = env.parse('x + 1')
    assert.strictEqual(typeof parsed, 'function')
    assert.ok(parsed.ast)

    const result1 = parsed({x: 5n})
    assert.strictEqual(result1, 6n)

    const result2 = parsed({x: 10n})
    assert.strictEqual(result2, 11n)
  })

  test('parse() returns function with check method', () => {
    const env = new Environment().registerVariable('x', 'int').registerVariable('y', 'int')

    const parsed = env.parse('x + y')

    // Check method should be available
    assert.strictEqual(typeof parsed.check, 'function')

    // Check should return type information
    const checkResult = parsed.check()
    assert.strictEqual(checkResult.valid, true)
    assert.strictEqual(checkResult.type, 'int')

    // Should still be able to evaluate
    const evalResult = parsed({x: 5n, y: 3n})
    assert.strictEqual(evalResult, 8n)
  })

  test('parse() check detects type errors', () => {
    const env = new Environment().registerVariable('x', 'int').registerVariable('y', 'string')

    const parsed = env.parse('x + y')

    // Type error should be caught by check
    const checkResult = parsed.check()
    assert.strictEqual(checkResult.valid, false)
    assert.ok(checkResult.error)
    assert.ok(checkResult.error.message.includes('no such overload'))
  })

  test('duplicate variable registration throws', () => {
    const env = new Environment().registerVariable('x', 'int')

    assert.throws(
      () => {
        env.registerVariable('x', 'string')
      },
      {
        message: /Variable already registered: x/
      }
    )
  })

  test('unlistedVariablesAreDyn with missing variable', () => {
    const env = new Environment({unlistedVariablesAreDyn: true})

    // Should work with unlisted variable (dyn type)
    const result = env.evaluate('unknownVar + 10', {unknownVar: 5n})
    assert.strictEqual(result, 15n)
  })

  test('unlistedVariablesAreDyn with registered variable', () => {
    const env = new Environment({unlistedVariablesAreDyn: true}).registerVariable('x', 'string')

    // Registered variable should still be type-checked
    assert.throws(() => {
      env.evaluate('x', {x: 123})
    }, EvaluationError)

    // Unlisted variable should work as dyn
    const result = env.evaluate('y + 10', {y: 5n})
    assert.strictEqual(result, 15n)
  })

  test('operator overloading with mixed types', () => {
    const env = new Environment()
      .registerVariable('str', 'string')
      .registerVariable('num', 'int')
      .registerOperator('string * int', (str, num) => str.repeat(Number(num)))

    const result = env.evaluate('str * num', {str: 'ab', num: 3n})
    assert.strictEqual(result, 'ababab')
  })
})

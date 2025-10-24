import {describe, test} from 'node:test'
import assert from 'node:assert/strict'
import {Environment} from '../lib/index.js'

describe('Dynamic Function Resolution', () => {
  describe('single argument dyn', () => {
    test('dyn accepts all types', () => {
      const env = new Environment()
      env.registerFunction('process(dyn): string', (x) => `dyn: ${x}`)

      assert.strictEqual(env.evaluate('process(42)'), 'dyn: 42')
      assert.strictEqual(env.evaluate('process("hello")'), 'dyn: hello')
      assert.strictEqual(env.evaluate('process(true)'), 'dyn: true')
      assert.strictEqual(env.evaluate('process([1, 2])'), 'dyn: 1,2')
      assert.strictEqual(env.evaluate('process({"x": 1})'), 'dyn: [object Object]')
    })

    test('specific type only matches exact type', () => {
      const env = new Environment()
      env.registerFunction('process(string): string', (x) => `string: ${x}`)

      assert.strictEqual(env.evaluate('process("hello")'), 'string: hello')
      assert.throws(() => env.evaluate('process(42)'), /no matching overload for 'process\(int\)/)
      assert.throws(() => env.evaluate('process(true)'), /no matching overload for 'process\(bool\)/)
    })
  })

  describe('two argument dyn', () => {
    test('dyn,dyn accepts all type combinations', () => {
      const env = new Environment()
      env.registerFunction('pair(dyn, dyn): string', (a, b) => `${a},${b}`)

      assert.strictEqual(env.evaluate('pair(1, 2)'), '1,2')
      assert.strictEqual(env.evaluate('pair("a", "b")'), 'a,b')
      assert.strictEqual(env.evaluate('pair(1, "x")'), '1,x')
      assert.strictEqual(env.evaluate('pair("x", 1)'), 'x,1')
      assert.strictEqual(env.evaluate('pair(true, false)'), 'true,false')
    })

    test('specific,dyn constrains first argument', () => {
      const env = new Environment()
      env.registerFunction('pair(string, dyn): string', (a, b) => `string-dyn: ${a},${b}`)

      assert.strictEqual(env.evaluate('pair("hello", 42)'), 'string-dyn: hello,42')
      assert.strictEqual(env.evaluate('pair("hello", "world")'), 'string-dyn: hello,world')
      assert.strictEqual(env.evaluate('pair("hello", true)'), 'string-dyn: hello,true')

      assert.throws(() => env.evaluate('pair(42, "hello")'), /no matching overload/)
      assert.throws(() => env.evaluate('pair(true, "hello")'), /no matching overload/)
    })

    test('dyn,specific constrains second argument', () => {
      const env = new Environment()
      env.registerFunction('pair(dyn, string): string', (a, b) => `dyn-string: ${a},${b}`)

      assert.strictEqual(env.evaluate('pair(42, "hello")'), 'dyn-string: 42,hello')
      assert.strictEqual(env.evaluate('pair("world", "hello")'), 'dyn-string: world,hello')
      assert.strictEqual(env.evaluate('pair(true, "hello")'), 'dyn-string: true,hello')

      assert.throws(() => env.evaluate('pair("hello", 42)'), /no matching overload/)
      assert.throws(() => env.evaluate('pair("hello", true)'), /no matching overload/)
    })

    test('specific,specific constrains both arguments', () => {
      const env = new Environment()
      env.registerFunction('pair(string, int): string', (a, b) => `string-int: ${a},${b}`)

      assert.strictEqual(env.evaluate('pair("hello", 42)'), 'string-int: hello,42')

      assert.throws(() => env.evaluate('pair("hello", "world")'), /no matching overload/)
      assert.throws(() => env.evaluate('pair(42, 42)'), /no matching overload/)
      assert.throws(() => env.evaluate('pair(42, "hello")'), /no matching overload/)
    })
  })

  describe('three+ argument dyn', () => {
    test('dyn,dyn,dyn accepts all type combinations', () => {
      const env = new Environment()
      env.registerFunction('triple(dyn, dyn, dyn): string', (a, b, c) => `${a},${b},${c}`)

      assert.strictEqual(env.evaluate('triple(1, 2, 3)'), '1,2,3')
      assert.strictEqual(env.evaluate('triple("a", "b", "c")'), 'a,b,c')
      assert.strictEqual(env.evaluate('triple(1, "x", true)'), '1,x,true')
      assert.strictEqual(env.evaluate('triple("x", 1, "y")'), 'x,1,y')
    })

    test('mixed specific and dyn types', () => {
      const env = new Environment()
      env.registerFunction('triple(string, dyn, int): string', (a, b, c) => `${a},${b},${c}`)

      assert.strictEqual(env.evaluate('triple("hello", "world", 42)'), 'hello,world,42')
      assert.strictEqual(env.evaluate('triple("hello", 42, 10)'), 'hello,42,10')
      assert.strictEqual(env.evaluate('triple("hello", true, 10)'), 'hello,true,10')

      assert.throws(() => env.evaluate('triple(42, "world", 10)'), /no matching overload/)
      assert.throws(() => env.evaluate('triple("hello", "world", "bad")'), /no matching overload/)
    })

    test('four arguments (stress test)', () => {
      const env = new Environment()
      env.registerFunction('quad(dyn, dyn, dyn, dyn): string', (a, b, c, d) => `${a},${b},${c},${d}`)

      assert.strictEqual(env.evaluate('quad(1, 2, 3, 4)'), '1,2,3,4')
      assert.strictEqual(env.evaluate('quad("a", 1, true, "b")'), 'a,1,true,b')
    })
  })

  describe('receiver methods', () => {
    test('receiver.method(dyn) works', () => {
      const env = new Environment()
      env.registerFunction('string.process(dyn): string', (receiver, arg) => `${receiver}:${arg}`)

      assert.strictEqual(env.evaluate('"hello".process(42)'), 'hello:42')
      assert.strictEqual(env.evaluate('"hello".process("world")'), 'hello:world')
      assert.strictEqual(env.evaluate('"hello".process(true)'), 'hello:true')
    })

    test('receiver.method(specific) constrains argument', () => {
      const env = new Environment()
      env.registerFunction('string.append(string): string', (receiver, arg) => `${receiver}${arg}`)

      assert.strictEqual(env.evaluate('"hello".append("world")'), 'helloworld')
      assert.throws(() => env.evaluate('"hello".append(42)'), /no matching overload/)
    })

    test('receiver.method(dyn, dyn) accepts multiple args', () => {
      const env = new Environment()
      env.registerFunction('string.join(dyn, dyn): string', (receiver, a, b) => {
        return `${a}${receiver}${b}`
      })

      assert.strictEqual(env.evaluate('"--".join("a", "b")'), 'a--b')
      assert.strictEqual(env.evaluate('"--".join(1, 2)'), '1--2')
    })
  })

  describe('zero arguments', () => {
    test('zero argument functions work', () => {
      const env = new Environment()
      env.registerFunction('getValue(): int', () => 42n)

      assert.strictEqual(env.evaluate('getValue()'), 42n)
    })

    test('zero argument receiver methods work', () => {
      const env = new Environment()
      env.registerFunction('string.length(): int', (receiver) => BigInt(receiver.length))

      assert.strictEqual(env.evaluate('"hello".length()'), 5n)
    })
  })

  describe('error handling', () => {
    test('no matching overload for specific type', () => {
      const env = new Environment()
      env.registerFunction('process(string): string', (x) => x)

      assert.throws(
        () => env.evaluate('process(42)'),
        /found no matching overload for 'process\(int\)'/
      )
    })

    test('no matching overload for wrong arg count', () => {
      const env = new Environment()
      env.registerFunction('pair(dyn, dyn): string', (a, b) => `${a},${b}`)

      assert.throws(() => env.evaluate('pair(1)'), /no matching overload/)
      assert.throws(() => env.evaluate('pair(1, 2, 3)'), /no matching overload/)
    })

    test('no matching overload for receiver type', () => {
      const env = new Environment()
      env.registerFunction('string.process(dyn): string', (receiver, arg) => `${receiver}:${arg}`)

      assert.throws(() => env.evaluate('42.process("hello")'), /no matching overload for 'int.process/)
    })
  })

  describe('with variables', () => {
    test('dyn works with typed variables', () => {
      const env = new Environment()
      env.registerVariable('x', 'int')
      env.registerVariable('y', 'string')
      env.registerFunction('pair(dyn, dyn): string', (a, b) => `${a},${b}`)

      assert.strictEqual(env.evaluate('pair(x, y)', {x: 42n, y: 'hello'}), '42,hello')
    })

    test('specific type matches variable type', () => {
      const env = new Environment()
      env.registerVariable('x', 'string')
      env.registerFunction('process(string): string', (x) => `processed: ${x}`)

      assert.strictEqual(env.evaluate('process(x)', {x: 'hello'}), 'processed: hello')
    })
  })

  describe('complex types', () => {
    test('list and map types with dyn', () => {
      const env = new Environment()
      env.registerFunction('process(dyn): string', (x) => {
        if (Array.isArray(x)) return 'got-list'
        if (typeof x === 'object') return 'got-map'
        return 'got-other'
      })

      assert.strictEqual(env.evaluate('process([1, 2, 3])'), 'got-list')
      assert.strictEqual(env.evaluate('process({"key": "value"})'), 'got-map')
      assert.strictEqual(env.evaluate('process(42)'), 'got-other')
    })

    test('specific list type', () => {
      const env = new Environment()
      env.registerFunction('processList(list): int', (x) => BigInt(x.length))

      assert.strictEqual(env.evaluate('processList([1, 2, 3])'), 3n)
      assert.throws(() => env.evaluate('processList(42)'), /no matching overload/)
    })

    test('specific map type', () => {
      const env = new Environment()
      env.registerFunction('processMap(map): int', (x) => BigInt(Object.keys(x).length))

      assert.strictEqual(env.evaluate('processMap({"a": 1, "b": 2})'), 2n)
      assert.throws(() => env.evaluate('processMap(42)'), /no matching overload/)
    })
  })
})

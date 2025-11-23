import {describe, test} from 'node:test'
import assert from 'node:assert'
import {Environment} from '../lib/index.js'

describe('Overlapping function overloads', () => {
  describe('single argument overlaps', () => {
    test('rejects identical signatures', () => {
      const env = new Environment()
      env.registerFunction('foo(int): int', (x) => x)

      assert.throws(
        () => env.registerFunction('foo(int): int', (x) => x * 2),
        /Function signature 'foo\(int\): int' overlaps with existing overload 'foo\(int\): int'/
      )
    })

    test('rejects dyn after specific type', () => {
      const env = new Environment()
      env.registerFunction('process(string): string', (x) => x)

      assert.throws(
        () => env.registerFunction('process(dyn): string', (x) => String(x)),
        /overlaps with existing overload/
      )
    })

    test('rejects specific type after dyn', () => {
      const env = new Environment()
      env.registerFunction('process(dyn): string', (x) => String(x))

      assert.throws(
        () => env.registerFunction('process(string): string', (x) => x),
        /overlaps with existing overload/
      )
    })

    test('rejects dyn after int', () => {
      const env = new Environment()
      env.registerFunction('process(int): string', (x) => String(x))

      assert.throws(
        () => env.registerFunction('process(dyn): string', (x) => String(x)),
        /overlaps with existing overload/
      )
    })

    test('allows different concrete types', () => {
      const env = new Environment()
      env.registerFunction('process(string): int', (x) => x.length)
      env.registerFunction('process(int): int', (x) => x)
      env.registerFunction('process(bool): int', (x) => (x ? 1 : 0))
    })
  })

  describe('multi-argument overlaps', () => {
    test('rejects (dyn, dyn) after (string, int)', () => {
      const env = new Environment()
      env.registerFunction('pair(string, int): string', (a, b) => `${a}:${b}`)

      assert.throws(
        () => env.registerFunction('pair(dyn, dyn): string', (a, b) => `${a}-${b}`),
        /overlaps with existing overload/
      )
    })

    test('rejects (string, dyn) after (string, int)', () => {
      const env = new Environment()
      env.registerFunction('pair(string, int): string', (a, b) => `${a}:${b}`)

      assert.throws(
        () => env.registerFunction('pair(string, dyn): string', (a, b) => `${a}-${b}`),
        /overlaps with existing overload/
      )
    })

    test('rejects (dyn, int) after (string, int)', () => {
      const env = new Environment()
      env.registerFunction('pair(string, int): string', (a, b) => `${a}:${b}`)

      assert.throws(
        () => env.registerFunction('pair(dyn, int): string', (a, b) => `${a}-${b}`),
        /overlaps with existing overload/
      )
    })

    test('allows non-overlapping: (string, int) vs (int, string)', () => {
      const env = new Environment()
      env.registerFunction('pair(string, int): string', (a, b) => `${a}:${b}`)
      env.registerFunction('pair(int, string): string', (a, b) => `${a}:${b}`)
    })

    test('rejects three-arg: (dyn, dyn, dyn) after (string, int, bool)', () => {
      const env = new Environment()
      env.registerFunction('triple(string, int, bool): string', (a, b, c) => `${a}-${b}-${c}`)

      assert.throws(
        () => env.registerFunction('triple(dyn, dyn, dyn): string', (a, b, c) => `${a},${b},${c}`),
        /overlaps with existing overload/
      )
    })
  })

  describe('different arities', () => {
    test('allows same name with different arg counts', () => {
      const env = new Environment()
      env.registerFunction('process(dyn): string', (x) => String(x))
      env.registerFunction('process(dyn, dyn): string', (x, y) => `${x},${y}`)
      env.registerFunction('process(dyn, dyn, dyn): string', (x, y, z) => `${x},${y},${z}`)
    })
  })

  describe('ast type (macros)', () => {
    test('ast overlaps with any specific type', () => {
      const env = new Environment()
      env.registerFunction('macro(ast): dyn', ({args}) => {
        // This whole object that's returned will be available as
        // macro object in the typeCheck/evaluate functions
        return {
          firstArgument: args[0],
          // typeCheck and evaluate are required
          typeCheck(checker, macro, ctx) {
            return checker.check(macro.firstArgument, ctx)
          },
          evaluate(evaluator, macro, ctx) {
            return evaluator.eval(macro.firstArgument, ctx)
          }
        }
      })

      assert.throws(
        () => env.registerFunction('macro(dyn): dyn', (x) => x),
        /overlaps with existing overload/
      )
      assert.throws(
        () => env.registerFunction('macro(int): int', (x) => x),
        /overlaps with existing overload/
      )
      assert.throws(
        () => env.registerFunction('macro(string): string', (x) => x),
        /overlaps with existing overload/
      )
    })

    test('ast overlaps in multi-arg positions', () => {
      const env = new Environment()
      env.registerFunction('macro(ast, int): int', () => ({
        evaluate() {
          return 1
        },
        typeCheck(checker) {
          return checker.getType('int')
        }
      }))

      assert.throws(
        () => env.registerFunction('macro(int, string): int', (x, _y) => x),
        /overlaps with existing overload/
      )
      assert.throws(
        () => env.registerFunction('macro(string, int): int', (x, _y) => x),
        /overlaps with existing overload/
      )
    })

    test('multiple ast arguments allowed', () => {
      const env = new Environment()
      env.registerFunction('macro(ast): dyn', (ast) => this.eval(ast))
      env.registerFunction('macro(ast, ast): dyn', (a, b) => this.eval(a) + this.eval(b))
    })
  })

  describe('receiver methods', () => {
    test('rejects dyn overlap on receiver methods', () => {
      const env = new Environment()
      env.registerFunction('string.process(int): string', (receiver, n) => receiver + String(n))

      assert.throws(
        () =>
          env.registerFunction(
            'string.process(dyn): string',
            (receiver, x) => receiver + String(x)
          ),
        /overlaps with existing overload/
      )
    })

    test('allows different receivers with same method name', () => {
      const env = new Environment()
      env.registerFunction('string.len(): int', (receiver) => BigInt(receiver.length))
      env.registerFunction('list.len(): int', (receiver) => BigInt(receiver.length))
    })
  })

  describe('generic types (list, map)', () => {
    test('list<dyn> normalizes to list (no overlap with list<string>)', () => {
      const env = new Environment()
      env.registerFunction('process(list<string>): int', (x) => x.length)
      env.registerFunction('process(list<dyn>): int', (x) => x.length)
    })

    test('allows different list element types', () => {
      const env = new Environment()
      env.registerFunction('stringify(list<string>): string', (lst) => lst.join(','))
      env.registerFunction('stringify(list<int>): string', (lst) => lst.map(String).join(','))
    })

    test('map<dyn, V> normalizes to map', () => {
      const env = new Environment()
      env.registerFunction('count(map<string, int>): int', (m) => Object.keys(m).length)
      env.registerFunction('count(map<dyn, int>): int', (m) => Object.keys(m).length)
    })

    test('map<K, dyn> normalizes to map', () => {
      const env = new Environment()
      env.registerFunction('count(map<string, string>): int', (m) => Object.keys(m).length)
      env.registerFunction('count(map<string, dyn>): int', (m) => Object.keys(m).length)
    })

    test('complex nested generics allowed', () => {
      const env = new Environment()
      env.registerFunction('count(map<string, list<int>>): int', (m) => {
        return Object.values(m).reduce((sum, lst) => sum + lst.length, 0)
      })

      env.registerFunction('count(map<string, list<dyn>>): int', (m) => {
        return Object.values(m).reduce((sum, lst) => sum + lst.length, 0)
      })
    })
  })

  describe('error messages', () => {
    test('error includes both signatures', () => {
      const env = new Environment()
      env.registerFunction('test(string): int', (x) => x.length)

      assert.throws(
        () => env.registerFunction('test(dyn): int', (x) => String(x).length),
        /Function signature 'test\(dyn\): int' overlaps with existing overload 'test\(string\): int'/
      )
    })

    test('error shows receiver in signature', () => {
      const env = new Environment()
      env.registerFunction('string.test(int): int', (_receiver, x) => x)

      assert.throws(
        () => env.registerFunction('string.test(dyn): int', (_receiver, x) => x),
        /string\.test\(dyn\): int/
      )
    })
  })
})

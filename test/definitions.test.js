import {describe, test} from 'node:test'
import assert from 'node:assert'
import {Environment} from '../lib/evaluator.js'
import {celTypes} from '../lib/registry.js'
const {strictEqual, deepStrictEqual} = assert

const noop = () => {}

function testVariable(expected, ...args) {
  const def = new Environment()
    .registerVariable(...args)
    .getDefinitions()
    .variables.find((v) => v.name === 'testVariable')

  deepStrictEqual(def, {...expected, name: 'testVariable'})
}

function testFunction(expected, ...args) {
  const def = new Environment()
    .registerFunction(...args)
    .getDefinitions()
    .functions.find((f) => f.name === expected.name)

  deepStrictEqual(def, expected)
}

describe('getDefinitions', () => {
  test('returns registered functions and variables with types', () => {
    const defs = new Environment().getDefinitions()
    assert.ok(Array.isArray(defs.variables))
    assert.ok(Array.isArray(defs.functions))

    const fn = defs.functions.find((f) => f.signature === 'double(double): double')
    const variable = defs.variables.find((v) => v.name === 'string')
    deepStrictEqual(variable, {name: 'string', description: null, type: 'type'})
    deepStrictEqual(fn, {
      description: null,
      name: 'double',
      params: [{name: 'arg0', type: 'double', description: null}],
      receiverType: null,
      returnType: 'double',
      signature: 'double(double): double'
    })
  })

  describe('variables', () => {
    test('registerVariable(name, type)', () => {
      testVariable({type: 'string', description: null}, 'testVariable', 'string')
    })

    test('registerVariable(name, TypeDeclaration)', () => {
      testVariable({type: 'string', description: null}, 'testVariable', celTypes.string)
    })

    test('registerVariable(name, type, {description})', () => {
      testVariable(
        {type: 'string', description: 'The user name'},
        'testVariable',
        'string',
        {description: 'The user name'}
      )
    })

    test('registerVariable(name, {type})', () => {
      testVariable({type: 'string', description: null}, 'testVariable', {type: 'string'})
    })

    test('registerVariable(name, {type, description})', () => {
      testVariable({type: 'string', description: 'The user name'}, 'testVariable', {
        type: 'string',
        description: 'The user name'
      })
    })

    test('registerVariable({name, type})', () => {
      testVariable({type: 'string', description: null}, {name: 'testVariable', type: 'string'})
    })

    test('registerVariable({name, type, description})', () => {
      testVariable(
        {type: 'string', description: 'The user name'},
        {name: 'testVariable', type: 'string', description: 'The user name'}
      )
    })

    test('throws on missing name', () => {
      assert.throws(
        () => new Environment().registerVariable({type: 'string'}),
        /name must be a string/
      )
    })

    test('throws on empty name', () => {
      assert.throws(() => new Environment().registerVariable('', 'string'), /name must be a string/)
    })

    test('throws on missing type', () => {
      assert.throws(() => new Environment().registerVariable('x', {}), /type is required/)
    })

    test('throws on reserved name', () => {
      assert.throws(() => new Environment().registerVariable('as', 'string'), /reserved name/)
    })

    test('throws on duplicate variable', () => {
      const env = new Environment().registerVariable('x', 'string')
      assert.throws(() => env.registerVariable('x', 'string'), /already registered/)
    })

    test('throws on unknown type', () => {
      assert.throws(() => new Environment().registerVariable('x', 'foo'), /Unknown type/)
    })
  })

  describe('constants', () => {
    test('registerConstant(name, type, value)', () => {
      const env = new Environment().registerConstant('minAge', 'int', 18n)
      strictEqual(env.evaluate('minAge'), 18n)
      const def = env.getDefinitions().variables.find((v) => v.name === 'minAge')
      deepStrictEqual(def, {name: 'minAge', type: 'int', description: null})
    })

    test('registerConstant({name, type, value})', () => {
      const env = new Environment().registerConstant({name: 'minAge', type: 'int', value: 18n})
      strictEqual(env.evaluate('minAge'), 18n)
      const def = env.getDefinitions().variables.find((v) => v.name === 'minAge')
      deepStrictEqual(def, {name: 'minAge', type: 'int', description: null})
    })

    test('registerConstant({name, type, value, description})', () => {
      const env = new Environment().registerConstant({
        name: 'minAge',
        type: 'int',
        value: 18n,
        description: 'Minimum age'
      })
      strictEqual(env.evaluate('minAge'), 18n)
      const def = env.getDefinitions().variables.find((v) => v.name === 'minAge')
      deepStrictEqual(def, {name: 'minAge', type: 'int', description: 'Minimum age'})
    })
  })

  describe('functions', () => {
    test('registerFunction(signature, handler)', () => {
      testFunction(
        {
          name: 'greet',
          signature: 'greet(string): string',
          description: null,
          receiverType: null,
          returnType: 'string',
          params: [{name: 'arg0', type: 'string', description: null}]
        },
        'greet(string): string',
        noop
      )
    })

    test('registerFunction(signature, handler, {description})', () => {
      testFunction(
        {
          name: 'greet',
          signature: 'greet(string): string',
          description: 'Greets someone',
          receiverType: null,
          returnType: 'string',
          params: [{name: 'arg0', type: 'string', description: null}]
        },
        'greet(string): string',
        noop,
        {description: 'Greets someone'}
      )
    })

    test('registerFunction(signature, {handler, description})', () => {
      testFunction(
        {
          name: 'add',
          signature: 'add(int, int): int',
          description: 'Adds two integers',
          receiverType: null,
          returnType: 'int',
          params: [
            {name: 'arg0', type: 'int', description: null},
            {name: 'arg1', type: 'int', description: null}
          ]
        },
        'add(int, int): int',
        {handler: noop, description: 'Adds two integers'}
      )
    })

    test('registerFunction({signature, handler, description})', () => {
      testFunction(
        {
          name: 'add',
          signature: 'add(int, int): int',
          description: 'Adds two integers',
          receiverType: null,
          returnType: 'int',
          params: [
            {name: 'arg0', type: 'int', description: null},
            {name: 'arg1', type: 'int', description: null}
          ]
        },
        {signature: 'add(int, int): int', handler: noop, description: 'Adds two integers'}
      )
    })

    test('registerFunction({signature, handler, description, params})', () => {
      testFunction(
        {
          name: 'formatDate',
          signature: 'formatDate(int, string): string',
          description: 'Formats a timestamp',
          receiverType: null,
          returnType: 'string',
          params: [
            {name: 'timestamp', type: 'int', description: 'Unix timestamp'},
            {name: 'format', type: 'string', description: 'Format string'}
          ]
        },
        {
          signature: 'formatDate(int, string): string',
          handler: noop,
          description: 'Formats a timestamp',
          params: [
            {name: 'timestamp', description: 'Unix timestamp'},
            {name: 'format', description: 'Format string'}
          ]
        }
      )
    })

    test('registerFunction({name, returnType, handler, description, params})', () => {
      testFunction(
        {
          name: 'multiply',
          signature: 'multiply(int, int): int',
          description: 'Multiplies two integers',
          receiverType: null,
          returnType: 'int',
          params: [
            {name: 'a', type: 'int', description: 'First number'},
            {name: 'b', type: 'int', description: 'Second number'}
          ]
        },
        {
          name: 'multiply',
          returnType: 'int',
          handler: noop,
          description: 'Multiplies two integers',
          params: [
            {name: 'a', type: 'int', description: 'First number'},
            {name: 'b', type: 'int', description: 'Second number'}
          ]
        }
      )
    })

    test('registerFunction({name, receiverType, returnType, handler, description, params})', () => {
      testFunction(
        {
          name: 'shout',
          signature: 'string.shout(): string',
          description: 'Converts to uppercase',
          receiverType: 'string',
          returnType: 'string',
          params: []
        },
        {
          name: 'shout',
          receiverType: 'string',
          returnType: 'string',
          handler: noop,
          description: 'Converts to uppercase',
          params: []
        }
      )
    })

    test('function defined with object works correctly', () => {
      const env = new Environment().registerFunction({
        name: 'doubleIt',
        params: [{name: 'n', type: 'int'}],
        returnType: 'int',
        handler: (n) => n * 2n
      })

      strictEqual(env.evaluate('doubleIt(21)'), 42n)
    })

    test('throws on missing name', () => {
      assert.throws(
        () => new Environment().registerFunction({params: [], returnType: 'int', handler: noop}),
        /signature or name are required/
      )
    })

    test('throws on missing returnType', () => {
      assert.throws(
        () => new Environment().registerFunction({name: 'test', params: [], handler: noop}),
        /must have a returnType/
      )
    })

    test('throws on missing handler', () => {
      assert.throws(
        () => new Environment().registerFunction({name: 'test', params: [], returnType: 'int'}),
        /handler must be a function/
      )
    })

    test('throws on missing params and signature', () => {
      assert.throws(
        () => new Environment().registerFunction({name: 'test', returnType: 'int', handler: noop}),
        /signature or params are required/
      )
    })

    test('throws on mismatched params length', () => {
      assert.throws(
        () =>
          new Environment().registerFunction({
            signature: 'test(int, int): int',
            handler: noop,
            params: [{name: 'a'}]
          }),
        /mismatched length/
      )
    })

    test('throws on unknown param type in signature', () => {
      assert.throws(
        () => new Environment().registerFunction('test(foo): int', noop),
        /Unknown type: foo/
      )
    })

    test('throws on unknown returnType in signature', () => {
      assert.throws(
        () => new Environment().registerFunction('test(int): foo', noop),
        /Unknown type: foo/
      )
    })

    test('throws on unknown receiverType in signature', () => {
      assert.throws(
        () => new Environment().registerFunction('foo.test(): int', noop),
        /Unknown type: foo/
      )
    })

    test('throws on unknown returnType in object', () => {
      assert.throws(
        () =>
          new Environment().registerFunction({
            name: 'test',
            params: [],
            returnType: 'foo',
            handler: noop
          }),
        /Unknown type: foo/
      )
    })

    test('throws on unknown receiverType in object', () => {
      assert.throws(
        () =>
          new Environment().registerFunction({
            name: 'test',
            receiverType: 'foo',
            params: [],
            returnType: 'int',
            handler: noop
          }),
        /Unknown type: foo/
      )
    })

    test('throws on unknown param type in object', () => {
      assert.throws(
        () =>
          new Environment().registerFunction({
            name: 'test',
            params: [{name: 'a', type: 'foo'}],
            returnType: 'int',
            handler: noop
          }),
        /Unknown type: foo/
      )
    })

    test('throws on overlapping signature', () => {
      const env = new Environment().registerFunction('test(int): int', noop)
      assert.throws(() => env.registerFunction('test(int): int', noop), /overlaps/)
    })
  })
})

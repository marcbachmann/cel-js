import {test, describe} from 'node:test'
import {evaluate} from '../lib/index.js'

describe('identifiers', () => {
  describe('dot notation', () => {
    test('should evaluate single identifier', (t) => {
      t.assert.strictEqual(evaluate('a', {a: 2}), 2)
    })

    test('should evaluate nested identifiers', (t) => {
      t.assert.strictEqual(evaluate('a.b.c', {a: {b: {c: 2}}}), 2)
    })
  })

  describe('index notation', () => {
    test('should evaluate single identifier', (t) => {
      t.assert.strictEqual(evaluate('a["b"]', {a: {b: 2}}), 2)
    })

    test('should evaluate nested identifiers', (t) => {
      t.assert.strictEqual(evaluate('a["b"]["c"]', {a: {b: {c: 2}}}), 2)
    })
  })

  test('should evaluate identifiers - mixed', (t) => {
    t.assert.strictEqual(evaluate('a.b["c"].d', {a: {b: {c: {d: 2}}}}), 2)
  })

  test('should evaluate identifiers - multiple usage of the same identifiers', (t) => {
    t.assert.strictEqual(evaluate('a.b["c"].d + a.b["c"].d', {a: {b: {c: {d: 2}}}}), 4)
  })

  test('should return object if identifier is object', (t) => {
    t.assert.deepStrictEqual(evaluate('a', {a: {b: 2}}), {b: 2})
  })

  test('should handle array access with identifiers', (t) => {
    t.assert.strictEqual(evaluate('items[0]', {items: ['first', 'second', 'third']}), 'first')
  })

  test('should handle dynamic property access', (t) => {
    t.assert.strictEqual(evaluate('obj[key]', {obj: {foo: 'bar'}, key: 'foo'}), 'bar')
  })

  test('throws if identifier is not in context', (t) => {
    t.assert.throws(() => evaluate('a'), /Unknown variable: a/)
  })

  test('throws if subproperty not in context', (t) => {
    t.assert.throws(() => evaluate('a.b', {a: {}}), /No such key: b/)
  })

  test('throws if not own property is accessed', (t) => {
    t.assert.throws(() => evaluate('a.constructor.name', {a: {}}), /No such key: constructor/)
    t.assert.throws(() => evaluate('a.length', {a: {}}), /No such key: length/)
  })

  test('restricts access to reserved identifiers', (t) => {
    t.assert.throws(() => evaluate('package', {package: 'foo'}), /Reserved identifier: package/)
    t.assert.throws(() => evaluate('if', {if: 'foo'}), /Reserved identifier: if/)
    t.assert.throws(() => evaluate('var', {var: 'foo'}), /Reserved identifier: var/)
  })

  test('allows access to reserved identifiers within objects', (t) => {
    const obj = {obj: {package: 'a', if: 'b', var: 'c'}}
    t.assert.strictEqual(evaluate('obj["package"]', obj), 'a')
    t.assert.strictEqual(evaluate('obj.package', obj), 'a')
    t.assert.strictEqual(evaluate('obj["if"]', obj), 'b')
    t.assert.strictEqual(evaluate('obj.if', obj), 'b')
    t.assert.strictEqual(evaluate('obj["var"]', obj), 'c')
    t.assert.strictEqual(evaluate('obj.var', obj), 'c')
  })

  test('verifies that identifiers are of a given type', (t) => {
    class Unrecognized {}
    t.assert.throws(() => evaluate('a', {a: new Unrecognized()}), /Unsupported type/)
  })
})

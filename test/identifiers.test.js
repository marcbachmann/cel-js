import {test, describe} from 'node:test'
import {expectEval, expectEvalDeep, expectEvalThrows} from './helpers.js'

describe('identifiers', () => {
  describe('dot notation', () => {
    test('should evaluate single identifier', () => expectEval('a', 2, {a: 2}))
    test('should evaluate nested identifiers', () => expectEval('a.b.c', 2, {a: {b: {c: 2}}}))
  })

  describe('index notation', () => {
    test('should evaluate single identifier', () => expectEval('a["b"]', 2, {a: {b: 2}}))
    test('should evaluate nested identifiers', () => expectEval('a["b"]["c"]', 2, {a: {b: {c: 2}}}))
  })

  test('should evaluate identifiers - mixed', () => {
    expectEval('a.b["c"].d', 2, {a: {b: {c: {d: 2}}}})
  })

  test('should evaluate identifiers - multiple usage of the same identifiers', () => {
    expectEval('a.b["c"].d + a.b["c"].d', 4, {a: {b: {c: {d: 2}}}})
  })

  test('should return object if identifier is object', () => {
    expectEvalDeep('a', {b: 2}, {a: {b: 2}})
  })

  test('should handle array access with identifiers', () => {
    expectEval('items[0]', 'first', {items: ['first', 'second', 'third']})
  })

  test('should handle dynamic property access', () => {
    expectEval('obj[key]', 'bar', {obj: {foo: 'bar'}, key: 'foo'})
  })

  test('throws if identifier is not in context', () => {
    expectEvalThrows('a', /Unknown variable: a/)
  })

  test('throws if subproperty not in context', () => {
    expectEvalThrows('a.b', /No such key: b/, {a: {}})
  })

  test('throws if not own property is accessed', () => {
    expectEvalThrows('a.constructor.name', /No such key: constructor/, {a: {}})
    expectEvalThrows('a.length', /No such key: length/, {a: {}})
  })

  test('restricts access to reserved identifiers', () => {
    expectEvalThrows('package', /Reserved identifier: package/, {package: 'foo'})
    expectEvalThrows('if', /Reserved identifier: if/, {if: 'foo'})
    expectEvalThrows('var', /Reserved identifier: var/, {var: 'foo'})
  })

  test('allows access to reserved identifiers within objects', () => {
    const obj = {obj: {package: 'a', if: 'b', var: 'c'}}
    expectEval('obj["package"]', 'a', obj)
    expectEval('obj.package', 'a', obj)
    expectEval('obj["if"]', 'b', obj)
    expectEval('obj.if', 'b', obj)
    expectEval('obj["var"]', 'c', obj)
    expectEval('obj.var', 'c', obj)
  })

  test('verifies that identifiers are of a given type', () => {
    class Unrecognized {}
    expectEvalThrows('a', /Unsupported type/, {a: new Unrecognized()})
  })
})

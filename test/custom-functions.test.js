import {describe, test} from 'node:test'
import assert from 'node:assert'
import {Environment} from '../lib/evaluator.js'

const globalEnv = new Environment()
  .registerVariable('dynamic', 'dyn')
  .registerVariable('dynamicList', 'list<dyn>')
  .registerVariable('integer', 'int')
  .registerVariable('integerList', 'list<int>')
  .registerVariable('boolean', 'bool')
  .registerVariable('booleanList', 'list<bool>')
  .registerFunction('max(bool): string', (list) => 'bool')
  .registerFunction('max(int): string', (list) => 'int')
  .registerFunction('max(list<bool>): string', (list) => 'list-bool')
  .registerFunction('max(list<int>): string', (list) => 'list-int')
  .registerFunction('max(map<int,int>): string', (list) => 'map-int-int')
  .registerFunction('max(map<int,bool>): string', (list) => 'map-int-bool')
  .registerFunction('max(map<string,int>): string', (list) => 'map-string-int')
  .registerFunction('max(map<string,bool>): string', (list) => 'map-string-bool')

const evaluate = globalEnv.evaluate.bind(globalEnv)

describe('Custom functions', () => {
  test('resolves overloads correctly according to the type check', () => {
    assert.equal(evaluate('max([1])'), 'list-int')
    assert.equal(evaluate('max([integer])', {integer: 1n}), 'list-int')
    assert.equal(evaluate('max(integerList)', {integerList: [1n]}), 'list-int')
    assert.equal(evaluate('max([false])'), 'list-bool')
    assert.equal(evaluate('max([boolean])', {boolean: false}), 'list-bool')
    assert.equal(evaluate('max(booleanList)', {booleanList: [false]}), 'list-bool')
  })

  test('resolves overloads correctly according to the type check with dyn', () => {
    assert.equal(evaluate('max([dynamic])', {dynamic: 1n}), 'list-int')
    assert.equal(evaluate('max(dynamic)', {dynamic: [1n]}), 'list-int')
    assert.equal(evaluate('max([dyn(1)])'), 'list-int')
  })

  test('prefers concrete overloads when dyn collections carry specific types', () => {
    assert.equal(evaluate('max([dyn(1), dyn(1.0)])'), 'list-int')
    assert.throws(() => evaluate('max([dyn(1.1), dyn(1)])'), /no matching overload/i)

    assert.equal(evaluate('max(dynamic)', {dynamic: {value: 1n}}), 'map-string-int')
    assert.equal(evaluate('max(dynamic)', {dynamic: {value: false}}), 'map-string-bool')
    assert.equal(evaluate('max(dynamic)', {dynamic: new Map([[1n, 2n]])}), 'map-int-int')
    assert.equal(evaluate('max(dynamic)', {dynamic: new Map([[1n, true]])}), 'map-int-bool')
  })

  test('refines partially dynamic collection declarations', () => {
    assert.equal(evaluate('max(dynamicList)', {dynamicList: [1n]}), 'list-int')
    assert.equal(evaluate('max(dynamicList)', {dynamicList: [false]}), 'list-bool')
    assert.throws(() => evaluate('max(dynamicList)', {dynamicList: ['a']}), /no matching overload/i)
  })

  test('falls back to the first overload when runtime values lack samples', () => {
    assert.equal(evaluate('max([])'), 'list-bool')
    assert.equal(evaluate('max(dynamicList)', {dynamicList: []}), 'list-bool')

    assert.equal(evaluate('max({})'), 'map-int-int')
    assert.equal(evaluate('max(dynamic)', {dynamic: {}}), 'map-int-int')
    assert.equal(evaluate('max(dynamic)', {dynamic: new Map()}), 'map-int-int')
  })
})

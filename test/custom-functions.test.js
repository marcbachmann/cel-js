import {describe, test} from 'node:test'
import assert from 'node:assert'
import {Environment} from '../lib/evaluator.js'

describe('Custom functions', () => {
  test('resolves overloads correctly according to the type check', () => {
    const env = new Environment()
      .registerVariable('i', 'int')
      .registerVariable('il', 'list<int>')
      .registerVariable('b', 'bool')
      .registerVariable('bl', 'list<bool>')
      .registerFunction('max(list<bool>): bool', (list) => true)
      .registerFunction('max(list<int>): int', (list) => 42)

    assert.equal(env.evaluate('max([1])'), 42)
    assert.equal(env.evaluate('max([i])', {i: 1n}), 42)
    assert.equal(env.evaluate('max(il)', {il: [1n]}), 42)
    assert.equal(env.evaluate('max([false])'), true)
    assert.equal(env.evaluate('max([b])', {b: false}), true)
    assert.equal(env.evaluate('max(bl)', {bl: [false]}), true)
  })
})

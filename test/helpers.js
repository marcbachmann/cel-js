import assert from 'node:assert/strict'
import {evaluate, parse, Environment} from '../lib/index.js'

export class TestEnvironment extends Environment {
  #expectEval
  #expectEvalThrows
  #expectEvalDeep
  get expectEval() {
    return (this.#expectEval ??= (expr, expected, context, message) => {
      assert.strictEqual(this.evaluate(expr, context), expected, message)
    })
  }

  get expectEvalThrows() {
    return (this.#expectEvalThrows ??= (expr, matcher, context) => {
      let err
      assert.throws(() => {
        try {
          this.evaluate(expr, context)
        } catch (e) {
          err = e
          throw e
        }
      }, matcher)
      return err
    })
  }

  get expectEvalDeep() {
    return (this.#expectEvalDeep ??= (expr, expected, context, message) => {
      assert.deepStrictEqual(this.evaluate(expr, context), expected, message)
    })
  }
}

const defaultExpectations = new TestEnvironment({unlistedVariablesAreDyn: true})
const {expectEval, expectEvalDeep, expectEvalThrows} = defaultExpectations
export {expectEval, expectEvalDeep, expectEvalThrows}

export function expectParseAst(expression, expectedAst) {
  const result = parse(expression)
  assert.strictEqual(typeof result, 'function')
  assert.deepStrictEqual(toPlainAst(result.ast), expectedAst)
  return result
}

export function expectParseThrows(expression, matcher) {
  assert.throws(() => parse(expression), matcher)
}

export {assert, evaluate, parse}

function toPlainAst(node) {
  if (!Array.isArray(node)) return node
  const plain = new Array(node.length)
  for (let i = 0; i < node.length; i++) plain[i] = toPlainAst(node[i])
  return plain
}

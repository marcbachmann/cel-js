import assert from 'node:assert/strict'
import {Environment} from '../lib/index.js'

export class TestEnvironment extends Environment {
  #expectEval
  #expectEvalThrows
  #expectEvalDeep
  #expectParseThrows
  #parse
  #evaluate

  get parse() {
    return (this.#parse ??= super.parse.bind(this))
  }

  get evaluate() {
    return (this.#evaluate ??= super.evaluate.bind(this))
  }

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

  get expectParseThrows() {
    return (this.#expectParseThrows ??= (expr, matcher) => {
      let err
      assert.throws(() => {
        try {
          this.parse(expr)
        } catch (e) {
          err = e
          throw e
        }
      }, matcher)
      return err
    })
  }
}

const defaultExpectations = new TestEnvironment({unlistedVariablesAreDyn: true})
const {evaluate, parse, expectEval, expectEvalDeep, expectEvalThrows, expectParseThrows} =
  defaultExpectations
export {assert, evaluate, parse, expectEval, expectEvalDeep, expectEvalThrows, expectParseThrows}

export function expectParseAst(expression, expectedAst) {
  const result = parse(expression)
  assert.strictEqual(typeof result, 'function')
  assert.deepStrictEqual(toPlainAst(result.ast), expectedAst)
  return result
}

function toPlainAst(node) {
  if (!Array.isArray(node)) return node
  const plain = new Array(node.length)
  for (let i = 0; i < node.length; i++) plain[i] = toPlainAst(node[i])
  return plain
}

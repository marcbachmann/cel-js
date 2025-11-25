import assert from 'node:assert/strict'
import {Environment} from '../lib/index.js'

export class TestEnvironment extends Environment {
  #expectEval
  #expectEvalThrows
  #expectEvalDeep
  #expectParseThrows
  #expectCheckThrows
  #parse
  #evaluate
  #expectType

  get parse() {
    return (this.#parse ??= super.parse.bind(this))
  }

  get evaluate() {
    return (this.#evaluate ??= super.evaluate.bind(this))
  }

  get expectEval() {
    return (this.#expectEval ??= (expr, expected, context, message) => {
      const res = this.evaluate(expr, context)
      if (!(res instanceof Promise)) assert.strictEqual(res, expected, message)
      else return res.then((r) => assert.strictEqual(r, expected, message))
    })
  }

  get expectEvalThrows() {
    return (this.#expectEvalThrows ??= (expr, matcher, context) =>
      assertThrows(() => this.evaluate(expr, context), matcher))
  }

  get expectEvalDeep() {
    return (this.#expectEvalDeep ??= (expr, expected, context, message) => {
      const result = this.evaluate(expr, context)
      if (!(result instanceof Promise)) assert.deepStrictEqual(result, expected, message)
      else return result.then((r) => assert.deepStrictEqual(r, expected, message))
    })
  }

  get expectParseThrows() {
    return (this.#expectParseThrows ??= (expr, matcher) =>
      assertThrows(() => this.parse(expr), matcher))
  }

  get expectType() {
    return (this.#expectType ??= (expr, expected) => {
      const result = this.check(expr)
      assert.strictEqual(result.type, expected)
    })
  }

  get expectCheckThrows() {
    return (this.#expectCheckThrows ??= (expr, matcher) =>
      assertThrows(() => {
        const result = this.check(expr)
        if (result.valid) return
        throw result.error
      }, matcher))
  }
}

function throws(err, matcher) {
  assert.throws(() => {
    throw err
  }, matcher)
  return err
}

function assertThrows(fn, matcher) {
  let err
  try {
    const res = fn()
    if (res instanceof Promise)
      return res.then(
        () => throws(null, matcher),
        (e) => throws(e, matcher)
      )
  } catch (e) {
    err = e
  }
  return throws(err, matcher)
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

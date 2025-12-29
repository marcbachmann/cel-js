import assert from 'node:assert/strict'
import {Environment} from '../lib/index.js'
import {Duration} from '../lib/functions.js'
const {deepStrictEqual, strictEqual, throws} = assert

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
      if (!(res instanceof Promise)) strictEqual(res, expected, message)
      else return res.then((r) => strictEqual(r, expected, message))
    })
  }

  get expectEvalThrows() {
    return (this.#expectEvalThrows ??= (expr, matcher, context) =>
      assertThrows(() => this.evaluate(expr, context), matcher))
  }

  get expectEvalDeep() {
    return (this.#expectEvalDeep ??= (expr, expected, context, message) => {
      const res = this.evaluate(expr, context)
      if (!(res instanceof Promise)) deepStrictEqual(normalize(res), normalize(expected), message)
      else return res.then((r) => deepStrictEqual(normalize(r), normalize(expected), message))
    })
  }

  get expectParseThrows() {
    return (this.#expectParseThrows ??= (expr, matcher) =>
      assertThrows(() => this.parse(expr), matcher))
  }

  get expectType() {
    return (this.#expectType ??= (expr, expected) => {
      const result = this.check(expr)
      strictEqual(result.type, expected)
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

function assertError(err, matcher) {
  throws(() => {
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
        () => assertError(null, matcher),
        (e) => assertError(e, matcher)
      )
  } catch (e) {
    err = e
  }
  return assertError(err, matcher)
}

const defaultExpectations = new TestEnvironment({
  unlistedVariablesAreDyn: true,
  enableOptionalTypes: true
})
const {
  evaluate,
  parse,
  expectType,
  expectEval,
  expectEvalDeep,
  expectEvalThrows,
  expectParseThrows
} = defaultExpectations
export {
  assert,
  evaluate,
  parse,
  expectType,
  expectEval,
  expectEvalDeep,
  expectEvalThrows,
  expectParseThrows
}

export function expectParseAst(expression, expectedAst) {
  const result = parse(expression)
  strictEqual(typeof result, 'function')
  deepStrictEqual(result.ast.toOldStructure(), expectedAst)
  return result
}

function normalize(value) {
  if (value instanceof Duration) return {Duration: value.valueOf()}
  return value
}

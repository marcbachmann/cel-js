import {describe, test} from 'node:test'
import {evaluate} from '../lib/index.js'

// simulate an evaluation error
const divByZero = '(1 / 0)'
const nonexistentVar = 'something'
const nonexistentProp = 'nested.different'
const nonexistentFunc = 'nested.different.startsWith("a")'
const ctx = {
  foo: 'bar',
  nested: {a: 'b'}
}

function strictEqualTest(expr, expected) {
  test(expr, (t) => {
    t.assert.strictEqual(evaluate(expr, ctx), expected)
  })
}

function testThrows(expr, error) {
  test(expr, (t) => {
    t.assert.throws(() => evaluate(expr, ctx), error)
  })
}

describe('logical operators', () => {
  // Partial state tests: https://chromium.googlesource.com/external/github.com/google/cel-go/+/refs/tags/v0.10.3/README.md#partial-state
  // - the symbols <x> and <y> represent error or unknown values,
  // - the ? indicating that the branch is not taken due to short-circuiting
  describe('partial state:', () => {
    strictEqualTest(`false && ${divByZero}`, false)
    strictEqualTest(`true && false`, false)
    strictEqualTest(`${divByZero} && false`, false)
    strictEqualTest(`true && true`, true)
    strictEqualTest(`true || ${divByZero}`, true)
    strictEqualTest(`false || true`, true)
    strictEqualTest(`${divByZero} || true`, true)
    strictEqualTest(`${nonexistentProp} || true`, true)
    strictEqualTest(`${nonexistentFunc} || true`, true)
    testThrows(`${divByZero} || ${nonexistentVar}`, /Unknown variable: something/)
    strictEqualTest(`false || false`, false)
    testThrows(`true && ${divByZero}`, /division by zero/)
    testThrows(`${divByZero} && true`, /division by zero/)
    testThrows(`${divByZero} && ${nonexistentVar}`, /Unknown variable: something/)
    testThrows(`false || ${divByZero}`, /division by zero/)
    testThrows(`${divByZero} || false`, /division by zero/)
    testThrows(`${divByZero} || ${nonexistentVar}`, /Unknown variable: something/)
  })

  describe('AND', () => {
    strictEqualTest('true && true', true)
    strictEqualTest('true && false', false)
    strictEqualTest('false && true', false)
    strictEqualTest('true && true && true', true)
    strictEqualTest('true && false && true', false)

    // Should not evaluate division by zero
    strictEqualTest('false && (1 / 0)', false)
  })

  describe('OR', () => {
    strictEqualTest('true || false', true)
    strictEqualTest('false || false', false)
    strictEqualTest('false || true || false', true)

    // Should not evaluate division by zero
    strictEqualTest('true || (1 / 0)', true)
  })

  strictEqualTest('true && true || false', true)
  strictEqualTest('(true || false) && (false || true)', true)

  strictEqualTest('!false', true)
  strictEqualTest('!(false)', true)
  strictEqualTest('!!false', false)
  strictEqualTest('!true', false)
  strictEqualTest('!(true)', false)
  strictEqualTest('!!true', true)
  strictEqualTest('!!!true', false)
})

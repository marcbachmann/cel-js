import {test, describe} from 'node:test'
import {evaluate} from '../index.js'

function strictEqualTest(testname, expr, expected) {
  test(testname, (t) => {
    t.assert.strictEqual(evaluate(expr), expected)
  })
}

function strictEqualTestThrows(testname, expr, error) {
  test(testname, (t) => {
    t.assert.throws(() => evaluate(expr), {message: error})
  })
}

describe('logical operators', () => {
  // Partial state tests: https://chromium.googlesource.com/external/github.com/google/cel-go/+/refs/tags/v0.10.3/README.md#partial-state
  // - the symbols <x> and <y> represent error or unknown values,
  // - the ? indicating that the branch is not taken due to short-circuiting
  describe('partial state:', () => {
    // simulate an evaluation error
    const divByZero = '(1 / 0)'
    const nonexistentVar = 'something'

    strictEqualTest('(false && ?) == false', `false && ${divByZero}`, false)
    strictEqualTest('(true && false) == false', `true && false`, false)
    strictEqualTest('(<x> && false) == false', `${divByZero} && false`, false)
    strictEqualTest('(true && true) == true', `true && true`, true)
    strictEqualTest('(true || ?) == true', `true || ${divByZero}`, true)
    strictEqualTest('(false || true) == true', `false || true`, true)
    strictEqualTest('(<x> || true) == true', `${divByZero} || true`, true)
    strictEqualTest('(false || false) == false', `false || false`, false)
    strictEqualTestThrows('(true && <x>) == <x>', `true && ${divByZero}`, 'division by zero')
    strictEqualTestThrows('(<x> && true) == <x>', `${divByZero} && true`, 'division by zero')
    strictEqualTestThrows(
      '(<x> && <y>) == <x, y>',
      `${divByZero} && ${nonexistentVar}`,
      'Unknown variable: something'
    )
    strictEqualTestThrows('(false || <x>) == <x>', `false || ${divByZero}`, 'division by zero')
    strictEqualTestThrows('(<x> || false) == <x>', `${divByZero} || false`, 'division by zero')
    strictEqualTestThrows(
      '(<x> || <y>) == <x, y>',
      `${divByZero} || ${nonexistentVar}`,
      'Unknown variable: something'
    )
  })

  describe('AND', () => {
    strictEqualTest('should return true if both expressions are true', 'true && true', true)
    strictEqualTest('should return false if second expression is false', 'true && false', false)
    strictEqualTest('should return false if first expression is false', 'false && true', false)
    strictEqualTest('should return true if all expressions are true', 'true && true && true', true)
    strictEqualTest(
      'should return false if at least one expression is false',
      'true && false && true',
      false
    )

    // Should not evaluate division by zero
    strictEqualTest('should short-circuit on false', 'false && (1 / 0)', false)
  })

  describe('OR', () => {
    strictEqualTest('should return true if at least one expression is true', 'true || false', true)
    strictEqualTest('should return false if all expressions are false', 'false || false', false)
    strictEqualTest(
      'should return true if at least one expression is true',
      'false || true || false',
      true
    )

    // Should not evaluate division by zero
    strictEqualTest('should short-circuit on true', 'true || (1 / 0)', true)
  })

  strictEqualTest('should be able to combine AND and OR', 'true && true || false', true)
  strictEqualTest(
    'should handle complex logical expressions',
    '(true || false) && (false || true)',
    true
  )

  strictEqualTest('should handle NOT operator', '!true', false)
  strictEqualTest('should handle NOT with false', '!false', true)
  strictEqualTest('should handle double NOT', '!!true', true)
})

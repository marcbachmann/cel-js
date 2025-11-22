import {test, describe} from 'node:test'
import {expectEval, expectEvalThrows} from './helpers.js'

function strictEqualTest(expr, expected, context) {
  test(expr, () => expectEval(expr, expected, context))
}

function testThrows(expr, matcher, context) {
  test(expr, () => expectEvalThrows(expr, matcher, context))
}

describe('unary operators', () => {
  describe('logical NOT', () => {
    strictEqualTest('!true', false)
    strictEqualTest('!false', true)
    strictEqualTest('!!true', true)
    strictEqualTest('!!!true', false)
    strictEqualTest('!(1 == 1)', false)

    test('should handle negation with variables', () =>
      expectEval('!isActive', false, {isActive: true}))

    strictEqualTest('!false', true)
    strictEqualTest('!(false)', true)
    strictEqualTest('!!false', false)
    strictEqualTest('!true', false)
    strictEqualTest('!(true)', false)
    strictEqualTest('!!true', true)
    strictEqualTest('!!!true', false)
    testThrows(`!""`, /no such overload: !string/)
    testThrows(`!1`, /no such overload: !int/)
    testThrows(`![]`, /no such overload: !list/)
    testThrows(`!{}`, /no such overload: !map/)
  })

  describe('unary plus', () => {
    test('supports unary plus as operator', () => {
      expectEval('1 + 2', 3n)
      expectEval('1 +2', 3n)
      expectEval('1+2', 3n)
    })

    const unexpectedPlusError = {name: 'ParseError', message: /Unexpected token: PLUS/}
    test('rejects unary plus in front of group', () => {
      expectEvalThrows('+(1 + 2)', unexpectedPlusError)
    })

    test('rejects unary plus', () => {
      expectEvalThrows('+2', unexpectedPlusError)
    })

    test('rejects unary plus after operator', () => {
      expectEvalThrows('1 ++ 2', unexpectedPlusError)

      expectEvalThrows('1 + + 2', unexpectedPlusError)
    })
  })

  describe('unary minus', () => {
    test('should negate positive number', () => expectEval('-5', -5n))
    test('should negate negative number', () => expectEval('-(-5)', 5n))
    test('should handle double negation', () => expectEval('--5', 5n))
    test('should handle unary minus with expressions', () => expectEval('-(1 + 2)', -3n))
    test('should handle unary minus with variables', () => expectEval('-value', -10, {value: 10}))
    test('should handle unary minus with floats', () => expectEval('-3.14', -3.14))
  })

  describe('combined unary operators', () => {
    test('should handle NOT and minus together', () => expectEval('!(-1 < 0)', false))
    test('should handle complex unary expressions', () => expectEval('!!!(false || true)', false))
  })

  test('supports many repetitions', () => expectEval(' + 1'.repeat(40).replace(' + ', ''), 40n))
})

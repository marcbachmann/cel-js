import {describe, test} from 'node:test'
import {assert, evaluate, expectEval, expectEvalThrows} from './helpers.js'

describe('double literals', () => {
  test('should parse decimal double literals', () => {
    expectEval('0.0', 0)
    expectEval('42.5', 42.5)
    expectEval('123456.789', 123456.789)
  })

  test('should parse negative double literals', () => {
    expectEval('-0.5', -0.5)
    expectEval('-42.75', -42.75)
    expectEval('-0.0001', -0.0001)
  })

  test('should parse fractional double literals', () => {
    expectEval('0.000001', 0.000001)
    expectEval('999999.999', 999999.999)
    expectEval('1.23456789', 1.23456789)
  })

  test('should handle double literals in complex expressions', () => {
    expectEval('(0.5 + 0.25) * 2.0', 1.5)
    expectEval('0.1 + (0.2 * 5.0)', 1.1)
    expectEval('[0.1, 0.2, 0.3][2]', 0.3)
  })
})

describe('double conversions', () => {
  test('should convert numeric inputs to double', () => {
    expectEval('double(42)', 42)
    expectEval('double(42u)', 42)
    expectEval('double(1.5)', 1.5)
  })

  test('should convert string inputs including special values', () => {
    expectEval('double("1.25")', 1.25)
    expectEval('double("1e3")', 1000)
    expectEval('double("1E-3")', 0.001)
    expectEval('double("Inf")', Number.POSITIVE_INFINITY)
    expectEval('double("-Infinity")', Number.NEGATIVE_INFINITY)
    assert.ok(Number.isNaN(evaluate('double("NaN")')))
  })

  test('should reject invalid or trimmed string inputs', () => {
    expectEvalThrows('double("")', /double\(\) type error/)
    expectEvalThrows('double(" 1")', /double\(\) type error/)
    expectEvalThrows('double("abc")', /double\(\) type error/)
  })
})

describe('double arithmetic', () => {
  test('should add double values', () => {
    expectEval('1.5 + 2.25', 3.75)
    expectEval('-0.5 + 0.25', -0.25)
  })

  test('should subtract double values', () => {
    expectEval('1.5 - 0.75', 0.75)
    expectEval('-0.5 - 0.25', -0.75)
  })

  test('should multiply double values', () => {
    expectEval('1.5 * 2.25', 3.375)
    expectEval('-0.5 * 0.25', -0.125)
  })

  test('should divide double values', () => {
    expectEval('7.5 / 2.5', 3)
    expectEval('-0.5 / 0.25', -2)
  })

  test('should return infinities or NaN when dividing by zero', () => {
    expectEval('1.0 / 0.0', Number.POSITIVE_INFINITY)
    expectEval('-1.0 / 0.0', Number.NEGATIVE_INFINITY)
    expectEval('0.0 / 0.0', Number.NaN)
  })

  test('should reject arithmetic mixing other numeric types', () => {
    expectEvalThrows('1.0 + 1', /no such overload: double \+ int/)
    expectEvalThrows('1.0 - 1u', /no such overload: double - uint/)
    expectEvalThrows('1.0 * 1', /no such overload: double \* int/)
    expectEvalThrows('1.0 / 1u', /no such overload: double \/ uint/)
  })
})

describe('double comparisons', () => {
  test('should compare double values with ints and uints', () => {
    expectEval('2.0 > 1', true)
    expectEval('2.0 >= 2', true)
    expectEval('2.0 >= 2u', true)
    expectEval('1.0 < 2u', true)
    expectEval('2.0 <= 3', true)
    expectEval('2.5 > 1u', true)
  })

  test('should compare double values with other doubles', () => {
    expectEval('0.5 < 0.6', true)
    expectEval('0.5 <= 0.5', true)
    expectEval('0.9 > 0.3', true)
    expectEval('1.0 >= 1.0', true)
  })

  test('should reject equality without dyn conversions', () => {
    expectEvalThrows('1.0 == 1', /no such overload: double == int/)
    expectEvalThrows('1.0 != 1', /no such overload: double != int/)
    expectEvalThrows('1.0 == 1u', /no such overload: double == uint/)
    expectEvalThrows('1.0 != 1u', /no such overload: double != uint/)
  })

  test('should allow dyn equality bridges for numeric types', () => {
    expectEval('dyn(1.0) == 1', true)
    expectEval('1 == dyn(1.0)', true)
    expectEval('dyn(1.0) == 1u', true)
    expectEval('dyn(1.0) != 2', true)
  })

  test('should reject comparisons against strings', () => {
    expectEvalThrows('1.0 > "1"', /no such overload: double > string/)
    expectEvalThrows('1.0 < "1"', /no such overload: double < string/)
  })

  test('should treat NaN as not equal and unordered', () => {
    expectEval('double("NaN") == double("NaN")', false)
    expectEval('double("NaN") != double("NaN")', true)
    expectEval('double("NaN") > 0', false)
    expectEval('double("NaN") < 0', false)
  })
})

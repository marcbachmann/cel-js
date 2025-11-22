import {test, describe} from 'node:test'
import {expectEval} from './helpers.js'

describe('addition and subtraction', () => {
  test('should evaluate addition', () => expectEval('1 + 1', 2n))

  test('should evaluate subtraction', () => expectEval('1 - 1', 0n))

  test('should evaluate addition with multiple terms', () => expectEval('1 + 1 + 1', 3n))

  test('should evaluate addition with multiple terms with different signs', () =>
    expectEval('1 + 1 - 1', 1n)
  )

  test('should evaluate float addition', () => expectEval('0.333 + 0.333', 0.666))

  test('should concatenate strings', () => expectEval('"a" + "b"', 'ab'))

  test('should handle unary minus', () => expectEval('-5', -5n))

  test('should handle unary minus with expressions', () => expectEval('-(1 + 2)', -3n))

  test('should handle complex arithmetic', () => expectEval('10 - 3 + 2', 9n))
})

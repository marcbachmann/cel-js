import {test, describe} from 'node:test'
import {expectEval, expectEvalThrows} from './helpers.js'

describe('multiplication and division', () => {
  test('should multiply two numbers', () => expectEval('2 * 3', 6n))
  test('should divide two numbers', () => expectEval('6 / 2', 3n))
  test('should handle modulo operation', () => expectEval('7 % 3', 1n))
  test('should handle complex multiplication', () => expectEval('2 * 3 * 4', 24n))
  test('should respect operator precedence', () => expectEval('2 + 3 * 4', 14n))
  test('should handle parentheses', () => expectEval('(2 + 3) * 4', 20n))
  test('should handle float multiplication', () => expectEval('2.5 * 2.0', 5))
  test('should handle float division', () => expectEval('5.5 / 2.0', 2.75))

  test('rejects int and double combinations', () => {
    expectEvalThrows('2.5 * 2', /EvaluationError: no such overload: double \* int/)
  })

  test('rejects double modulo', () => {
    expectEvalThrows('5.5 % 2.0', /EvaluationError: no such overload: double % double/)
    expectEvalThrows('2 % 2.0', /EvaluationError: no such overload: int % double/)
  })
})

import {test, describe} from 'node:test'
import {expectEval, expectEvalThrows} from './helpers.js'

describe('comparison operators', () => {
  describe('equality', () => {
    test('should compare equal numbers', () => expectEval('1 == 1', true))
    test('should compare unequal numbers', () => expectEval('1 == 2', false))
    test('should compare equal strings', () => expectEval('"hello" == "hello"', true))
    test('should compare unequal strings', () => expectEval('"hello" == "world"', false))
    test('should compare equal booleans', () => expectEval('true == true', true))
    test('should compare unequal booleans', () => expectEval('true == false', false))

    test('does not support non-dynamic comparisons', () => {
      const err = /no such overload:/
      expectEvalThrows('true == null', err)
      expectEvalThrows('false == null', err)
      expectEvalThrows('1.0 == null', err)
      expectEvalThrows('1 == null', err)
      expectEvalThrows('true == null', err)
      expectEvalThrows('true == 1', err)
    })

    test('supports dynamic comparisons', () => {
      const ctx = {
        v: {
          true: true,
          false: false,
          null: null,
          int: 1n,
          double: 1,
          string: 'hello'
        }
      }

      for (const key of Object.keys(ctx.v)) {
        expectEval(`v["${key}"] == ""`, false, ctx)
        expectEval(`v["${key}"] == 999`, false, ctx)
        expectEval(`v["${key}"] == 999.1`, false, ctx)
        expectEval(`v["${key}"] == []`, false, ctx)
        expectEval(`v["${key}"] == {}`, false, ctx)
        expectEval(`"" == v["${key}"]`, false, ctx)
        expectEval(`999 == v["${key}"]`, false, ctx)
        expectEval(`999.1 == v["${key}"]`, false, ctx)
        expectEval(`[] == v["${key}"]`, false, ctx)
        expectEval(`{} == v["${key}"]`, false, ctx)
      }

      expectEval('v["null"] == null', true, ctx)
      expectEval('v["true"] == true', true, ctx)
      expectEval('v["true"] == true', true, ctx)
      expectEval('v["false"] == false', true, ctx)
      expectEval('v["int"] == 1', true, ctx)
      expectEval('v["double"] == 1.0', true, ctx)
      expectEval('v["double"] == 1', true, ctx)
      expectEval('v["null"] == null', true, ctx)
    })
  })

  describe('inequality', () => {
    test('should compare unequal numbers', () => expectEval('1 != 2', true))

    test('should compare equal numbers', () => expectEval('1 != 1', false))

    test('does not support non-dynamic comparisons', () => {
      const err = /no such overload:/
      expectEvalThrows('true != null', err)
      expectEvalThrows('false != null', err)
      expectEvalThrows('1.0 != null', err)
      expectEvalThrows('1 != null', err)
      expectEvalThrows('true != null', err)
      expectEvalThrows('true != 1', err)
    })

    test('supports dynamic comparisons', () => {
      const ctx = {
        v: {
          true: true,
          false: false,
          null: null,
          int: 1n,
          double: 1,
          string: 'hello'
        }
      }

      for (const key of Object.keys(ctx.v)) {
        expectEval(`v["${key}"] != ""`, true, ctx)
        expectEval(`v["${key}"] != 999`, true, ctx)
        expectEval(`v["${key}"] != 999.1`, true, ctx)
        expectEval(`v["${key}"] != []`, true, ctx)
        expectEval(`v["${key}"] != {}`, true, ctx)
        expectEval(`"" != v["${key}"]`, true, ctx)
        expectEval(`999 != v["${key}"]`, true, ctx)
        expectEval(`999.1 != v["${key}"]`, true, ctx)
        expectEval(`[] != v["${key}"]`, true, ctx)
        expectEval(`{} != v["${key}"]`, true, ctx)
      }

      expectEval('v["null"] != null', false, ctx)
      expectEval('v["true"] != true', false, ctx)
      expectEval('v["true"] != true', false, ctx)
      expectEval('v["false"] != false', false, ctx)
      expectEval('v["int"] != 1', false, ctx)
      expectEval('v["double"] != 1.0', false, ctx)
      expectEval('v["double"] != 1', false, ctx)
      expectEval('v["null"] != null', false, ctx)
    })
  })

  describe('less than', () => {
    test('should compare numbers', () => expectEval('1 < 2', true))
    test('should compare equal numbers', () => expectEval('2 < 2', false))
    test('should compare greater numbers', () => expectEval('3 < 2', false))
  })

  describe('less than or equal', () => {
    test('should compare smaller numbers', () => expectEval('1 <= 2', true))
    test('should compare equal numbers', () => expectEval('2 <= 2', true))
    test('should compare greater numbers', () => expectEval('3 <= 2', false))
  })

  describe('greater than', () => {
    test('should compare numbers', () => expectEval('2 > 1', true))
    test('should compare equal numbers', () => expectEval('2 > 2', false))
    test('should compare smaller numbers', () => expectEval('1 > 2', false))
  })

  describe('greater than or equal', () => {
    test('should compare greater numbers', () => expectEval('2 >= 1', true))
    test('should compare equal numbers', () => expectEval('2 >= 2', true))
    test('should compare smaller numbers', () => expectEval('1 >= 2', false))
  })

  describe('string comparisons', () => {
    test('should compare strings lexicographically', () => expectEval('"a" < "b"', true))
    test('should compare equal strings', () => expectEval('"hello" >= "hello"', true))
  })
})

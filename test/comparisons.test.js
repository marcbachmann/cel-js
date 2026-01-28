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

  const relationalTests = {
    '<': [
      ['booleans', [
        ['true < false', false], ['false < true', true],
        ['true < true', false], ['false < false', false]
      ]],
      ['integers', [
        ['1 < 2', true], ['2 < 2', false], ['3 < 2', false],
        ['-5 < -3', true], ['-3 < -5', false], ['-1 < 0', true], ['0 < -1', false],
        ['9223372036854775806 < 9223372036854775807', true]
      ]],
      ['unsigned integers', [
        ['uint(1) < uint(2)', true], ['uint(2) < uint(2)', false], ['uint(3) < uint(2)', false],
        ['uint(0) < uint(1)', true]
      ]],
      ['doubles', [
        ['1.0 < 2.0', true], ['2.0 < 2.0', false], ['3.0 < 2.0', false],
        ['-5.5 < -3.3', true], ['1.1 < 1.2', true], ['0.001 < 0.002', true]
      ]],
      ['strings', [
        ['"a" < "b"', true], ['"b" < "a"', false], ['"hello" < "hello"', false],
        ['"abc" < "abcd"', true], ['"" < "a"', true], ['"a" < ""', false],
        ['"A" < "a"', true], ['"α" < "β"', true]
      ]],
      ['timestamps', [
        ['timestamp("2024-01-01T00:00:00Z") < timestamp("2024-01-02T00:00:00Z")', true],
        ['timestamp("2024-01-01T00:00:00Z") < timestamp("2024-01-01T00:00:00Z")', false],
        ['timestamp("2024-01-02T00:00:00Z") < timestamp("2024-01-01T00:00:00Z")', false]
      ]],
      ['durations', [
        ['duration("1h") < duration("2h")', true],
        ['duration("1h") < duration("1h")', false],
        ['duration("2h") < duration("1h")', false]
      ]],
      ['cross-type (int/double)', [
        ['1 < 1.5', true], ['2 < 1.5', false], ['1 < 1.0', false],
        ['1.5 < 2', true], ['1.5 < 1', false], ['1.0 < 1', false]
      ]],
      ['cross-type (int/uint)', [
        ['1 < uint(2)', true], ['2 < uint(1)', false], ['1 < uint(1)', false],
        ['uint(1) < 2', true], ['uint(2) < 1', false], ['uint(1) < 1', false]
      ]],
      ['cross-type (double/uint)', [
        ['1.5 < uint(2)', true], ['2.5 < uint(2)', false],
        ['uint(1) < 2.5', true], ['uint(3) < 2.5', false]
      ]]
    ],
    '<=': [
      ['booleans', [
        ['true <= false', false], ['false <= true', true],
        ['true <= true', true], ['false <= false', true]
      ]],
      ['integers', [
        ['1 <= 2', true], ['2 <= 2', true], ['3 <= 2', false],
        ['-5 <= -3', true], ['-3 <= -3', true]
      ]],
      ['unsigned integers', [
        ['uint(1) <= uint(2)', true], ['uint(2) <= uint(2)', true], ['uint(3) <= uint(2)', false]
      ]],
      ['doubles', [
        ['1.0 <= 2.0', true], ['2.0 <= 2.0', true], ['3.0 <= 2.0', false]
      ]],
      ['strings', [
        ['"a" <= "b"', true], ['"b" <= "a"', false], ['"hello" <= "hello"', true],
        ['"" <= "a"', true], ['"" <= ""', true]
      ]],
      ['timestamps', [
        ['timestamp("2024-01-01T00:00:00Z") <= timestamp("2024-01-02T00:00:00Z")', true],
        ['timestamp("2024-01-01T00:00:00Z") <= timestamp("2024-01-01T00:00:00Z")', true],
        ['timestamp("2024-01-02T00:00:00Z") <= timestamp("2024-01-01T00:00:00Z")', false]
      ]],
      ['durations', [
        ['duration("1h") <= duration("2h")', true],
        ['duration("1h") <= duration("1h")', true],
        ['duration("2h") <= duration("1h")', false]
      ]],
      ['cross-type (int/double)', [
        ['1 <= 1.5', true], ['1 <= 1.0', true], ['2 <= 1.5', false],
        ['1.5 <= 2', true], ['1.0 <= 1', true], ['1.5 <= 1', false]
      ]],
      ['cross-type (int/uint)', [
        ['1 <= uint(2)', true], ['1 <= uint(1)', true], ['2 <= uint(1)', false],
        ['uint(1) <= 2', true], ['uint(1) <= 1', true], ['uint(2) <= 1', false]
      ]]
    ],
    '>': [
      ['booleans', [
        ['true > false', true], ['false > true', false],
        ['true > true', false], ['false > false', false]
      ]],
      ['integers', [
        ['2 > 1', true], ['2 > 2', false], ['1 > 2', false],
        ['-3 > -5', true], ['0 > -1', true],
        ['9223372036854775807 > 9223372036854775806', true]
      ]],
      ['unsigned integers', [
        ['uint(2) > uint(1)', true], ['uint(2) > uint(2)', false], ['uint(1) > uint(2)', false]
      ]],
      ['doubles', [
        ['2.0 > 1.0', true], ['2.0 > 2.0', false], ['1.0 > 2.0', false],
        ['1.2 > 1.1', true], ['0.002 > 0.001', true]
      ]],
      ['strings', [
        ['"b" > "a"', true], ['"a" > "b"', false], ['"hello" > "hello"', false],
        ['"abcd" > "abc"', true], ['"a" > ""', true], ['"" > ""', false]
      ]],
      ['timestamps', [
        ['timestamp("2024-01-02T00:00:00Z") > timestamp("2024-01-01T00:00:00Z")', true],
        ['timestamp("2024-01-01T00:00:00Z") > timestamp("2024-01-01T00:00:00Z")', false],
        ['timestamp("2024-01-01T00:00:00Z") > timestamp("2024-01-02T00:00:00Z")', false]
      ]],
      ['durations', [
        ['duration("2h") > duration("1h")', true],
        ['duration("1h") > duration("1h")', false],
        ['duration("1h") > duration("2h")', false]
      ]],
      ['cross-type (int/double)', [
        ['2 > 1.5', true], ['1 > 1.5', false], ['1 > 1.0', false],
        ['1.5 > 1', true], ['1.5 > 2', false], ['1.0 > 1', false]
      ]],
      ['cross-type (int/uint)', [
        ['2 > uint(1)', true], ['1 > uint(2)', false], ['1 > uint(1)', false],
        ['uint(2) > 1', true], ['uint(1) > 2', false], ['uint(1) > 1', false]
      ]]
    ],
    '>=': [
      ['booleans', [
        ['true >= false', true], ['false >= true', false],
        ['true >= true', true], ['false >= false', true]
      ]],
      ['integers', [
        ['2 >= 1', true], ['2 >= 2', true], ['1 >= 2', false],
        ['-3 >= -5', true], ['-3 >= -3', true]
      ]],
      ['unsigned integers', [
        ['uint(2) >= uint(1)', true], ['uint(2) >= uint(2)', true], ['uint(1) >= uint(2)', false]
      ]],
      ['doubles', [
        ['2.0 >= 1.0', true], ['2.0 >= 2.0', true], ['1.0 >= 2.0', false]
      ]],
      ['strings', [
        ['"b" >= "a"', true], ['"a" >= "b"', false], ['"hello" >= "hello"', true],
        ['"a" >= ""', true], ['"" >= ""', true]
      ]],
      ['timestamps', [
        ['timestamp("2024-01-02T00:00:00Z") >= timestamp("2024-01-01T00:00:00Z")', true],
        ['timestamp("2024-01-01T00:00:00Z") >= timestamp("2024-01-01T00:00:00Z")', true],
        ['timestamp("2024-01-01T00:00:00Z") >= timestamp("2024-01-02T00:00:00Z")', false]
      ]],
      ['durations', [
        ['duration("2h") >= duration("1h")', true],
        ['duration("1h") >= duration("1h")', true],
        ['duration("1h") >= duration("2h")', false]
      ]],
      ['cross-type (int/double)', [
        ['2 >= 1.5', true], ['1 >= 1.0', true], ['1 >= 1.5', false],
        ['1.5 >= 1', true], ['1.0 >= 1', true], ['1.5 >= 2', false]
      ]],
      ['cross-type (int/uint)', [
        ['2 >= uint(1)', true], ['1 >= uint(1)', true], ['1 >= uint(2)', false],
        ['uint(2) >= 1', true], ['uint(1) >= 1', true], ['uint(1) >= 2', false]
      ]]
    ]
  }

  for (const [op, groups] of Object.entries(relationalTests)) {
    describe(op, () => {
      for (const [name, cases] of groups) {
        test(name, () => {
          for (const [expr, expected] of cases) {
            expectEval(expr, expected)
          }
        })
      }
    })
  }

  describe('type mismatches', () => {
    test('should reject incompatible types', () => {
      const err = /no such overload:/
      for (const expr of ['"a" < 1', '1 < "a"', 'true < 1', 'true < "a"', '[] < []', '{} < {}']) {
        expectEvalThrows(expr, err)
      }
    })
  })
})

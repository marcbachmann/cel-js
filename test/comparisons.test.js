import {test, describe} from 'node:test'
import {evaluate} from '../lib/index.js'

describe('comparison operators', () => {
  describe('equality', () => {
    test('should compare equal numbers', (t) => {
      t.assert.strictEqual(evaluate('1 == 1'), true)
    })

    test('should compare unequal numbers', (t) => {
      t.assert.strictEqual(evaluate('1 == 2'), false)
    })

    test('should compare equal strings', (t) => {
      t.assert.strictEqual(evaluate('"hello" == "hello"'), true)
    })

    test('should compare unequal strings', (t) => {
      t.assert.strictEqual(evaluate('"hello" == "world"'), false)
    })

    test('should compare equal booleans', (t) => {
      t.assert.strictEqual(evaluate('true == true'), true)
    })

    test('should compare unequal booleans', (t) => {
      t.assert.strictEqual(evaluate('true == false'), false)
    })

    test('does not support non-dynamic comparisons', (t) => {
      const err = /no such overload:/
      t.assert.throws(() => evaluate('true == null'), err)
      t.assert.throws(() => evaluate('false == null'), err)
      t.assert.throws(() => evaluate('1.0 == null'), err)
      t.assert.throws(() => evaluate('1 == null'), err)
      t.assert.throws(() => evaluate('true == null'), err)
      t.assert.throws(() => evaluate('true == 1'), err)
    })

    test('supports dynamic comparisons', (t) => {
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
        t.assert.strictEqual(evaluate(`v["${key}"] == ""`, ctx), false)
        t.assert.strictEqual(evaluate(`v["${key}"] == 999`, ctx), false)
        t.assert.strictEqual(evaluate(`v["${key}"] == 999.1`, ctx), false)
        t.assert.strictEqual(evaluate(`v["${key}"] == []`, ctx), false)
        t.assert.strictEqual(evaluate(`v["${key}"] == {}`, ctx), false)
        t.assert.strictEqual(evaluate(`"" == v["${key}"]`, ctx), false)
        t.assert.strictEqual(evaluate(`999 == v["${key}"]`, ctx), false)
        t.assert.strictEqual(evaluate(`999.1 == v["${key}"]`, ctx), false)
        t.assert.strictEqual(evaluate(`[] == v["${key}"]`, ctx), false)
        t.assert.strictEqual(evaluate(`{} == v["${key}"]`, ctx), false)
      }

      t.assert.strictEqual(evaluate('v["null"] == null', ctx), true)
      t.assert.strictEqual(evaluate('v["true"] == true', ctx), true)
      t.assert.strictEqual(evaluate('v["true"] == true', ctx), true)
      t.assert.strictEqual(evaluate('v["false"] == false', ctx), true)
      t.assert.strictEqual(evaluate('v["int"] == 1', ctx), true)
      t.assert.strictEqual(evaluate('v["double"] == 1.0', ctx), true)
      t.assert.strictEqual(evaluate('v["double"] == 1', ctx), true)
      t.assert.strictEqual(evaluate('v["null"] == null', ctx), true)
    })
  })

  describe('inequality', () => {
    test('should compare unequal numbers', (t) => {
      t.assert.strictEqual(evaluate('1 != 2'), true)
    })

    test('should compare equal numbers', (t) => {
      t.assert.strictEqual(evaluate('1 != 1'), false)
    })

    test('does not support non-dynamic comparisons', (t) => {
      const err = /no such overload:/
      t.assert.throws(() => evaluate('true != null'), err)
      t.assert.throws(() => evaluate('false != null'), err)
      t.assert.throws(() => evaluate('1.0 != null'), err)
      t.assert.throws(() => evaluate('1 != null'), err)
      t.assert.throws(() => evaluate('true != null'), err)
      t.assert.throws(() => evaluate('true != 1'), err)
    })

    test('supports dynamic comparisons', (t) => {
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
        t.assert.strictEqual(evaluate(`v["${key}"] != ""`, ctx), true)
        t.assert.strictEqual(evaluate(`v["${key}"] != 999`, ctx), true)
        t.assert.strictEqual(evaluate(`v["${key}"] != 999.1`, ctx), true)
        t.assert.strictEqual(evaluate(`v["${key}"] != []`, ctx), true)
        t.assert.strictEqual(evaluate(`v["${key}"] != {}`, ctx), true)
        t.assert.strictEqual(evaluate(`"" != v["${key}"]`, ctx), true)
        t.assert.strictEqual(evaluate(`999 != v["${key}"]`, ctx), true)
        t.assert.strictEqual(evaluate(`999.1 != v["${key}"]`, ctx), true)
        t.assert.strictEqual(evaluate(`[] != v["${key}"]`, ctx), true)
        t.assert.strictEqual(evaluate(`{} != v["${key}"]`, ctx), true)
      }

      t.assert.strictEqual(evaluate('v["null"] != null', ctx), false)
      t.assert.strictEqual(evaluate('v["true"] != true', ctx), false)
      t.assert.strictEqual(evaluate('v["true"] != true', ctx), false)
      t.assert.strictEqual(evaluate('v["false"] != false', ctx), false)
      t.assert.strictEqual(evaluate('v["int"] != 1', ctx), false)
      t.assert.strictEqual(evaluate('v["double"] != 1.0', ctx), false)
      t.assert.strictEqual(evaluate('v["double"] != 1', ctx), false)
      t.assert.strictEqual(evaluate('v["null"] != null', ctx), false)
    })
  })

  describe('less than', () => {
    test('should compare numbers', (t) => {
      t.assert.strictEqual(evaluate('1 < 2'), true)
    })

    test('should compare equal numbers', (t) => {
      t.assert.strictEqual(evaluate('2 < 2'), false)
    })

    test('should compare greater numbers', (t) => {
      t.assert.strictEqual(evaluate('3 < 2'), false)
    })
  })

  describe('less than or equal', () => {
    test('should compare smaller numbers', (t) => {
      t.assert.strictEqual(evaluate('1 <= 2'), true)
    })

    test('should compare equal numbers', (t) => {
      t.assert.strictEqual(evaluate('2 <= 2'), true)
    })

    test('should compare greater numbers', (t) => {
      t.assert.strictEqual(evaluate('3 <= 2'), false)
    })
  })

  describe('greater than', () => {
    test('should compare numbers', (t) => {
      t.assert.strictEqual(evaluate('2 > 1'), true)
    })

    test('should compare equal numbers', (t) => {
      t.assert.strictEqual(evaluate('2 > 2'), false)
    })

    test('should compare smaller numbers', (t) => {
      t.assert.strictEqual(evaluate('1 > 2'), false)
    })
  })

  describe('greater than or equal', () => {
    test('should compare greater numbers', (t) => {
      t.assert.strictEqual(evaluate('2 >= 1'), true)
    })

    test('should compare equal numbers', (t) => {
      t.assert.strictEqual(evaluate('2 >= 2'), true)
    })

    test('should compare smaller numbers', (t) => {
      t.assert.strictEqual(evaluate('1 >= 2'), false)
    })
  })

  describe('string comparisons', () => {
    test('should compare strings lexicographically', (t) => {
      t.assert.strictEqual(evaluate('"a" < "b"'), true)
    })

    test('should compare equal strings', (t) => {
      t.assert.strictEqual(evaluate('"hello" >= "hello"'), true)
    })
  })
})

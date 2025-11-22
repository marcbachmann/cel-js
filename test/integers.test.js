import {describe, test} from 'node:test'
import {evaluate, UnsignedInt} from '../lib/evaluator.js'
import {assert, expectEval, expectEvalThrows} from './helpers.js'

describe('integer literals', () => {
  test('should parse decimal integers', () => {
    expectEval('42', 42n)
    expectEval('0', 0n)
    expectEval('123456', 123456n)
  })

  test('should parse negative decimal integers', () => {
    expectEval('-42', -42n)
    expectEval('-1', -1n)
    expectEval('-999', -999n)
  })

  test('should parse hexadecimal integers with lowercase x', () => {
    expectEval('0x0', 0n)
    expectEval('0x1', 1n)
    expectEval('0xa', 10n)
    expectEval('0xf', 15n)
    expectEval('0x10', 16n)
    expectEval('0xff', 255n)
    expectEval('0x100', 256n)
    expectEval('0xdead', 57005n)
    expectEval('0xbeef', 48879n)
  })

  test('should parse hexadecimal integers with uppercase X', () => {
    expectEval('0X0', 0n)
    expectEval('0X1', 1n)
    expectEval('0XA', 10n)
    expectEval('0XF', 15n)
    expectEval('0X10', 16n)
    expectEval('0XFF', 255n)
    expectEval('0X100', 256n)
    expectEval('0XDEAD', 57005n)
    expectEval('0XBEEF', 48879n)
  })

  test('should parse hexadecimal integers with mixed case', () => {
    expectEval('0xDead', 57005n)
    expectEval('0xBeEf', 48879n)
    expectEval('0XdEaD', 57005n)
    expectEval('0XbEeF', 48879n)
  })

  test('should parse negative hexadecimal integers', () => {
    expectEval('-0x1', -1n)
    expectEval('-0xa', -10n)
    expectEval('-0xff', -255n)
    expectEval('-0X10', -16n)
    expectEval('-0XDEAD', -57005n)
  })

  test('should compare integers correctly', () => {
    expectEval('0x10 == 16', true)
    expectEval('0xff != 254', true)
    expectEval('0xa > 9', true)
    expectEval('0xf >= 15', true)
    expectEval('0x5 < 10', true)
    expectEval('0x8 <= 8', true)
  })

  test('should handle large hex values', () => {
    expectEval('0x7fffffff', 2147483647n)
    expectEval('0x80000000', 2147483648n)
    expectEval('0xffffffff', 4294967295n)
  })

  test('should handle integer literals in complex expressions', () => {
    expectEval('(0x10 + 0x20) * 2', 96n)
    expectEval('0xff > 100 ? 0xa : 0xb', 10n)
    expectEval('[0x1, 0x2, 0x3][1]', 2n)
  })

  test('should allow integer with double comparisons', () => {
    expectEval('1.1 >= 1', true)
    expectEval('1.0 >= 1', true)
    expectEval('1.0 <= 1', true)
    expectEval('0.9 <= 1', true)
    expectEval('1.1 > 1', true)
    expectEval('2 > 1.0', true)
  })

  test('should not allow integer equality with doubles', () => {
    expectEvalThrows('1.0 == 0', /no such overload: double == int/)
    expectEvalThrows('1.0 != 0', /no such overload: double != int/)
  })

  test('should allow integer addition via context', () => {
    expectEval('a + b', 3, {a: 1, b: 2})
  })
})

describe('integer parsing edge cases', () => {
  test('should throw error for invalid hex numbers', () => {
    const matcher = {name: 'ParseError', message: /Invalid hex integer/}
    expectEvalThrows('0x', matcher)
    expectEvalThrows('0X', matcher)
  })

  test('should throw error for incomplete hex numbers', () => {
    const matcher = {name: 'ParseError', message: /Invalid hex integer/}
    expectEvalThrows('0xg', matcher)
    expectEvalThrows('0Xz', matcher)
  })

  test('should handle hex numbers at token boundaries', () => {
    expectEval('0xff+1', 256n) // no space between hex and operator
    expectEval('0x10*0x2', 32n) // hex multiplication without spaces
  })

  test('throws integer overflow error with values out of bound', () => {
    expectEval('9223372036854775807', 9223372036854775807n)
    expectEval('-9223372036854775808', -9223372036854775808n)
    expectEval('4611686018427387903 * 2', 9223372036854775806n)
    expectEval('-4611686018427387904 * 2', -9223372036854775808n)
    expectEvalThrows('9223372036854775807 + 1', /integer overflow/)
    expectEvalThrows('-9223372036854775808 - 1', /integer overflow/)
    expectEvalThrows('4611686018427387905 * 2', /integer overflow/)
  })
})

describe('unsigned integer', () => {
  test('returns an unsigned integer', () => {
    const result = evaluate('42u')
    assert.ok(result instanceof UnsignedInt)
    assert.strictEqual(result.valueOf(), 42n)
  })

  test('should use unsigned integers in arithmetic operations', () => {
    assert.strictEqual(evaluate('10u + 20u').valueOf(), 30n)
    assert.strictEqual(evaluate('0xau + 0xbu').valueOf(), 21n)
    assert.strictEqual(evaluate('100u - 50u').valueOf(), 50n)
    assert.strictEqual(evaluate('0xffu * 2u').valueOf(), 510n)
  })

  test('should use integers in arithmetic operations', () => {
    expectEval('0x10 + 0x20', 48n)
    expectEval('0xff - 0xf', 240n)
    expectEval('0xa * 0xb', 110n)
    expectEval('0x64 / 0x4', 25n)
    expectEval('0x17 % 0x5', 3n)
  })

  test('should parse unsigned decimal integers', () => {
    assert.strictEqual(evaluate('42u').valueOf(), 42n)
    assert.strictEqual(evaluate('42U').valueOf(), 42n)
    assert.strictEqual(evaluate('0u').valueOf(), 0n)
    assert.strictEqual(evaluate('0U').valueOf(), 0n)
    assert.strictEqual(evaluate('4294967295u').valueOf(), 4294967295n) // max uint32
    assert.strictEqual(evaluate('4294967295U').valueOf(), 4294967295n)
  })

  test('should parse unsigned hexadecimal integers', () => {
    assert.strictEqual(evaluate('0x0u').valueOf(), 0n)
    assert.strictEqual(evaluate('0x0U').valueOf(), 0n)
    assert.strictEqual(evaluate('0xffu').valueOf(), 255n)
    assert.strictEqual(evaluate('0xffU').valueOf(), 255n)
    assert.strictEqual(evaluate('0xFFu').valueOf(), 255n)
    assert.strictEqual(evaluate('0XFFU').valueOf(), 255n)
    assert.strictEqual(evaluate('0xffffffffu').valueOf(), 4294967295n) // max uint32
    assert.strictEqual(evaluate('0xffffffffU').valueOf(), 4294967295n)
    assert.strictEqual(evaluate('0XFFFFFFFFu').valueOf(), 4294967295n)
    assert.strictEqual(evaluate('0XFFFFFFFFU').valueOf(), 4294967295n)
  })

  test('should compare unsigned integers correctly', () => {
    const nr = ['1u', '1', '1.0', '0x1']
    const assertEquals = (expr, expected) =>
      expectEval(expr, expected, undefined, `${expr} should be ${expected}`)

    for (const a of nr) {
      for (const b of nr) {
        assertEquals(`dyn(${b}) == ${a}`, true)
        assertEquals(`${a} == dyn(${b})`, true)
        assertEquals(`dyn(${b}) != ${a}`, false)
        assertEquals(`${a} != dyn(${b})`, false)

        assertEquals(`(${b} + ${b}) > ${a}`, true)
        assertEquals(`(${b} + ${b}) > dyn(${a})`, true)
        assertEquals(`dyn((${b} + ${b})) > ${a}`, true)

        assertEquals(`(${b} + ${b}) < ${a}`, false)
        assertEquals(`(${b} + ${b}) < dyn(${a})`, false)
        assertEquals(`dyn((${b} + ${b})) < ${a}`, false)

        assertEquals(`${b} >= ${a}`, true)
        assertEquals(`${b} >= dyn(${a})`, true)
        assertEquals(`dyn(${b}) >= ${a}`, true)
        assertEquals(`${b} <= ${a}`, true)
        assertEquals(`${b} <= dyn(${a})`, true)
        assertEquals(`dyn(${b}) <= ${a}`, true)
      }
    }
  })

  test('restricts equality of different type', () => {
    const nr = ['1u', '1', '1.0']
    for (const a of nr) {
      for (const b of nr) {
        if (a === b) continue
        expectEvalThrows(`${a} == ${b}`)
        expectEvalThrows(`${a} != ${b}`)
        expectEvalThrows(`${a} + ${b}`)
        expectEvalThrows(`${a} - ${b}`)
        expectEvalThrows(`dyn(${a}) + ${b}`)
        expectEvalThrows(`dyn(${a}) - ${b}`)
        expectEvalThrows(`dyn(${a}) / ${b}`)
        expectEvalThrows(`dyn(${a}) * ${b}`)
      }
    }
  })

  test('should handle unsigned integers in complex expressions', () => {
    assert.strictEqual(evaluate('(10u + 20u) * 2u').valueOf(), 60n)
    assert.strictEqual(evaluate('100u > 50u ? 1u : 0u').valueOf(), 1n)
    assert.strictEqual(evaluate('[1u, 2u, 3u][0]').valueOf(), 1n)
  })

  test('should handle unsigned suffix at token boundaries', () => {
    assert.strictEqual(evaluate('42u+1u').valueOf(), 43n) // no space between unsigned and operator
    assert.strictEqual(evaluate('0xffu*2u').valueOf(), 510n) // unsigned hex without spaces
  })

  test('should not allow unsigned suffix on floats', () => {
    expectEvalThrows('1.5u', {name: 'ParseError', message: /Unexpected character: 'u'/})
    expectEvalThrows('3.14U', {name: 'ParseError', message: /Unexpected character: 'U'/})
  })

  test('throws integer overflow error with values out of bound', () => {
    assert.strictEqual(evaluate('0u').valueOf(), 0n) // min uint64
    assert.strictEqual(evaluate('18446744073709551615u').valueOf(), 18446744073709551615n) // max uint64
    assert.strictEqual(evaluate('9223372036854775807u * 2u').valueOf(), 18446744073709551614n)
    expectEvalThrows('0.1u', /Unexpected character: 'u'/)
    expectEvalThrows('0u - 1u', /integer overflow/)
    expectEvalThrows('-1u', /no such overload: -uint/)
    expectEvalThrows('18446744073709551615u + 1u', /integer overflow/)
    expectEvalThrows('9223372036854775808u * 2u', /integer overflow/)
  })
})

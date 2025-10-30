import {test, describe} from 'node:test'
import {evaluate, UnsignedInt} from '../lib/evaluator.js'

describe('integer literals', () => {
  test('should parse decimal integers', (t) => {
    t.assert.strictEqual(evaluate('42'), 42n)
    t.assert.strictEqual(evaluate('0'), 0n)
    t.assert.strictEqual(evaluate('123456'), 123456n)
  })

  test('should parse negative decimal integers', (t) => {
    t.assert.strictEqual(evaluate('-42'), -42n)
    t.assert.strictEqual(evaluate('-1'), -1n)
    t.assert.strictEqual(evaluate('-999'), -999n)
  })

  test('should parse hexadecimal integers with lowercase x', (t) => {
    t.assert.strictEqual(evaluate('0x0'), 0n)
    t.assert.strictEqual(evaluate('0x1'), 1n)
    t.assert.strictEqual(evaluate('0xa'), 10n)
    t.assert.strictEqual(evaluate('0xf'), 15n)
    t.assert.strictEqual(evaluate('0x10'), 16n)
    t.assert.strictEqual(evaluate('0xff'), 255n)
    t.assert.strictEqual(evaluate('0x100'), 256n)
    t.assert.strictEqual(evaluate('0xdead'), 57005n)
    t.assert.strictEqual(evaluate('0xbeef'), 48879n)
  })

  test('should parse hexadecimal integers with uppercase X', (t) => {
    t.assert.strictEqual(evaluate('0X0'), 0n)
    t.assert.strictEqual(evaluate('0X1'), 1n)
    t.assert.strictEqual(evaluate('0XA'), 10n)
    t.assert.strictEqual(evaluate('0XF'), 15n)
    t.assert.strictEqual(evaluate('0X10'), 16n)
    t.assert.strictEqual(evaluate('0XFF'), 255n)
    t.assert.strictEqual(evaluate('0X100'), 256n)
    t.assert.strictEqual(evaluate('0XDEAD'), 57005n)
    t.assert.strictEqual(evaluate('0XBEEF'), 48879n)
  })

  test('should parse hexadecimal integers with mixed case', (t) => {
    t.assert.strictEqual(evaluate('0xDead'), 57005n)
    t.assert.strictEqual(evaluate('0xBeEf'), 48879n)
    t.assert.strictEqual(evaluate('0XdEaD'), 57005n)
    t.assert.strictEqual(evaluate('0XbEeF'), 48879n)
  })

  test('should parse negative hexadecimal integers', (t) => {
    t.assert.strictEqual(evaluate('-0x1'), -1n)
    t.assert.strictEqual(evaluate('-0xa'), -10n)
    t.assert.strictEqual(evaluate('-0xff'), -255n)
    t.assert.strictEqual(evaluate('-0X10'), -16n)
    t.assert.strictEqual(evaluate('-0XDEAD'), -57005n)
  })

  test('should compare integers correctly', (t) => {
    t.assert.strictEqual(evaluate('0x10 == 16'), true)
    t.assert.strictEqual(evaluate('0xff != 254'), true)
    t.assert.strictEqual(evaluate('0xa > 9'), true)
    t.assert.strictEqual(evaluate('0xf >= 15'), true)
    t.assert.strictEqual(evaluate('0x5 < 10'), true)
    t.assert.strictEqual(evaluate('0x8 <= 8'), true)
  })

  test('should handle large hex values', (t) => {
    t.assert.strictEqual(evaluate('0x7fffffff'), 2147483647n) // max signed 32-bit
    t.assert.strictEqual(evaluate('0x80000000'), 2147483648n) // min signed 32-bit + 1
    t.assert.strictEqual(evaluate('0xffffffff'), 4294967295n) // max unsigned 32-bit
  })

  test('should handle integer literals in complex expressions', (t) => {
    t.assert.strictEqual(evaluate('(0x10 + 0x20) * 2'), 96n) // (16 + 32) * 2
    t.assert.strictEqual(evaluate('0xff > 100 ? 0xa : 0xb'), 10n) // 255 > 100 ? 10 : 11
    t.assert.strictEqual(evaluate('[0x1, 0x2, 0x3][1]'), 2n) // array access
  })

  test('should allow integer with double comparisons', (t) => {
    t.assert.strictEqual(evaluate(`1.1 >= 1`), true)
    t.assert.strictEqual(evaluate(`1.0 >= 1`), true)
    t.assert.strictEqual(evaluate(`1.0 <= 1`), true)
    t.assert.strictEqual(evaluate(`0.9 <= 1`), true)
    t.assert.strictEqual(evaluate(`1.1 > 1`), true)
    t.assert.strictEqual(evaluate(`2 > 1.0`), true)
  })

  test('should not allow integer equality', (t) => {
    t.assert.throws(() => evaluate(`1.0 == 0`), /no such overload: double == int/)
    t.assert.throws(() => evaluate(`1.0 != 0`), /no such overload: double != int/)
  })

  test('should not allow integer equality', (t) => {
    t.assert.strictEqual(evaluate(`a + b`, {a: 1, b: 2}), 3)
  })
})

describe('integer parsing edge cases', () => {
  test('should throw error for invalid hex numbers', (t) => {
    t.assert.throws(() => evaluate('0x'), {
      name: 'ParseError',
      message: /Invalid hex integer/
    })
    t.assert.throws(() => evaluate('0X'), {
      name: 'ParseError',
      message: /Invalid hex integer/
    })
  })

  test('should throw error for incomplete hex numbers', (t) => {
    t.assert.throws(() => evaluate('0xg'), {
      name: 'ParseError',
      message: /Invalid hex integer/
    })
    t.assert.throws(() => evaluate('0Xz'), {
      name: 'ParseError',
      message: /Invalid hex integer/
    })
  })

  test('should handle hex numbers at token boundaries', (t) => {
    t.assert.strictEqual(evaluate('0xff+1'), 256n) // no space between hex and operator
    t.assert.strictEqual(evaluate('0x10*0x2'), 32n) // hex multiplication without spaces
  })

  test('throws integer overflow error with values out of bound', (t) => {
    t.assert.strictEqual(evaluate('9223372036854775807').valueOf(), 9223372036854775807n)
    t.assert.strictEqual(evaluate('-9223372036854775808').valueOf(), -9223372036854775808n)
    t.assert.strictEqual(evaluate('4611686018427387903 * 2').valueOf(), 9223372036854775806n)
    t.assert.strictEqual(evaluate('-4611686018427387904 * 2').valueOf(), -9223372036854775808n)
    t.assert.throws(() => evaluate(`9223372036854775807 + 1`), /integer overflow/)
    t.assert.throws(() => evaluate(`-9223372036854775808 - 1`), /integer overflow/)
    t.assert.throws(() => evaluate(`4611686018427387905 * 2`), /integer overflow/)
  })
})

describe('unsigned integer', () => {
  test('returns an unsigned integer', (t) => {
    const result = evaluate('42u')
    t.assert.ok(result instanceof UnsignedInt)
    t.assert.strictEqual(result.valueOf(), 42n)
  })

  test('should use unsigned integers in arithmetic operations', (t) => {
    t.assert.strictEqual(evaluate('10u + 20u').valueOf(), 30n)
    t.assert.strictEqual(evaluate('0xau + 0xbu').valueOf(), 21n) // 10 + 11
    t.assert.strictEqual(evaluate('100u - 50u').valueOf(), 50n)
    t.assert.strictEqual(evaluate('0xffu * 2u').valueOf(), 510n) // 255 * 2
  })

  test('should use integers in arithmetic operations', (t) => {
    t.assert.strictEqual(evaluate('0x10 + 0x20').valueOf(), 48n) // 16 + 32
    t.assert.strictEqual(evaluate('0xff - 0xf').valueOf(), 240n) // 255 - 15
    t.assert.strictEqual(evaluate('0xa * 0xb').valueOf(), 110n) // 10 * 11
    t.assert.strictEqual(evaluate('0x64 / 0x4').valueOf(), 25n) // 100 / 4
    t.assert.strictEqual(evaluate('0x17 % 0x5').valueOf(), 3n) // 23 % 5
  })

  test('should parse unsigned decimal integers', (t) => {
    t.assert.strictEqual(evaluate('42u').valueOf(), 42n)
    t.assert.strictEqual(evaluate('42U').valueOf(), 42n)
    t.assert.strictEqual(evaluate('0u').valueOf(), 0n)
    t.assert.strictEqual(evaluate('0U').valueOf(), 0n)
    t.assert.strictEqual(evaluate('4294967295u').valueOf(), 4294967295n) // max uint32
    t.assert.strictEqual(evaluate('4294967295U').valueOf(), 4294967295n)
  })

  test('should parse unsigned hexadecimal integers', (t) => {
    t.assert.strictEqual(evaluate('0x0u').valueOf(), 0n)
    t.assert.strictEqual(evaluate('0x0U').valueOf(), 0n)
    t.assert.strictEqual(evaluate('0xffu').valueOf(), 255n)
    t.assert.strictEqual(evaluate('0xffU').valueOf(), 255n)
    t.assert.strictEqual(evaluate('0xFFu').valueOf(), 255n)
    t.assert.strictEqual(evaluate('0XFFU').valueOf(), 255n)
    t.assert.strictEqual(evaluate('0xffffffffu').valueOf(), 4294967295n) // max uint32
    t.assert.strictEqual(evaluate('0xffffffffU').valueOf(), 4294967295n)
    t.assert.strictEqual(evaluate('0XFFFFFFFFu').valueOf(), 4294967295n)
    t.assert.strictEqual(evaluate('0XFFFFFFFFU').valueOf(), 4294967295n)
  })

  test('should compare unsigned integers correctly', (t) => {
    t.assert.ok(evaluate('dyn(42u) == 42'))
    t.assert.ok(evaluate('dyn(0xffu) == 255'))
    t.assert.ok(evaluate('100u > 99u'))
    t.assert.ok(evaluate('50u <= 50u'))
  })

  test('should handle unsigned integers in complex expressions', (t) => {
    t.assert.strictEqual(evaluate('(10u + 20u) * 2u').valueOf(), 60n)
    t.assert.strictEqual(evaluate('100u > 50u ? 1u : 0u').valueOf(), 1n)
    t.assert.strictEqual(evaluate('[1u, 2u, 3u][0]').valueOf(), 1n)
  })

  test('should handle unsigned suffix at token boundaries', (t) => {
    t.assert.strictEqual(evaluate('42u+1u').valueOf(), 43n) // no space between unsigned and operator
    t.assert.strictEqual(evaluate('0xffu*2u').valueOf(), 510n) // unsigned hex without spaces
  })

  test('should not allow unsigned suffix on floats', (t) => {
    t.assert.throws(() => evaluate('1.5u'), {
      name: 'ParseError',
      message: /Unexpected character: 'u'/
    })
    t.assert.throws(() => evaluate('3.14U'), {
      name: 'ParseError',
      message: /Unexpected character: 'U'/
    })
  })

  test('throws integer overflow error with values out of bound', (t) => {
    t.assert.strictEqual(evaluate('0u').valueOf(), 0n) // min uint64
    t.assert.strictEqual(evaluate('18446744073709551615u').valueOf(), 18446744073709551615n) // max uint64
    t.assert.strictEqual(evaluate('9223372036854775807u * 2u').valueOf(), 18446744073709551614n)
    t.assert.throws(() => evaluate(`0.1u`), /Unexpected character: 'u'/)
    t.assert.throws(() => evaluate(`0u - 1u`), /integer overflow/)
    t.assert.throws(() => evaluate(`-1u`), /no such overload: -uint/)
    t.assert.throws(() => evaluate(`18446744073709551615u + 1u`), /integer overflow/)
    t.assert.throws(() => evaluate(`9223372036854775808u * 2u`), /integer overflow/)
  })
})

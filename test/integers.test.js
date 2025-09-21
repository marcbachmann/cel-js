import {test, describe} from 'node:test'
import {evaluate} from '../lib/index.js'

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

  test('should parse unsigned decimal integers', (t) => {
    t.assert.strictEqual(evaluate('42u'), 42n)
    t.assert.strictEqual(evaluate('42U'), 42n)
    t.assert.strictEqual(evaluate('0u'), 0n)
    t.assert.strictEqual(evaluate('0U'), 0n)
    t.assert.strictEqual(evaluate('4294967295u'), 4294967295n) // max uint32
    t.assert.strictEqual(evaluate('4294967295U'), 4294967295n)
  })

  test('should parse unsigned hexadecimal integers', (t) => {
    t.assert.strictEqual(evaluate('0x0u'), 0n)
    t.assert.strictEqual(evaluate('0x0U'), 0n)
    t.assert.strictEqual(evaluate('0xffu'), 255n)
    t.assert.strictEqual(evaluate('0xffU'), 255n)
    t.assert.strictEqual(evaluate('0xFFu'), 255n)
    t.assert.strictEqual(evaluate('0XFFU'), 255n)
    t.assert.strictEqual(evaluate('0xffffffffu'), 4294967295n) // max uint32
    t.assert.strictEqual(evaluate('0xffffffffU'), 4294967295n)
    t.assert.strictEqual(evaluate('0XFFFFFFFFu'), 4294967295n)
    t.assert.strictEqual(evaluate('0XFFFFFFFFU'), 4294967295n)
  })

  test('should handle unsigned integer overflow correctly', (t) => {
    // Test that values larger than 32-bit get truncated to 32-bit unsigned
    // JavaScript's >>> operator converts to 32-bit unsigned
    t.assert.strictEqual(evaluate('4294967296u'), 0n) // 2^32 becomes 0
    t.assert.strictEqual(evaluate('4294967297u'), 1n) // 2^32 + 1 becomes 1
    t.assert.strictEqual(evaluate('0x100000000u'), 0n) // 2^32 in hex becomes 0
    t.assert.strictEqual(evaluate('0x100000001u'), 1n) // 2^32 + 1 in hex becomes 1
  })

  test('should use integers in arithmetic operations', (t) => {
    t.assert.strictEqual(evaluate('0x10 + 0x20'), 48n) // 16 + 32
    t.assert.strictEqual(evaluate('0xff - 0xf'), 240n) // 255 - 15
    t.assert.strictEqual(evaluate('0xa * 0xb'), 110n) // 10 * 11
    t.assert.strictEqual(evaluate('0x64 / 0x4'), 25n) // 100 / 4
    t.assert.strictEqual(evaluate('0x17 % 0x5'), 3n) // 23 % 5
  })

  test('throws integer overflow error with values out of bound', (t) => {
    t.assert.strictEqual(evaluate('9223372036854775807'), 9223372036854775807n)
    t.assert.strictEqual(evaluate('-9223372036854775808'), -9223372036854775808n)
    t.assert.strictEqual(evaluate('4611686018427387903 * 2'), 9223372036854775806n)
    t.assert.strictEqual(evaluate('-4611686018427387904 * 2'), -9223372036854775808n)
    t.assert.throws(() => evaluate(`9223372036854775807 + 1`), /integer overflow/)
    t.assert.throws(() => evaluate(`-9223372036854775808 - 1`), /integer overflow/)
    t.assert.throws(() => evaluate(`4611686018427387905 * 2`), /integer overflow/)
  })

  test('should use unsigned integers in arithmetic operations', (t) => {
    t.assert.strictEqual(evaluate('10u + 20u'), 30n)
    t.assert.strictEqual(evaluate('0xau + 0xbu'), 21n) // 10 + 11
    t.assert.strictEqual(evaluate('100u - 50u'), 50n)
    t.assert.strictEqual(evaluate('0xffu * 2u'), 510n) // 255 * 2
  })

  test('should compare integers correctly', (t) => {
    t.assert.strictEqual(evaluate('0x10 == 16'), true)
    t.assert.strictEqual(evaluate('0xff != 254'), true)
    t.assert.strictEqual(evaluate('0xa > 9'), true)
    t.assert.strictEqual(evaluate('0xf >= 15'), true)
    t.assert.strictEqual(evaluate('0x5 < 10'), true)
    t.assert.strictEqual(evaluate('0x8 <= 8'), true)
  })

  test('should compare unsigned integers correctly', (t) => {
    t.assert.strictEqual(evaluate('42u == 42'), true)
    t.assert.strictEqual(evaluate('0xffu == 255'), true)
    t.assert.strictEqual(evaluate('100u > 99u'), true)
    t.assert.strictEqual(evaluate('50u <= 50u'), true)
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

  test('should handle unsigned integers in complex expressions', (t) => {
    t.assert.strictEqual(evaluate('(10u + 20u) * 2u'), 60n)
    t.assert.strictEqual(evaluate('100u > 50u ? 1u : 0u'), 1n)
    t.assert.strictEqual(evaluate('[1u, 2u, 3u][0]'), 1n)
  })

  test('should handle mixed integer types in expressions', (t) => {
    t.assert.strictEqual(evaluate('10 + 0xa'), 20n) // decimal + hex
    t.assert.strictEqual(evaluate('0x10 + 20u'), 36n) // hex + unsigned
    t.assert.strictEqual(evaluate('5 * 0x2 + 3u'), 13n) // mixed arithmetic
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
    t.assert.throws(() => evaluate(`1.0 == 0`), /no such overload: Double == Integer/)
    t.assert.throws(() => evaluate(`1.0 != 0`), /no such overload: Double != Integer/)
  })
})

describe('integer parsing edge cases', () => {
  test('should throw error for invalid hex numbers', (t) => {
    t.assert.throws(() => evaluate('0x'), {
      name: 'EvaluationError',
      message: /Invalid hex integer/
    })
    t.assert.throws(() => evaluate('0X'), {
      name: 'EvaluationError',
      message: /Invalid hex integer/
    })
  })

  test('should throw error for incomplete hex numbers', (t) => {
    t.assert.throws(() => evaluate('0xg'), {
      name: 'EvaluationError',
      message: /Invalid hex integer/
    })
    t.assert.throws(() => evaluate('0Xz'), {
      name: 'EvaluationError',
      message: /Invalid hex integer/
    })
  })

  test('should handle hex numbers at token boundaries', (t) => {
    t.assert.strictEqual(evaluate('0xff+1'), 256n) // no space between hex and operator
    t.assert.strictEqual(evaluate('0x10*0x2'), 32n) // hex multiplication without spaces
  })

  test('should handle unsigned suffix at token boundaries', (t) => {
    t.assert.strictEqual(evaluate('42u+1'), 43n) // no space between unsigned and operator
    t.assert.strictEqual(evaluate('0xffu*2'), 510n) // unsigned hex without spaces
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
})

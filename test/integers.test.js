import {test, describe} from 'node:test'
import {evaluate} from '../index.js'

describe('integer literals', () => {
  test('should parse decimal integers', (t) => {
    t.assert.strictEqual(evaluate('42'), 42)
    t.assert.strictEqual(evaluate('0'), 0)
    t.assert.strictEqual(evaluate('123456'), 123456)
  })

  test('should parse negative decimal integers', (t) => {
    t.assert.strictEqual(evaluate('-42'), -42)
    t.assert.strictEqual(evaluate('-1'), -1)
    t.assert.strictEqual(evaluate('-999'), -999)
  })

  test('should parse hexadecimal integers with lowercase x', (t) => {
    t.assert.strictEqual(evaluate('0x0'), 0)
    t.assert.strictEqual(evaluate('0x1'), 1)
    t.assert.strictEqual(evaluate('0xa'), 10)
    t.assert.strictEqual(evaluate('0xf'), 15)
    t.assert.strictEqual(evaluate('0x10'), 16)
    t.assert.strictEqual(evaluate('0xff'), 255)
    t.assert.strictEqual(evaluate('0x100'), 256)
    t.assert.strictEqual(evaluate('0xdead'), 57005)
    t.assert.strictEqual(evaluate('0xbeef'), 48879)
  })

  test('should parse hexadecimal integers with uppercase X', (t) => {
    t.assert.strictEqual(evaluate('0X0'), 0)
    t.assert.strictEqual(evaluate('0X1'), 1)
    t.assert.strictEqual(evaluate('0XA'), 10)
    t.assert.strictEqual(evaluate('0XF'), 15)
    t.assert.strictEqual(evaluate('0X10'), 16)
    t.assert.strictEqual(evaluate('0XFF'), 255)
    t.assert.strictEqual(evaluate('0X100'), 256)
    t.assert.strictEqual(evaluate('0XDEAD'), 57005)
    t.assert.strictEqual(evaluate('0XBEEF'), 48879)
  })

  test('should parse hexadecimal integers with mixed case', (t) => {
    t.assert.strictEqual(evaluate('0xDead'), 57005)
    t.assert.strictEqual(evaluate('0xBeEf'), 48879)
    t.assert.strictEqual(evaluate('0XdEaD'), 57005)
    t.assert.strictEqual(evaluate('0XbEeF'), 48879)
  })

  test('should parse negative hexadecimal integers', (t) => {
    t.assert.strictEqual(evaluate('-0x1'), -1)
    t.assert.strictEqual(evaluate('-0xa'), -10)
    t.assert.strictEqual(evaluate('-0xff'), -255)
    t.assert.strictEqual(evaluate('-0X10'), -16)
    t.assert.strictEqual(evaluate('-0XDEAD'), -57005)
  })

  test('should parse unsigned decimal integers', (t) => {
    t.assert.strictEqual(evaluate('42u'), 42)
    t.assert.strictEqual(evaluate('42U'), 42)
    t.assert.strictEqual(evaluate('0u'), 0)
    t.assert.strictEqual(evaluate('0U'), 0)
    t.assert.strictEqual(evaluate('4294967295u'), 4294967295) // max uint32
    t.assert.strictEqual(evaluate('4294967295U'), 4294967295)
  })

  test('should parse unsigned hexadecimal integers', (t) => {
    t.assert.strictEqual(evaluate('0x0u'), 0)
    t.assert.strictEqual(evaluate('0x0U'), 0)
    t.assert.strictEqual(evaluate('0xffu'), 255)
    t.assert.strictEqual(evaluate('0xffU'), 255)
    t.assert.strictEqual(evaluate('0xFFu'), 255)
    t.assert.strictEqual(evaluate('0XFFU'), 255)
    t.assert.strictEqual(evaluate('0xffffffffu'), 4294967295) // max uint32
    t.assert.strictEqual(evaluate('0xffffffffU'), 4294967295)
    t.assert.strictEqual(evaluate('0XFFFFFFFFu'), 4294967295)
    t.assert.strictEqual(evaluate('0XFFFFFFFFU'), 4294967295)
  })

  test('should handle unsigned integer overflow correctly', (t) => {
    // Test that values larger than 32-bit get truncated to 32-bit unsigned
    // JavaScript's >>> operator converts to 32-bit unsigned
    t.assert.strictEqual(evaluate('4294967296u'), 0) // 2^32 becomes 0
    t.assert.strictEqual(evaluate('4294967297u'), 1) // 2^32 + 1 becomes 1
    t.assert.strictEqual(evaluate('0x100000000u'), 0) // 2^32 in hex becomes 0
    t.assert.strictEqual(evaluate('0x100000001u'), 1) // 2^32 + 1 in hex becomes 1
  })

  test('should use integers in arithmetic operations', (t) => {
    t.assert.strictEqual(evaluate('0x10 + 0x20'), 48) // 16 + 32
    t.assert.strictEqual(evaluate('0xff - 0xf'), 240) // 255 - 15
    t.assert.strictEqual(evaluate('0xa * 0xb'), 110) // 10 * 11
    t.assert.strictEqual(evaluate('0x64 / 0x4'), 25) // 100 / 4
    t.assert.strictEqual(evaluate('0x17 % 0x5'), 3) // 23 % 5
  })

  test('should use unsigned integers in arithmetic operations', (t) => {
    t.assert.strictEqual(evaluate('10u + 20u'), 30)
    t.assert.strictEqual(evaluate('0xau + 0xbu'), 21) // 10 + 11
    t.assert.strictEqual(evaluate('100u - 50u'), 50)
    t.assert.strictEqual(evaluate('0xffu * 2u'), 510) // 255 * 2
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
    t.assert.strictEqual(evaluate('0x7fffffff'), 2147483647) // max signed 32-bit
    t.assert.strictEqual(evaluate('0x80000000'), 2147483648) // min signed 32-bit + 1
    t.assert.strictEqual(evaluate('0xffffffff'), 4294967295) // max unsigned 32-bit
  })

  test('should handle integer literals in complex expressions', (t) => {
    t.assert.strictEqual(evaluate('(0x10 + 0x20) * 2'), 96) // (16 + 32) * 2
    t.assert.strictEqual(evaluate('0xff > 100 ? 0xa : 0xb'), 10) // 255 > 100 ? 10 : 11
    t.assert.strictEqual(evaluate('[0x1, 0x2, 0x3][1]'), 2) // array access
  })

  test('should handle unsigned integers in complex expressions', (t) => {
    t.assert.strictEqual(evaluate('(10u + 20u) * 2u'), 60)
    t.assert.strictEqual(evaluate('100u > 50u ? 1u : 0u'), 1)
    t.assert.strictEqual(evaluate('[1u, 2u, 3u][0]'), 1)
  })

  test('should handle mixed integer types in expressions', (t) => {
    t.assert.strictEqual(evaluate('10 + 0xa'), 20) // decimal + hex
    t.assert.strictEqual(evaluate('0x10 + 20u'), 36) // hex + unsigned
    t.assert.strictEqual(evaluate('5 * 0x2 + 3u'), 13) // mixed arithmetic
  })
})

describe('integer parsing edge cases', () => {
  test('should throw error for invalid hex numbers', (t) => {
    t.assert.throws(() => evaluate('0x'), {
      name: 'EvaluationError',
      message: /Invalid hex number/
    })
    t.assert.throws(() => evaluate('0X'), {
      name: 'EvaluationError',
      message: /Invalid hex number/
    })
  })

  test('should throw error for incomplete hex numbers', (t) => {
    t.assert.throws(() => evaluate('0xg'), {
      name: 'EvaluationError',
      message: /Invalid hex number/
    })
    t.assert.throws(() => evaluate('0Xz'), {
      name: 'EvaluationError',
      message: /Invalid hex number/
    })
  })

  test('should handle hex numbers at token boundaries', (t) => {
    t.assert.strictEqual(evaluate('0xff+1'), 256) // no space between hex and operator
    t.assert.strictEqual(evaluate('0x10*0x2'), 32) // hex multiplication without spaces
  })

  test('should handle unsigned suffix at token boundaries', (t) => {
    t.assert.strictEqual(evaluate('42u+1'), 43) // no space between unsigned and operator
    t.assert.strictEqual(evaluate('0xffu*2'), 510) // unsigned hex without spaces
  })

  test('should not allow unsigned suffix on floats', (t) => {
    t.assert.throws(() => evaluate('1.5u'), {
      name: 'EvaluationError',
      message: /Invalid float number: unsigned suffix not allowed/
    })
    t.assert.throws(() => evaluate('3.14U'), {
      name: 'EvaluationError',
      message: /Invalid float number: unsigned suffix not allowed/
    })
  })
})

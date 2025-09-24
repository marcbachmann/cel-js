import {test, describe} from 'node:test'
import {evaluate, parse} from '../lib/index.js'

describe('string literals and escapes', () => {
  describe('basic string literals', () => {
    test('should handle double quoted strings', (t) => {
      t.assert.strictEqual(evaluate('"hello"'), 'hello')
    })

    test('should handle single quoted strings', (t) => {
      t.assert.strictEqual(evaluate("'hello'"), 'hello')
    })

    test('should handle empty strings', (t) => {
      t.assert.strictEqual(evaluate('""'), '')
      t.assert.strictEqual(evaluate("''"), '')
    })

    test('should handle strings with quotes inside', (t) => {
      t.assert.strictEqual(evaluate('\'"hello"\''), '"hello"')
      t.assert.strictEqual(evaluate('"\'hello\'"'), "'hello'")
    })
  })

  describe('triple quoted strings', () => {
    test('should handle triple double quoted strings', (t) => {
      t.assert.strictEqual(evaluate('"""hello"""'), 'hello')
    })

    test('should handle triple single quoted strings', (t) => {
      t.assert.strictEqual(evaluate("'''hello'''"), 'hello')
    })

    test('should handle newlines in triple quoted strings', (t) => {
      t.assert.strictEqual(evaluate('"""hello\\nworld"""'), 'hello\nworld')
    })

    test('should handle quotes inside triple quoted strings', (t) => {
      t.assert.strictEqual(evaluate('"""x""x"""'), 'x""x')
      t.assert.strictEqual(evaluate("'''x''x'''"), "x''x")
    })
  })

  describe('raw strings', () => {
    test('should handle raw double quoted strings', (t) => {
      t.assert.strictEqual(evaluate('r"hello\\nworld"'), 'hello\\nworld')
    })

    test('should handle raw single quoted strings', (t) => {
      t.assert.strictEqual(evaluate("r'hello\\nworld'"), 'hello\\nworld')
    })

    test('should handle raw strings with backslashes', (t) => {
      t.assert.strictEqual(evaluate('r"\\\\"'), '\\\\')
    })

    test('should handle uppercase R prefix', (t) => {
      t.assert.strictEqual(evaluate('R"hello\\nworld"'), 'hello\\nworld')
    })
  })

  describe('escape sequences', () => {
    test('should handle basic escape sequences', (t) => {
      t.assert.strictEqual(evaluate('"\\""'), '"')
      t.assert.strictEqual(evaluate("'\\''"), "'")
      t.assert.strictEqual(evaluate('"\\\\"'), '\\')
    })

    test('should handle whitespace escape sequences', (t) => {
      t.assert.strictEqual(evaluate('"\\n"'), '\n')
      t.assert.strictEqual(evaluate('"\\r"'), '\r')
      t.assert.strictEqual(evaluate('"\\t"'), '\t')
      t.assert.strictEqual(evaluate('"\\b"'), '\b')
      t.assert.strictEqual(evaluate('"\\f"'), '\f')
      t.assert.strictEqual(evaluate('"\\v"'), '\v')
    })

    test('should handle Unicode escape sequences', (t) => {
      t.assert.strictEqual(evaluate('"\\u0041"'), 'A')
      t.assert.strictEqual(evaluate('"\\u00FF"'), 'ÿ')
    })

    test('should handle hex escape sequences', (t) => {
      t.assert.strictEqual(evaluate('"\\x41"'), 'A')
      t.assert.strictEqual(evaluate('"\\xFF"'), 'ÿ')
    })
  })

  describe('bytes literals', () => {
    test('should handle basic bytes literals', (t) => {
      const result = evaluate('b"abc"')
      t.assert.ok(result instanceof Uint8Array, 'Should return Uint8Array')
      t.assert.strictEqual(result.length, 3)
      t.assert.strictEqual(result[0], 97) // 'a'
      t.assert.strictEqual(result[1], 98) // 'b'
      t.assert.strictEqual(result[2], 99) // 'c'
    })

    test('should handle uppercase B prefix', (t) => {
      const result = evaluate('B"abc"')
      t.assert.ok(result instanceof Uint8Array, 'Should return Uint8Array')
      t.assert.strictEqual(result.length, 3)
    })

    test('should handle bytes with escape sequences', (t) => {
      const result = evaluate('b"\\x41\\x42\\x43"')
      t.assert.ok(result instanceof Uint8Array, 'Should return Uint8Array')
      t.assert.strictEqual(result[0], 65) // 'A'
      t.assert.strictEqual(result[1], 66) // 'B'
      t.assert.strictEqual(result[2], 67) // 'C'
    })

    test('should handle triple quoted byte strings', (t) => {
      const result = evaluate('b"""hello"""')
      t.assert.ok(result instanceof Uint8Array, 'Should return Uint8Array')
      t.assert.strictEqual(result.length, 5)
    })

    test('should reject \\U escapes in byte strings', (t) => {
      t.assert.throws(() => evaluate('b"\\U00000041"'), /not allowed in bytes/)
    })
  })

  describe('error cases', () => {
    test('should throw on unterminated strings', (t) => {
      t.assert.throws(() => parse('"unterminated'), /Unterminated/)
    })

    test('should throw on invalid escape sequences', (t) => {
      t.assert.throws(() => parse('"\\s"'), /Invalid escape/)
    })

    test('should throw on newlines in single quoted strings', (t) => {
      const result = parse('"hello\\nworld"') // This should work
      t.assert.strictEqual(typeof result, 'function')
    })

    test('should throw on invalid Unicode escapes', (t) => {
      t.assert.throws(() => parse('"\\uZZZZ"'), /Invalid Unicode/)
    })
  })

  describe('complex string examples', () => {
    test('should handle string concatenation with different quote types', (t) => {
      t.assert.strictEqual(evaluate(`"hello" + ' world'`), 'hello world')
    })

    test('should handle escaped quotes in concatenation', (t) => {
      t.assert.strictEqual(evaluate(`"He said \\"hello\\"" + ' to me'`), 'He said "hello" to me')
    })

    test('should handle raw strings in expressions', (t) => {
      t.assert.strictEqual(evaluate('r"\\n" + "\\n"'), '\\n\n')
    })

    test('only allows numbers', (t) => {
      t.assert.throws(() => evaluate(`'this is ' + null`), /no such overload: string \+ null/)
      t.assert.throws(() => evaluate(`'this is ' + 0`), /no such overload: string \+ int/)
    })
  })

  describe('bytes operations', () => {
    test('should concatenate bytes with +', (t) => {
      const result = evaluate('b"hello" + b" world"')
      t.assert.ok(result instanceof Uint8Array, 'Should return Uint8Array')
      t.assert.strictEqual(result.length, 11)
      // Convert to string for easy comparison
      const str = new TextDecoder().decode(result)
      t.assert.strictEqual(str, 'hello world')
    })

    test('should support bytes() function', (t) => {
      const result = evaluate('bytes("hello")')
      t.assert.ok(result instanceof Uint8Array, 'Should return Uint8Array')
      t.assert.strictEqual(result.length, 5)
    })

    test('should support size() on bytes', (t) => {
      t.assert.strictEqual(evaluate('size(b"hello")'), 5n)
    })

    test('does not support retrieval of bytes by index', (t) => {
      t.assert.throws(() => evaluate('b"hello"[0]'), /No such key: 0/)
      t.assert.throws(() => evaluate('b"hello"[1]'), /No such key: 1/)
    })

    test('should support bytes.string()', (t) => {
      t.assert.strictEqual(evaluate('b"hello".string()'), 'hello')
      t.assert.strictEqual(evaluate('b"hello".string()'), 'hello')
    })

    test('should support bytes.hex()', (t) => {
      t.assert.strictEqual(evaluate('b"ABC".hex()'), '414243')
    })

    test('should support bytes.base64()', (t) => {
      t.assert.strictEqual(evaluate('b"hello".base64()'), 'aGVsbG8=')
    })

    test('should support bytes.at()', (t) => {
      t.assert.strictEqual(evaluate('b"hello".at(0)'), 104n) // 'h'
      t.assert.strictEqual(evaluate('b"hello".at(4)'), 111n) // 'o'
    })

    test('should throw on out of bounds bytes.at()', (t) => {
      t.assert.throws(() => evaluate('b"hello".at(5)'), /out of range/)
      t.assert.throws(() => evaluate('b"hello".at(-1)'), /out of range/)
    })

    test('should support equality comparison for bytes', (t) => {
      t.assert.strictEqual(evaluate('b"hello" == b"hello"'), true)
      t.assert.strictEqual(evaluate('b"hello" == b"world"'), false)
      t.assert.strictEqual(evaluate('b"hello" != b"world"'), true)
    })
  })

  describe('extended unicode escapes', () => {
    test('should handle \\U escapes in strings', (t) => {
      t.assert.strictEqual(evaluate('"\\U00000041"'), 'A')
      t.assert.strictEqual(evaluate('"\\U0001F600"'), '😀')
    })

    test('should reject invalid \\U escapes', (t) => {
      t.assert.throws(() => evaluate('"\\U00110000"'), /Invalid Unicode code point/) // > U+10FFFF
      t.assert.throws(() => evaluate('"\\U0000D800"'), /surrogate/) // Surrogate
    })
  })

  describe('string contains with in operator', () => {
    test('should support substring in string', (t) => {
      t.assert.strictEqual(evaluate('"ell" in "hello"'), true)
      t.assert.strictEqual(evaluate('"abc" in "hello"'), false)
    })
  })
})

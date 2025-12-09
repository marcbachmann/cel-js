import {test, describe} from 'node:test'
import {assert, evaluate, expectEval, expectEvalThrows, expectParseThrows} from './helpers.js'

describe('string literals and escapes', () => {
  describe('basic string literals', () => {
    test('should handle double quoted strings', () => expectEval('"hello"', 'hello'))
    test('should handle single quoted strings', () => expectEval("'hello'", 'hello'))

    test('should handle empty strings', () => {
      expectEval('""', '')
      expectEval("''", '')
    })

    test('should handle strings with quotes inside', () => {
      expectEval(`'"hello"'`, '"hello"')
      expectEval(`"'hello'"`, "'hello'")
    })
  })

  describe('triple quoted strings', () => {
    test('should handle triple double quoted strings', () => expectEval('"""hello"""', 'hello'))
    test('should handle triple single quoted strings', () => expectEval("'''hello'''", 'hello'))

    test('should handle newlines in triple quoted strings', () => {
      expectEval('"""hello\\nworld"""', 'hello\nworld')
    })

    test('should handle quotes inside triple quoted strings', () => {
      expectEval('"""x""x"""', 'x""x')
      expectEval("'''x''x'''", "x''x")
    })
  })

  describe('raw strings', () => {
    test('should handle raw double quoted strings', () => {
      expectEval('r"hello\\nworld"', 'hello\\nworld')
    })

    test('should handle raw single quoted strings', () => {
      expectEval("r'hello\\nworld'", 'hello\\nworld')
    })

    test('should handle raw strings with backslashes', () => {
      expectEval('r"\\\\"', '\\\\')
    })

    test('should handle uppercase R prefix', () => {
      expectEval('R"hello\\nworld"', 'hello\\nworld')
    })
  })

  describe('escape sequences', () => {
    test('should handle basic escape sequences', () => {
      expectEval('"\\""', '"')
      expectEval("'\\''", "'")
      expectEval('"\\\\"', '\\')
    })

    test('should handle whitespace escape sequences', () => {
      expectEval('"\\n"', '\n')
      expectEval('"\\r"', '\r')
      expectEval('"\\t"', '\t')
      expectEval('"\\b"', '\b')
      expectEval('"\\f"', '\f')
      expectEval('"\\v"', '\v')
    })

    test('should handle Unicode escape sequences', () => {
      expectEval('"\\u0041"', 'A')
      expectEval('"\\u00FF"', 'ÿ')
    })

    test('should handle hex escape sequences', () => {
      expectEval('"\\x41"', 'A')
      expectEval('"\\xFF"', 'ÿ')
    })
  })

  describe('bytes literals', () => {
    test('should handle basic bytes literals', () => {
      const result = evaluate('b"abc"')
      assert.ok(result instanceof Uint8Array, 'Should return Uint8Array')
      assert.strictEqual(result.length, 3)
      assert.strictEqual(result[0], 97) // 'a'
      assert.strictEqual(result[1], 98) // 'b'
      assert.strictEqual(result[2], 99) // 'c'
    })

    test('should handle uppercase B prefix', () => {
      const result = evaluate('B"abc"')
      assert.ok(result instanceof Uint8Array, 'Should return Uint8Array')
      assert.strictEqual(result.length, 3)
    })

    test('should handle bytes with escape sequences', () => {
      const result = evaluate('b"\\x41\\x42\\x43"')
      assert.ok(result instanceof Uint8Array, 'Should return Uint8Array')
      assert.strictEqual(result[0], 65) // 'A'
      assert.strictEqual(result[1], 66) // 'B'
      assert.strictEqual(result[2], 67) // 'C'
    })

    test('should handle triple quoted byte strings', () => {
      const result = evaluate('b"""hello"""')
      assert.ok(result instanceof Uint8Array, 'Should return Uint8Array')
      assert.strictEqual(result.length, 5)
    })

    test('should reject \\U escapes in byte strings', () => {
      expectEvalThrows('b"\\U00000041"', /not allowed in bytes/)
    })
  })

  describe('error cases', () => {
    test('should throw on unterminated strings', () => {
      expectParseThrows('"unterminated', /Unterminated/)
    })

    test('should throw on invalid escape sequences', () => {
      expectParseThrows('"\\s"', /Invalid escape/)
      expectParseThrows('"\\ "', /Invalid escape/)
    })

    test('should throw on newlines in single quoted strings', () => {
      expectParseThrows('"\n"', /Newlines not allowed in single-quoted strings/)

      // Escaped \n should be fine
      expectEval('"hello\\nworld"', 'hello\nworld')
    })

    test('should throw on invalid Unicode escapes', () => {
      expectParseThrows('"\\uZZZZ"', /Invalid Unicode/)
    })
  })

  describe('complex string examples', () => {
    test('should handle string concatenation with different quote types', () => {
      expectEval(`"hello" + ' world'`, 'hello world')
    })

    test('should handle escaped quotes in concatenation', () => {
      expectEval(`"He said \\"hello\\"" + ' to me'`, 'He said "hello" to me')
    })

    test('should handle raw strings in expressions', () => {
      expectEval('r"\\n" + "\\n"', '\\n\n')
    })

    test('only allows numbers', () => {
      expectEvalThrows(`'this is ' + null`, /no such overload: string \+ null/)
      expectEvalThrows(`'this is ' + 0`, /no such overload: string \+ int/)
      expectEvalThrows('"ell" in "hello"', /no such overload: string in string/)
    })
  })

  describe('bytes operations', () => {
    test('should concatenate bytes with +', () => {
      const result = evaluate('b"hello" + b" world"')
      assert.ok(result instanceof Uint8Array, 'Should return Uint8Array')
      assert.strictEqual(result.length, 11)
      // Convert to string for easy comparison
      const str = new TextDecoder().decode(result)
      assert.strictEqual(str, 'hello world')
    })

    test('should support bytes() function', () => {
      const result = evaluate('bytes("hello")')
      assert.ok(result instanceof Uint8Array, 'Should return Uint8Array')
      assert.strictEqual(result.length, 5)
    })

    test('should support size() on bytes', () => {
      expectEval('size(b"hello")', 5n)
    })

    test('does not support retrieval of bytes by index', () => {
      const err = /Cannot index type 'bytes' with type 'int'/
      assert.throws(() => evaluate('b"hello"[0]'), err)
      assert.throws(() => evaluate('b"hello"[1]'), err)
    })

    test('should support bytes.string()', () => {
      expectEval('b"hello".string()', 'hello')
      expectEval('b"hello".string()', 'hello')
    })

    test('should support bytes.hex()', () => {
      expectEval('b"ABC".hex()', '414243')
    })

    test('should support bytes.base64()', () => {
      expectEval('b"hello".base64()', 'aGVsbG8=')
    })

    test('should support bytes.at()', () => {
      expectEval('b"hello".at(0)', 104n) // 'h'
      expectEval('b"hello".at(4)', 111n) // 'o'
    })

    test('should throw on out of bounds bytes.at()', () => {
      expectEvalThrows('b"hello".at(5)', /out of range/)
      expectEvalThrows('b"hello".at(-1)', /out of range/)
    })

    test('should support equality comparison for bytes', () => {
      expectEval('b"hello" == b"hello"', true)
      expectEval('b"hello" == b"world"', false)
      expectEval('b"hello" != b"world"', true)
    })
  })

  describe('extended unicode escapes', () => {
    test('should handle \\U escapes in strings', () => {
      expectEval('"\\U00000041"', 'A')
      expectEval('"\\U0001F600"', '😀')
    })

    test('should reject invalid \\U escapes', () => {
      expectEvalThrows('"\\U00110000"', /Invalid Unicode escape/)
      expectEvalThrows('"\\U0000D800"', /Invalid Unicode surrogate/)
    })
  })
})

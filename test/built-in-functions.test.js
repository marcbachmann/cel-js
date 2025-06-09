import {test, describe} from 'node:test'
import {evaluate} from '../index.js'

describe('built-in functions', () => {
  describe('size function', () => {
    describe('arrays', () => {
      test('should return 0 for empty array', (t) => {
        t.assert.strictEqual(evaluate('size([])'), 0)
      })

      test('should return 1 for one element array', (t) => {
        t.assert.strictEqual(evaluate('size([1])'), 1)
      })

      test('should return 3 for three element array', (t) => {
        t.assert.strictEqual(evaluate('size([1, 2, 3])'), 3)
      })
    })

    describe('objects', () => {
      test('should return 0 for empty object', (t) => {
        t.assert.strictEqual(evaluate('size({})'), 0)
      })

      test('should return 1 for one property object', (t) => {
        t.assert.strictEqual(evaluate('size({"a": 1})'), 1)
      })

      test('should return 3 for three property object', (t) => {
        const result = evaluate('size({"a": 1, "b": 2, "c": 3})')
        t.assert.strictEqual(result, 3)
      })
    })

    describe('strings', () => {
      test('should return 0 for empty string', (t) => {
        t.assert.strictEqual(evaluate('size("")'), 0)
      })

      test('should return length of string', (t) => {
        t.assert.strictEqual(evaluate('size("abc")'), 3)
      })

      test('should handle unicode characters', (t) => {
        t.assert.strictEqual(evaluate('size("hello 😄")'), 7)
        t.assert.strictEqual(evaluate('size("hello 👨‍❤️‍💋‍👨")'), 14)
      })
    })

    test('should throw error for unsupported types', (t) => {
      t.assert.throws(() => evaluate('size(123)'), /size\(\) type error/)
      t.assert.throws(() => evaluate('size(true)'), /size\(\) type error/)
      t.assert.throws(() => evaluate('size(null)'), /size\(\) type error/)
    })
  })

  describe('Date/Time functions', () => {
    const christmas = new Date('2023-12-25T12:30:45.500Z') // Monday
    const newyear = new Date('2024-01-01T00:00:00Z')
    const context = {christmas, newyear}

    describe('getDate function', () => {
      test('should return day of month (1-based) in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getDate()', context), 25)
      })

      test('should return day of month with timezone', (t) => {
        // Christmas at midnight UTC is Dec 24 in Los Angeles
        const utcMidnight = {date: new Date('2023-12-25T00:00:00Z')}
        t.assert.strictEqual(evaluate('date.getDate("America/Los_Angeles")', utcMidnight), 24)
      })
    })

    describe('getDayOfMonth function', () => {
      test('should return day of month (0-based) in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getDayOfMonth()', context), 24)
      })

      test('should return day of month with timezone', (t) => {
        const utcMidnight = {date: new Date('2023-12-25T00:00:00Z')}
        t.assert.strictEqual(evaluate('date.getDayOfMonth("America/Los_Angeles")', utcMidnight), 23)
      })
    })

    describe('getDayOfWeek function', () => {
      test('should return day of week (0=Sunday) in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getDayOfWeek()', context), 1) // Monday
      })

      test('should return day of week with timezone', (t) => {
        const utcMidnight = {date: new Date('2023-12-25T00:00:00Z')}
        t.assert.strictEqual(evaluate('date.getDayOfWeek("America/Los_Angeles")', utcMidnight), 0) // Sunday
      })
    })

    describe('getDayOfYear function', () => {
      test('should return day of year (0-based) in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getDayOfYear()', context), 358)
      })

      test('should return 0 for January 1st', (t) => {
        t.assert.strictEqual(evaluate('newyear.getDayOfYear()', context), 0)
      })

      test('should handle leap year', (t) => {
        const leapYear = {date: new Date('2024-12-31T12:00:00Z')}
        t.assert.strictEqual(evaluate('date.getDayOfYear()', leapYear), 365) // 366 days total, 0-based
      })
    })

    describe('getFullYear function', () => {
      test('should return full year in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getFullYear()', context), 2023)
      })

      test('should return full year with timezone', (t) => {
        t.assert.strictEqual(evaluate('christmas.getFullYear("Europe/London")', context), 2023)
      })
    })

    describe('getHours function', () => {
      test('should return hours in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getHours()', context), 12)
      })

      test('should return hours with timezone', (t) => {
        // 12:30 UTC = 04:30 PST (8 hours behind)
        t.assert.strictEqual(evaluate('christmas.getHours("America/Los_Angeles")', context), 4)
      })
    })

    describe('getMinutes function', () => {
      test('should return minutes in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getMinutes()', context), 30)
      })

      test('should return minutes with timezone', (t) => {
        t.assert.strictEqual(evaluate('christmas.getMinutes("Asia/Tokyo")', context), 30)
      })
    })

    describe('getSeconds function', () => {
      test('should return seconds in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getSeconds()', context), 45)
      })

      test('should return seconds with timezone', (t) => {
        t.assert.strictEqual(evaluate('christmas.getSeconds("Europe/Paris")', context), 45)
      })
    })

    describe('getMilliseconds function', () => {
      test('should return milliseconds in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getMilliseconds()', context), 500)
      })

      test('should return milliseconds with timezone', (t) => {
        t.assert.strictEqual(
          evaluate('christmas.getMilliseconds("Australia/Sydney")', context),
          500
        )
      })
    })

    describe('getMonth function', () => {
      test('should return month (0-based) in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getMonth()', context), 11) // December
      })

      test('should return 0 for January', (t) => {
        t.assert.strictEqual(evaluate('newyear.getMonth()', context), 0) // January
      })

      test('should return month with timezone', (t) => {
        t.assert.strictEqual(evaluate('christmas.getMonth("America/New_York")', context), 11)
      })
    })

    describe('integration with timestamp function', () => {
      test('should work with timestamp() function', (t) => {
        t.assert.strictEqual(evaluate('timestamp("2023-12-25T12:00:00Z").getFullYear()'), 2023)
        t.assert.strictEqual(evaluate('timestamp("2023-12-25T12:00:00Z").getMonth()'), 11)
        t.assert.strictEqual(evaluate('timestamp("2023-12-25T12:00:00Z").getDayOfWeek()'), 1)
      })

      test('should work with timestamp and timezone', (t) => {
        t.assert.strictEqual(
          evaluate('timestamp("2023-12-25T00:00:00Z").getDate("America/Los_Angeles")'),
          24
        )
      })
    })

    describe('complex expressions', () => {
      test('should work in boolean expressions', (t) => {
        const result = evaluate('christmas.getMonth() == 11 && christmas.getDate() == 25', context)
        t.assert.strictEqual(result, true)
      })

      test('should work in ternary expressions', (t) => {
        const result = evaluate('christmas.getDayOfWeek() == 1 ? "Monday" : "Other"', context)
        t.assert.strictEqual(result, 'Monday')
      })

      test('should work in arithmetic expressions', (t) => {
        const result = evaluate('christmas.getFullYear() * 100 + christmas.getMonth() + 1', context)
        t.assert.strictEqual(result, 202312)
      })
    })
  })

  describe('startsWith function', () => {
    describe('method call syntax', () => {
      describe('basic functionality', () => {
        test('should return true when string starts with prefix', (t) => {
          t.assert.strictEqual(evaluate('"hello world".startsWith("hello")'), true)
        })

        test('should return false when string does not start with prefix', (t) => {
          t.assert.strictEqual(evaluate('"hello world".startsWith("world")'), false)
        })

        test('should return true when prefix is empty string', (t) => {
          t.assert.strictEqual(evaluate('"hello".startsWith("")'), true)
        })

        test('should return true when string and prefix are identical', (t) => {
          t.assert.strictEqual(evaluate('"hello".startsWith("hello")'), true)
        })

        test('should return false when prefix is longer than string', (t) => {
          t.assert.strictEqual(evaluate('"hi".startsWith("hello")'), false)
        })

        test('should work with empty string', (t) => {
          t.assert.strictEqual(evaluate('"".startsWith("")'), true)
          t.assert.strictEqual(evaluate('"".startsWith("a")'), false)
        })
      })

      describe('case sensitivity', () => {
        test('should be case sensitive', (t) => {
          t.assert.strictEqual(evaluate('"Hello".startsWith("hello")'), false)
          t.assert.strictEqual(evaluate('"Hello".startsWith("Hello")'), true)
          t.assert.strictEqual(evaluate('"HELLO".startsWith("hello")'), false)
        })
      })

      describe('unicode support', () => {
        test('should work with unicode characters', (t) => {
          t.assert.strictEqual(evaluate('"😄 hello".startsWith("😄")'), true)
          t.assert.strictEqual(evaluate('"😄 hello".startsWith("hello")'), false)
          t.assert.strictEqual(evaluate('"café".startsWith("caf")'), true)
          t.assert.strictEqual(evaluate('"naïve".startsWith("naï")'), true)
        })

        test('should handle complex unicode sequences', (t) => {
          t.assert.strictEqual(evaluate('"👨‍❤️‍💋‍👨 love".startsWith("👨‍❤️‍💋‍👨")'), true)
        })
      })

      describe('special characters', () => {
        test('should work with whitespace', (t) => {
          t.assert.strictEqual(evaluate('" hello".startsWith(" ")'), true)
          t.assert.strictEqual(evaluate('"""\thello""".startsWith("""\t""")'), true)
          t.assert.strictEqual(evaluate('"""\nhello""".startsWith("""\n""")'), true)
        })

        test('should work with escape sequences', (t) => {
          t.assert.strictEqual(evaluate('"\\\\hello".startsWith("\\\\")'), true)
          t.assert.strictEqual(evaluate('"\\\\path".startsWith("\\\\")'), true)
        })
      })

      describe('with variables', () => {
        const context = {
          greeting: 'hello world',
          prefix: 'hello',
          emptyStr: '',
          message: 'Good morning!'
        }

        test('should work with string variables', (t) => {
          t.assert.strictEqual(evaluate('greeting.startsWith(prefix)', context), true)
          t.assert.strictEqual(evaluate('greeting.startsWith("world")', context), false)
          t.assert.strictEqual(evaluate('message.startsWith("Good")', context), true)
        })

        test('should work with empty string variable', (t) => {
          t.assert.strictEqual(evaluate('greeting.startsWith(emptyStr)', context), true)
          t.assert.strictEqual(evaluate('emptyStr.startsWith("")', context), true)
          t.assert.strictEqual(evaluate('emptyStr.startsWith("a")', context), false)
        })
      })

      describe('error handling', () => {
        test('should throw error when called on non-string', (t) => {
          t.assert.throws(
            () => evaluate('(123).startsWith("1")'),
            /Function not found: startsWith for Number/
          )
        })

        test('should throw error when argument is not a string', (t) => {
          const error = /startsWith\(\) requires a string argument/
          t.assert.throws(() => evaluate('"hello".startsWith(123)'), error)
          t.assert.throws(() => evaluate('"hello".startsWith(true)'), error)
          t.assert.throws(() => evaluate('"hello".startsWith(null)'), error)
          t.assert.throws(() => evaluate('"hello".startsWith([])'), error)
          t.assert.throws(() => evaluate('"hello".startsWith({})'), error)
        })

        test('should work when called with variables of correct type', (t) => {
          const context = {
            str: 'hello world',
            num: 123,
            bool: true,
            arr: [],
            obj: {}
          }

          t.assert.strictEqual(evaluate('str.startsWith("hello")', context), true)

          t.assert.throws(
            () => evaluate('num.startsWith("1")', context),
            /Function not found: startsWith for Number/
          )
          t.assert.throws(
            () => evaluate('bool.startsWith("t")', context),
            /Function not found: startsWith for Boolean/
          )
          t.assert.throws(
            () => evaluate('arr.startsWith("")', context),
            /Function not found: startsWith for Array/
          )
          t.assert.throws(
            () => evaluate('obj.startsWith("")', context),
            /Function not found: startsWith for Object/
          )
        })
      })
    })

    describe('syntax consistency', () => {
      test('both syntaxes should produce identical results', (t) => {
        // Test cases that should be identical between both syntaxes
        const testCases = [
          ['"hello"', '"he"', true],
          ['"hello"', '"lo"', false],
          ['"hello"', '""', true],
          ['"hello"', '"hello"', true],
          ['""', '""', true],
          ['""', '"a"', false]
        ]

        testCases.forEach(([str, prefix, expected]) => {
          const methodResult = evaluate(`${str}.startsWith(${prefix})`)

          t.assert.strictEqual(
            methodResult,
            expected,
            `Method syntax failed for ${str}.startsWith(${prefix})`
          )
        })
      })

      test('both syntaxes should throw same errors for invalid arguments', (t) => {
        // Test error consistency
        const errorCases = [
          ['"hello"', '123'],
          ['"hello"', 'true'],
          ['"hello"', 'null']
        ]

        errorCases.forEach(([str, invalidPrefix]) => {
          t.assert.throws(
            () => evaluate(`${str}.startsWith(${invalidPrefix})`),
            /startsWith\(\) requires a string argument/
          )
        })
      })
    })

    describe('complex expressions', () => {
      test('should work in boolean expressions with both syntaxes', (t) => {
        t.assert.strictEqual(
          evaluate('"hello".startsWith("he") || startsWith("world", "he")'),
          true
        )
        t.assert.strictEqual(
          evaluate('"hello".startsWith("wo") || "world".startsWith("he")'),
          false
        )
      })

      test('should work in ternary expressions', (t) => {
        t.assert.strictEqual(evaluate('"hello".startsWith("he") ? "yes" : "no"'), 'yes')
      })

      test('should work with string concatenation', (t) => {
        const context = {prefix: 'hel'}
        t.assert.strictEqual(evaluate('("hel" + "lo").startsWith(prefix)', context), true)
      })
    })

    describe('edge cases', () => {
      test('should handle strings with quotes', (t) => {
        t.assert.strictEqual(evaluate('"\\"quoted\\"".startsWith("\\"")'), true)
        t.assert.strictEqual(evaluate("'single quotes'.startsWith('single')"), true)
      })

      test('should handle very long strings', (t) => {
        const longStr = 'a'.repeat(10000)
        const context = {longStr}
        t.assert.strictEqual(evaluate('longStr.startsWith("a")', context), true)
        t.assert.strictEqual(evaluate('longStr.startsWith("b")', context), false)
      })

      test('should handle strings with null bytes', (t) => {
        t.assert.strictEqual(evaluate('"hello\\x00world".startsWith("hello")', {}), true)
      })
    })
  })
})

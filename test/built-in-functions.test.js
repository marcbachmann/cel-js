import {test, describe} from 'node:test'
import {evaluate} from '../lib/index.js'
import {Duration} from '../lib/functions.js'

describe('built-in functions', () => {
  describe('size function', () => {
    describe('arrays', () => {
      test('should return 0 for empty array', (t) => {
        t.assert.strictEqual(evaluate('size([])'), 0n)
      })

      test('should return 1 for one element array', (t) => {
        t.assert.strictEqual(evaluate('size([1])'), 1n)
      })

      test('should return 3 for three element array', (t) => {
        t.assert.strictEqual(evaluate('size([1, 2, 3])'), 3n)
      })
    })

    describe('objects', () => {
      test('should return 0 for empty object', (t) => {
        t.assert.strictEqual(evaluate('size({})'), 0n)
      })

      test('should return 1 for one property object', (t) => {
        t.assert.strictEqual(evaluate('size({"a": 1})'), 1n)
      })

      test('should return 3 for three property object', (t) => {
        const result = evaluate('size({"a": 1, "b": 2, "c": 3})')
        t.assert.strictEqual(result, 3n)
      })
    })

    describe('strings', () => {
      test('should return 0 for empty string', (t) => {
        t.assert.strictEqual(evaluate('size("")'), 0n)
        t.assert.strictEqual(evaluate('"".size()'), 0n)
      })

      test('should return length of string', (t) => {
        t.assert.strictEqual(evaluate('size("abc")'), 3n)
        t.assert.strictEqual(evaluate('"abc".size()'), 3n)
      })

      test('should handle unicode characters', (t) => {
        t.assert.strictEqual(evaluate('size("hello 😄")'), 7n)
        t.assert.strictEqual(evaluate('"hello 😄".size()'), 7n)
        t.assert.strictEqual(evaluate('size("hello 👨‍❤️‍💋‍👨")'), 14n)
        t.assert.strictEqual(evaluate('"hello 👨‍❤️‍💋‍👨".size()'), 14n)
      })
    })

    test('should throw error for unsupported types', (t) => {
      t.assert.throws(() => evaluate('size(123)'), /found no matching overload for 'size\(int\)'/)
      t.assert.throws(() => evaluate('size(true)'), /found no matching overload for 'size\(bool\)'/)
      t.assert.throws(() => evaluate('size(null)'), /found no matching overload for 'size\(null\)'/)
    })

    test('converts to a non-dynamic type', (t) => {
      t.assert.throws(() => evaluate('size("hello") == 1.0'), /no such overload/)
      t.assert.throws(() => evaluate('size(s) == 1.0', {s: 'hello'}), /no such overload/)
      t.assert.throws(() => evaluate('size(dyn("hello")) == 1.0'), /no such overload/)
      t.assert.throws(() => evaluate('s.size() == 1.0', {s: 'hello'}), /no such overload/)
      t.assert.throws(() => evaluate('dyn("hello").size() == 1.0'), /no such overload/)
    })
  })

  describe('google.protobuf.Duration functions', () => {
    test('returns Duration instance', (t) => {
      t.assert.ok(evaluate('duration("1h")') instanceof Duration)
    })

    test('is of type duration', (t) => {
      t.assert.ok(evaluate('type(duration("1h")) == google.protobuf.Duration'))
      t.assert.ok(evaluate('type(duration("1h")) == type(duration("2h"))'))
    })

    test('parses duration string', (t) => {
      t.assert.strictEqual(evaluate('duration("1h")').getMilliseconds(), 3600000n)
      t.assert.strictEqual(evaluate('duration("1h1h")').getMilliseconds(), 7200000n)
      t.assert.strictEqual(evaluate('duration("1.5h")').getMilliseconds(), 5400000n)
      t.assert.strictEqual(evaluate('duration("2m")').getMilliseconds(), 120000n)
      t.assert.strictEqual(evaluate('duration("2.5m")').getMilliseconds(), 150000n)
      t.assert.strictEqual(evaluate('duration("30s")').getMilliseconds(), 30000n)
      t.assert.strictEqual(evaluate('duration("30.5s")').getMilliseconds(), 30500n)
      t.assert.strictEqual(evaluate('duration("1ms")').getMilliseconds(), 1n)
      t.assert.strictEqual(evaluate('duration("1h2s3m.1m")').getMilliseconds(), 3788000n)
      t.assert.strictEqual(evaluate('duration("-1h2s3m.1m")').getMilliseconds(), -3788000n)
    })

    test('equality', (t) => {
      t.assert.strictEqual(evaluate('duration("1h") == duration("1h")'), true)
      t.assert.strictEqual(evaluate('duration("1h") == duration("2h")'), false)
      t.assert.strictEqual(evaluate('duration("1h") == duration("1h1m")'), false)
      t.assert.strictEqual(evaluate('duration("1h1m") == duration("1h")'), false)
      t.assert.strictEqual(evaluate('duration("1h") != duration("1h")'), false)
      t.assert.strictEqual(evaluate('duration("1h") != duration("2h")'), true)
      t.assert.strictEqual(evaluate('duration("1h") != duration("1h1m")'), true)
      t.assert.strictEqual(evaluate('duration("1h1m") != duration("1h")'), true)
    })

    test('relational', (t) => {
      t.assert.strictEqual(evaluate('duration("1h") < duration("2h")'), true)
      t.assert.strictEqual(evaluate('duration("2h") < duration("1h")'), false)
      t.assert.strictEqual(evaluate('duration("1h") < duration("1h1m")'), true)
      t.assert.strictEqual(evaluate('duration("1h1m") < duration("1h")'), false)
      t.assert.strictEqual(evaluate('duration("1h") <= duration("1h")'), true)
      t.assert.strictEqual(evaluate('duration("1h") <= duration("2h")'), true)
      t.assert.strictEqual(evaluate('duration("2h") <= duration("1h")'), false)
      t.assert.strictEqual(evaluate('duration("1h") <= duration("1h1m")'), true)
      t.assert.strictEqual(evaluate('duration("1h1m") <= duration("1h")'), false)
      t.assert.strictEqual(evaluate('duration("2h") > duration("1h")'), true)
      t.assert.strictEqual(evaluate('duration("1h") > duration("2h")'), false)
      t.assert.strictEqual(evaluate('duration("1h1m") > duration("1h")'), true)
      t.assert.strictEqual(evaluate('duration("1h") > duration("1h1m")'), false)
      t.assert.strictEqual(evaluate('duration("1h") >= duration("1h")'), true)
      t.assert.strictEqual(evaluate('duration("2h") >= duration("1h")'), true)
      t.assert.strictEqual(evaluate('duration("1h") >= duration("2h")'), false)
      t.assert.strictEqual(evaluate('duration("1h1m") >= duration("1h")'), true)
      t.assert.strictEqual(evaluate('duration("1h") >= duration("1h1m")'), false)
    })

    test('addition of durations', (t) => {
      t.assert.strictEqual(evaluate('duration("1h") + duration("1h")').getMilliseconds(), 7200000n)
      t.assert.strictEqual(evaluate('duration("1h") + duration("30m")').getMilliseconds(), 5400000n)
      t.assert.strictEqual(evaluate('duration("1s") + duration("1s1ms")').getMilliseconds(), 2001n)
    })

    test('addition of timestamp and duration', (t) => {
      t.assert.strictEqual(
        evaluate('timestamp("2025-01-01T00:00:00Z") + duration("1h1ms")').getTime(),
        new Date('2025-01-01T01:00:00.001Z').getTime()
      )
    })

    test('subtraction of timestamp and duration', (t) => {
      t.assert.strictEqual(
        evaluate('timestamp("2025-01-01T00:00:00Z") - duration("1h1ms")').getTime(),
        new Date('2024-12-31T22:59:59.999Z').getTime()
      )
    })
  })

  describe('google.protobuf.Timestamp functions', () => {
    const christmasTs = '2023-12-25T12:30:45.500Z'
    const newyearTs = '2024-01-01T00:00:00Z'
    const christmas = new Date(christmasTs) // Monday
    const newyear = new Date(newyearTs)
    const context = {christmas, christmasTs, newyear, newyearTs}

    test('is of type timestamp', (t) => {
      t.assert.ok(evaluate('type(timestamp("2023-12-25T00:00:00Z")) == google.protobuf.Timestamp'))
      t.assert.ok(
        evaluate(
          'type(timestamp("2023-12-25T00:00:00Z")) == type(timestamp("2023-12-25T10:00:00Z"))'
        )
      )
    })

    describe('timestamp function', () => {
      test('should parse valid RFC 3339 timestamp', (t) => {
        t.assert.deepEqual(evaluate(`timestamp(christmasTs)`, context), christmas)
        t.assert.deepEqual(
          evaluate(`timestamp('9999-12-31T23:59:59.999Z')`, context),
          new Date('9999-12-31T23:59:59.999Z')
        )
        t.assert.deepEqual(
          evaluate(`timestamp('0001-01-01T00:00:00Z')`, context),
          new Date('0001-01-01T00:00:00Z')
        )
      })

      test('allows integer unix timestamps', (t) => {
        t.assert.deepEqual(evaluate(`timestamp(0)`, context), new Date(0))
        t.assert.deepEqual(evaluate(`timestamp(1703507445)`, context), new Date(1703507445000))

        t.assert.deepEqual(
          evaluate(`timestamp(253402300799)`, context),
          new Date('9999-12-31T23:59:59Z')
        )
        t.assert.deepEqual(
          evaluate(`timestamp(-62135596800)`, context),
          new Date('0001-01-01T00:00:00Z')
        )
      })

      test('errors with too large dates (+-1)', (t) => {
        const intErr = /requires a valid integer unix timestamp/
        t.assert.throws(() => evaluate(`timestamp(253402300800)`, context), intErr)
        t.assert.throws(() => evaluate(`timestamp(-62135596801)`, context), intErr)

        const dateErr = /requires a string in ISO 8601 format/
        t.assert.throws(() => evaluate(`timestamp('10000-01-01T00:00:00Z')`, context), dateErr)
        t.assert.throws(() => evaluate(`timestamp('0000-01-01T00:00:00Z')`, context), dateErr)
      })

      test('supports equality operator', (t) => {
        t.assert.strictEqual(evaluate(`timestamp(0) == timestamp(0)`, context), true)
        t.assert.strictEqual(evaluate(`timestamp(100) == timestamp(100)`, context), true)
        t.assert.strictEqual(evaluate(`timestamp(0) == timestamp(100)`, context), false)
      })
    })

    describe('getDate function', () => {
      test('should return day of month (1-based) in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getDate()', context), 25n)
      })

      test('should return day of month with timezone', (t) => {
        // Christmas at midnight UTC is Dec 24 in Los Angeles
        const utcMidnight = {date: new Date('2023-12-25T00:00:00Z')}
        t.assert.strictEqual(evaluate('date.getDate("America/Los_Angeles")', utcMidnight), 24n)
      })
    })

    describe('getDayOfMonth function', () => {
      test('should return day of month (0-based) in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getDayOfMonth()', context), 24n)
      })

      test('should return day of month with timezone', (t) => {
        const utcMidnight = {date: new Date('2023-12-25T00:00:00Z')}
        t.assert.strictEqual(
          evaluate('date.getDayOfMonth("America/Los_Angeles")', utcMidnight),
          23n
        )
      })
    })

    describe('getDayOfWeek function', () => {
      test('should return day of week (0=Sunday) in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getDayOfWeek()', context), 1n) // Monday
      })

      test('should return day of week with timezone', (t) => {
        const utcMidnight = {date: new Date('2023-12-25T00:00:00Z')}
        t.assert.strictEqual(evaluate('date.getDayOfWeek("America/Los_Angeles")', utcMidnight), 0n) // Sunday
      })
    })

    describe('getDayOfYear function', () => {
      test('should return day of year (0-based) in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getDayOfYear()', context), 358n)
      })

      test('should return 0 for January 1st', (t) => {
        t.assert.strictEqual(evaluate('newyear.getDayOfYear()', context), 0n)
      })

      test('should handle leap year', (t) => {
        const leapYear = {date: new Date('2024-12-31T12:00:00Z')}
        t.assert.strictEqual(evaluate('date.getDayOfYear()', leapYear), 365n) // 366 days total, 0-based
      })
    })

    describe('getFullYear function', () => {
      test('should return full year in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getFullYear()', context), 2023n)
      })

      test('should return full year with timezone', (t) => {
        t.assert.strictEqual(evaluate('christmas.getFullYear("Europe/London")', context), 2023n)
      })
    })

    describe('getHours function', () => {
      test('should return hours in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getHours()', context), 12n)
      })

      test('should return hours with timezone', (t) => {
        // 12:30 UTC = 04:30 PST (8 hours behind)
        t.assert.strictEqual(evaluate('christmas.getHours("America/Los_Angeles")', context), 4n)
      })
    })

    describe('getMinutes function', () => {
      test('should return minutes in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getMinutes()', context), 30n)
      })

      test('should return minutes with timezone', (t) => {
        t.assert.strictEqual(evaluate('christmas.getMinutes("Asia/Tokyo")', context), 30n)
      })
    })

    describe('getSeconds function', () => {
      test('should return seconds in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getSeconds()', context), 45n)
      })

      test('should return seconds with timezone', (t) => {
        t.assert.strictEqual(evaluate('christmas.getSeconds("Europe/Paris")', context), 45n)
      })
    })

    describe('getMilliseconds function', () => {
      test('should return milliseconds in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getMilliseconds()', context), 500n)
      })

      test('should return milliseconds with timezone', (t) => {
        t.assert.strictEqual(
          evaluate('christmas.getMilliseconds("Australia/Sydney")', context),
          500n
        )
      })
    })

    describe('getMonth function', () => {
      test('should return month (0-based) in UTC', (t) => {
        t.assert.strictEqual(evaluate('christmas.getMonth()', context), 11n) // December
      })

      test('should return 0 for January', (t) => {
        t.assert.strictEqual(evaluate('newyear.getMonth()', context), 0n) // January
      })

      test('should return month with timezone', (t) => {
        t.assert.strictEqual(evaluate('christmas.getMonth("America/New_York")', context), 11n)
      })
    })

    describe('integration with timestamp function', () => {
      test('should work with timestamp() function', (t) => {
        t.assert.strictEqual(evaluate('timestamp("2023-12-25T12:00:00Z").getFullYear()'), 2023n)
        t.assert.strictEqual(evaluate('timestamp("2023-12-25T12:00:00Z").getMonth()'), 11n)
        t.assert.strictEqual(evaluate('timestamp("2023-12-25T12:00:00Z").getDayOfWeek()'), 1n)
      })

      test('should work with timestamp and timezone', (t) => {
        t.assert.strictEqual(
          evaluate('timestamp("2023-12-25T00:00:00Z").getDate("America/Los_Angeles")'),
          24n
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
        t.assert.strictEqual(result, 202312n)
      })
    })
  })

  describe('string.matches(regex):', () => {
    test('should return true for matching string', (t) => {
      t.assert.strictEqual(evaluate('"hello".matches("h.*o")'), true)
      t.assert.strictEqual(evaluate('"hello".matches("^h")'), true)
      t.assert.strictEqual(evaluate('"hello".matches("^hello$")'), true)
    })

    test('should return false for non-matching string', (t) => {
      t.assert.strictEqual(evaluate('"hello".matches("H.*o")'), false)
      t.assert.strictEqual(evaluate('"hello".matches("l$")'), false)
      t.assert.strictEqual(evaluate('"hello".matches("^ello$")'), false)
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
            /Function not found: 'startsWith' for value of type 'int'/
          )
        })

        test('should throw error when argument is not a string', (t) => {
          const error = /found no matching overload for 'string.startsWith/
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
            boolean: true,
            arr: [],
            obj: {}
          }

          t.assert.strictEqual(evaluate('str.startsWith("hello")', context), true)

          t.assert.throws(
            () => evaluate('num.startsWith("1")', context),
            /Function not found: 'startsWith' for value of type 'double'/
          )
          t.assert.throws(
            () => evaluate('boolean.startsWith("t")', context),
            /Function not found: 'startsWith' for value of type 'bool'/
          )
          t.assert.throws(
            () => evaluate('arr.startsWith("")', context),
            /Function not found: 'startsWith' for value of type 'list'/
          )
          t.assert.throws(
            () => evaluate('obj.startsWith("")', context),
            /Function not found: 'startsWith' for value of type 'map'/
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
          ['"hello"', '123', 'int'],
          ['"hello"', 'true', 'bool'],
          ['"hello"', 'null', 'null']
        ]

        errorCases.forEach(([str, invalidPrefix, argType]) => {
          t.assert.throws(
            () => evaluate(`${str}.startsWith(${invalidPrefix})`),
            new RegExp(`found no matching overload for 'string.startsWith\\(${argType}\\)`)
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

  describe('type function', () => {
    test('supports equality', (t) => {
      t.assert.strictEqual(evaluate('int == int'), true)
      t.assert.strictEqual(evaluate('type(1) == int'), true)
      t.assert.strictEqual(evaluate('double == double'), true)
      t.assert.strictEqual(evaluate('type(1.0) == double'), true)
      t.assert.strictEqual(evaluate(`string == string`), true)
      t.assert.strictEqual(evaluate(`type('string') == string`), true)
      t.assert.strictEqual(evaluate('bool == bool'), true)
      t.assert.strictEqual(evaluate('type(true) == bool'), true)
      t.assert.strictEqual(evaluate('type(false) == bool'), true)
      t.assert.strictEqual(evaluate('null_type == null_type'), true)
      t.assert.strictEqual(evaluate('type(null) == null_type'), true)
      t.assert.strictEqual(evaluate('bytes == bytes'), true)
      t.assert.strictEqual(evaluate('type(bytes("test")) == bytes'), true)
      t.assert.strictEqual(evaluate('list == list'), true)
      t.assert.strictEqual(evaluate('type([]) == list'), true)
      t.assert.strictEqual(evaluate('map == map'), true)
      t.assert.strictEqual(evaluate('type({}) == map'), true)
      t.assert.strictEqual(evaluate('type == type'), true)
      t.assert.strictEqual(evaluate('type(string) == type'), true)
    })

    test('supports inequality', (t) => {
      t.assert.strictEqual(evaluate('type(1) != type'), true)
      t.assert.strictEqual(evaluate('type(1.0) != type'), true)
      t.assert.strictEqual(evaluate(`type('string') != type`), true)
      t.assert.strictEqual(evaluate('type(true) != type'), true)
      t.assert.strictEqual(evaluate('type(false) != type'), true)
      t.assert.strictEqual(evaluate('type(null) != type'), true)
      t.assert.strictEqual(evaluate('type(bytes("test")) != type'), true)
      t.assert.strictEqual(evaluate('type([]) != type'), true)
      t.assert.strictEqual(evaluate('type({}) != type'), true)
    })

    test('throws on invalid comparisons', (t) => {
      t.assert.throws(() => evaluate('int > int'), /no such overload: type > type/)
      t.assert.throws(() => evaluate('int >= int'), /no such overload: type >= type/)
      t.assert.throws(() => evaluate('int < int'), /no such overload: type < type/)
      t.assert.throws(() => evaluate('int <= int'), /no such overload: type <= type/)
      t.assert.throws(() => evaluate('int + int'), /no such overload: type \+ type/)
      t.assert.throws(() => evaluate('int - int'), /no such overload: type - type/)
      t.assert.throws(() => evaluate('int * int'), /no such overload: type \* type/)
      t.assert.throws(() => evaluate('int / int'), /no such overload: type \/ type/)
      t.assert.throws(() => evaluate('int % int'), /no such overload: type % type/)
    })
  })

  describe('int function', () => {
    test('should return bigint', (t) => {
      t.assert.strictEqual(evaluate('int(42)'), 42n)
      t.assert.strictEqual(evaluate('int(3.14)'), 3n)
      t.assert.strictEqual(evaluate(`int('-5')`), -5n)
      t.assert.strictEqual(evaluate(`int('0')`), 0n)
      t.assert.strictEqual(evaluate(`int('-0')`), 0n)
      t.assert.strictEqual(evaluate(`int('9223372036854775807')`), 9223372036854775807n)
    })

    test('errors on integer overflow', (t) => {
      t.assert.throws(() => evaluate(`int(double('inf'))`), /integer overflow/)
      t.assert.throws(() => evaluate(`int(double('-inf'))`), /integer overflow/)
      t.assert.throws(() => evaluate(`int(double('nan'))`), /integer overflow/)
    })

    test('throws invalid integer', (t) => {
      t.assert.throws(() => evaluate(`int('9223372036854775808')`), /cannot convert to int/)
      t.assert.throws(() => evaluate(`int('0x01')`), /cannot convert to int/)
      t.assert.throws(() => evaluate(`int('1e10')`), /cannot convert to int/)
      t.assert.throws(() => evaluate(`int('3.1')`), /cannot convert to int/)
    })
  })

  describe('double function', () => {
    test('should return numbers as-is', (t) => {
      t.assert.strictEqual(evaluate('double(42)'), 42)
      t.assert.strictEqual(evaluate('double(3.14)'), 3.14)
      t.assert.strictEqual(evaluate('double(-5)'), -5)
      t.assert.strictEqual(evaluate('double(0)'), 0)
      t.assert.strictEqual(evaluate('double(-0)'), 0)
      t.assert.strictEqual(
        evaluate('double(inf)', {inf: Number.POSITIVE_INFINITY}),
        Number.POSITIVE_INFINITY
      )
      t.assert.strictEqual(
        evaluate('double(inf)', {inf: Number.NEGATIVE_INFINITY}),
        Number.NEGATIVE_INFINITY
      )
      t.assert.ok(Number.isNaN(evaluate('double(nan)', {nan: Number.NaN})))
    })

    test('should convert valid numeric strings to numbers', (t) => {
      t.assert.strictEqual(evaluate('double("42")'), 42)
      t.assert.strictEqual(evaluate('double("3.14")'), 3.14)
      t.assert.strictEqual(evaluate('double("-5")'), -5)
      t.assert.strictEqual(evaluate('double("0")'), 0)
      t.assert.strictEqual(evaluate('double("123.456")'), 123.456)
      t.assert.strictEqual(evaluate('double("1e5")'), 100000)
      t.assert.strictEqual(evaluate('double("1.23e-4")'), 0.000123)
      t.assert.strictEqual(evaluate('double("Infinity")'), Number.POSITIVE_INFINITY)
      t.assert.strictEqual(evaluate('double("-Infinity")'), Number.NEGATIVE_INFINITY)
      t.assert.ok(Number.isNaN(evaluate('double("NaN")')))
    })

    test('should throw error for invalid string conversions', (t) => {
      const error = /double\(\) type error: cannot convert to double/
      t.assert.throws(() => evaluate('double("not a number")'), error)
      t.assert.throws(() => evaluate('double("abc")'), error)
      t.assert.throws(() => evaluate('double("")'), error)
      t.assert.throws(() => evaluate('double(" ")'), error)
      t.assert.throws(() => evaluate('double(" 1")'), error)
      t.assert.throws(() => evaluate('double("1 ")'), error)
      t.assert.throws(() => evaluate('double("1.1.1")'), error)
      t.assert.throws(() => evaluate('double("1 0")'), error)

      t.assert.throws(
        () => evaluate('double(true)'),
        /found no matching overload for 'double\(bool\)'/
      )
      t.assert.throws(
        () => evaluate('double(false)'),
        /found no matching overload for 'double\(bool\)'/
      )
      t.assert.throws(
        () => evaluate('double(null)'),
        /found no matching overload for 'double\(null\)'/
      )
    })

    test('supports addition with number and bigint', (t) => {
      t.assert.strictEqual(
        evaluate(`int('999999999999999999') + 50000000`),
        BigInt('1000000000049999999')
      )
    })

    test('should work with variables from context', (t) => {
      const context = {
        num: 42,
        str: '3.14',
        bool: true,
        nullVal: null
      }
      t.assert.strictEqual(evaluate('double(num)', context), 42)
      t.assert.strictEqual(evaluate('double(str)', context), 3.14)
    })

    test('should throw error for objects, arrays, and bytes', (t) => {
      t.assert.throws(
        () => evaluate('double({})'),
        /found no matching overload for 'double\(map\)'/
      )
      t.assert.throws(
        () => evaluate('double([])'),
        /found no matching overload for 'double\(list\)'/
      )
      t.assert.throws(
        () => evaluate('double([1, 2, 3])'),
        /found no matching overload for 'double\(list\)'/
      )
      t.assert.throws(
        () => evaluate('double(bytes("test"))'),
        /found no matching overload for 'double\(bytes\)'/
      )

      const context = {
        num: 42,
        str: '3.14',
        boolVal: true,
        nullVal: null
      }
      t.assert.throws(
        () => evaluate('double(boolVal)', context),
        /found no matching overload for 'double\(bool\)'/
      )
      t.assert.throws(
        () => evaluate('double(nullVal)', context),
        /found no matching overload for 'double\(null\)'/
      )
    })

    test('should work in expressions', (t) => {
      t.assert.strictEqual(evaluate('double("5") + double("3")'), 8)
      t.assert.strictEqual(evaluate('double("3.14") * 2.0'), 6.28)
    })

    test('should throw with no arguments', (t) => {
      t.assert.throws(() => evaluate('double()'), /found no matching overload for 'double\(\)'/)
    })

    test('should throw with multiple arguments', (t) => {
      t.assert.throws(
        () => evaluate('double(1, 2)'),
        /found no matching overload for 'double\(int, int\)'/
      )
    })
  })

  describe('string function', () => {
    describe('string identity', () => {
      test('should return same string string(value)', (t) => {
        t.assert.strictEqual(evaluate('string("something")'), 'something')
      })

      test('should return string(false)', (t) => {
        t.assert.strictEqual(evaluate('string(false)'), 'false')
        t.assert.strictEqual(evaluate('string(true)'), 'true')
        t.assert.strictEqual(evaluate('string(1)'), '1')
        t.assert.strictEqual(evaluate('string(1.0)'), '1')
      })
    })
  })

  describe('bool function', () => {
    describe('boolean identity', () => {
      test('should return true for bool(true)', (t) => {
        t.assert.strictEqual(evaluate('bool(true)'), true)
      })

      test('should return false for bool(false)', (t) => {
        t.assert.strictEqual(evaluate('bool(false)'), false)
      })
    })

    describe('string to boolean conversion', () => {
      describe('truthy string values', () => {
        test('should return true for string "1"', (t) => {
          t.assert.strictEqual(evaluate('bool("1")'), true)
        })

        test('should return true for string "t"', (t) => {
          t.assert.strictEqual(evaluate('bool("t")'), true)
        })

        test('should return true for string "true" (lowercase)', (t) => {
          t.assert.strictEqual(evaluate('bool("true")'), true)
        })

        test('should return true for string "TRUE" (uppercase)', (t) => {
          t.assert.strictEqual(evaluate('bool("TRUE")'), true)
        })

        test('should return true for string "True" (pascalcase)', (t) => {
          t.assert.strictEqual(evaluate('bool("True")'), true)
        })
      })

      describe('falsy string values', () => {
        test('should return false for string "0"', (t) => {
          t.assert.strictEqual(evaluate('bool("0")'), false)
        })

        test('should return false for string "f"', (t) => {
          t.assert.strictEqual(evaluate('bool("f")'), false)
        })

        test('should return false for string "false" (lowercase)', (t) => {
          t.assert.strictEqual(evaluate('bool("false")'), false)
        })

        test('should return false for string "FALSE" (uppercase)', (t) => {
          t.assert.strictEqual(evaluate('bool("FALSE")'), false)
        })

        test('should return false for string "False" (pascalcase)', (t) => {
          t.assert.strictEqual(evaluate('bool("False")'), false)
        })
      })

      describe('invalid string values', () => {
        const invalidStrings = [
          'T',
          'F',
          'yes',
          'no',
          '2',
          '',
          ' true ',
          'tRuE',
          'fAlSe',
          'TrUe',
          'FaLsE'
        ]

        for (const invalidString of invalidStrings) {
          test(`should throw error for invalid string "${invalidString}"`, (t) => {
            t.assert.throws(
              () => evaluate(`bool("${invalidString}")`),
              new RegExp(`bool\\(\\) conversion error: invalid string value "${invalidString}"`)
            )
          })
        }
      })
    })

    describe('invalid argument types', () => {
      const invalidArg = /found no matching overload for/
      test('should throw error for number argument', (t) => {
        t.assert.throws(() => evaluate('bool(1)'), invalidArg)
      })

      test('should throw error for null argument', (t) => {
        t.assert.throws(() => evaluate('bool(null)'), invalidArg)
      })

      test('should throw error for array argument', (t) => {
        t.assert.throws(() => evaluate('bool([])'), invalidArg)
      })

      test('should throw error for object argument', (t) => {
        t.assert.throws(() => evaluate('bool({})'), invalidArg)
      })
    })

    describe('integration with expressions', () => {
      test('should work with string concatenation', (t) => {
        t.assert.strictEqual(evaluate('bool("tr" + "ue")'), true)
      })

      test('should work with conditional expressions', (t) => {
        t.assert.strictEqual(evaluate('bool("true") ? 1 : 0'), 1n)
        t.assert.strictEqual(evaluate('bool("false") ? 1 : 0'), 0n)
      })

      test('should work with logical operators', (t) => {
        t.assert.strictEqual(evaluate('bool("true") && bool("true")'), true)
        t.assert.strictEqual(evaluate('bool("true") && bool("false")'), false)
        t.assert.strictEqual(evaluate('bool("false") || bool("true")'), true)
      })

      test('should work with NOT operator', (t) => {
        t.assert.strictEqual(evaluate('!bool("true")'), false)
        t.assert.strictEqual(evaluate('!bool("false")'), true)
      })

      test('should work with variables from context', (t) => {
        const context = {
          trueString: 'TRUE',
          falseString: 'false',
          boolValue: true
        }
        t.assert.strictEqual(evaluate('bool(trueString)', context), true)
        t.assert.strictEqual(evaluate('bool(falseString)', context), false)
        t.assert.strictEqual(evaluate('bool(boolValue)', context), true)
      })
    })
  })
})

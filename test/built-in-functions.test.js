import {test, describe} from 'node:test'
import {assert, evaluate, expectEval, expectEvalDeep, expectEvalThrows} from './helpers.js'
import {Duration} from '../lib/functions.js'

describe('built-in functions', () => {
  describe('size function', () => {
    describe('arrays', () => {
      test('should return 0 for empty array', () => expectEval('size([])', 0n))
      test('should return 1 for one element array', () => expectEval('size([1])', 1n))
      test('should return 3 for three element array', () => expectEval('size([1, 2, 3])', 3n))
    })

    describe('objects', () => {
      test('should return 0 for empty object', () => expectEval('size({})', 0n))
      test('should return 1 for one property object', () => expectEval('size({"a": 1})', 1n))
      test('should return 3 for three property object', () =>
        expectEval('size({"a": 1, "b": 2, "c": 3})', 3n))
    })

    describe('strings', () => {
      test('should return 0 for empty string', () => {
        expectEval('size("")', 0n)
        expectEval('"".size()', 0n)
      })

      test('should return length of string', () => {
        expectEval('size("abc")', 3n)
        expectEval('"abc".size()', 3n)
      })

      test('should handle unicode characters', () => {
        expectEval('size("hello 😄")', 7n)
        expectEval('"hello 😄".size()', 7n)
        expectEval('size("hello 👨‍❤️‍💋‍👨")', 14n)
        expectEval('"hello 👨‍❤️‍💋‍👨".size()', 14n)
      })
    })

    test('should throw error for unsupported types', () => {
      expectEvalThrows('size(123)', /found no matching overload for 'size\(int\)'/)
      expectEvalThrows('size(true)', /found no matching overload for 'size\(bool\)'/)
      expectEvalThrows('size(null)', /found no matching overload for 'size\(null\)'/)
    })

    test('converts to a non-dynamic type', () => {
      const err = /no such overload/
      expectEvalThrows('size("hello") == 1.0', err)
      expectEvalThrows('size(s) == 1.0', err, {s: 'hello'})
      expectEvalThrows('size(dyn("hello")) == 1.0', err)
      expectEvalThrows('s.size() == 1.0', err, {s: 'hello'})
      expectEvalThrows('dyn("hello").size() == 1.0', err)
    })
  })

  describe('google.protobuf.Duration functions', () => {
    test('returns Duration instance', () => {
      assert.ok(evaluate('duration("1h")') instanceof Duration)
    })

    test('is of type duration', () => {
      expectEval('type(duration("1h")) == google.protobuf.Duration', true)
      expectEval('type(duration("1h")) == type(duration("2h"))', true)
    })

    test('parses duration string', () => {
      expectEval('duration("1h").getMilliseconds()', 3600000n)
      expectEval('duration("1h1h").getMilliseconds()', 7200000n)
      expectEval('duration("1.5h").getMilliseconds()', 5400000n)
      expectEval('duration("2m").getMilliseconds()', 120000n)
      expectEval('duration("2.5m").getMilliseconds()', 150000n)
      expectEval('duration("30s").getMilliseconds()', 30000n)
      expectEval('duration("30.5s").getMilliseconds()', 30500n)
      expectEval('duration("1ms").getMilliseconds()', 1n)
      expectEval('duration("1h2s3m.1m").getMilliseconds()', 3788000n)
      expectEval('duration("-1h2s3m.1m").getMilliseconds()', -3788000n)
    })

    test('equality', () => {
      expectEval('duration("1h") == duration("1h")', true)
      expectEval('duration("1h") == duration("2h")', false)
      expectEval('duration("1h") == duration("1h1m")', false)
      expectEval('duration("1h1m") == duration("1h")', false)
      expectEval('duration("1h") != duration("1h")', false)
      expectEval('duration("1h") != duration("2h")', true)
      expectEval('duration("1h") != duration("1h1m")', true)
      expectEval('duration("1h1m") != duration("1h")', true)
    })

    test('relational', () => {
      expectEval('duration("1h") < duration("2h")', true)
      expectEval('duration("2h") < duration("1h")', false)
      expectEval('duration("1h") < duration("1h1m")', true)
      expectEval('duration("1h1m") < duration("1h")', false)
      expectEval('duration("1h") <= duration("1h")', true)
      expectEval('duration("1h") <= duration("2h")', true)
      expectEval('duration("2h") <= duration("1h")', false)
      expectEval('duration("1h") <= duration("1h1m")', true)
      expectEval('duration("1h1m") <= duration("1h")', false)
      expectEval('duration("2h") > duration("1h")', true)
      expectEval('duration("1h") > duration("2h")', false)
      expectEval('duration("1h1m") > duration("1h")', true)
      expectEval('duration("1h") > duration("1h1m")', false)
      expectEval('duration("1h") >= duration("1h")', true)
      expectEval('duration("2h") >= duration("1h")', true)
      expectEval('duration("1h") >= duration("2h")', false)
      expectEval('duration("1h1m") >= duration("1h")', true)
      expectEval('duration("1h") >= duration("1h1m")', false)
    })

    test('addition of durations', () => {
      assert.ok(evaluate('duration("1h") + duration("1h")') instanceof Duration)
      expectEval('(duration("1h") + duration("1h")).getMilliseconds()', 7200000n)
      expectEval('(duration("1h") + duration("30m")).getMilliseconds()', 5400000n)
      expectEval('(duration("1s") + duration("1s1ms")).getMilliseconds()', 2001n)
    })

    test('addition of timestamp and duration', () => {
      expectEvalDeep(
        'timestamp("2025-01-01T00:00:00Z") + duration("1h1ms")',
        new Date('2025-01-01T01:00:00.001Z')
      )
    })

    test('subtraction of timestamp and duration', () => {
      expectEvalDeep(
        'timestamp("2025-01-01T00:00:00Z") - duration("1h1ms")',
        new Date('2024-12-31T22:59:59.999Z')
      )
    })
  })

  describe('google.protobuf.Timestamp functions', () => {
    const christmasTs = '2023-12-25T12:30:45.500Z'
    const newyearTs = '2024-01-01T00:00:00Z'
    const christmas = new Date(christmasTs) // Monday
    const newyear = new Date(newyearTs)
    const context = {christmas, christmasTs, newyear, newyearTs}

    test('is of type timestamp', () => {
      expectEval('type(timestamp("2023-12-25T00:00:00Z")) == google.protobuf.Timestamp', true)
      expectEval(
        'type(timestamp("2023-12-25T00:00:00Z")) == type(timestamp("2023-12-25T10:00:00Z"))',
        true
      )
    })

    describe('timestamp function', () => {
      test('should parse valid RFC 3339 timestamp', () => {
        expectEvalDeep(`timestamp(christmasTs)`, christmas, context)
        expectEvalDeep(
          `timestamp('9999-12-31T23:59:59.999Z')`,
          new Date('9999-12-31T23:59:59.999Z'),
          context
        )
        expectEvalDeep(
          `timestamp('0001-01-01T00:00:00Z')`,
          new Date('0001-01-01T00:00:00Z'),
          context
        )
      })

      test('allows integer unix timestamps', () => {
        expectEvalDeep(`timestamp(0)`, new Date(0), context)
        expectEvalDeep(`timestamp(1703507445)`, new Date(1703507445000), context)
        expectEvalDeep(`timestamp(253402300799)`, new Date('9999-12-31T23:59:59Z'), context)
        expectEvalDeep(`timestamp(-62135596800)`, new Date('0001-01-01T00:00:00Z'), context)
      })

      test('errors with too large dates (+-1)', () => {
        const intErr = /requires a valid integer unix timestamp/
        expectEvalThrows(`timestamp(253402300800)`, intErr, context)
        expectEvalThrows(`timestamp(-62135596801)`, intErr, context)

        const dateErr = /requires a string in ISO 8601 format/
        expectEvalThrows(`timestamp('10000-01-01T00:00:00Z')`, dateErr, context)
        expectEvalThrows(`timestamp('0000-01-01T00:00:00Z')`, dateErr, context)
      })

      test('supports equality operator', () => {
        expectEval('timestamp(0) == timestamp(0)', true, context)
        expectEval('timestamp(100) == timestamp(100)', true, context)
        expectEval('timestamp(0) == timestamp(100)', false, context)
      })

      test('timestamp substraction returns duration', () => {
        expectEvalDeep('timestamp(1000) - timestamp(0)', new Duration(1000n), context)
        expectEvalDeep('timestamp(0) - timestamp(1000)', new Duration(-1000n), context)
        expectEvalDeep(
          'timestamp("2024-01-01T00:00:00Z") - timestamp(3600)',
          new Duration(1704063600n),
          context
        )

        // Test that expectEvalDeep throws for non-equality
        assert.throws(() => {
          expectEvalDeep('timestamp(0) - timestamp(1000)', new Duration(0n), context)
        })
      })
    })

    describe('getDate function', () => {
      test('should return day of month (1-based) in UTC', () => {
        expectEval('christmas.getDate()', 25n, context)
      })

      test('should return day of month with timezone', () => {
        // Christmas at midnight UTC is Dec 24 in Los Angeles
        const utcMidnight = {date: new Date('2023-12-25T00:00:00Z')}
        expectEval('date.getDate("America/Los_Angeles")', 24n, utcMidnight)
      })
    })

    describe('getDayOfMonth function', () => {
      test('should return day of month (0-based) in UTC', () => {
        expectEval('christmas.getDayOfMonth()', 24n, context)
      })

      test('should return day of month with timezone', () => {
        const utcMidnight = {date: new Date('2023-12-25T00:00:00Z')}
        expectEval('date.getDayOfMonth("America/Los_Angeles")', 23n, utcMidnight)
      })
    })

    describe('getDayOfWeek function', () => {
      test('should return day of week (0=Sunday) in UTC', () => {
        expectEval('christmas.getDayOfWeek()', 1n, context)
      })

      test('should return day of week with timezone', () => {
        const utcMidnight = {date: new Date('2023-12-25T00:00:00Z')}
        expectEval('date.getDayOfWeek("America/Los_Angeles")', 0n, utcMidnight)
      })
    })

    describe('getDayOfYear function', () => {
      test('should return day of year (0-based) in UTC', () => {
        expectEval('christmas.getDayOfYear()', 358n, context)
      })

      test('should return 0 for January 1st', () => {
        expectEval('newyear.getDayOfYear()', 0n, context)
      })

      test('should handle leap year', () => {
        const leapYear = {date: new Date('2024-12-31T12:00:00Z')}
        expectEval('date.getDayOfYear()', 365n, leapYear)
      })
    })

    describe('getFullYear function', () => {
      test('should return full year in UTC', () => {
        expectEval('christmas.getFullYear()', 2023n, context)
      })

      test('should return full year with timezone', () => {
        expectEval('christmas.getFullYear("Europe/London")', 2023n, context)
      })
    })

    describe('getHours function', () => {
      test('should return hours in UTC', () => {
        expectEval('christmas.getHours()', 12n, context)
      })

      test('should return hours with timezone', () => {
        // 12:30 UTC = 04:30 PST (8 hours behind)
        expectEval('christmas.getHours("America/Los_Angeles")', 4n, context)
      })
    })

    describe('getMinutes function', () => {
      test('should return minutes in UTC', () => {
        expectEval('christmas.getMinutes()', 30n, context)
      })

      test('should return minutes with timezone', () => {
        expectEval('christmas.getMinutes("Asia/Tokyo")', 30n, context)
      })
    })

    describe('getSeconds function', () => {
      test('should return seconds in UTC', () => {
        expectEval('christmas.getSeconds()', 45n, context)
      })

      test('should return seconds with timezone', () => {
        expectEval('christmas.getSeconds("Europe/Paris")', 45n, context)
      })
    })

    describe('getMilliseconds function', () => {
      test('should return milliseconds in UTC', () => {
        expectEval('christmas.getMilliseconds()', 500n, context)
      })

      test('should return milliseconds with timezone', () => {
        expectEval('christmas.getMilliseconds("Australia/Sydney")', 500n, context)
      })
    })

    describe('getMonth function', () => {
      test('should return month (0-based) in UTC', () => {
        expectEval('christmas.getMonth()', 11n, context)
      })

      test('should return 0 for January', () => {
        expectEval('newyear.getMonth()', 0n, context)
      })

      test('should return month with timezone', () => {
        expectEval('christmas.getMonth("America/New_York")', 11n, context)
      })
    })

    describe('integration with timestamp function', () => {
      test('should work with timestamp() function', () => {
        expectEval('timestamp("2023-12-25T12:00:00Z").getFullYear()', 2023n)
        expectEval('timestamp("2023-12-25T12:00:00Z").getMonth()', 11n)
        expectEval('timestamp("2023-12-25T12:00:00Z").getDayOfWeek()', 1n)
      })

      test('should work with timestamp and timezone', () => {
        expectEval('timestamp("2023-12-25T00:00:00Z").getDate("America/Los_Angeles")', 24n)
      })
    })

    describe('complex expressions', () => {
      test('should work in boolean expressions', () => {
        expectEval('christmas.getMonth() == 11 && christmas.getDate() == 25', true, context)
      })

      test('should work in ternary expressions', () => {
        expectEval('christmas.getDayOfWeek() == 1 ? "Monday" : "Other"', 'Monday', context)
      })

      test('should work in arithmetic expressions', () => {
        expectEval('christmas.getFullYear() * 100 + christmas.getMonth() + 1', 202312n, context)
      })
    })
  })

  describe('string.matches(regex):', () => {
    test('should return true for matching string', () => {
      expectEval('"hello".matches("h.*o")', true)
      expectEval('"hello".matches("^h")', true)
      expectEval('"hello".matches("^hello$")', true)
    })

    test('should return false for non-matching string', () => {
      expectEval('"hello".matches("H.*o")', false)
      expectEval('"hello".matches("l$")', false)
      expectEval('"hello".matches("^ello$")', false)
    })
  })

  describe('string.trim(): string', () => {
    test('removes whitespaces', () => {
      expectEval('"\\n\\rhello ".trim()', 'hello')
      expectEval('"  hello  ".trim()', 'hello')
      expectEval('"hello".trim()', 'hello')
    })
  })

  describe('string.lowerAscii(): string', () => {
    test('converts to lower case', () => {
      expectEval('"\\n\\rWelcome to Zürich ".lowerAscii()', '\n\rwelcome to zürich ')
      expectEval('"🤕 HEllo".lowerAscii()', '🤕 hello')
      expectEval('"ยินดีต้อนรับในซูริก".lowerAscii()', 'ยินดีต้อนรับในซูริก')
    })
  })

  describe('string.upperAscii(): string', () => {
    test('converts to upper case', () => {
      expectEval('"\\n\\rWelcome to Zürich ".upperAscii()', '\n\rWELCOME TO ZÜRICH ')
      expectEval('"🤕 HEllo".upperAscii()', '🤕 HELLO')
      expectEval('"ยินดีต้อนรับในซูริก".upperAscii()', 'ยินดีต้อนรับในซูริก')
    })
  })

  describe('string.split:', () => {
    test('requires string delimiter', () => {
      expectEvalThrows('"a,b,c".split()', /found no matching overload for 'string.split\(\)/)
    })

    test('should split string by delimiter', () => {
      expectEvalDeep('"a,b,c".split(",")', ['a', 'b', 'c'])
    })

    test('should split string by delimiter + limit', () => {
      expectEvalDeep('"a,b,c".split(",", 0)', [])
      expectEvalDeep('"a,b,c".split(",", -1)', ['a', 'b', 'c'])
      expectEvalDeep('"a,b,c".split("", -1)', ['a', ',', 'b', ',', 'c'])

      expectEvalDeep('"a,b,c".split(",", 1)', ['a,b,c'])
      expectEvalDeep('"a,b,c".split(",", 2)', ['a', 'b,c'])
      expectEvalDeep('"a,b,c".split(",", 3)', ['a', 'b', 'c'])
      expectEvalDeep('"a,b,c".split(",", 4)', ['a', 'b', 'c'])
      expectEvalDeep('"a,b,c".split("", 3)', ['a', ',', 'b,c'])
    })
  })

  describe('string.startsWith function', () => {
    describe('method call syntax', () => {
      describe('basic functionality', () => {
        test('should return true when string starts with prefix', () => {
          expectEval('"hello world".startsWith("hello")', true)
        })

        test('should return false when string does not start with prefix', () => {
          expectEval('"hello world".startsWith("world")', false)
        })

        test('should return true when prefix is empty string', () => {
          expectEval('"hello".startsWith("")', true)
        })

        test('should return true when string and prefix are identical', () => {
          expectEval('"hello".startsWith("hello")', true)
        })

        test('should return false when prefix is longer than string', () => {
          expectEval('"hi".startsWith("hello")', false)
        })

        test('should work with empty string', () => {
          expectEval('"".startsWith("")', true)
          expectEval('"".startsWith("a")', false)
        })
      })

      describe('case sensitivity', () => {
        test('should be case sensitive', () => {
          expectEval('"Hello".startsWith("hello")', false)
          expectEval('"Hello".startsWith("Hello")', true)
          expectEval('"HELLO".startsWith("hello")', false)
        })
      })

      describe('unicode support', () => {
        test('should work with unicode characters', () => {
          expectEval('"😄 hello".startsWith("😄")', true)
          expectEval('"😄 hello".startsWith("hello")', false)
          expectEval('"café".startsWith("caf")', true)
          expectEval('"naïve".startsWith("naï")', true)
        })

        test('should handle complex unicode sequences', () => {
          expectEval('"👨‍❤️‍💋‍👨 love".startsWith("👨‍❤️‍💋‍👨")', true)
        })
      })

      describe('special characters', () => {
        test('should work with whitespace', () => {
          expectEval('" hello".startsWith(" ")', true)
          expectEval('"""\thello""".startsWith("""\t""")', true)
          expectEval('"""\nhello""".startsWith("""\n""")', true)
        })

        test('should work with escape sequences', () => {
          expectEval('"\\\\hello".startsWith("\\\\")', true)
          expectEval('"\\\\path".startsWith("\\\\")', true)
        })
      })

      describe('with variables', () => {
        const context = {
          greeting: 'hello world',
          prefix: 'hello',
          emptyStr: '',
          message: 'Good morning!'
        }

        test('should work with string variables', () => {
          expectEval('greeting.startsWith(prefix)', true, context)
          expectEval('greeting.startsWith("world")', false, context)
          expectEval('message.startsWith("Good")', true, context)
        })

        test('should work with empty string variable', () => {
          expectEval('greeting.startsWith(emptyStr)', true, context)
          expectEval('emptyStr.startsWith("")', true, context)
          expectEval('emptyStr.startsWith("a")', false, context)
        })
      })

      describe('error handling', () => {
        test('should throw error when called on non-string', () => {
          expectEvalThrows(
            '(123).startsWith("1")',
            /found no matching overload for 'int.startsWith/
          )
        })

        test('should throw error when argument is not a string', () => {
          const error = /found no matching overload for 'string.startsWith/
          expectEvalThrows('"hello".startsWith(123)', error)
          expectEvalThrows('"hello".startsWith(true)', error)
          expectEvalThrows('"hello".startsWith(null)', error)
          expectEvalThrows('"hello".startsWith([])', error)
          expectEvalThrows('"hello".startsWith({})', error)
        })

        test('should work when called with variables of correct type', () => {
          const context = {
            str: 'hello world',
            num: 123,
            boolean: true,
            arr: [],
            obj: {}
          }

          expectEval('str.startsWith("hello")', true, context)

          expectEvalThrows(
            'num.startsWith("1")',
            /found no matching overload for 'double.startsWith/,
            context
          )
          expectEvalThrows(
            'boolean.startsWith("t")',
            /found no matching overload for 'bool.startsWith/,
            context
          )
          expectEvalThrows(
            'arr.startsWith("")',
            /found no matching overload for 'list.startsWith/,
            context
          )
          expectEvalThrows(
            'obj.startsWith("")',
            /found no matching overload for 'map.startsWith/,
            context
          )
        })
      })
    })

    describe('syntax consistency', () => {
      test('both syntaxes should produce identical results', () => {
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
          expectEval(
            `${str}.startsWith(${prefix})`,
            expected,
            undefined,
            `Method syntax failed for ${str}.startsWith(${prefix})`
          )
        })
      })

      test('both syntaxes should throw same errors for invalid arguments', () => {
        // Test error consistency
        const errorCases = [
          ['"hello"', '123', 'int'],
          ['"hello"', 'true', 'bool'],
          ['"hello"', 'null', 'null']
        ]

        errorCases.forEach(([str, invalidPrefix, argType]) => {
          expectEvalThrows(
            `${str}.startsWith(${invalidPrefix})`,
            new RegExp(`found no matching overload for 'string.startsWith\\(${argType}\\)`)
          )
        })
      })
    })

    describe('complex expressions', () => {
      test('function syntax should raise when unregistered', () => {
        expectEvalThrows(
          'startsWith("world", "he")',
          /found no matching overload for 'startsWith\(string, string\)/
        )
      })

      test('should work in ternary expressions', () => {
        expectEval('"hello".startsWith("he") ? "yes" : "no"', 'yes')
      })

      test('should work with string concatenation', () => {
        const context = {prefix: 'hel'}
        expectEval('("hel" + "lo").startsWith(prefix)', true, context)
      })
    })

    describe('edge cases', () => {
      test('should handle strings with quotes', () => {
        expectEval('"\\"quoted\\"".startsWith("\\"")', true)
        expectEval("'single quotes'.startsWith('single')", true)
      })

      test('should handle very long strings', () => {
        const longStr = 'a'.repeat(10000)
        const context = {longStr}
        expectEval('longStr.startsWith("a")', true, context)
        expectEval('longStr.startsWith("b")', false, context)
      })

      test('should handle strings with null bytes', () => {
        expectEval('"hello\\x00world".startsWith("hello")', true)
      })
    })
  })

  describe('type function', () => {
    test('supports equality', () => {
      expectEval('int == int', true)
      expectEval('type(1) == int', true)
      expectEval('double == double', true)
      expectEval('type(1.0) == double', true)
      expectEval(`string == string`, true)
      expectEval(`type('string') == string`, true)
      expectEval('bool == bool', true)
      expectEval('type(true) == bool', true)
      expectEval('type(false) == bool', true)
      expectEval('null_type == null_type', true)
      expectEval('type(null) == null_type', true)
      expectEval('bytes == bytes', true)
      expectEval('type(bytes("test")) == bytes', true)
      expectEval('list == list', true)
      expectEval('type([]) == list', true)
      expectEval('map == map', true)
      expectEval('type({}) == map', true)
      expectEval('type == type', true)
      expectEval('type(string) == type', true)
    })

    test('supports inequality', () => {
      expectEval('type(1) != type', true)
      expectEval('type(1.0) != type', true)
      expectEval(`type('string') != type`, true)
      expectEval('type(true) != type', true)
      expectEval('type(false) != type', true)
      expectEval('type(null) != type', true)
      expectEval('type(bytes("test")) != type', true)
      expectEval('type([]) != type', true)
      expectEval('type({}) != type', true)
    })

    test('throws on invalid comparisons', () => {
      expectEvalThrows('int > int', /no such overload: type > type/)
      expectEvalThrows('int >= int', /no such overload: type >= type/)
      expectEvalThrows('int < int', /no such overload: type < type/)
      expectEvalThrows('int <= int', /no such overload: type <= type/)
      expectEvalThrows('int + int', /no such overload: type \+ type/)
      expectEvalThrows('int - int', /no such overload: type - type/)
      expectEvalThrows('int * int', /no such overload: type \* type/)
      expectEvalThrows('int / int', /no such overload: type \/ type/)
      expectEvalThrows('int % int', /no such overload: type % type/)
    })
  })

  describe('int function', () => {
    test('should return bigint', () => {
      expectEval('int(42)', 42n)
      expectEval('int(3.14)', 3n)
      expectEval(`int('-5')`, -5n)
      expectEval(`int('0')`, 0n)
      expectEval(`int('-0')`, 0n)
      expectEval(`int('9223372036854775807')`, 9223372036854775807n)
    })

    test('errors on integer overflow', () => {
      expectEvalThrows(`int(double('inf'))`, /integer overflow/)
      expectEvalThrows(`int(double('-inf'))`, /integer overflow/)
      expectEvalThrows(`int(double('nan'))`, /integer overflow/)
    })

    test('throws invalid integer', () => {
      expectEvalThrows(`int('9223372036854775808')`, /cannot convert to int/)
      expectEvalThrows(`int('0x01')`, /cannot convert to int/)
      expectEvalThrows(`int('1e10')`, /cannot convert to int/)
      expectEvalThrows(`int('3.1')`, /cannot convert to int/)
    })
  })

  describe('double function', () => {
    test('should return numbers as-is', () => {
      expectEval('double(42)', 42)
      expectEval('double(3.14)', 3.14)
      expectEval('double(-5)', -5)
      expectEval('double(0)', 0)
      expectEval('double(-0)', 0)
      expectEval('double(1u)', 1)
      expectEval('double(inf)', Number.POSITIVE_INFINITY, {inf: Number.POSITIVE_INFINITY})
      expectEval('double(inf)', Number.NEGATIVE_INFINITY, {inf: Number.NEGATIVE_INFINITY})
      assert.ok(Number.isNaN(evaluate('double(nan)', {nan: Number.NaN})))
    })

    test('should convert valid numeric strings to numbers', () => {
      expectEval('double("42")', 42)
      expectEval('double("3.14")', 3.14)
      expectEval('double("-5")', -5)
      expectEval('double("0")', 0)
      expectEval('double("123.456")', 123.456)
      expectEval('double("1e5")', 100000)
      expectEval('double("1.23e-4")', 0.000123)
      expectEval('double("Infinity")', Number.POSITIVE_INFINITY)
      expectEval('double("-Infinity")', Number.NEGATIVE_INFINITY)
      assert.ok(Number.isNaN(evaluate('double("NaN")')))
    })

    test('should throw error for invalid string conversions', () => {
      const error = /double\(\) type error: cannot convert to double/
      expectEvalThrows('double("not a number")', error)
      expectEvalThrows('double("abc")', error)
      expectEvalThrows('double("")', error)
      expectEvalThrows('double(" ")', error)
      expectEvalThrows('double(" 1")', error)
      expectEvalThrows('double("1 ")', error)
      expectEvalThrows('double("1.1.1")', error)
      expectEvalThrows('double("1 0")', error)

      expectEvalThrows('double(true)', /found no matching overload for 'double\(bool\)'/)
      expectEvalThrows('double(false)', /found no matching overload for 'double\(bool\)'/)
      expectEvalThrows('double(null)', /found no matching overload for 'double\(null\)'/)
    })

    test('supports addition with number and bigint', () => {
      expectEval(`int('999999999999999999') + 50000000`, BigInt('1000000000049999999'))
    })

    test('should work with variables from context', () => {
      const context = {
        num: 42,
        integer: 42n,
        str: '3.14',
        bool: true,
        nullVal: null
      }
      expectEval('double(num)', 42, context)
      expectEval('double(str)', 3.14, context)
      expectEval('double(integer)', 42, context)
    })

    test('should throw error for objects, arrays, and bytes', () => {
      expectEvalThrows('double({})', /found no matching overload for 'double\(map<dyn, dyn>\)'/)
      expectEvalThrows('double([])', /found no matching overload for 'double\(list<dyn>\)'/)
      expectEvalThrows('double([1, 2, 3])', /found no matching overload for 'double\(list<int>\)'/)
      expectEvalThrows('double(bytes("test"))', /found no matching overload for 'double\(bytes\)'/)

      const context = {
        num: 42,
        str: '3.14',
        boolVal: true,
        nullVal: null
      }
      expectEvalThrows(
        'double(boolVal)',
        /found no matching overload for 'double\(bool\)'/,
        context
      )
      expectEvalThrows(
        'double(nullVal)',
        /found no matching overload for 'double\(null\)'/,
        context
      )
    })

    test('should work in expressions', () => {
      expectEval('double("5") + double("3")', 8)
      expectEval('double("3.14") * 2.0', 6.28)
    })

    test('should throw with no arguments', () => {
      expectEvalThrows('double()', /found no matching overload for 'double\(\)'/)
    })

    test('should throw with multiple arguments', () => {
      expectEvalThrows('double(1, 2)', /found no matching overload for 'double\(int, int\)'/)
    })
  })

  describe('string function', () => {
    describe('string identity', () => {
      test('should return same string string(value)', () => {
        expectEval('string("something")', 'something')
      })

      test('should return string(false)', () => {
        expectEval('string(false)', 'false')
        expectEval('string(true)', 'true')
        expectEval('string(1)', '1')
        expectEval('string(1.0)', '1')
      })
    })
  })

  describe('bool function', () => {
    describe('boolean identity', () => {
      test('should return true for bool(true)', () => {
        expectEval('bool(true)', true)
      })

      test('should return false for bool(false)', () => {
        expectEval('bool(false)', false)
      })
    })

    describe('string to boolean conversion', () => {
      describe('truthy string values', () => {
        test('should return true for string "1"', () => {
          expectEval('bool("1")', true)
        })

        test('should return true for string "t"', () => {
          expectEval('bool("t")', true)
        })

        test('should return true for string "true" (lowercase)', () => {
          expectEval('bool("true")', true)
        })

        test('should return true for string "TRUE" (uppercase)', () => {
          expectEval('bool("TRUE")', true)
        })

        test('should return true for string "True" (pascalcase)', () => {
          expectEval('bool("True")', true)
        })
      })

      describe('falsy string values', () => {
        test('should return false for string "0"', () => {
          expectEval('bool("0")', false)
        })

        test('should return false for string "f"', () => {
          expectEval('bool("f")', false)
        })

        test('should return false for string "false" (lowercase)', () => {
          expectEval('bool("false")', false)
        })

        test('should return false for string "FALSE" (uppercase)', () => {
          expectEval('bool("FALSE")', false)
        })

        test('should return false for string "False" (pascalcase)', () => {
          expectEval('bool("False")', false)
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
          test(`should throw error for invalid string "${invalidString}"`, () => {
            expectEvalThrows(
              `bool("${invalidString}")`,
              new RegExp(`bool\\(\\) conversion error: invalid string value "${invalidString}"`)
            )
          })
        }
      })
    })

    describe('invalid argument types', () => {
      const invalidArg = /found no matching overload for/
      test('should throw error for number argument', () => {
        expectEvalThrows('bool(1)', invalidArg)
      })

      test('should throw error for null argument', () => {
        expectEvalThrows('bool(null)', invalidArg)
      })

      test('should throw error for array argument', () => {
        expectEvalThrows('bool([])', invalidArg)
      })

      test('should throw error for object argument', () => {
        expectEvalThrows('bool({})', invalidArg)
      })
    })

    describe('integration with expressions', () => {
      test('should work with string concatenation', () => {
        expectEval('bool("tr" + "ue")', true)
      })

      test('should work with conditional expressions', () => {
        expectEval('bool("true") ? 1 : 0', 1n)
        expectEval('bool("false") ? 1 : 0', 0n)
      })

      test('should work with logical operators', () => {
        expectEval('bool("true") && bool("true")', true)
        expectEval('bool("true") && bool("false")', false)
        expectEval('bool("false") || bool("true")', true)
      })

      test('should work with NOT operator', () => {
        expectEval('!bool("true")', false)
        expectEval('!bool("false")', true)
      })

      test('should work with variables from context', () => {
        const context = {
          trueString: 'TRUE',
          falseString: 'false',
          boolValue: true
        }
        expectEval('bool(trueString)', true, context)
        expectEval('bool(falseString)', false, context)
        expectEval('bool(boolValue)', true, context)
      })
    })
  })
})

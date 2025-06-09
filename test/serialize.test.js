import {test, describe} from 'node:test'
import assert from 'node:assert'
import {parse} from '../index.js'
import {serialize} from '../serialize.js'

function equalResult(expr) {
  assert.strictEqual(serialize(parse(expr).ast), expr)
}

describe('AST to CEL Serialization', () => {
  describe('Literals', () => {
    test('should serialize boolean values', () => {
      equalResult('true')
      equalResult('false')
    })

    test('should serialize null', () => {
      equalResult('null')
    })

    test('should serialize numbers', () => {
      equalResult('42')
      equalResult('3.14')
      equalResult('-42')
      equalResult('0')
    })

    test('should serialize strings with proper escaping', () => {
      equalResult('"hello world"')
      equalResult('"escaped \\"quotes\\""')
      equalResult('"line\\nbreak"')
      equalResult('"tab\\there"')
      equalResult('"backslash\\\\"')
    })

    test('should serialize bytes literals', () => {
      equalResult('b"hello"')
      assert.strictEqual(serialize(parse('b"\\x00\\xFF"').ast), 'b"\\x00\\xff"')
      equalResult('b"\\n\\r\\t"')
    })

    test('should handle bytes after JSON serialization', () => {
      const bytesAst = parse('b"test"').ast
      const jsonified = JSON.parse(JSON.stringify(bytesAst))
      assert.strictEqual(serialize(jsonified), 'b"test"')
    })
  })

  describe('Identifiers', () => {
    test('should serialize simple identifiers', () => {
      equalResult('x')
      equalResult('userName')
      equalResult('_private')
    })
  })

  describe('Binary Operators', () => {
    test('should serialize arithmetic operators', () => {
      equalResult('1 + 2')
      equalResult('1 - 2')
      equalResult('1 * 2')
      equalResult('1 / 2')
      equalResult('1 % 2')
      equalResult('x + y')
      equalResult('a - b')
      equalResult('x * y')
      equalResult('a / b')
      equalResult('x % y')
    })

    test('should serialize comparison operators', () => {
      equalResult('1 == 2')
      equalResult('a == b')
      equalResult('x != y')
      equalResult('1 != 2')
      equalResult('a < b')
      equalResult('x <= y')
      equalResult('a > b')
      equalResult('x >= y')
    })

    test('should serialize logical operators', () => {
      equalResult('a && b')
      equalResult('x || y')
    })

    test('should serialize in operator', () => {
      equalResult('x in list')
    })
  })

  describe('Unary Operators', () => {
    test('should serialize logical not', () => {
      equalResult('!x')
      equalResult('!!x')
    })

    test('should serialize unary minus', () => {
      equalResult('-x')
      assert.strictEqual(serialize(parse('--x').ast), '-(-x)')
    })
  })

  describe('Operator Precedence', () => {
    test('should handle arithmetic precedence', () => {
      equalResult('x + y * z')
      equalResult('(x + y) * z')
      equalResult('x * y + z')
      equalResult('x * (y + z)')
    })

    test('should handle logical precedence', () => {
      equalResult('1 || 2 && 3')
      equalResult('(a || b) && c')
      equalResult('a && b || c')
      equalResult('a && (b || c)')
    })

    test('should handle comparison and logical precedence', () => {
      equalResult('x == y && a != b')
      equalResult('x < y || a > b')
      assert.strictEqual(serialize(parse('(x == y) && (a != b) && a').ast), 'x == y && a != b && a')
    })

    test('should handle unary operator precedence', () => {
      equalResult('!x && y')
      equalResult('-(x + y)')
      equalResult('-x * y')
    })
  })

  describe('Member and Index Access', () => {
    test('should serialize member access', () => {
      equalResult('user.name')
      equalResult('user.address.city')
      equalResult('a.b.c.d')
    })

    test('should serialize index access', () => {
      equalResult('list[0]')
      equalResult('map["key"]')
      equalResult('matrix[i][j]')
    })

    test('should serialize mixed access', () => {
      equalResult('users[0].name')
      equalResult('data.users[i].address.city')
    })
  })

  describe('Function and Method Calls', () => {
    test('should serialize function calls', () => {
      equalResult('size(list)')
      equalResult('max(a, b)')
      equalResult('timestamp("2023-01-01T00:00:00Z")')
    })

    test('should serialize method calls', () => {
      equalResult('name.startsWith("Hello")')
      equalResult('list.filter(x, x > 0)')
      equalResult('numbers.map(n, n * 2)')
    })

    test('should serialize chained method calls', () => {
      equalResult('list.filter(x, x > 0).map(x, x * 2)')
    })
  })

  describe('Collections', () => {
    test('should serialize arrays', () => {
      equalResult('[]')
      equalResult('[1, 2, 3]')
      equalResult('[x, y, z]')
      equalResult('[[1, 2], [3, 4]]')
    })

    test('should serialize objects', () => {
      equalResult('{}')
      equalResult('{"name": "John", "age": 30}')
      equalResult('{x: 1, y: 2}')
      equalResult('{"nested": {"value": 42}}')
      equalResult('{foo: {"value": 42}}')
    })
  })

  describe('Ternary Operator', () => {
    test('should serialize simple ternary', () => {
      equalResult('x > 0 ? x : -x')
    })

    test('should serialize nested ternary with correct associativity', () => {
      equalResult('a ? b : c ? d : e')
      equalResult('(a ? b : c) ? d : e')
    })
  })

  describe('Complex Expressions', () => {
    test('should serialize filter expressions', () => {
      equalResult('users.filter(u, u.age >= 18 && u.active)')
    })

    test('should serialize map with object construction', () => {
      equalResult('items.map(i, {"id": i.id, "total": i.price * i.quantity})')
    })

    test('should serialize has() with method chain', () => {
      equalResult('has(user.email) && user.email.endsWith("@example.com")')
    })
  })

  describe('Edge Cases', () => {
    test('should handle deeply nested expressions', () => {
      equalResult('((x + y) * (a - b)) / ((c + d) * (e - f))')
    })

    test('should handle expressions with all operator types', () => {
      equalResult('!a && b || c == d && e.f(g) in h ? i[j] : k + l * m')
    })

    test('should handle multiple unary operators with multiplication', () => {
      equalResult('-x * -y')
      equalResult('-x * y * -z')
    })

    test('should handle nested parentheses with division and multiplication', () => {
      equalResult('(a * b) / (c * d)')
      equalResult('((a + b) * c) / (d * (e + f))')
    })

    test('should correctly handle unary operators inside binary operations', () => {
      equalResult('a + -b')
      equalResult('a * -b')
      equalResult('-a * (b + c)')
    })
  })
})

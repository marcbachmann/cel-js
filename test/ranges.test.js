import {describe, test} from 'node:test'
import assert from 'node:assert/strict'
import {parse, ParseError} from '../lib/index.js'

// Slice the source string at a node's range and assert against part
// If `equalsSlice(node, part)` does not equal the expected substring, it throws an error
function equalsSlice(node, part) {
  assert.strictEqual(node.input.slice(node.start, node.end), part)
}

describe('Source ranges', () => {
  describe('binary operators', () => {
    test('range spans both operands', () => {
      const src = 'user.name + tags[0]'
      const ast = parse(src).ast

      assert.strictEqual(ast.op, '+')
      equalsSlice(ast, src)
      equalsSlice(ast.args[0], 'user.name')
      equalsSlice(ast.args[1], 'tags[0]')
    })

    test('.range getter returns {start, end} object', () => {
      const src = 'a + b'
      const ast = parse(src).ast
      assert.deepStrictEqual(ast.range, {start: 0, end: src.length})
    })

    test('logical OR is left-associative: each || node spans its own operands', () => {
      const src = '1 == 1 || 2 == 2 || 3 == 3'
      const ast = parse(src).ast

      // root: (1 == 1 || 2 == 2) || (3 == 3)
      assert.strictEqual(ast.op, '||')
      equalsSlice(ast, src)

      const [left, right] = ast.args
      equalsSlice(left, '1 == 1 || 2 == 2')
      equalsSlice(right, '3 == 3')

      // left: (1 == 1) || (2 == 2)
      assert.strictEqual(left.op, '||')
      equalsSlice(left.args[0], '1 == 1')
      equalsSlice(left.args[1], '2 == 2')
    })
  })

  describe('list literals', () => {
    test('range spans the brackets and each element', () => {
      const src = '[1, "hello", true]'
      const ast = parse(src).ast

      assert.strictEqual(ast.op, 'list')
      equalsSlice(ast, src)
      equalsSlice(ast.args[0], '1')
      equalsSlice(ast.args[1], '"hello"')
      equalsSlice(ast.args[2], 'true')
    })

    test('empty list has range over both brackets', () => {
      const src = '[]'
      const ast = parse(src).ast
      equalsSlice(ast, '[]')
    })
  })

  describe('map literals', () => {
    test('range spans the braces and each key-value pair', () => {
      const src = '{"name": user, "age": 42}'
      const ast = parse(src).ast

      assert.strictEqual(ast.op, 'map')
      equalsSlice(ast, src)
      const [[key0, val0], [key1, val1]] = ast.args
      equalsSlice(key0, '"name"')
      equalsSlice(val0, 'user')
      equalsSlice(key1, '"age"')
      equalsSlice(val1, '42')
    })

    test('empty map has range over both braces', () => {
      const src = '{}'
      const ast = parse(src).ast
      equalsSlice(ast, '{}')
    })
  })

  describe('string literals', () => {
    test('double-quoted string range includes the quote characters', () => {
      const src = '"hello"'
      const ast = parse(src).ast
      assert.strictEqual(ast.op, 'value')
      equalsSlice(ast, src)
    })

    test('single-quoted string range includes the quote characters', () => {
      const src = "'world'"
      const ast = parse(src).ast
      assert.strictEqual(ast.op, 'value')
      equalsSlice(ast, src)
    })

    test('triple double-quoted string range includes all six quote characters', () => {
      const src = '"""triple quoted"""'
      const ast = parse(src).ast
      assert.strictEqual(ast.op, 'value')
      equalsSlice(ast, src)
    })

    test('triple single-quoted string range includes all six quote characters', () => {
      const src = "'''triple quoted'''"
      const ast = parse(src).ast
      assert.strictEqual(ast.op, 'value')
      equalsSlice(ast, src)
    })

    test('raw string prefix r"..." range starts at the prefix character', () => {
      const src = 'r"raw\\nstring"'
      const ast = parse(src).ast
      assert.strictEqual(ast.op, 'value')
      equalsSlice(ast, src)
    })

    test('bytes string prefix b"..." range starts at the prefix character', () => {
      const src = 'b"bytes"'
      const ast = parse(src).ast
      assert.strictEqual(ast.op, 'value')
      equalsSlice(ast, src)
    })
  })

  describe('ternary operator', () => {
    test('range spans condition through alternate branch', () => {
      const src = 'x > 0 ? x : -x'
      const ast = parse(src).ast

      assert.strictEqual(ast.op, '?:')
      equalsSlice(ast, src)

      const [condition, consequent, alternate] = ast.args
      equalsSlice(condition, 'x > 0')
      equalsSlice(consequent, 'x')
      equalsSlice(alternate, '-x')
    })

    test('nested ternary: each branch is itself a ternary with accurate child ranges', () => {
      const src = 'a ? b ? 1 : 2 : 3'
      const ast = parse(src).ast

      assert.strictEqual(ast.op, '?:')
      equalsSlice(ast, src)

      const [condition, consequent, alternate] = ast.args
      equalsSlice(condition, 'a')
      equalsSlice(consequent, 'b ? 1 : 2')
      equalsSlice(alternate, '3')

      assert.strictEqual(consequent.op, '?:')
      const [innerCond, innerThen, innerElse] = consequent.args
      equalsSlice(innerCond, 'b')
      equalsSlice(innerThen, '1')
      equalsSlice(innerElse, '2')
    })
  })

  describe('.map macro', () => {
    test('comprehension range spans the full receiver.map(...) call', () => {
      const src = '[1, 2].map(x, x * 2)'

      // The rcall node stores the comprehension in meta.alternate
      const rcall = parse(src).ast
      assert.strictEqual(rcall.op, 'rcall')
      equalsSlice(rcall, src)

      // The comprehension itself (accessed via meta.alternate) shares the same range
      const comp = rcall.meta.alternate
      assert.strictEqual(comp.op, 'comprehension')
      equalsSlice(comp, src)

      // Child ranges within the comprehension
      equalsSlice(comp.args.iterable, '[1, 2]')
      assert.strictEqual(comp.args.iterVarName, 'x')
      equalsSlice(comp.args.step, 'x * 2')
    })

    test('receiver and transform args are accessible via rcall.args', () => {
      const src = 'items.map(e, e.name)'
      const ast = parse(src).ast

      // rcall.args = [methodName, receiver, fnArgs]
      assert.strictEqual(ast.args[0], 'map')
      equalsSlice(ast.args[1], 'items') // receiver
      equalsSlice(ast.args[2][0], 'e') // iterVar
      equalsSlice(ast.args[2][1], 'e.name') // transform
    })

    test('map literal as receiver: iterable range spans the full map literal', () => {
      const src = '{"a": 1, "b": 2}.map(k, k)'
      const comp = parse(src).ast.meta.alternate

      assert.strictEqual(comp.op, 'comprehension')
      equalsSlice(comp, src)
      equalsSlice(comp.args.iterable, '{"a": 1, "b": 2}')
      assert.strictEqual(comp.args.iterVarName, 'k')
      equalsSlice(comp.args.step, 'k')
    })
  })

  describe('has macro', () => {
    test('range spans the full has(...) call including parens', () => {
      const src = 'has(user.name)'
      const ast = parse(src).ast

      assert.strictEqual(ast.op, 'call')
      equalsSlice(ast, src)
    })

    test('inner field-access argument has its own accurate range', () => {
      const src = 'has(user.name)'
      const ast = parse(src).ast

      // call.args = [methodName, fnArgs]; fnArgs[0] is the field-access node
      const fieldAccess = ast.args[1][0]
      assert.strictEqual(fieldAccess.op, '.')
      equalsSlice(fieldAccess, 'user.name')
    })
  })

  describe('bracket access', () => {
    test('range spans receiver through closing bracket', () => {
      const src = 'tags[0]'
      const ast = parse(src).ast

      assert.strictEqual(ast.op, '[]')
      equalsSlice(ast, src)
      equalsSlice(ast.args[0], 'tags')
      equalsSlice(ast.args[1], '0')
    })

    test('chained bracket access: each node spans only its own brackets', () => {
      const src = 'data["key"][1]'
      const ast = parse(src).ast

      equalsSlice(ast, src)
      equalsSlice(ast.args[1], '1')

      const inner = ast.args[0]
      equalsSlice(inner, 'data["key"]')
      equalsSlice(inner.args[0], 'data')
      equalsSlice(inner.args[1], '"key"')
    })
  })

  describe('function calls', () => {
    test('two-arg call: range spans name through closing paren, args have their own ranges', () => {
      const src = 'max(a, b + 1)'
      const ast = parse(src).ast

      // call.args = [functionName, fnArgs]
      assert.strictEqual(ast.op, 'call')
      equalsSlice(ast, src)
      assert.strictEqual(ast.args[0], 'max')
      equalsSlice(ast.args[1][0], 'a')
      equalsSlice(ast.args[1][1], 'b + 1')
    })
  })

  describe('parse errors', () => {
    test('error node range points to the invalid escape sequence', () => {
      const src = '"\\x0G"'

      try {
        parse(src)
        assert.fail('Expected a parse error')
      } catch (error) {
        assert.ok(error instanceof ParseError)
        assert.strictEqual(src.slice(error.node.start, error.node.end), '\\x0G')
      }
    })

    test('error node exposes pos, start, end and input', () => {
      const src = '"\\x0G"'

      assert.throws(() => parse(src), {
        name: 'ParseError',
        node: {pos: 1, start: 1, end: 5, input: src}
      })
    })
  })
})

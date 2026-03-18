import {describe, test} from 'node:test'
import assert from 'node:assert/strict'
import {parse, ParseError} from '../lib/index.js'

describe('Source ranges', () => {
  test('tracks stable ranges on AST nodes', () => {
    const source = 'user.name + tags[0]'
    const ast = parse(source).ast

    assert.strictEqual(ast.op, '+')
    assert.strictEqual(ast.pos, source.indexOf('+'))
    assert.strictEqual(ast.start, 0)
    assert.strictEqual(ast.end, source.length)
    assert.deepStrictEqual(ast.range, {start: 0, end: source.length})
    assert.strictEqual(source.slice(ast.start, ast.end), source)

    const left = ast.args[0]
    assert.strictEqual(left.op, '.')
    assert.strictEqual(left.start, 0)
    assert.strictEqual(left.end, 'user.name'.length)
    assert.strictEqual(source.slice(left.start, left.end), 'user.name')

    const right = ast.args[1]
    assert.strictEqual(right.op, '[]')
    assert.strictEqual(source.slice(right.start, right.end), 'tags[0]')
  })

  test('tracks stable ranges on parse errors', () => {
    const source = '"\\x0G"'

    assert.throws(
      () => parse(source),
      {
        name: 'ParseError',
        node: {
          pos: 1,
          start: 1,
          end: 5,
          input: source
        }
      }
    )

    try {
      parse(source)
      assert.fail('Expected a parse error')
    } catch (error) {
      assert.ok(error instanceof ParseError)
      assert.strictEqual(source.slice(error.node.start, error.node.end), '\\x0G')
    }
  })
})

import {test, describe} from 'node:test'
import {evaluate, parse} from '../index.js'

describe('atomic expressions', () => {
  test('should evaluate a number', (t) => {
    t.assert.strictEqual(evaluate('1'), 1)
  })

  test('should evaluate a true boolean literal', (t) => {
    t.assert.strictEqual(evaluate('true'), true)
  })

  test('should evaluate a false boolean literal', (t) => {
    t.assert.strictEqual(evaluate('false'), false)
  })

  test('should evaluate null literal', (t) => {
    t.assert.strictEqual(evaluate('null'), null)
  })

  test('should evaluate a string literal', (t) => {
    t.assert.strictEqual(evaluate('"foo"'), 'foo')
  })

  test('should evaluate a float', (t) => {
    t.assert.strictEqual(evaluate('1.2'), 1.2)
  })

  test('should parse successfully', (t) => {
    const result = parse('42')
    t.assert.strictEqual(typeof result, 'function')
    t.assert.strictEqual(result.ast, 42)
  })

  test('should parse string successfully', (t) => {
    const result = parse('"hello"')
    t.assert.strictEqual(typeof result, 'function')
    t.assert.strictEqual(result.ast, 'hello')
  })

  test('should parse boolean successfully', (t) => {
    const result = parse('true')
    t.assert.strictEqual(typeof result, 'function')
    t.assert.strictEqual(result.ast, true)
  })
})

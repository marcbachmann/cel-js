import {test, describe} from 'node:test'
import {expectEval, expectParseAst} from './helpers.js'

describe('atomic expressions', () => {
  test('should evaluate a number', () => expectEval('1', 1n))
  test('should evaluate a true boolean literal', () => expectEval('true', true))
  test('should evaluate a false boolean literal', () => expectEval('false', false))
  test('should evaluate null literal', () => expectEval('null', null))
  test('should evaluate a string literal', () => expectEval('"foo"', 'foo'))
  test('should evaluate a float', () => expectEval('1.2', 1.2))
  test('should parse successfully', () => expectParseAst('42', {op: 'value', args: 42n}))
  test('should parse string successfully', () =>
    expectParseAst('"hello"', {op: 'value', args: 'hello'}))
  test('should parse boolean successfully', () => expectParseAst('true', {op: 'value', args: true}))
})

#!/usr/bin/env node
import {parse} from '../lib/index.js'
function replacer(k, v) {
  return typeof v === 'bigint' ? JSON.rawJSON(v.toString()) : v
}

function stringify(val) {
  return JSON.stringify(val, replacer)
}

function error(err) {
  console.error(`Usage: npx @marcbachmann/cel-js '<expression>' ['<context as JSON>']`)
  console.error(`Example: npx @marcbachmann/cel-js 'user.age >= 18' '{"user": {"age": 20}}'\n`)
  if (err) console.error(`Error: ${err.message}`)
  process.exit(1)
}

const [expr, data] = process.argv.slice(2)
if (!expr) error(new Error('No expression provided'))

let evaluate, ctx, result
try {
  evaluate = parse(expr)
} catch (e) {
  error(e)
}

try {
  ctx = data ? JSON.parse(data) : null
} catch (e) {
  error(new Error('Failed to parse context JSON.'))
}

try {
  result = evaluate(ctx)
} catch (e) {
  error(e)
}

try {
  process.stdout.write(stringify(result))
  process.stdout.write('\n')
} catch (e) {
  error(new Error('Failed to serialize result to JSON.'))
}

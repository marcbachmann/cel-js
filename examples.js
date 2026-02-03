#!/usr/bin/env node
/* eslint-disable no-console */

// Examples demonstrating My CEL JS usage
import {evaluate, parse, Environment} from './lib/index.js'

console.log('🚀 My CEL JS Examples\n')

// Basic arithmetic
console.log('📊 Basic Arithmetic:')
console.log('1 + 2 * 3 =', evaluate('1 + 2 * 3'))
console.log('(1 + 2) * 3 =', evaluate('(1 + 2) * 3'))
console.log('10 / 2 + 1 =', evaluate('10 / 2 + 1'))

// String operations
console.log('\n📝 String Operations:')
console.log('"Hello" + " " + "World" =', evaluate('"Hello" + " " + "World"'))
console.log('size("JavaScript") =', evaluate('size("JavaScript")'))

// Boolean logic
console.log('\n🔀 Boolean Logic:')
console.log('true && false =', evaluate('true && false'))
console.log('!true || false =', evaluate('!true || false'))
console.log('1 < 2 && 3 > 2 =', evaluate('1 < 2 && 3 > 2'))

// Arrays and objects
console.log('\n📋 Arrays and Objects:')
console.log('[1, 2, 3][1] =', evaluate('[1, 2, 3][1]'))
console.log('{"name": "John"}.name =', evaluate('{"name": "John"}.name'))
console.log('size([1, 2, 3, 4]) =', evaluate('size([1, 2, 3, 4])'))

// Conditional expressions
console.log('\n❓ Conditional Expressions:')
console.log('true ? "yes" : "no" =', evaluate('true ? "yes" : "no"'))
console.log('age >= 18 ? "adult" : "minor" =', evaluate('age >= 18 ? "adult" : "minor"', {age: 25}))

// Working with context
console.log('\n🔍 Working with Context:')
const userContext = {
  user: {
    name: 'Alice',
    age: 25,
    roles: ['user', 'admin'],
    settings: {theme: 'dark', notifications: true}
  }
}

console.log('user.name =', evaluate('user.name', userContext))
console.log('user.age >= 21 =', evaluate('user.age >= 21', userContext))
console.log('"admin" in user.roles =', evaluate('"admin" in user.roles', userContext))
console.log(
  'user.settings.theme == "dark" =',
  evaluate('user.settings.theme == "dark"', userContext)
)

// Complex access control example
console.log('\n🔐 Access Control Example:')
const accessExpression = `
  user.age >= 18 && 
  ("admin" in user.roles || "moderator" in user.roles) &&
  user.settings.notifications ? 
    "Full access granted" : 
    "Limited access"
`
console.log('Access result:', evaluate(accessExpression, userContext))

// Custom functions using Environment API (recommended)
console.log('\n⚙️  Custom Functions (Environment API):')
const env = new Environment()
  .registerVariable('user', 'map')
  .registerVariable('x', 'int')
  .registerFunction('multiplyByTwo(int): int', (x) => x * 2n)
  .registerFunction('greet(string): string', (name) => `Hello, ${name}!`)
  .registerFunction('max(int, int): int', (a, b) => (a > b ? a : b))

console.log('multiplyByTwo(5) =', env.evaluate('multiplyByTwo(5)', {x: 5n}))
console.log('greet(user.name) =', env.evaluate('greet(user.name)', userContext))
console.log('max(10, 20) =', env.evaluate('max(10, 20)', {}))

// Membership testing
console.log('\n🔍 Membership Testing:')
console.log('2 in [1, 2, 3] =', evaluate('2 in [1, 2, 3]'))
console.log(
  '"name" in {"name": dyn("John"), "age": dyn(30)} =',
  evaluate('"name" in {"name": dyn("John"), "age": dyn(30)}')
)

// Array operations
console.log('\n📚 Array Operations:')
console.log('[1, 2] + [3, 4] =', evaluate('[1, 2] + [3, 4]'))
console.log('size(user.roles) =', evaluate('size(user.roles)', userContext))

// Parse and evaluate separately
console.log('\n🔧 Parse and Evaluate Separately:')
const evaluateResult = parse('1 + 2 * 3')
console.log('Parse result:', evaluateResult.ast)
console.log('Evaluation result:', evaluateResult())

// Error handling
console.log('\n⚠️  Error Handling:')
try {
  evaluate('unknownVariable')
} catch (err) {
  console.log('Error caught:', err.message)
}

try {
  parse('1 +')
} catch (err) {
  console.log('Invalid parse result:', err.message)
}

console.log('\n✨ All examples completed!')

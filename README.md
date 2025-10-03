# @marcbachmann/cel-js

A high-performance, zero-dependency implementation of the [Common Expression Language (CEL)](https://github.com/google/cel-spec) in JavaScript.

[![npm version](https://img.shields.io/npm/v/@marcbachmann/cel-js.svg)](https://www.npmjs.com/package/@marcbachmann/cel-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

CEL (Common Expression Language) is a non-Turing complete language designed for simplicity, speed, safety, and portability. This JavaScript implementation provides a fast, lightweight CEL evaluator perfect for policy evaluation, configuration, and embedded expressions.

## Features

- 🚀 **Zero Dependencies** - No external packages required
- ⚡ **High Performance** - Up to 22x faster evaluation, 3x faster parsing than alternatives
- 📦 **ES Modules** - Modern ESM with full tree-shaking support
- 🔒 **Type Safe** - Environment API with type checking for variables and custom functions
- 🎯 **Most of the CEL Spec** - Including macros, type functions, and operators
- 📘 **TypeScript Support** - Full type definitions included

## Installation

```bash
npm install @marcbachmann/cel-js
```

## Quick Start

```javascript
import {evaluate} from '@marcbachmann/cel-js'

// Simple evaluation
evaluate('1 + 2 * 3') // 7n

// With context
const allowed = evaluate(
  'user.age >= 18 && "admin" in user.roles',
  {user: {age: 30, roles: ['admin', 'user']}}
)
// true
```

## API

### Simple Evaluation

```javascript
import {evaluate, parse} from '@marcbachmann/cel-js'

// Direct evaluation
evaluate('1 + 2') // 3n

// With variables
evaluate('name + "!"', {name: 'Alice'}) // "Alice!"

// Parse once, evaluate multiple times for better performance
const expr = parse('user.age >= minAge')
expr({user: {age: 25}, minAge: 18}) // true
expr({user: {age: 16}, minAge: 18}) // false
```

### Environment API (Recommended)

For type-safe expressions with custom functions and operators:

```javascript
import {Environment} from '@marcbachmann/cel-js'

const env = new Environment()
  .registerVariable('user', 'map')
  .registerVariable('minAge', 'int')
  .registerFunction('isAdult(int): bool', age => age >= 18n)
  .registerOperator('string * int', (str, n) => str.repeat(Number(n)))

// Type-checked evaluation
env.evaluate('isAdult(user.age)', {
  user: {age: 25n},
  minAge: 18n
})

// Custom operators
env.evaluate('"Hi" * 3') // "HiHiHi"
```

#### Environment Options

```javascript
new Environment({
  // Treat undeclared variables as dynamic type
  unlistedVariablesAreDyn: false,

  // Support legacy function format (deprecated)
  supportLegacyFunctions: false
})
```

#### Environment Methods

- **`registerVariable(name, type)`** - Declare a variable with type checking
- **`registerType(typename, constructor)`** - Register custom types
- **`registerFunction(signature, handler)`** - Add custom functions
- **`registerOperator(signature, handler)`** - Add custom operators
- **`hasVariable(name)`** - Check if variable is registered
- **`parse(expression)`** - Parse expression for reuse
- **`evaluate(expression, context)`** - Evaluate with context

**Supported Types:** `int`, `uint`, `double`, `string`, `bool`, `bytes`, `list`, `map`, `timestamp`, `duration`, `null_type`, `type`, `dyn`, or custom types

## Language Features

### Operators

```javascript
// Arithmetic
evaluate('10 + 5 - 3')     // 12n
evaluate('10 * 5 / 2')     // 25n
evaluate('10 % 3')         // 1n

// Comparison
evaluate('5 > 3')          // true
evaluate('5 >= 5')         // true
evaluate('5 == 5')         // true
evaluate('5 != 4')         // true

// Logical
evaluate('true && false')  // false
evaluate('true || false')  // true
evaluate('!false')         // true

// Ternary
evaluate('5 > 3 ? "yes" : "no"')  // "yes"

// Membership
evaluate('2 in [1, 2, 3]')        // true
evaluate('"ell" in "hello"')      // true
```

### Data Types

```javascript
// Numbers (default to BigInt)
evaluate('42')           // 42n
evaluate('3.14')         // 3.14
evaluate('0xFF')         // 255n

// Strings
evaluate('"hello"')      // "hello"
evaluate('r"\\n"')       // "\\n" (raw string)
evaluate('"""multi\nline"""')  // "multi\nline\n"

// Bytes
evaluate('b"hello"')     // Uint8Array
evaluate('b"\\xFF"')     // Uint8Array [255]

// Collections
evaluate('[1, 2, 3]')           // [1n, 2n, 3n]
evaluate('{name: "Alice"}')     // {name: "Alice"}

// Other
evaluate('true')         // true
evaluate('null')         // null
```

### Built-in Functions

```javascript
// Type conversion
evaluate('string(123)')           // "123"
evaluate('int("42")')             // 42n
evaluate('double("3.14")')        // 3.14
evaluate('bytes("hello")')        // Uint8Array

// Collections
evaluate('size([1, 2, 3])')       // 3n
evaluate('size("hello")')         // 5n
evaluate('size({a: 1, b: 2})')    // 2n

// Time
evaluate('timestamp("2024-01-01T00:00:00Z")')  // Date

// Type checking
evaluate('type(42)')              // int
evaluate('type("hello")')         // string
```

### String Methods

```javascript
evaluate('"hello".contains("ell")')         // true
evaluate('"hello".startsWith("he")')        // true
evaluate('"hello".endsWith("lo")')          // true
evaluate('"hello".matches("h.*o")')         // true
evaluate('"hello".size()')                  // 5n
```

### Macros

```javascript
const ctx = {
  numbers: [1, 2, 3, 4, 5],
  users: [
    {name: 'Alice', admin: true},
    {name: 'Bob', admin: false}
  ]
}

// Check property exists
evaluate('has(user.email)', {user: {}})  // false

// All elements match
evaluate('numbers.all(n, n > 0)', ctx)   // true

// Any element matches
evaluate('numbers.exists(n, n > 3)', ctx)  // true

// Exactly one matches
evaluate('numbers.exists_one(n, n == 3)', ctx)  // true

// Transform
evaluate('numbers.map(n, n * 2)', ctx)
// [2n, 4n, 6n, 8n, 10n]

// Filter
evaluate('numbers.filter(n, n > 2)', ctx)
// [3n, 4n, 5n]

// Filter + Transform
evaluate('users.filter(u, u.admin).map(u, u.name)', ctx)

// Or using three arg form of .map
evaluate('users.map(u, u.admin, u.name)', ctx)
// ["Alice"]
```

### Custom Types

```javascript
import {Environment} from '@marcbachmann/cel-js'

class Vector {
  constructor(x, y) {
    this.x = x
    this.y = y
  }
  add(other) {
    return new Vector(this.x + other.x, this.y + other.y)
  }
}

const env = new Environment()
  .registerType('Vector', Vector)
  .registerVariable('v1', 'Vector')
  .registerVariable('v2', 'Vector')
  .registerOperator('Vector + Vector', (a, b) => a.add(b))
  .registerFunction('magnitude(Vector): double', (v) =>
    Math.sqrt(v.x * v.x + v.y * v.y)
  )

const result = env.evaluate('magnitude(v1 + v2)', {
  v1: new Vector(3, 4),
  v2: new Vector(1, 2)
})
// 7.211102550927978
```

## Performance

Benchmark results comparing against the `cel-js` package on Node.js v24.8.0 (Apple Silicon):

### Parsing Performance
- **Average: 3.1x faster** (range: 0.76x - 14.8x)
- Simple expressions: **7-15x faster**
- Array/Map creation: **8-10x faster**

### Evaluation Performance
- **Average: 22x faster** (range: 5.5x - 111x)
- Simple values: **64-111x faster**
- Collections: **46-58x faster**
- Complex logic: **5-14x faster**

### Highlights

| Operation | Parsing | Evaluation |
|-----------|---------|------------|
| Simple number | 7.3x | 111x |
| Array creation | 10.1x | 57.9x |
| Map creation | 8.6x | 46x |
| Complex authorization | 1.3x | 5.5x |

Run benchmarks: `npm run benchmark`

## Error Handling

```javascript
import {evaluate, ParseError, EvaluationError} from '@marcbachmann/cel-js'

try {
  evaluate('invalid + + syntax')
} catch (error) {
  if (error instanceof ParseError) {
    console.error('Syntax error:', error.message)
  } else if (error instanceof EvaluationError) {
    console.error('Runtime error:', error.message)
  }
}
```

## Examples

### Authorization Rules

```javascript
import {Environment} from '@marcbachmann/cel-js'

const authEnv = new Environment()
  .registerVariable('user', 'map')
  .registerVariable('resource', 'map')

const canEdit = authEnv.parse(
  'user.isActive && ' +
  '(user.role == "admin" || ' +
  ' user.id == resource.ownerId)'
)

canEdit({
  user: {id: 123, role: 'user', isActive: true},
  resource: {ownerId: 123}
}) // true
```

### Data Validation

```javascript
import {Environment} from '@marcbachmann/cel-js'

const validator = new Environment()
  .registerVariable('email', 'string')
  .registerVariable('age', 'int')
  .registerFunction('isValidEmail(string): bool',
    email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )

const valid = validator.evaluate(
  'isValidEmail(email) && age >= 18 && age < 120',
  {email: 'user@example.com', age: 25n}
)
```

### Feature Flags

```javascript
import {parse} from '@marcbachmann/cel-js'

const flags = {
  'new-dashboard': parse(
    'user.betaUser || user.id in allowedUserIds'
  ),
  'premium-features': parse(
    'user.subscription == "pro" && !user.trialExpired'
  )
}

function isEnabled(feature, context) {
  return flags[feature]?.(context) ?? false
}
```

## TypeScript

Full TypeScript support included:

```typescript
import {Environment, evaluate, ParseError} from '@marcbachmann/cel-js'

const env = new Environment()
  .registerVariable('count', 'int')
  .registerFunction('double(int): int', (x) => x * 2n)

const result: any = env.evaluate('double(count)', {count: 21n})
```

## Contributing

Contributions welcome! Please open an issue before submitting major changes.

```bash
# Run tests
npm test

# Run benchmarks
npm run benchmark

# Run in watch mode
npm run test:watch
```

## License

MIT © Marc Bachmann

## See Also

- [CEL Specification](https://github.com/google/cel-spec)
- [CEL Go Implementation](https://github.com/google/cel-go)

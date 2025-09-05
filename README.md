# @marcbachmann/cel-js

A lightweight, zero-dependency implementation of the [Common Expression Language (CEL)](https://github.com/google/cel-spec) in JavaScript.

[![npm version](https://img.shields.io/npm/v/@marcbachmann/cel-js.svg)](https://www.npmjs.com/package/@marcbachmann/cel-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@marcbachmann/cel-js.svg)](https://nodejs.org/en/)

## Overview

CEL (Common Expression Language) is a non-Turing complete language designed for simplicity, speed, safety, and portability. This JavaScript implementation provides a fast, lightweight CEL evaluator with zero external dependencies, making it perfect for embedded expression evaluation in JavaScript applications.

## Features

- 🚀 **Zero Dependencies** - No external packages, minimal bundle size
- ⚡ **High Performance** - Optimized lexer, parser, and evaluator
- 📦 **ES Modules** - Modern ESM support with full tree-shaking capabilities
- 🔧 **Type Support** - Full support for CEL's type system including strings, numbers, booleans, lists, maps, and bytes
- 🛡️ **Safe Evaluation** - Sandboxed expression evaluation with no access to the JavaScript runtime
- 🎯 **Complete CEL Support** - Implements the full CEL specification including:
  - All arithmetic, comparison, and logical operators
  - String and bytes literals with escape sequences
  - List and map construction
  - Property access and indexing
  - Function calls and receiver-style method calls
  - Macros (`has`, `all`, `exists`, `exists_one`, `map`, `filter`)
  - Ternary conditional operator

## Installation

```bash
npm install @marcbachmann/cel-js
```

## Quick Start

```javascript
import { evaluate, parse } from '@marcbachmann/cel-js'

// Simple evaluation
console.log(evaluate('1 + 2 * 3')) // 7

// With context
const context = {
  user: {
    name: 'Alice',
    age: 30,
    roles: ['admin', 'user']
  }
}

const result = evaluate('user.age >= 18 && "admin" in user.roles', context)
console.log(result) // true

// Parse once, evaluate multiple times
const expression = parse('user.age >= age_limit')
console.log(expression({ user: { age: 25 }, age_limit: 21 })) // true
console.log(expression({ user: { age: 18 }, age_limit: 21 })) // false
```

## API Reference

### `evaluate(expression, context?, functions?)`

Evaluates a CEL expression string and returns the result.

```javascript
evaluate(expression: string, context?: object, functions?: object): any
```

**Parameters:**
- `expression` - The CEL expression string to evaluate
- `context` - Optional object containing variables accessible in the expression
- `functions` - Optional object containing custom functions

**Returns:** The evaluated result

**Throws:** `ParseError` or `EvaluationError` on invalid expressions

### `parse(expression)`

Parses a CEL expression and returns a reusable evaluator function.

```javascript
parse(expression: string): (context?: object, functions?: object) => any
```

**Parameters:**
- `expression` - The CEL expression string to parse

**Returns:** A function that can be called with context and functions to evaluate the expression

**Throws:** `ParseError` on syntax errors

### Error Types

- `ParseError` - Thrown when an expression has invalid syntax
- `EvaluationError` - Thrown when an expression cannot be evaluated (e.g., undefined variable, type mismatch)

## Expression Language Guide

### Basic Types

```javascript
// Numbers
evaluate('42')        // 42
evaluate('3.14')      // 3.14
evaluate('0xFF')      // 255 (hex)
evaluate('0xFFu')     // 255 (unsigned)

// Strings
evaluate('"Hello"')   // "Hello"
evaluate("'World'")   // "World"
evaluate('"""
Multi
line
"""')                // "Multi\nline\n"

// Booleans
evaluate('true')      // true
evaluate('false')     // false

// Null
evaluate('null')      // null
```

### Operators

```javascript
// Arithmetic
evaluate('2 + 3')     // 5
evaluate('5 - 2')     // 3
evaluate('3 * 4')     // 12
evaluate('10 / 2')    // 5
evaluate('10 % 3')    // 1
evaluate('-5')        // -5

// Comparison
evaluate('5 == 5')    // true
evaluate('5 != 4')    // true
evaluate('5 > 4')     // true
evaluate('5 >= 5')    // true
evaluate('3 < 4')     // true
evaluate('3 <= 3')    // true

// Logical
evaluate('true && false')  // false
evaluate('true || false')  // true
evaluate('!true')          // false

// String concatenation
evaluate('"Hello" + " " + "World"')  // "Hello World"

// Membership
evaluate('2 in [1, 2, 3]')           // true
evaluate('"lo" in "Hello"')          // true
```

### Collections

```javascript
// Lists
evaluate('[1, 2, 3]')              // [1, 2, 3]
evaluate('[1, 2, 3][1]')           // 2
evaluate('[1, 2, 3].size()')       // 3

// Maps
evaluate('{name: "John", age: 30}')         // {name: "John", age: 30}
evaluate('{"key": "value"}.key')             // "value"
evaluate('{1: "one", 2: "two"}[2]')         // "two"
```

### Built-in Functions

```javascript
// Type conversion
evaluate('string(123)')           // "123"
evaluate('bytes("hello")')        // Uint8Array

// Size
evaluate('size("hello")')         // 5
evaluate('size([1, 2, 3])')      // 3
evaluate('size({a: 1, b: 2})')   // 2

// Timestamps
evaluate('timestamp("2023-01-01T00:00:00Z")')  // Date object
```

### String Methods

```javascript
evaluate('"hello".size()')                    // 5
evaluate('"hello".startsWith("he")')          // true
evaluate('"hello".endsWith("lo")')            // true
evaluate('"hello".contains("ell")')           // true
evaluate('"hello".matches("h.*o")')           // true
```

### Bytes Operations

```javascript
// Bytes literals
evaluate('b"hello"')                         // Uint8Array
evaluate('b"\\xFF\\x00"')                   // Uint8Array with hex values

// Bytes methods
evaluate('b"hello".size()')                  // 5
evaluate('b"hello"[0]')                      // 104
evaluate('b"hello".toString()')              // "hello"
evaluate('b"hello".toString("base64")')      // "aGVsbG8="
evaluate('b"hello".toString("hex")')         // "68656c6c6f"
```

### Macros

```javascript
// has - check if field exists
evaluate('has(user.email)', { user: { name: 'John' } })  // false

// all - check if all elements match
evaluate('numbers.all(x, x > 0)', { numbers: [1, 2, 3] })  // true

// exists - check if any element matches
evaluate('numbers.exists(x, x > 5)', { numbers: [1, 5, 10] })  // true

// exists_one - check if exactly one element matches
evaluate('numbers.exists_one(x, x == 5)', { numbers: [1, 5, 10] })  // true

// map - transform elements
evaluate('numbers.map(x, x * 2)', { numbers: [1, 2, 3] })  // [2, 4, 6]

// filter - filter elements
evaluate('numbers.filter(x, x > 2)', { numbers: [1, 2, 3, 4] })  // [3, 4]
```

### Date/Time Operations

```javascript
const context = {
  now: new Date('2024-01-15T10:30:00Z')
}

evaluate('now.getFullYear()', context)           // 2024
evaluate('now.getMonth()', context)               // 0 (January)
evaluate('now.getDate()', context)                // 15
evaluate('now.getHours()', context)               // 10
evaluate('now.getMinutes()', context)             // 30

// With timezone
evaluate('now.getHours("America/New_York")', context)  // 5 (UTC-5)
```

### Custom Functions

```javascript
const functions = {
  // Simple function
  double: (x) => x * 2,

  // Multiple parameters
  add: (a, b) => a + b,

  // String manipulation
  capitalize: (str) => str.charAt(0).toUpperCase() + str.slice(1),

  // Complex logic
  discount: (price, percentage) => price * (1 - percentage / 100)
}

evaluate('double(21)', {}, functions)                    // 42
evaluate('add(10, 5)', {}, functions)                   // 15
evaluate('capitalize("hello")', {}, functions)          // "Hello"
evaluate('discount(100, 20)', {}, functions)            // 80
```

## Advanced Usage

### Expression Compilation

For better performance when evaluating the same expression multiple times:

```javascript
import { parse } from '@marcbachmann/cel-js'

// Parse once
const checkAccess = parse('user.role == "admin" && user.active')

// Evaluate many times with different contexts
const users = [
  { role: 'admin', active: true },
  { role: 'user', active: true },
  { role: 'admin', active: false }
]

users.forEach(user => {
  console.log(checkAccess({ user }))
})
// Output: true, false, false
```

### Error Handling

```javascript
import { evaluate, ParseError, EvaluationError } from '@marcbachmann/cel-js'

try {
  const result = evaluate('invalid syntax +++')
} catch (error) {
  if (error instanceof ParseError) {
    console.error('Syntax error:', error.message)
  } else if (error instanceof EvaluationError) {
    console.error('Runtime error:', error.message)
  }
}
```

### Complex Example

```javascript
import {parse} from '@marcbachmann/cel-js'
const context = {
  request: {
    method: 'POST',
    path: '/api/users',
    user: {
      id: 123,
      role: 'admin',
      permissions: ['read', 'write', 'delete']
    },
    body: {
      name: 'New User',
      email: 'newuser@example.com'
    }
  },
  resource: {
    owner_id: 456,
    public: false
  }
}

const rules = {
  // Admin can do anything
  isAdmin: 'request.user.role == "admin"',

  // User owns the resource
  isOwner: 'request.user.id == resource.owner_id',

  // Has specific permission
  canDelete: '"delete" in request.user.permissions',

  // Complex access rule
  canAccess: `
    resource.public ||
    request.user.role == "admin" ||
    (isOwner && request.method in ["GET", "PUT"])
  `,

  // Validate request
  validRequest: `
    request.method == "POST" &&
    has(request.body.name) &&
    has(request.body.email) &&
    request.body.email.matches("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}$")
  `
}

// Compile all rules
const compiledRules = {}
for (const [name, expr] of Object.entries(rules)) {
  compiledRules[name] = parse(expr)
}

// Evaluate all rules
const results = {}
for (const [name, rule] of Object.entries(compiledRules)) {
  results[name] = rule(context)
}

console.log(results)
// {
//   isAdmin: true,
//   isOwner: false,
//   canDelete: true,
//   canAccess: true,
//   validRequest: true
// }
```

## Performance

This implementation is designed for high performance:

- **Hand-written lexer** - No regex overhead, direct character processing
- **Efficient parser** - Recursive descent with minimal allocations
- **Optimized AST** - Array-based representation for cache efficiency
- **Fast evaluation** - Direct interpretation without intermediate representations

### Benchmark Results

Comparison with the `cel-js` package shows significant performance improvements:

#### Parsing Performance
- **Average speedup: 3.38x faster**
- Range: 1.62x - 10.91x faster across different expression types
- Fastest on array creation (10.91x) and map creation (6.69x)
- Consistently faster on all 21 test expressions

#### Evaluation Performance  
- **Average speedup: 12.94x faster**
- Range: 5.88x - 28.54x faster
- Array creation: **28.54x faster**
- Map creation: **21.80x faster**
- Simple primitives: **15-20x faster**
- Complex authorization checks: **5.88x faster**

#### Combined Parse + Evaluate Performance
- **Average speedup: 6.10x faster**
- Range: 1.07x - 18.92x faster
- Simple expressions: **17-19x faster**
- Complex expressions: **2-4x faster**
- List comprehensions: **3.59x faster**

#### Specific Operation Performance Highlights

| Operation | Parse | Evaluate | Combined |
|-----------|-------|----------|----------|
| Simple Number (42) | 5.36x | 17.88x | 17.87x |
| Simple Boolean (true) | 5.85x | 19.66x | 18.92x |
| Array Creation [1,2,3,4,5] | 10.91x | 28.54x | 13.72x |
| Map Creation {"foo": 1, ...} | 6.69x | 21.80x | 9.28x |
| Property Access (user.name) | 2.70x | 10.28x | 4.23x |
| Complex Logic | 2.24x | 11.47x | 2.21x |
| Authorization Check | 1.63x | 5.88x | 2.16x |
| List Comprehension | 2.29x | 7.46x | 3.59x |

#### Feature Advantages
@marcbachmann/cel-js supports features not available in cel-js:
- ✅ String methods (`startsWith`, `endsWith`, `contains`, `matches`)
- ✅ Macros (`has`, `all`, `exists`, `exists_one`, `map`, `filter`)
- ✅ Type functions (`string`, `bytes`, `timestamp`, `size`)
- ✅ Bytes literals and operations
- ✅ Raw strings and escape sequences
- ✅ Triple-quoted strings

### Running Benchmarks

```bash
# Performance benchmark
npm run benchmark

# Memory usage benchmark
npm run benchmark:memory

# With detailed GC stats
node --expose-gc benchmark/memory.js
```

**Test Environment**: Node.js v24.6.0 on Darwin ARM64 (Apple Silicon)
**Benchmark Configuration**: 10,000 iterations each for parsing and evaluation, with 5,000 warmup iterations

See the [benchmark directory](./benchmark/README.md) for detailed benchmark documentation and results.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run benchmarks
npm run benchmark

# Run memory benchmarks
npm run benchmark:memory
```

## License

MIT © Marc Bachmann

## See Also

- [CEL Specification](https://github.com/google/cel-spec) - The official CEL specification
- [CEL C++ Implementation](https://github.com/google/cel-cpp) - Google's C++ implementation
- [CEL Go Implementation](https://github.com/google/cel-go) - Google's Go implementation

## Acknowledgments

This implementation follows the CEL specification created by Google. CEL was designed to be simple, fast, and safe for expression evaluation in various contexts including security policies, protocols, and configurations.

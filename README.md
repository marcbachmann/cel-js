# @marcbachmann/cel-js [![npm version](https://img.shields.io/npm/v/@marcbachmann/cel-js.svg)](https://www.npmjs.com/package/@marcbachmann/cel-js) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A high-performance, zero-dependency implementation of the [Common Expression Language (CEL)](https://github.com/google/cel-spec) in JavaScript.

🚀 Use the [CEL JS Playground](https://playceljs.sksop.in/) to test expressions.

## Overview

CEL (Common Expression Language) is a non-Turing complete language designed for simplicity, speed, safety, and portability. This JavaScript implementation provides a fast, lightweight CEL evaluator perfect for policy evaluation, configuration, and embedded expressions.

## Features

- 🚀 **Zero Dependencies** - No external packages required
- ⚡ **High Performance** - Up to 22x faster evaluation, 3x faster parsing than alternatives
- 📦 **ES Modules** - Modern ESM with full tree-shaking support
- 🔒 **Type Safe** - Environment API with type checking for variables, custom types and functions
- 🎯 **Most of the CEL Spec** - Including macros, custom functions and types, optional chaining, input variables, and all operators
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

// Access parsed AST and type checking
console.log(expr.ast)        // AST representation
const typeCheck = expr.check() // Type check without evaluation
```

### Environment API (Recommended)

For type-safe expressions with custom functions and operators:

```javascript
import {Environment} from '@marcbachmann/cel-js'

const env = new Environment()
  .registerVariable('user', 'map')
  .registerConstant('minAge', 'int', 18n)
  .registerFunction('isAdult(int): bool', age => age >= 18n)
  .registerOperator('string * int', (str, n) => str.repeat(Number(n)))

// Type-checked evaluation with constant
env.evaluate('isAdult(user.age) && user.age >= minAge', {
  user: {age: 25n}
})

// Custom operators
env.evaluate('"Hi" * 3') // "HiHiHi"
```

#### Register constants

Use `registerConstant` to expose shared configuration without passing it through every evaluation context.

```javascript
import {Environment} from '@marcbachmann/cel-js'

const env = new Environment()
  .registerConstant('minAge', 'int', 18n)

env.evaluate('user.age >= minAge', {user: {age: 20n}}) // true
```

Supported signatures:

```javascript
env.registerConstant('minAge', 'int', 18n)
env.registerConstant({name: 'minAge', type: 'int', value: 18n, description: 'Minimum age'})
```

#### Environment Options

```javascript
new Environment({
  // Treat undeclared variables as dynamic type
  unlistedVariablesAreDyn: false,
  // Require list/map literals to stay strictly homogeneous (default: true)
  homogeneousAggregateLiterals: true,
  // Enable .?key/.[?key] optional chaining and optional.* helpers (default: false)
  enableOptionalTypes: true,
  // Optional structural limits (parse time)
  limits: {
    maxAstNodes: 100000,
    maxDepth: 250,
    maxListElements: 1000,
    maxMapEntries: 1000,
    maxCallArguments: 32
  }
})
```

- Set `homogeneousAggregateLiterals` to `false` if you need aggregate literals to accept mixed element/key/value types without wrapping everything in `dyn(...)`.
- Set `enableOptionalTypes` to `true` to activate optional chaining.

#### Environment Methods

- **`registerVariable(name, type)`** - Declare a variable with type checking
- **`registerType(typename, constructor)`** - Register custom types
- **`registerFunction(signature, handler)`** - Add custom functions
- **`registerOperator(signature, handler)`** - Add custom operators
- **`registerConstant(name, type, value)`** - Provide immutable values without passing them in context
- **`clone()`** - Create a fast, isolated copy that stops the parent from registering more entries
- **`hasVariable(name)`** - Check if variable is registered
- **`parse(expression)`** - Parse expression for reuse
- **`evaluate(expression, context)`** - Evaluate with context
- **`check(expression)`** - Validate expression types without evaluation
- **`getDefinitions()`** - Returns all registered variables and functions with their types, signatures, and descriptions

#### `registerVariable` signatures

```javascript
env.registerVariable('user', 'map')
env.registerVariable('user', 'map', {description: 'The current user'})
env.registerVariable('user', {type: 'map', description: 'The current user'})
env.registerVariable({name: 'user', type: 'map', description: 'The current user'})
```

The `type` can be a type string (e.g. `'int'`, `'map'`, `'list<string>'`) or a `TypeDeclaration` obtained from another environment.

#### `registerFunction` signatures

```javascript
// Signature string + handler
env.registerFunction('greet(string): string', (name) => `Hello, ${name}!`)
env.registerFunction('greet(string): string', handler, {description: 'Greets someone'})
env.registerFunction('greet(string): string', {handler, description: 'Greets someone'})

// Single object with signature string
env.registerFunction({signature: 'add(int, int): int', handler, description: 'Adds two integers'})

// Single object with signature string and named params
env.registerFunction({
  signature: 'formatDate(int, string): string',
  handler,
  description: 'Formats a timestamp',
  params: [
    {name: 'timestamp', description: 'Unix timestamp in seconds'},
    {name: 'format', description: 'Date format string'}
  ]
})

// Single object without signature string
env.registerFunction({
  name: 'multiply',
  returnType: 'int',
  handler: (a, b) => a * b,
  description: 'Multiplies two integers',
  params: [
    {name: 'a', type: 'int', description: 'First number'},
    {name: 'b', type: 'int', description: 'Second number'}
  ]
})

// Receiver method (called as 'hello'.shout())
env.registerFunction({
  name: 'shout',
  receiverType: 'string',
  returnType: 'string',
  handler: (str) => str.toUpperCase() + '!',
  params: []
})
```

#### `registerFunction` (sync & async)

`registerFunction(signature, handler)` accepts both synchronous and async handlers. When an async function (or a macro predicate/transform that uses async functions) participates in an expression, `env.evaluate()` returns a `Promise` that resolves with the final value. Consumers should `await` those evaluations when they register async behavior:

```javascript
const env = new Environment()
  .registerFunction('fetchUser(string): map', async (id) => {
    const res = await fetch(`/users/${id}`)
    return res.json()
  })

const user = await env.evaluate('fetchUser(userId)', {userId: '42'})
```

Async handlers are primarily intended for latency-sensitive lookups (e.g., cache fetches, lightweight RPC). CEL’s goal is still deterministic, predictable evaluation, so avoid building expressions that trigger unbounded async work (like nested loops within macros or large fan-out requests) even though the engine will await those results.

#### Environment Cloning

```javascript
import assert from 'node:assert/strict'

const parent = new Environment().registerVariable('user', 'map')
const child = parent.clone()

// Parent registries is frozen once cloned
assert.throws(() => parent.registerVariable('foo', 'dyn'))

// Child stays fully extensible without deep-copy overhead
child
  .registerFunction('isAdult(map): bool', (u) => u.age >= 18n)
  .registerVariable('minAge', 'int')

child.evaluate('isAdult(user) && user.age >= minAge', {
  user: {age: 20n},
  minAge: 18n
})
```

**Supported Types:** `int`, `uint`, `double`, `string`, `bool`, `bytes`, `list`, `map`, `timestamp`, `duration`, `null_type`, `type`, `dyn`, or custom types

### Type Checking

Validate expressions before evaluation to catch type errors early:

```javascript
import {Environment, TypeError} from '@marcbachmann/cel-js'

const env = new Environment()
  .registerVariable('age', 'int')
  .registerVariable('name', 'string')

// Check expression validity
const result = env.check('age >= 18 && name.startsWith("A")')

if (result.valid) {
  console.log(`Expression is valid, returns: ${result.type}`) // bool
  // Safe to evaluate
  const value = env.evaluate('age >= 18 && name.startsWith("A")', {
    age: 25n,
    name: 'Alice'
  })
} else {
  console.error(`Type error: ${result.error.message}`)
}

// Detect errors without evaluation
const invalid = env.check('age + name') // Invalid: can't add int + string
console.log(invalid.valid) // false
console.log(invalid.error.message) // "Operator '+' not defined for types 'int' and 'string'"
```

**Benefits:**
- Catch type mismatches before runtime
- Validate user-provided expressions safely
- Get inferred return types for expressions
- Better error messages with source location

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
evaluate('dyn(42)')               // Converts to dynamic type

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
evaluate('"hello".indexOf("ll")')           // 2n
evaluate('"hello world".indexOf("o", 5)')   // 7n (search from index 5)
evaluate('"hello".lastIndexOf("l")')        // 3n
evaluate('"hello".substring(1)')            // "ello"
evaluate('"hello".substring(1, 4)')         // "ell"
```

### List Methods

```javascript
evaluate('[1, 2, 3].size()')                // 3n
evaluate('["a", "b", "c"].join()')          // "abc"
evaluate('["a", "b", "c"].join(", ")')      // "a, b, c"
```

### Bytes Methods

```javascript
evaluate('b"hello".size()')                 // 5n
evaluate('b"hello".string()')               // "hello"
evaluate('b"hello".hex()')                  // "68656c6c6f"
evaluate('b"hello".base64()')               // "aGVsbG8="
evaluate('b"{\\"x\\": 42}".json()')         // {x: 42n}
evaluate('b"hello".at(0)')                  // 104n (byte value at index)
```

### Timestamp Methods

All timestamp methods support an optional timezone parameter (e.g., `"America/New_York"`, `"UTC"`):

```javascript
const ctx = {t: new Date('2024-01-15T14:30:45.123Z')}

evaluate('t.getFullYear()', ctx)            // 2024n
evaluate('t.getMonth()', ctx)               // 0n (January, 0-indexed)
evaluate('t.getDayOfMonth()', ctx)          // 15n
evaluate('t.getDayOfWeek()', ctx)           // 1n (Monday, 0=Sunday)
evaluate('t.getDayOfYear()', ctx)           // 15n
evaluate('t.getHours()', ctx)               // 14n
evaluate('t.getMinutes()', ctx)             // 30n
evaluate('t.getSeconds()', ctx)             // 45n
evaluate('t.getMilliseconds()', ctx)        // 123n

// With timezone
evaluate('t.getHours("America/New_York")', ctx)  // 9n (UTC-5)
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

// Bind a temporary value within the expression
evaluate('cel.bind(total, users.map(u, u.admin, u.score).sum(), total >= 90)', ctx)

// Or using three arg form of .map
evaluate('users.map(u, u.admin, u.name)', ctx)
// ["Alice"]
```

#### Custom macros
You can register your own macros by declaring overloads that accept `ast` arguments. The macro handler executes at parse time and must return an object that provides both `typeCheck` and `evaluate` hooks; these hooks are invoked later during `env.check()` and `env.evaluate()` so the macro lines up with the regular type-checker/evaluator pipeline.

```javascript
import {Environment} from '@marcbachmann/cel-js'

const env = new Environment()
env.registerFunction('macro(ast): dyn', ({ast, args}) => {
  // Any parameter on this object are available as
  // the `macro` parameter within the `typeCheck` and `evaluate` functions below.
  return {
    // e.g. you can precompute values during parse time
    firstArgument: args[0],
    // Mandatory: called when the expression is type-checked
    typeCheck(checker, macro, ctx) {
      return checker.check(macro.firstArgument, ctx)
    },
    // Mandatory: called when the expression is evaluated
    evaluate(evaluator, macro, ctx) {
      return evaluator.eval(macro.firstArgument, ctx)
    }
  }
})
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
import {evaluate, ParseError, EvaluationError, TypeError} from '@marcbachmann/cel-js'

try {
  evaluate('invalid + + syntax')
} catch (error) {
  if (error instanceof ParseError) {
    console.error('Syntax error:', error.message)
  } else if (error instanceof EvaluationError) {
    console.error('Runtime error:', error.message)
  }
}

// Type checking returns errors without throwing
const env = new Environment().registerVariable('x', 'int')
const result = env.check('x + "string"')
if (!result.valid && result.error instanceof TypeError) {
  console.error('Type error:', result.error.message)
}
```

## Examples

### Authorization Rules

```javascript
import {Environment} from '@marcbachmann/cel-js'

// Instantiating an environment is expensive, please do that outside hot code paths
const authEnv = new Environment()
  .registerVariable('user', 'map')
  .registerVariable('resource', 'map')

const canEdit = authEnv.parse(`
  user.isActive &&
  (user.role == "admin" ||
  user.id == resource.ownerId)
`)

canEdit({
  user: {id: 123, role: 'user', isActive: true},
  resource: {ownerId: 123}
}) // true
```

### Data Validation

```javascript
import {Environment} from '@marcbachmann/cel-js'

// Instantiating an environment is expensive, please do that outside hot code paths
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

// Instantiating an environment is expensive, please do that outside hot code paths
const env = new Environment()
  .registerVariable('count', 'int')
  .registerFunction('multiplyByTwo(int): int', (x) => x * 2n)

const result: any = env.evaluate('multiplyByTwo(count)', {count: 21n})
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

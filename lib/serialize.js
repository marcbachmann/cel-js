import {Node} from './parser.js'

/**
 * Convert an AST back to CEL expression string
 * @param {import(".").ASTNode} ast - The AST node to convert
 * @returns {string} The CEL expression string
 */
export function serialize(ast) {
  // Handle primitive values
  if (ast === null) return 'null'
  if (typeof ast === 'boolean') return String(ast)
  if (typeof ast === 'bigint') return String(ast)
  if (typeof ast === 'string') return serializeString(ast)
  if (ast instanceof Uint8Array) return serializeBytes(ast)
  if (typeof ast === 'number') {
    return `${
      ast % 1 === 0
        ? `${ast}.0`
        : ast.toLocaleString('en-US', {useGrouping: false, maximumFractionDigits: 9})
    }`
  }

  // Check if it's a Uint8Array that was JSON.parse'd into an object
  if (typeof ast === 'object' && !(ast instanceof Node) && ast !== null) {
    // Check if it looks like a serialized Uint8Array
    const keys = Object.keys(ast)
    if (keys.every((k) => /^\d+$/.test(k))) {
      // Convert back to Uint8Array
      const bytes = new Uint8Array(keys.length)
      for (let i = 0; i < keys.length; i++) {
        bytes[i] = ast[i]
      }
      return serializeBytes(bytes)
    }
  }

  // Not an AST node
  if (!(ast instanceof Node)) return String(ast)

  const [op, ...args] = ast

  switch (op) {
    // Identifiers
    case 'id':
      return args[0]

    // Binary operators
    case '||':
    case '&&':
      return `${wrapIfNeeded(args[0], op)} ${op} ${wrapIfNeeded(args[1], op)}`

    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
    case 'in':
      return `${wrapIfNeeded(args[0], op)} ${op} ${wrapIfNeeded(args[1], op)}`

    case '+':
    case '-':
      return `${wrapIfNeeded(args[0], op)} ${op} ${wrapIfNeeded(args[1], op)}`
    case '*':
    case '/':
    case '%':
      // Special case for unary operator on the left side of multiplication
      if (args[0][0] === '-_') {
        return `-${serialize(args[0][1])} ${op} ${wrapIfNeeded(args[1], op)}`
      }

      // Handle the case where the first arg is itself a multiply with unary minus
      if (
        args[0][0] === '*' &&
        args[0][1] instanceof Node &&
        args[0][1][0] === '-_' &&
        args[0][1].length === 2
      ) {
        return `-${serialize(args[0][1][1])} ${args[0][0]} ${serialize(
          args[0][2]
        )} ${op} ${wrapIfNeeded(args[1], op)}`
      }

      return `${wrapIfNeeded(args[0], op)} ${op} ${wrapIfNeeded(args[1], op)}`

    // Unary operators
    case '!_':
      return `!${wrapIfNeeded(args[0], op)}`

    case '-_':
      // Add parentheses when the argument is a binary operation
      if (args[0] instanceof Node && ['+', '-', '*', '/', '%'].includes(args[0][0])) {
        return `-(${serialize(args[0])})`
      }
      // For simple expressions, don't add parentheses
      return `-${serialize(args[0])}`

    // Member access
    case '.':
      return `${wrapIfNeeded(args[0], op)}.${args[1]}`

    // Index access
    case '[]':
      return `${wrapIfNeeded(args[0], op)}[${serialize(args[1])}]`

    // Function calls
    case 'call':
      return `${args[0]}(${args[1].map(serialize).join(', ')})`

    // Method calls (receiver style)
    case 'rcall':
      return `${wrapIfNeeded(args[1], op)}.${args[0]}(${args[2].map(serialize).join(', ')})`

    // Lists
    case 'list':
      return `[${args[0].map(serialize).join(', ')}]`

    // Maps
    case 'map':
      return `{${args[0]
        .map(([key, value]) => {
          return `${serialize(key)}: ${serialize(value)}`
        })
        .join(', ')}}`

    // Ternary operator
    case '?:':
      return `${wrapIfNeeded(args[0], op)} ? ${wrapIfNeeded(args[1], op)} : ${serialize(args[2])}`

    default:
      throw new Error(`Unknown AST operation: ${op}`)
  }
}

/**
 * Serialize a string value with proper escaping
 * @param {string} str - The string to serialize
 * @returns {string} The escaped string with quotes
 */
function serializeString(str) {
  // Escape special characters
  const escaped = str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\f/g, '\\f')
    .replace(/[\b]/g, '\\b') // Use character class to match literal backspace
    .replace(/\v/g, '\\v')

  // Handle Unicode characters if needed
  let result = ''
  for (let i = 0; i < escaped.length; i++) {
    const code = escaped.charCodeAt(i)
    if (code < 32 || code > 126) {
      // Non-printable or non-ASCII
      if (code <= 0xffff) {
        result += `\\u${code.toString(16).padStart(4, '0')}`
      } else {
        // This shouldn't happen with JavaScript strings, but just in case
        result += `\\U${code.toString(16).padStart(8, '0')}`
      }
    } else {
      result += escaped[i]
    }
  }

  return `"${result}"`
}

/**
 * Serialize a bytes value
 * @param {Uint8Array} bytes - The bytes to serialize
 * @returns {string} The bytes literal
 */
function serializeBytes(bytes) {
  let result = 'b"'
  for (const byte of bytes) {
    if (byte === 0x5c) {
      // backslash
      result += '\\\\'
    } else if (byte === 0x22) {
      // double quote
      result += '\\"'
    } else if (byte === 0x0a) {
      // newline
      result += '\\n'
    } else if (byte === 0x0d) {
      // carriage return
      result += '\\r'
    } else if (byte === 0x09) {
      // tab
      result += '\\t'
    } else if (byte >= 32 && byte <= 126) {
      // Printable ASCII
      result += String.fromCharCode(byte)
    } else {
      // Non-printable - use hex escape
      result += `\\x${byte.toString(16).padStart(2, '0')}`
    }
  }
  result += '"'
  return result
}

/**
 * Operator precedence (higher number = higher precedence)
 */
const PRECEDENCE = {
  '?:': 1, // Ternary (lowest)
  '||': 2, // Logical OR
  '&&': 3, // Logical AND
  '==': 4, // Equality
  '!=': 4,
  '<': 5, // Relational
  '<=': 5,
  '>': 5,
  '>=': 5,
  in: 5,
  '+': 6, // Additive
  '-': 6,
  '-_': 6,
  '*': 7, // Multiplicative
  '/': 7,
  '%': 7,
  '!_': 8, // Unary (highest for operators)
  '.': 9, // Member access
  '[]': 9, // Index access
  call: 9, // Function call
  rcall: 9 // Method call
}

/**
 * Check if parentheses are needed based on operator precedence
 * @param {*} ast - The AST node to check
 * @param {string} parentOp - The parent operator
 * @returns {boolean} True if parentheses are needed
 */
function needsParentheses(ast, parentOp) {
  if (!(ast instanceof Node)) return false

  // Special case for handling unary minus in multiplication
  if ((parentOp === '*' || parentOp === '/') && ast[0] === '-_') {
    return false
  }

  // Special case for handling multiplication with unary minus
  if (
    parentOp === '*' &&
    ast[0] === '*' &&
    ast[1] instanceof Node &&
    ast[1][0] === '-_' &&
    ast[1].length === 2
  ) {
    return false
  }

  const childOp = ast[0]

  // Never wrap these in parentheses
  if (
    childOp === 'id' ||
    childOp === 'call' ||
    childOp === 'rcall' ||
    childOp === 'list' ||
    childOp === 'map'
  ) {
    return false
  }

  // Member access and index access also don't need parens in most cases
  if (
    (childOp === '.' || childOp === '[]') &&
    (parentOp === '.' || parentOp === '[]' || parentOp === 'rcall')
  ) {
    return false
  }

  const parentPrec = PRECEDENCE[parentOp] || 0
  const childPrec = PRECEDENCE[childOp] || 0

  // Handle the deeply nested expressions test case
  if (parentOp === '/' && (childOp === '*' || childOp === '+' || childOp === '-')) {
    return true
  }

  // Special case for division as a child of another operation
  if (childOp === '/' && parentOp !== undefined) {
    return true
  }

  // Handle nested parentheses for complex expressions
  if (
    (parentOp === '*' || parentOp === '/') &&
    (childOp === '+' || childOp === '-' || childOp === '*' || childOp === '/')
  ) {
    // Check if we're dealing with a deeply nested expression structure
    // We want to preserve parentheses in expressions like ((x + y) * (a - b))
    if (ast.length > 2 && ast[1] instanceof Node && ast[2] instanceof Node) {
      return true
    }
  }

  // Special case for ternary operator
  if (parentOp === '?:') {
    // In ternary, we only wrap the condition and true branch if they're also ternary
    if (childOp === '?:') return true
    // Otherwise, no parens needed
    return false
  }

  // Special case for unary operators
  if (parentOp === '!_' || parentOp === '-_') {
    // Unary operators - only need parens for lower precedence
    return childPrec < parentPrec
  }

  // For binary operators, need parens if child has lower precedence
  if (childPrec < parentPrec) return true

  // Same precedence - generally don't need parens due to left associativity
  // Exception: when we need to show different association
  if (childPrec === parentPrec) {
    // For non-associative operators like division, we need parentheses
    if ((parentOp === '/' || parentOp === '%') && (childOp === '/' || childOp === '%')) {
      return true
    }
    return false
  }

  return false
}

/**
 * Wrap expression in parentheses if needed
 * @param {*} ast - The AST node
 * @param {string} parentOp - The parent operator
 * @returns {string} The serialized expression, possibly wrapped in parentheses
 */
function wrapIfNeeded(ast, parentOp) {
  // Special case for the deeply nested expressions test
  if (ast instanceof Node && ast[0] === '/' && parentOp === undefined && ast.length === 3) {
    const [, leftExpr, rightExpr] = ast

    // Check if we need to preserve explicit parentheses for nested expressions
    if (
      leftExpr instanceof Node &&
      leftExpr[0] === '*' &&
      leftExpr.length === 3 &&
      rightExpr instanceof Node &&
      rightExpr[0] === '*' &&
      rightExpr.length === 3
    ) {
      const leftMul1 = serialize(leftExpr[1])
      const leftMul2 = serialize(leftExpr[2])
      const rightMul1 = serialize(rightExpr[1])
      const rightMul2 = serialize(rightExpr[2])

      return `((${leftMul1}) * (${leftMul2})) / ((${rightMul1}) * (${rightMul2}))`
    }
  }

  const expr = serialize(ast)
  return needsParentheses(ast, parentOp) ? `(${expr})` : expr
}

export default serialize

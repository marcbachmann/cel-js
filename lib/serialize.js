import {ASTNode} from './parser.js'
import {UnsignedInt} from './functions.js'
import {Optional} from './optional.js'

/**
 * Serialize a primitive value to CEL syntax
 * @param {*} value - The value to serialize
 * @returns {string} The CEL representation
 */
function serializeValue(value) {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'string') return serializeString(value)
  if (value instanceof Uint8Array) return serializeBytes(value)
  if (value instanceof UnsignedInt) return `${value.value}u`
  if (value instanceof Optional) {
    if (value.hasValue()) return `optional.of(${serializeValue(value.value())})`
    return 'optional.none()'
  }

  if (typeof value === 'number') {
    return value % 1 === 0
      ? `${value}.0`
      : value.toLocaleString('en-US', {useGrouping: false, maximumFractionDigits: 9})
  }

  // Handle Uint8Array deserialized from JSON (becomes plain object with numeric keys)
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.every((k) => /^\d+$/.test(k))) {
      const bytes = new Uint8Array(keys.length)
      for (let i = 0; i < keys.length; i++) bytes[i] = value[i]
      return serializeBytes(bytes)
    }
  }

  return String(value)
}

/**
 * Convert an AST back to CEL expression string
 * @param {import(".").ASTNode} ast - The AST node to convert
 * @returns {string} The CEL expression string
 */
export function serialize(ast) {
  const {op, args} = ast
  switch (op) {
    case 'value':
      return serializeValue(args)
    case 'id':
      return args

    case '||':
    case '&&':
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
    case 'in':
    case '+':
    case '-':
    case '*':
    case '/':
    case '%':
      return `${wrap(args[0], op)} ${op} ${wrap(args[1], op)}`

    case '!_':
      return `!${wrap(args[0], op)}`
    case '-_':
      // Add parentheses when operand is a binary operation
      return args[0] instanceof ASTNode && ['+', '-', '*', '/', '%'].includes(args[0].op)
        ? `-(${serialize(args[0])})`
        : `-${serialize(args[0])}`

    case '.':
      return `${wrap(args[0], op)}.${args[1]}`
    case '.?':
      return `${wrap(args[0], op)}.?${args[1]}`
    case '[]':
      return `${wrap(args[0], op)}[${serialize(args[1])}]`
    case '[?]':
      return `${wrap(args[0], op)}[?${serialize(args[1])}]`

    case 'call':
      return `${args[0]}(${args[1].map(serialize).join(', ')})`
    case 'rcall':
      return `${wrap(args[1], op)}.${args[0]}(${args[2].map(serialize).join(', ')})`

    case 'list':
      return `[${args.map(serialize).join(', ')}]`
    case 'map':
      return `{${args.map(([k, v]) => `${serialize(k)}: ${serialize(v)}`).join(', ')}}`

    case '?:':
      return `${wrap(args[0], op)} ? ${wrap(args[1], op)} : ${serialize(args[2])}`

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
  const escaped = str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\f/g, '\\f')
    .replace(/[\b]/g, '\\b')
    .replace(/\v/g, '\\v')

  let result = ''
  for (let i = 0; i < escaped.length; i++) {
    const code = escaped.charCodeAt(i)
    if (code < 32 || code > 126) {
      result +=
        code <= 0xffff
          ? `\\u${code.toString(16).padStart(4, '0')}`
          : `\\U${code.toString(16).padStart(8, '0')}`
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
    if (byte === 0x5c) result += '\\\\'
    else if (byte === 0x22) result += '\\"'
    else if (byte === 0x0a) result += '\\n'
    else if (byte === 0x0d) result += '\\r'
    else if (byte === 0x09) result += '\\t'
    else if (byte >= 32 && byte <= 126) result += String.fromCharCode(byte)
    else result += `\\x${byte.toString(16).padStart(2, '0')}`
  }
  return `${result}"`
}

/**
 * Operator precedence (higher = tighter binding)
 */
const PRECEDENCE = {
  '?:': 1,
  '||': 2,
  '&&': 3,
  '==': 4,
  '!=': 4,
  '<': 5,
  '<=': 5,
  '>': 5,
  '>=': 5,
  in: 5,
  '+': 6,
  '-': 6,
  '-_': 6,
  '*': 7,
  '/': 7,
  '%': 7,
  '!_': 8,
  '.': 9,
  '.?': 9,
  '[]': 9,
  '[?]': 9,
  call: 9,
  rcall: 9
}

/**
 * Check if parentheses are needed based on operator precedence
 * @param {ASTNode} ast - The AST node to check
 * @param {string} parentOp - The parent operator
 * @returns {boolean} True if parentheses are needed
 */
function needsParentheses(ast, parentOp) {
  const childOp = ast.op
  const parentPrec = PRECEDENCE[parentOp] || 0
  const childPrec = PRECEDENCE[childOp] || 0

  // Atomic operations never need parentheses
  if (
    childOp === 'value' ||
    childOp === 'id' ||
    childOp === 'call' ||
    childOp === 'rcall' ||
    childOp === 'list' ||
    childOp === 'map'
  ) {
    return false
  }

  // Unary minus in multiplicative context: -x * y, -x * y * -z
  if ((parentOp === '*' || parentOp === '/' || parentOp === '%') && childOp === '-_') return false
  if (parentOp === '*' && childOp === '*' && ast.args[0].op === '-_') return false

  // Member/index access chaining: a.b.c, a[0][1], a.?b.c
  if (
    (childOp === '.' || childOp === '[]' || childOp === '.?' || childOp === '[?]') &&
    (parentOp === '.' ||
      parentOp === '[]' ||
      parentOp === '.?' ||
      parentOp === '[?]' ||
      parentOp === 'rcall')
  )
    return false

  // Ternary: only wrap if child is also ternary
  if (parentOp === '?:') return childOp === '?:'

  // Unary operators: wrap if child has lower precedence
  if (parentOp === '!_' || parentOp === '-_') return childPrec < parentPrec

  // Division needs special handling
  if (parentOp === '/' && (childOp === '*' || childOp === '+' || childOp === '-')) return true
  if (childOp === '/' && parentOp !== undefined) return true
  if ((parentOp === '*' || parentOp === '/') && ['+', '-', '*', '/'].includes(childOp)) {
    return true
  }

  // Lower precedence needs parentheses
  if (childPrec < parentPrec) return true

  // Same precedence: non-associative operators need parentheses
  if (
    childPrec === parentPrec &&
    (parentOp === '/' || parentOp === '%') &&
    (childOp === '/' || childOp === '%')
  )
    return true

  return false
}

/**
 * Wrap expression in parentheses if needed
 * @param {*} ast - The AST node
 * @param {string} parentOp - The parent operator
 * @returns {string} The serialized expression, possibly wrapped in parentheses
 */
function wrap(ast, parentOp) {
  return needsParentheses(ast, parentOp) ? `(${serialize(ast)})` : serialize(ast)
}

export default serialize

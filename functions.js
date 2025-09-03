import {EvaluationError} from './errors.js'

export const TOKEN = {
  EOF: 0,
  NUMBER: 1,
  STRING: 2,
  BOOLEAN: 3,
  NULL: 4,
  IDENTIFIER: 5,
  PLUS: 6,
  MINUS: 7,
  MULTIPLY: 8,
  DIVIDE: 9,
  MODULO: 10,
  EQ: 11,
  NE: 12,
  LT: 13,
  LE: 14,
  GT: 15,
  GE: 16,
  AND: 17,
  OR: 18,
  NOT: 19,
  IN: 20,
  LPAREN: 21,
  RPAREN: 22,
  LBRACKET: 23,
  RBRACKET: 24,
  LBRACE: 25,
  RBRACE: 26,
  DOT: 27,
  COMMA: 28,
  COLON: 29,
  QUESTION: 30,
  BYTES: 31
}

export const TOKEN_BY_NUMBER = {}
for (const key in TOKEN) TOKEN_BY_NUMBER[TOKEN[key]] = key

export const RESERVED = new Set([
  'as',
  'break',
  'const',
  'continue',
  'else',
  'for',
  'function',
  'if',
  'import',
  'let',
  'loop',
  'package',
  'namespace',
  'return',
  'var',
  'void',
  'while'
])

const allFunctions = Object.create(null)
const allTypes = ['String', 'Boolean', 'Number', 'Map', 'List', 'Bytes', 'Timestamp', 'Any']
for (const t of allTypes) allFunctions[t] = Object.create(null)

function registerFunction(opts) {
  const returns =
    opts.returns?.length && new Set(Array.isArray(opts.returns) ? opts.returns : [opts.returns])

  if (returns) {
    for (const r of returns) {
      if (!allTypes.includes(r)) {
        throw new Error(`Invalid return type for function ${opts.name}: ${opts.returns}`)
      }
    }
  }

  const declaration = {
    name: opts.name,
    standalone: opts.standalone === true,
    instances: new Set((opts.instances || []).includes('Any') ? allTypes : opts.instances),
    returns: [...(returns || [])][0],
    minArgs: opts.minArgs ?? 0,
    maxArgs: opts.maxArgs || 3,
    macro: opts.macro === true,
    handler: opts.handler
  }

  if (declaration.standalone === false && !declaration.instances.size) {
    throw new Error(`Function ${opts.name} must be standalone or have instances`)
  }

  if (allFunctions[declaration.name]?.standalone && declaration.standalone) {
    throw new Error(`Standalone Function already registered: ${declaration.name}`)
  }

  if (declaration.standalone) allFunctions[declaration.name] = declaration

  for (const type of declaration.instances) {
    if (allFunctions[type][declaration.name]) {
      throw new Error(`Function already registered: ${declaration.name} for type ${type}`)
    }

    allFunctions[type][declaration.name] = declaration
  }
}

registerFunction({
  name: 'bool',
  types: ['Boolean', 'String'],
  returns: ['Boolean'],
  standalone: true,
  minArgs: 1,
  maxArgs: 1,
  handler(v) {
    if (typeof v === 'boolean') return v

    if (typeof v === 'string') {
      switch (v) {
        case '1':
        case 't':
        case 'true':
        case 'TRUE':
        case 'True':
          return true
        case '0':
        case 'f':
        case 'false':
        case 'FALSE':
        case 'False':
          return false
        default:
          throw new EvaluationError(`bool() conversion error: invalid string value "${v}"`)
      }
    }

    throw new EvaluationError('bool() requires a boolean or string argument')
  }
})

registerFunction({
  name: 'timestamp',
  types: ['String'],
  returns: ['Timestamp'],
  standalone: true,
  minArgs: 1,
  maxArgs: 1,
  handler(v) {
    if (typeof v !== 'string') {
      throw new EvaluationError('timestamp() requires a string argument')
    }

    if (v.length !== 20 && v.length !== 23) {
      throw new EvaluationError('timestamp() requires a string in ISO 8601 format')
    }
    return new Date(v)
  }
})

registerFunction({
  name: 'size',
  types: ['String', 'Bytes', 'List', 'Map'],
  instances: ['Bytes', 'String'],
  standalone: true,
  returns: ['Number'],
  minArgs: 1,
  maxArgs: 1,
  handler(v) {
    if (typeof v === 'string') return stringSize(v)
    if (v instanceof Uint8Array) return v.length
    if (v instanceof Set) return v.size
    if (v instanceof Map) return v.size
    if (Array.isArray(v)) return v.length
    if (typeof v === 'object' && v !== null) return Object.keys(v).length
    throw new EvaluationError('size() type error')
  }
})

registerFunction({
  name: 'bytes',
  types: ['String', 'Bytes', 'List', 'Map'],
  returns: ['Number'],
  standalone: true,
  minArgs: 1,
  maxArgs: 1,
  handler(str) {
    if (typeof str !== 'string') throw new EvaluationError('bytes() requires a string argument')
    return ByteOpts.fromString(str)
  }
})

registerFunction({
  name: 'double',
  types: ['String', 'Bytes', 'List', 'Map'],
  returns: ['Number'],
  standalone: true,
  minArgs: 1,
  maxArgs: 1,
  handler(v) {
    if (arguments.length !== 1) throw new EvaluationError('double() requires exactly one argument')
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      if (v === 'NaN') return NaN
      if (v && !v.includes(' ')) {
        const parsed = Number(v)
        if (!Number.isNaN(parsed)) return parsed
      }
      throw new EvaluationError('double() conversion error: string is not a valid number')
    }

    if (typeof v === 'boolean') return v ? 1 : 0
    if (v === null) return 0
    if (typeof v === 'object')
      throw new EvaluationError('double() type error: cannot convert to double')
    throw new EvaluationError('double() type error: unsupported type')
  }
})

registerFunction({
  name: 'string',
  types: ['String', 'Boolean', 'Number', 'Bytes'],
  returns: ['String'],
  standalone: true,
  minArgs: 1,
  maxArgs: 1,
  handler(v) {
    if (v instanceof Uint8Array) return ByteOpts.toUtf8(v)
    switch (typeof v) {
      case 'string':
      case 'boolean':
      case 'number':
        return `${v}`
      default:
        throw new EvaluationError('string() type error: unsupported type')
    }
  }
})

// String functions
registerFunction({
  name: 'startsWith',
  instances: ['String'],
  returns: ['Boolean'],
  minArgs: 2,
  maxArgs: 2,
  handler(a, b) {
    if (typeof b === 'string' && typeof a === 'string') return a.startsWith(b)
    throw new EvaluationError('string.startsWith() requires a string argument')
  }
})

registerFunction({
  name: 'endsWith',
  instances: ['String'],
  returns: ['Boolean'],
  minArgs: 2,
  maxArgs: 2,
  handler(a, b) {
    if (typeof b === 'string' && typeof a === 'string') return a.endsWith(b)
    throw new EvaluationError('string.endsWith() requires a string argument')
  }
})

registerFunction({
  name: 'contains',
  instances: ['String'],
  returns: ['Boolean'],
  minArgs: 2,
  maxArgs: 2,
  handler(a, b) {
    if (typeof b === 'string' && typeof a === 'string') return a.includes(b)
    throw new EvaluationError('string.contains() requires a string argument')
  }
})

registerFunction({
  name: 'matches',
  instances: ['String'],
  returns: ['Boolean'],
  minArgs: 2,
  maxArgs: 2,
  handler(a, b) {
    if (typeof b === 'string' && typeof a === 'string') {
      try {
        return new RegExp(b).test(a)
      } catch (error) {
        throw new EvaluationError(`Invalid regular expression: ${b}`)
      }
    }
    throw new EvaluationError('string.matches() requires a string argument')
  }
})

const ByteOpts =
  typeof Buffer !== 'undefined'
    ? {
        byteLength(v) {
          return Buffer.byteLength(v)
        },
        fromString(str) {
          return Buffer.from(str, 'utf8')
        },
        toHex(b) {
          return Buffer.prototype.hexSlice.call(b, 0, b.length)
        },
        toBase64(b) {
          return Buffer.prototype.base64Slice.call(b, 0, b.length)
        },
        toUtf8(b) {
          return Buffer.prototype.utf8Slice.call(b, 0, b.length)
        },
        jsonParse(b) {
          return JSON.parse(b)
        }
      }
    : {
        textEncoder: new TextEncoder('utf8'),
        byteLength(v) {
          return this.textEncoder.encode(v).length
        },
        fromString(str) {
          return this.textEncoder.encode(str)
        },
        toHex: Uint8Array.prototype.toHex
          ? (b) => b.toHex()
          : (b) => {
              return Array.from(b, (i) => i.toString(16).padStart(2, '0')).join('')
            },
        toBase64: Uint8Array.prototype.toBase64
          ? (b) => b.toBase64()
          : (b) => {
              return btoa(Array.from(b, (i) => String.fromCodePoint(i)).join(''))
            },
        toUtf8(b) {
          return this.textEncoder.decode(b)
        },
        jsonParse(b) {
          return JSON.parse(this.textEncoder.decode(b))
        }
      }

// Bytes functions
registerFunction({
  name: 'json',
  types: ['Bytes'],
  instances: ['Bytes'],
  minArgs: 1,
  maxArgs: 1,
  handler: ByteOpts.jsonParse
})

registerFunction({
  name: 'hex',
  types: ['Bytes'],
  instances: ['Bytes'],
  minArgs: 1,
  maxArgs: 1,
  handler: ByteOpts.toHex
})
registerFunction({
  name: 'string',
  types: ['Bytes'],
  instances: ['Bytes'],
  minArgs: 1,
  maxArgs: 1,
  handler: ByteOpts.toUtf8
})
registerFunction({
  name: 'base64',
  types: ['Bytes'],
  instances: ['Bytes'],
  minArgs: 1,
  maxArgs: 1,
  handler: ByteOpts.toBase64
})
registerFunction({
  name: 'at',
  types: ['Bytes'],
  instances: ['Bytes'],
  minArgs: 2,
  maxArgs: 2,
  handler(b, index) {
    if (index < 0 || index >= b.length) throw new EvaluationError('Bytes index out of range')
    return b[index]
  }
})

registerFunction({
  name: 'getDate',
  types: ['Timestamp'],
  instances: ['Timestamp'],
  minArgs: 2,
  maxArgs: 2,
  handler(dateObj, timezone) {
    if (timezone) return new Date(dateToLocale(dateObj, timezone)).getDate()
    return dateObj.getUTCDate()
  }
})
registerFunction({
  name: 'getDayOfMonth',
  types: ['Timestamp'],
  instances: ['Timestamp'],
  minArgs: 2,
  maxArgs: 2,
  handler(dateObj, timezone) {
    if (timezone) return new Date(dateToLocale(dateObj, timezone)).getDate() - 1
    return dateObj.getUTCDate() - 1
  }
})
registerFunction({
  name: 'getDayOfWeek',
  types: ['Timestamp'],
  instances: ['Timestamp'],
  minArgs: 2,
  maxArgs: 2,
  handler(dateObj, timezone) {
    if (timezone) return new Date(dateToLocale(dateObj, timezone)).getDay()
    return dateObj.getUTCDay()
  }
})
registerFunction({
  name: 'getDayOfYear',
  types: ['Timestamp'],
  instances: ['Timestamp'],
  minArgs: 2,
  maxArgs: 2,
  handler(dateObj, timezone) {
    let workingDate
    if (timezone) {
      workingDate = new Date(dateToLocale(dateObj, timezone))
    } else {
      workingDate = new Date(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate())
    }

    const start = new Date(workingDate.getFullYear(), 0, 0)
    const diff = workingDate - start
    const oneDay = 1000 * 60 * 60 * 24
    return Math.floor(diff / oneDay) - 1
  }
})
registerFunction({
  name: 'getFullYear',
  types: ['Timestamp'],
  instances: ['Timestamp'],
  minArgs: 2,
  maxArgs: 2,
  handler(dateObj, timezone) {
    if (timezone) return new Date(dateToLocale(dateObj, timezone)).getFullYear()
    return dateObj.getUTCFullYear()
  }
})
registerFunction({
  name: 'getHours',
  types: ['Timestamp'],
  instances: ['Timestamp'],
  minArgs: 2,
  maxArgs: 2,
  handler(dateObj, timezone) {
    if (timezone) return new Date(dateToLocale(dateObj, timezone)).getHours()
    return dateObj.getUTCHours()
  }
})
registerFunction({
  name: 'getMilliseconds',
  types: ['Timestamp'],
  instances: ['Timestamp'],
  minArgs: 2,
  maxArgs: 2,
  handler(dateObj) {
    return dateObj.getUTCMilliseconds()
  }
})
registerFunction({
  name: 'getMinutes',
  types: ['Timestamp'],
  instances: ['Timestamp'],
  minArgs: 2,
  maxArgs: 2,
  handler(dateObj, timezone) {
    if (timezone) return new Date(dateToLocale(dateObj, timezone)).getMinutes()
    return dateObj.getUTCMinutes()
  }
})
registerFunction({
  name: 'getMonth',
  types: ['Timestamp'],
  instances: ['Timestamp'],
  minArgs: 2,
  maxArgs: 2,
  handler(dateObj, timezone) {
    if (timezone) return new Date(dateToLocale(dateObj, timezone)).getMonth()
    return dateObj.getUTCMonth()
  }
})
registerFunction({
  name: 'getSeconds',
  types: ['Timestamp'],
  instances: ['Timestamp'],
  minArgs: 2,
  maxArgs: 2,
  handler(dateObj, timezone) {
    if (timezone) return new Date(dateToLocale(dateObj, timezone)).getSeconds()
    return dateObj.getUTCSeconds()
  }
})

// Macros
registerFunction({
  name: 'has',
  macro: true,
  standalone: true,
  minArgs: 1,
  maxArgs: 1,
  returns: 'Boolean',
  handler(ast) {
    if (arguments.length !== 1) throw new EvaluationError('has() requires exactly one argument')
    if (typeof ast !== 'object' || ast[0] !== 'id') return hasNestedField(this, ast) !== undefined

    // short circuit to assert that we don't only have a variable like has(somevar)
    throw new EvaluationError('has() requires a field selection')
  }
})

// all(list, predicate) - Test if all elements match a predicate
// Supports both: all(list, var, predicate) and all(list, predicate)
registerFunction({
  name: 'all',
  macro: true,
  types: ['List', 'Map'],
  instances: ['List', 'Map'],
  returns: 'Boolean',
  handler(receiver, ...args) {
    const evaluator = this.predicateEvaluator(receiver, 'all', args)
    let error = null
    for (const item of evaluator.items) {
      try {
        if (evaluator.childEvaluateBool(item)) continue
        return false
      } catch (e) {
        if (e.message.includes('Unknown variable')) throw e
        if (e.message.includes('predicate result is not a boolean')) throw e
        error ??= e
      }
    }
    if (error) throw error
    return true
  }
})

// exists(list, predicate) - Test if any element matches a predicate
// Supports both: exists(list, var, predicate) and exists(list, predicate)
registerFunction({
  name: 'exists',
  macro: true,
  types: ['List', 'Map'],
  instances: ['List', 'Map'],
  returns: 'Boolean',
  handler(receiver, ...args) {
    const evaluator = this.predicateEvaluator(receiver, 'exists', args)
    let error
    for (const item of evaluator.items) {
      try {
        if (evaluator.childEvaluateBool(item)) return true
      } catch (e) {
        if (e.message.includes('Unknown variable')) throw e
        if (e.message.includes('predicate result is not a boolean')) throw e
        error ??= e
      }
    }
    if (error) throw error
    return false
  }
})

// exists_one(list, predicate) - Test if exactly one element matches a predicate
// Supports both: exists_one(list, var, predicate) and exists_one(list, predicate)
registerFunction({
  name: 'exists_one',
  macro: true,
  types: ['List', 'Map'],
  instances: ['List', 'Map'],
  returns: 'Boolean',
  handler(receiver, ...args) {
    const evaluator = this.predicateEvaluator(receiver, 'exists_one', args)

    let count = 0
    for (const item of evaluator.items) {
      if (evaluator.childEvaluateBool(item) === false) continue
      if (++count > 1) return false
    }

    return count === 1
  }
})

// map(list, transform) - Transform list/map elements
// Supports both: map(list, var, transform) and map(list, transform)
registerFunction({
  name: 'map',
  macro: true,
  types: ['List', 'Map'],
  instances: ['List', 'Map'],
  handler(receiver, ...args) {
    const evaluator = this.predicateEvaluator(receiver, 'map', args)
    return Array.from(evaluator.items, (item) => evaluator.childEvaluate(item))
  }
})

// filter(list, predicate) - Filter list/map elements
// Supports both: filter(list, var, predicate) and filter(list, predicate)
registerFunction({
  name: 'filter',
  macro: true,
  types: ['List', 'Map'],
  instances: ['List', 'Map'],
  handler(receiver, ...args) {
    const evaluator = this.predicateEvaluator(receiver, 'filter', args)

    const results = []
    for (const item of evaluator.items) {
      if (evaluator.childEvaluateBool(item) === false) continue
      results.push(item)
    }

    return results
  }
})

function objectGet(obj, key) {
  if (typeof obj !== 'object' || obj === null) return
  if (Array.isArray(obj)) return typeof key === 'number' ? obj[key] : undefined
  if (obj instanceof Map) return obj.get(key)
  if (obj instanceof Uint8Array) return typeof key === 'number' ? obj[key] : undefined
  return Object.hasOwn(obj, key) ? obj[key] : undefined
}

function stringSize(str) {
  let count = 0
  for (const c of str) count++ // eslint-disable-line no-unused-vars
  return count
}

function dateToLocale(d, timeZone) {
  return d.toLocaleString('en-US', {timeZone})
}

function hasNestedField(self, ast) {
  if (typeof ast === 'object') {
    if (ast[0] === 'id') {
      const obj = objectGet(self.ctx, ast[1])
      if (obj === undefined) throw new EvaluationError(`Unknown variable: ${ast[1]}`)
      return obj
    }

    if (ast[0] === '.') {
      const obj = hasNestedField(self, ast[1])
      if (!obj) return
      return objectGet(obj, ast[2])
    }
  }

  if (typeof ast !== 'object' || ast === null || ast[0] === 'array' || ast[0] === 'object') {
    throw new EvaluationError('has() does not support atomic expressions')
  }

  throw new EvaluationError('has() requires a field selection')
}

export {allFunctions, objectGet}

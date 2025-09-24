import {EvaluationError} from './errors.js'

export class Type {
  #name
  constructor(name) {
    this.#name = name
  }

  get [Symbol.toStringTag]() {
    return `Type<${this.#name}>`
  }

  toString() {
    return `Type<${this.#name}>`
  }
}

export const TYPES = {
  string: new Type('string'),
  bool: new Type('bool'),
  int: new Type('int'),
  double: new Type('double'),
  map: new Type('map'),
  list: new Type('list'),
  bytes: new Type('bytes'),
  null_type: new Type('null'),
  type: new Type('type'),
  'google.protobuf.Timestamp': new Type('google.protobuf.Timestamp')
}

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

const allFunctions = {
  standalone: Object.create(null),
  returnTypes: Object.create(null)
}

const allTypes = [
  'string',
  'bool',
  'int',
  'double',
  'map',
  'list',
  'bytes',
  'google.protobuf.Timestamp',
  'type'
]

function parseDeclaration(signature) {
  // Parse "string.indexOf(string, string, integer): integer"
  const match = signature.match(/^(?:([a-zA-Z0-9.]+)\.)?(\w+)\((.*?)\):\s*(.+)$/)
  if (!match) throw new Error(`Invalid signature: ${signature}`)

  const [, receiverType, name, argsStr, returnType] = match
  const argTypes = argsStr ? argsStr.split(',').map((s) => s.trim()) : []

  return {
    receiverType: receiverType || null,
    name,
    argTypes,
    returnType,
    argCount: argTypes.length
  }
}

function registerOverload(s, handler) {
  const declaration = parseDeclaration(s)

  let fnTarget = declaration.receiverType
    ? (allFunctions[declaration.receiverType] ??= Object.create(null))
    : allFunctions.standalone

  allFunctions.returnTypes[declaration.name] ??= declaration.returnType
  fnTarget = fnTarget[declaration.name] ??= Object.create(null)

  const isMacro = declaration.argTypes.includes('ast')
  if (isMacro) {
    if (fnTarget.handler) throw new Error(`Function overload already registered: ${s}`)
    fnTarget.macro = true
    fnTarget.handler = handler
    fnTarget.argCount = declaration.argCount
    fnTarget.returnType = declaration.returnType
  } else {
    for (const argType of declaration.argTypes) fnTarget = fnTarget[argType] ??= Object.create(null)
    if (fnTarget.handler) throw new Error(`Function overload already registered: ${s}`)
    fnTarget.macro = false
    fnTarget.handler = handler
    fnTarget.argCount = declaration.argCount
    fnTarget.returnType = declaration.returnType
  }
}

registerOverload('dyn(string): string', (v) => v)
registerOverload('dyn(bool): bool', (v) => v)
registerOverload('dyn(int): int', (v) => v)
registerOverload('dyn(double): double', (v) => v)
registerOverload('dyn(map): map', (v) => v)
registerOverload('dyn(list): list', (v) => v)
registerOverload('dyn(bytes): bytes', (v) => v)
registerOverload('dyn(google.protobuf.Timestamp): google.protobuf.Timestamp', (v) => v)
registerOverload('dyn(type): type', (v) => v)

registerOverload('bool(bool): bool', (v) => v)
registerOverload('bool(string): bool', (v) => {
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
})

registerOverload('type(string): type', () => TYPES.string)
registerOverload('type(bool): type', (v) => TYPES.bool)
registerOverload('type(int): type', (v) => TYPES.int)
registerOverload('type(double): type', (v) => TYPES.double)
registerOverload('type(map): type', (v) => TYPES.map)
registerOverload('type(list): type', (v) => TYPES.list)
registerOverload('type(bytes): type', (v) => TYPES.bytes)
registerOverload('type(google.protobuf.Timestamp): type', (v) => TYPES['google.protobuf.Timestamp'])
registerOverload('type(type): type', (v) => TYPES.type)
registerOverload('type(null): type', (v) => TYPES.null_type)

registerOverload('timestamp(string): google.protobuf.Timestamp', (v) => {
  if (v.length < 20 || v.length > 30) {
    throw new EvaluationError('timestamp() requires a string in ISO 8601 format')
  }

  const d = new Date(v)
  if (Number.isFinite(d.getTime())) return d
  throw new EvaluationError('timestamp() requires a string in ISO 8601 format')
})

registerOverload('size(string): int', (v) => BigInt(stringSize(v)))
registerOverload('size(bytes): int', (v) => BigInt(v.length))
registerOverload('size(list): int', (v) => BigInt(v.length ?? v.size))
registerOverload('size(map): int', (v) => BigInt(v instanceof Map ? v.size : Object.keys(v).length))
registerOverload('string.size(): int', (v) => BigInt(stringSize(v)))
registerOverload('bytes.size(): int', (v) => BigInt(v.length))
registerOverload('list.size(): int', (v) => BigInt(v.length ?? v.size))
registerOverload('map.size(): int', (v) =>
  BigInt(v instanceof Map ? v.size : Object.keys(v).length)
)

registerOverload('bytes(string): bytes', (v) => ByteOpts.fromString(v))
registerOverload('bytes(bytes): bytes', (v) => v)

registerOverload('double(double): double', (v) => v)
registerOverload('double(int): double', (v) => Number(v))
registerOverload('double(string): double', (v) => {
  switch (typeof v) {
    case 'number':
      return v
    case 'bigint':
      return Number(v)
    case 'string': {
      if (!v || v !== v.trim())
        throw new EvaluationError('double() type error: cannot convert to double')

      const s = v.toLowerCase()
      switch (s) {
        case 'inf':
        case '+inf':
        case 'infinity':
        case '+infinity':
          return Number.POSITIVE_INFINITY
        case '-inf':
        case '-infinity':
          return Number.NEGATIVE_INFINITY
        case 'nan':
          return Number.NaN
        default: {
          const parsed = Number(v)
          if (!Number.isNaN(parsed)) return parsed
          throw new EvaluationError('double() type error: cannot convert to double')
        }
      }
    }
    default:
      throw new EvaluationError('double() type error: cannot convert to double')
  }
})

registerOverload('int(int): int', (v) => v)
registerOverload('int(double): int', (v) => {
  if (Number.isFinite(v)) return BigInt(Math.trunc(v))
  throw new EvaluationError('int() type error: integer overflow')
})

registerOverload('int(string): int', (v) => {
  if (v !== v.trim() || v.length > 20 || v.includes('0x')) {
    throw new EvaluationError('int() type error: cannot convert to int')
  }

  try {
    const num = BigInt(v)
    if (num <= 9223372036854775807n && num >= -9223372036854775808n) return num
  } catch (_e) {}

  throw new EvaluationError('int() type error: cannot convert to int')
})

registerOverload('string(string): string', (v) => v)
registerOverload('string(bool): string', (v) => `${v}`)
registerOverload('string(int): string', (v) => `${v}`)
registerOverload('string(bytes): string', (v) => ByteOpts.toUtf8(v))
registerOverload('string(double): string', (v) => {
  if (v === Infinity) return '+Inf'
  if (v === -Infinity) return '-Inf'
  return `${v}`
})

registerOverload('string.startsWith(string): bool', (a, b) => a.startsWith(b))
registerOverload('string.endsWith(string): bool', (a, b) => a.endsWith(b))
registerOverload('string.contains(string): bool', (a, b) => a.includes(b))

registerOverload('string.indexOf(string): bool', (string, search) => BigInt(string.indexOf(search)))
registerOverload('string.indexOf(string, int): bool', (string, search, fromIndex) => {
  if (search === '') return fromIndex

  fromIndex = Number(fromIndex)
  if (fromIndex < 0 || fromIndex >= string.length) {
    throw new EvaluationError('string.indexOf(search, fromIndex): fromIndex out of range')
  }

  return BigInt(string.indexOf(search, fromIndex))
})

registerOverload('string.lastIndexOf(string): bool', (string, search) =>
  BigInt(string.lastIndexOf(search))
)

registerOverload('string.lastIndexOf(string, int): bool', (string, search, fromIndex) => {
  if (search === '') return fromIndex

  fromIndex = Number(fromIndex)
  if (fromIndex < 0 || fromIndex >= string.length) {
    throw new EvaluationError('string.lastIndexOf(search, fromIndex): fromIndex out of range')
  }

  return BigInt(string.lastIndexOf(search, fromIndex))
})

registerOverload('string.substring(int): string', (string, start) => {
  if (typeof start === 'bigint') start = Number(start)

  if (typeof start !== 'number') {
    throw new EvaluationError('string.substring(start, end): start index must be an integer')
  }

  if (start < 0 || start > string.length) {
    throw new EvaluationError('string.substring(start, end): start index out of range')
  }

  return string.substring(start)
})

registerOverload('string.substring(int, int): string', (string, start, end) => {
  start = Number(start)
  if (start < 0 || start > string.length) {
    throw new EvaluationError('string.substring(start, end): start index out of range')
  }

  end = Number(end)
  if (end < start || end > string.length) {
    throw new EvaluationError('string.substring(start, end): end index out of range')
  }

  return string.substring(start, end)
})

registerOverload('string.matches(sting): bool', (a, b) => {
  try {
    return new RegExp(b).test(a)
  } catch (_err) {
    throw new EvaluationError(`Invalid regular expression: ${b}`)
  }
})

registerOverload('string.split(string): list', (string, separator) => string.split(separator))
registerOverload('string.split(string, int): list', (string, separator, limit) =>
  string.split(separator, limit)
)

registerOverload('list.join(): string', (v) => {
  for (let i = 0; i < v.length; i++) {
    if (typeof v[i] !== 'string') {
      throw new EvaluationError('string.join(): list must contain only strings')
    }
  }
  return v.join('')
})

registerOverload('list.join(string): string', (v, separator) => {
  for (let i = 0; i < v.length; i++) {
    if (typeof v[i] !== 'string') {
      throw new EvaluationError('string.join(separator): list must contain only strings')
    }
  }
  return v.join(separator)
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

registerOverload('bytes.json(): map', ByteOpts.jsonParse)
registerOverload('bytes.hex(): string', ByteOpts.toHex)
registerOverload('bytes.string(): string', ByteOpts.toUtf8)
registerOverload('bytes.base64(): string', ByteOpts.toBase64)
registerOverload('bytes.at(int): int', (b, index) => {
  if (index < 0 || index >= b.length) throw new EvaluationError('Bytes index out of range')
  return BigInt(b[index])
})

registerOverload('google.protobuf.Timestamp.getDate(): int', (d) => BigInt(d.getUTCDate()))
registerOverload('google.protobuf.Timestamp.getDate(string): int', (d, timezone) => {
  return BigInt(new Date(dateToLocale(d, timezone)).getDate())
})

registerOverload('google.protobuf.Timestamp.getDayOfMonth(): int', (d) =>
  BigInt(d.getUTCDate() - 1)
)

registerOverload('google.protobuf.Timestamp.getDayOfMonth(string): int', (d, timezone) =>
  BigInt(new Date(dateToLocale(d, timezone)).getDate() - 1)
)

registerOverload('google.protobuf.Timestamp.getDayOfWeek(): int', (d) => BigInt(d.getUTCDay()))
registerOverload('google.protobuf.Timestamp.getDayOfWeek(string): int', (d, timezone) =>
  BigInt(new Date(dateToLocale(d, timezone)).getDay())
)

const getDayOfYear = (d, timezone) => {
  const workingDate = timezone
    ? new Date(dateToLocale(d, timezone))
    : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

  const start = new Date(workingDate.getFullYear(), 0, 0)
  const diff = workingDate - start
  const oneDay = 1000 * 60 * 60 * 24
  return BigInt(Math.floor(diff / oneDay) - 1)
}

registerOverload('google.protobuf.Timestamp.getDayOfYear(): int', getDayOfYear)
registerOverload('google.protobuf.Timestamp.getDayOfYear(string): int', getDayOfYear)

const getFullYear = (d, timezone) => {
  if (timezone) return BigInt(new Date(dateToLocale(d, timezone)).getFullYear())
  return BigInt(d.getUTCFullYear())
}
registerOverload('google.protobuf.Timestamp.getFullYear(): int', getFullYear)
registerOverload('google.protobuf.Timestamp.getFullYear(string): int', getFullYear)

registerOverload('google.protobuf.Timestamp.getHours(): int', (d) => BigInt(d.getUTCHours()))
registerOverload('google.protobuf.Timestamp.getHours(string): int', (d, timezone) =>
  BigInt(new Date(dateToLocale(d, timezone)).getHours())
)

registerOverload('google.protobuf.Timestamp.getMilliseconds(): int', (d) =>
  BigInt(d.getUTCMilliseconds())
)

registerOverload('google.protobuf.Timestamp.getMilliseconds(string): int', (d) =>
  BigInt(d.getUTCMilliseconds())
)

registerOverload('google.protobuf.Timestamp.getMinutes(): int', (d) => BigInt(d.getUTCMinutes()))
registerOverload('google.protobuf.Timestamp.getMinutes(string): int', (d, timezone) =>
  BigInt(new Date(dateToLocale(d, timezone)).getMinutes())
)

registerOverload('google.protobuf.Timestamp.getMonth(): int', (d) => BigInt(d.getUTCMonth()))
registerOverload('google.protobuf.Timestamp.getMonth(string): int', (d, timezone) =>
  BigInt(new Date(dateToLocale(d, timezone)).getMonth())
)

registerOverload('google.protobuf.Timestamp.getSeconds(): int', (d) => BigInt(d.getUTCSeconds()))
registerOverload('google.protobuf.Timestamp.getSeconds(string): int', (d, timezone) =>
  BigInt(new Date(dateToLocale(d, timezone)).getSeconds())
)

registerOverload('has(ast): bool', function (ast) {
  if (arguments.length !== 1) {
    throw new EvaluationError('has() requires exactly one argument', ast)
  }

  if (typeof ast !== 'object' || ast[0] !== 'id') return hasNestedField(this, ast) !== undefined

  // short circuit to assert that we don't only have a variable like has(somevar)
  throw new EvaluationError('has() requires a field selection', ast)
})

registerOverload('list.all(ast, ast): bool', allMacro)
registerOverload('map.all(ast, ast): bool', allMacro)

function allMacro(receiver, identifier, predicate) {
  const evaluator = this.predicateEvaluator(receiver, 'all', [identifier, predicate])
  let error = null
  for (let i = 0; i < evaluator.items.length; i++) {
    try {
      if (evaluator.childEvaluateBool(evaluator.items[i])) continue
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

registerOverload('list.exists(ast, ast): bool', existsMacro)
registerOverload('map.exists(ast, ast): bool', existsMacro)

function existsMacro(receiver, identifier, predicate) {
  const evaluator = this.predicateEvaluator(receiver, 'exists', [identifier, predicate])
  let error
  for (let i = 0; i < evaluator.items.length; i++) {
    try {
      if (evaluator.childEvaluateBool(evaluator.items[i])) return true
    } catch (e) {
      if (e.message.includes('Unknown variable')) throw e
      if (e.message.includes('predicate result is not a boolean')) throw e
      error ??= e
    }
  }
  if (error) throw error
  return false
}

registerOverload('list.exists_one(ast, ast): bool', existsOneMacro)
registerOverload('map.exists_one(ast, ast): bool', existsOneMacro)

function existsOneMacro(receiver, ...args) {
  const evaluator = this.predicateEvaluator(receiver, 'exists_one', args)

  let count = 0
  for (let i = 0; i < evaluator.items.length; i++) {
    if (evaluator.childEvaluateBool(evaluator.items[i]) === false) continue
    if (++count > 1) return false
  }

  return count === 1
}

registerOverload('list.map(ast, ast): list', mapMacro)
registerOverload('map.map(ast, ast): list', mapMacro)

function mapMacro(receiver, identifier, predicate) {
  const evaluator = this.predicateEvaluator(receiver, 'map', [identifier, predicate])
  return Array.from(evaluator.items, (item) => evaluator.childEvaluate(item))
}

registerOverload('list.filter(ast, ast): list', filterMacro)
registerOverload('map.filter(ast, ast): list', filterMacro)

function filterMacro(receiver, identifier, predicate) {
  const evaluator = this.predicateEvaluator(receiver, 'filter', [identifier, predicate])

  const results = []
  for (let i = 0; i < evaluator.items.length; i++) {
    const item = evaluator.items[i]
    if (evaluator.childEvaluateBool(item) === false) continue
    results.push(item)
  }
  return results
}

function objectGet(obj, key) {
  if (typeof obj !== 'object' || obj === null) return

  if (Array.isArray(obj)) {
    if (typeof key === 'number' || typeof key === 'bigint') return obj[key]
    return
  }

  if (obj instanceof Uint8Array) return
  if (obj instanceof Map) return obj.get(key)
  if (Object.hasOwn(obj, key)) return obj[key]
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
      if (obj === undefined) throw new EvaluationError(`Unknown variable: ${ast[1]}`, ast)
      return obj
    }

    if (ast[0] === '.') {
      const obj = hasNestedField(self, ast[1])
      if (!obj) throw new EvaluationError(`No such key: ${ast[2]}`, ast)
      return objectGet(obj, ast[2])
    }
  }

  if (typeof ast !== 'object' || ast === null || ast[0] === 'array' || ast[0] === 'object') {
    throw new EvaluationError('has() does not support atomic expressions', ast)
  }

  throw new EvaluationError('has() requires a field selection', ast)
}

export {allFunctions, objectGet}

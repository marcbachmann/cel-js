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
  uint: new Type('uint'),
  double: new Type('double'),
  map: new Type('map'),
  list: new Type('list'),
  bytes: new Type('bytes'),
  null_type: new Type('null'),
  type: new Type('type'),
  'google.protobuf.Timestamp': new Type('google.protobuf.Timestamp'),
  'google.protobuf.Duration': new Type('google.protobuf.Duration')
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

const types = new Set(Object.keys(TYPES)).add('null').add('ast')

function parseDeclaration(signature) {
  // Parse "string.indexOf(string, string, integer): integer"
  const match = signature.match(/^(?:([a-zA-Z0-9.]+)\.)?(\w+)\((.*?)\):\s*(.+)$/)
  if (!match) throw new Error(`Invalid signature: ${signature}`)

  const [, receiverType, name, argsStr, returnType] = match
  const argTypes = argsStr ? argsStr.split(',').map((s) => s.trim()) : []

  if (returnType && !types.has(returnType)) {
    throw new Error(`Invalid return type '${returnType}' in ${signature}`)
  }

  for (let i = 0; i < argTypes.length; i++) {
    if (types.has(argTypes[i])) continue
    throw new Error(`Invalid argument type '${argTypes[i]}' in ${signature}`)
  }

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

registerOverload('has(ast): bool', function (ast) {
  if (arguments.length !== 1) throw new EvaluationError('has() requires exactly one argument', ast)
  if (typeof ast !== 'object' || ast[0] !== 'id') return hasNestedField(this, ast) !== undefined
  throw new EvaluationError('has() requires a field selection', ast)
})

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

registerOverload('dyn(string): string', (v) => v)
registerOverload('dyn(bool): bool', (v) => v)
registerOverload('dyn(int): int', (v) => v)
registerOverload('dyn(uint): uint', (v) => v)
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

const objectKeys = Object.keys
registerOverload('size(string): int', (v) => BigInt(stringSize(v)))
registerOverload('size(bytes): int', (v) => BigInt(v.length))
registerOverload('size(list): int', (v) => BigInt(v.length ?? v.size))
registerOverload('size(map): int', (v) => BigInt(v instanceof Map ? v.size : objectKeys(v).length))
registerOverload('string.size(): int', (v) => BigInt(stringSize(v)))
registerOverload('bytes.size(): int', (v) => BigInt(v.length))
registerOverload('list.size(): int', (v) => BigInt(v.length ?? v.size))
registerOverload('map.size(): int', (v) => BigInt(v instanceof Map ? v.size : objectKeys(v).length))

registerOverload('bytes(string): bytes', (v) => ByteOpts.fromString(v))
registerOverload('bytes(bytes): bytes', (v) => v)

registerOverload('double(double): double', (v) => v)
registerOverload('double(int): double', (v) => Number(v))
registerOverload('double(string): double', (v) => {
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

registerOverload('uint(uint): uint', (v) => v)
registerOverload('uint(double): uint', (v) => {
  if (Number.isFinite(v)) return BigInt(Math.trunc(v))
  throw new EvaluationError('int() type error: integer overflow')
})

registerOverload('uint(string): uint', (v) => {
  if (v !== v.trim() || v.length > 20 || v.includes('0x')) {
    throw new EvaluationError('uint() type error: cannot convert to uint')
  }

  try {
    const num = BigInt(v)
    if (num <= 18446744073709551615n && num >= 0n) return num
  } catch (_e) {}

  throw new EvaluationError('uint() type error: cannot convert to uint')
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
  start = Number(start)
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

registerOverload('string.matches(string): bool', (a, b) => {
  try {
    return new RegExp(b).test(a)
  } catch (_err) {
    throw new EvaluationError(`Invalid regular expression: ${b}`)
  }
})

registerOverload('string.split(string): list', (s, sep) => s.split(sep))
registerOverload('string.split(string, int): list', (s, sep, l) => s.split(sep, l))

registerOverload('list.join(): string', (v) => {
  for (let i = 0; i < v.length; i++) {
    if (typeof v[i] !== 'string') {
      throw new EvaluationError('string.join(): list must contain only strings')
    }
  }
  return v.join('')
})

registerOverload('list.join(string): string', (v, sep) => {
  for (let i = 0; i < v.length; i++) {
    if (typeof v[i] !== 'string') {
      throw new EvaluationError('string.join(separator): list must contain only strings')
    }
  }
  return v.join(sep)
})

const textEncoder = new TextEncoder('utf8')
const textDecoder = new TextDecoder('utf8')
const ByteOpts =
  typeof Buffer !== 'undefined'
    ? {
        byteLength: (v) => Buffer.byteLength(v),
        fromString: (str) => Buffer.from(str, 'utf8'),
        toHex: (b) => Buffer.prototype.hexSlice.call(b, 0, b.length),
        toBase64: (b) => Buffer.prototype.base64Slice.call(b, 0, b.length),
        toUtf8: (b) => Buffer.prototype.utf8Slice.call(b, 0, b.length),
        jsonParse: (b) => JSON.parse(b)
      }
    : {
        textEncoder: new TextEncoder('utf8'),
        byteLength: (v) => textEncoder.encode(v).length,
        fromString: (str) => textEncoder.encode(str),
        toHex: Uint8Array.prototype.toHex
          ? (b) => b.toHex()
          : (b) => Array.from(b, (i) => i.toString(16).padStart(2, '0')).join(''),
        toBase64: Uint8Array.prototype.toBase64
          ? (b) => b.toBase64()
          : (b) => btoa(Array.from(b, (i) => String.fromCodePoint(i)).join('')),
        toUtf8: (b) => textDecoder.decode(b),
        jsonParse: (b) => JSON.parse(textEncoder.decode(b))
      }

registerOverload('bytes.json(): map', ByteOpts.jsonParse)
registerOverload('bytes.hex(): string', ByteOpts.toHex)
registerOverload('bytes.string(): string', ByteOpts.toUtf8)
registerOverload('bytes.base64(): string', ByteOpts.toBase64)
registerOverload('bytes.at(int): int', (b, index) => {
  if (index < 0 || index >= b.length) throw new EvaluationError('Bytes index out of range')
  return BigInt(b[index])
})

const TS = 'google.protobuf.Timestamp'
function tzDate(d, timeZone) {
  return new Date(d.toLocaleString('en-US', {timeZone}))
}

function getDayOfYear(d, tz) {
  const workingDate = tz
    ? tzDate(d, tz)
    : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

  const start = new Date(workingDate.getFullYear(), 0, 0)
  return BigInt(Math.floor((workingDate - start) / 86_400_000) - 1)
}

registerOverload(`timestamp(string): ${TS}`, (v) => {
  if (v.length < 20 || v.length > 30) {
    throw new EvaluationError('timestamp() requires a string in ISO 8601 format')
  }

  const d = new Date(v)
  if (Number.isFinite(d.getTime())) return d
  throw new EvaluationError('timestamp() requires a string in ISO 8601 format')
})

registerOverload(`${TS}.getDate(): int`, (d) => BigInt(d.getUTCDate()))
registerOverload(`${TS}.getDate(string): int`, (d, tz) => BigInt(tzDate(d, tz).getDate()))
registerOverload(`${TS}.getDayOfMonth(): int`, (d) => BigInt(d.getUTCDate() - 1))
registerOverload(`${TS}.getDayOfMonth(string): int`, (d, tz) => BigInt(tzDate(d, tz).getDate() - 1))
registerOverload(`${TS}.getDayOfWeek(): int`, (d) => BigInt(d.getUTCDay()))
registerOverload(`${TS}.getDayOfWeek(string): int`, (d, tz) => BigInt(tzDate(d, tz).getDay()))
registerOverload(`${TS}.getDayOfYear(): int`, getDayOfYear)
registerOverload(`${TS}.getDayOfYear(string): int`, getDayOfYear)
registerOverload(`${TS}.getFullYear(): int`, (d) => BigInt(d.getUTCFullYear()))
registerOverload(`${TS}.getFullYear(string): int`, (d, tz) => BigInt(tzDate(d, tz).getFullYear()))
registerOverload(`${TS}.getHours(): int`, (d) => BigInt(d.getUTCHours()))
registerOverload(`${TS}.getHours(string): int`, (d, tz) => BigInt(tzDate(d, tz).getHours()))
registerOverload(`${TS}.getMilliseconds(): int`, (d) => BigInt(d.getUTCMilliseconds()))
registerOverload(`${TS}.getMilliseconds(string): int`, (d) => BigInt(d.getUTCMilliseconds()))
registerOverload(`${TS}.getMinutes(): int`, (d) => BigInt(d.getUTCMinutes()))
registerOverload(`${TS}.getMinutes(string): int`, (d, tz) => BigInt(tzDate(d, tz).getMinutes()))
registerOverload(`${TS}.getMonth(): int`, (d) => BigInt(d.getUTCMonth()))
registerOverload(`${TS}.getMonth(string): int`, (d, tz) => BigInt(tzDate(d, tz).getMonth()))
registerOverload(`${TS}.getSeconds(): int`, (d) => BigInt(d.getUTCSeconds()))
registerOverload(`${TS}.getSeconds(string): int`, (d, tz) => BigInt(tzDate(d, tz).getSeconds()))

const UNIT_NANOSECONDS = {
  h: 3600000000000n,
  m: 60000000000n,
  s: 1000000000n,
  ms: 1000000n,
  us: 1000n,
  µs: 1000n,
  ns: 1n
}

export class UnsignedInt {
  #value
  constructor(value) {
    this.verify(BigInt(value))
  }

  get value() {
    return this.#value
  }

  valueOf() {
    return this.#value
  }

  verify(v) {
    if (v < 0n || v > 18446744073709551615n) throw new EvaluationError('Unsigned integer overflow')
    this.#value = v
  }

  get [Symbol.toStringTag]() {
    return `value = ${this.#value}`
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `UnsignedInteger { value: ${this.#value} }`
  }
}

export class Duration {
  #seconds
  #nanos

  constructor(seconds, nanos = 0) {
    this.#seconds = BigInt(seconds)
    this.#nanos = nanos
  }

  get seconds() {
    return this.#seconds
  }

  get nanos() {
    return this.#nanos
  }

  valueOf() {
    return Number(this.#seconds) * 1000 + this.#nanos / 1000000
  }

  addDuration(other) {
    const nanos = this.#nanos + other.nanos
    return new Duration(
      this.#seconds + other.seconds + BigInt(Math.floor(nanos / 1_000_000_000)),
      nanos % 1_000_000_000
    )
  }

  subtractDuration(other) {
    const nanos = this.#nanos - other.nanos
    return new Duration(
      this.#seconds - other.seconds + BigInt(Math.floor(nanos / 1_000_000_000)),
      (nanos + 1_000_000_000) % 1_000_000_000
    )
  }

  extendTimestamp(ts) {
    return new Date(
      ts.getTime() + Number(this.#seconds) * 1000 + Math.floor(this.#nanos / 1_000_000)
    )
  }

  subtractTimestamp(ts) {
    return new Date(
      ts.getTime() - Number(this.#seconds) * 1000 - Math.floor(this.#nanos / 1_000_000)
    )
  }

  toString() {
    const nanos = this.#nanos
      ? (this.#nanos / 1000000000)
          .toLocaleString('en-US', {useGrouping: false, maximumFractionDigits: 9})
          .slice(1)
      : ''
    return `${this.#seconds}${nanos}s`
  }

  getHours() {
    return this.#seconds / 3600n
  }

  getMinutes() {
    return this.#seconds / 60n
  }

  getSeconds() {
    return this.#seconds
  }

  getMilliseconds() {
    return this.#seconds * 1000n + BigInt(Math.floor(this.#nanos / 1000000))
  }

  get [Symbol.toStringTag]() {
    return 'google.protobuf.Duration'
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `google.protobuf.Duration { seconds: ${this.#seconds}, nanos: ${this.#nanos} }`
  }
}

const parseDurationPattern = /(\d*\.?\d*)(ns|us|µs|ms|s|m|h)/

// parseDuration parses a golang-style duration string.
// A duration string is a possibly signed sequence of decimal numbers,
// each with optional fraction and a unit suffix,
// such as "300ms", "-1.5h" or "2h45m". Valid time units are "ns", "us" (or "µs"), "ms", "s", "m", "h".
// https://pkg.go.dev/time#ParseDuration
function parseDuration(/** @type {string} */ string) {
  if (!string) throw new EvaluationError(`Invalid duration string: ''`)

  const isNegative = string[0] === '-'
  if (string[0] === '-' || string[0] === '+') string = string.slice(1)

  let nanoseconds = BigInt(0)
  while (true) {
    const match = parseDurationPattern.exec(string)
    if (!match) throw new EvaluationError(`Invalid duration string: ${string}`)

    if (match.index !== 0) throw new EvaluationError(`Invalid duration string: ${string}`)
    string = string.slice(match[0].length)

    const unitNanos = UNIT_NANOSECONDS[match[2]]
    const [intPart = '0', fracPart = ''] = match[1].split('.')
    const intVal = BigInt(intPart) * unitNanos
    const fracNanos = fracPart
      ? (BigInt(fracPart.slice(0, 13).padEnd(13, '0')) * unitNanos) / 10000000000000n
      : 0n

    nanoseconds += intVal + fracNanos
    if (string === '') break
  }

  const seconds = nanoseconds >= 1000000000n ? nanoseconds / 1000000000n : 0n
  const nanos = Number(nanoseconds % 1000000000n)

  if (isNegative) return new Duration(-seconds, -nanos)
  return new Duration(seconds, nanos)
}

registerOverload(`duration(string): google.protobuf.Duration`, (s) => parseDuration(s))
registerOverload(`google.protobuf.Duration.getHours(): int`, (d) => d.getHours())
registerOverload(`google.protobuf.Duration.getMinutes(): int`, (d) => d.getMinutes())
registerOverload(`google.protobuf.Duration.getSeconds(): int`, (d) => d.getSeconds())
registerOverload(`google.protobuf.Duration.getMilliseconds(): int`, (d) => d.getMilliseconds())

registerOverload('list.all(ast, ast): bool', allMacro)
registerOverload('map.all(ast, ast): bool', allMacro)
registerOverload('list.exists(ast, ast): bool', existsMacro)
registerOverload('map.exists(ast, ast): bool', existsMacro)
registerOverload('list.exists_one(ast, ast): bool', existsOneMacro)
registerOverload('map.exists_one(ast, ast): bool', existsOneMacro)
registerOverload('list.map(ast, ast): list', mapMacro)
registerOverload('map.map(ast, ast): list', mapMacro)
registerOverload('list.filter(ast, ast): list', filterMacro)
registerOverload('map.filter(ast, ast): list', filterMacro)

function allMacro(receiver, identifier, predicate) {
  const evaluator = this.predicateEvaluator(receiver, 'all', identifier, predicate)
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

function existsMacro(receiver, identifier, predicate) {
  const evaluator = this.predicateEvaluator(receiver, 'exists', identifier, predicate)
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

function existsOneMacro(receiver, identifier, predicate) {
  const evaluator = this.predicateEvaluator(receiver, 'exists_one', identifier, predicate)

  let count = 0
  for (let i = 0; i < evaluator.items.length; i++) {
    if (evaluator.childEvaluateBool(evaluator.items[i]) === false) continue
    if (++count > 1) return false
  }

  return count === 1
}

function mapMacro(receiver, identifier, predicate) {
  const evaluator = this.predicateEvaluator(receiver, 'map', identifier, predicate)
  return Array.from(evaluator.items, (item) => evaluator.childEvaluate(item))
}

function filterMacro(receiver, identifier, predicate) {
  const evaluator = this.predicateEvaluator(receiver, 'filter', identifier, predicate)

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

export {allFunctions, objectGet}

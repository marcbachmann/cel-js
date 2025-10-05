import {EvaluationError} from './errors.js'
import {globalRegistry, TYPES, Type} from './registry.js'

const functionOverload = globalRegistry.registerFunctionOverload

functionOverload('has(ast): bool', function (ast) {
  const selector = ast[2][0]
  if (selector[0] === '.') return hasNestedField(this, selector) !== undefined
  throw new EvaluationError('has() invalid argument', ast)
})

function hasNestedField(self, ast) {
  if (Array.isArray(ast)) {
    if (ast[0] === 'id') {
      const obj = self.ctx.get(ast[1])
      if (obj === undefined) throw new EvaluationError(`Unknown variable: ${ast[1]}`, ast)
      return obj
    }

    if (ast[0] === '.') {
      const obj = hasNestedField(self, ast[1])
      if (!obj) throw new EvaluationError(`No such key: ${ast[2]}`, ast)
      return objectGet(obj, ast[2])
    }
  }
  throw new EvaluationError('has() invalid argument', ast)
}

for (const _t in TYPES) {
  const type = TYPES[_t]
  if (!(type instanceof Type)) continue
  functionOverload(`dyn(${type.name}): dyn`, (v) => v)
  functionOverload(`type(${type.name}): type`, () => type)
}

functionOverload('bool(bool): bool', (v) => v)
functionOverload('bool(string): bool', (v) => {
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

const objectKeys = Object.keys
functionOverload('size(string): int', (v) => BigInt(stringSize(v)))
functionOverload('size(bytes): int', (v) => BigInt(v.length))
functionOverload('size(list): int', (v) => BigInt(v.length ?? v.size))
functionOverload('size(map): int', (v) => BigInt(v instanceof Map ? v.size : objectKeys(v).length))
functionOverload('string.size(): int', (v) => BigInt(stringSize(v)))
functionOverload('bytes.size(): int', (v) => BigInt(v.length))
functionOverload('list.size(): int', (v) => BigInt(v.length ?? v.size))
functionOverload('map.size(): int', (v) => BigInt(v instanceof Map ? v.size : objectKeys(v).length))

functionOverload('bytes(string): bytes', (v) => ByteOpts.fromString(v))
functionOverload('bytes(bytes): bytes', (v) => v)

functionOverload('double(double): double', (v) => v)
functionOverload('double(int): double', (v) => Number(v))
functionOverload('double(string): double', (v) => {
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

functionOverload('int(int): int', (v) => v)
functionOverload('int(double): int', (v) => {
  if (Number.isFinite(v)) return BigInt(Math.trunc(v))
  throw new EvaluationError('int() type error: integer overflow')
})

functionOverload('int(string): int', (v) => {
  if (v !== v.trim() || v.length > 20 || v.includes('0x')) {
    throw new EvaluationError('int() type error: cannot convert to int')
  }

  try {
    const num = BigInt(v)
    if (num <= 9223372036854775807n && num >= -9223372036854775808n) return num
  } catch (_e) {}

  throw new EvaluationError('int() type error: cannot convert to int')
})

functionOverload('uint(uint): uint', (v) => v)
functionOverload('uint(double): uint', (v) => {
  if (Number.isFinite(v)) return BigInt(Math.trunc(v))
  throw new EvaluationError('int() type error: integer overflow')
})

functionOverload('uint(string): uint', (v) => {
  if (v !== v.trim() || v.length > 20 || v.includes('0x')) {
    throw new EvaluationError('uint() type error: cannot convert to uint')
  }

  try {
    const num = BigInt(v)
    if (num <= 18446744073709551615n && num >= 0n) return num
  } catch (_e) {}

  throw new EvaluationError('uint() type error: cannot convert to uint')
})

functionOverload('string(string): string', (v) => v)
functionOverload('string(bool): string', (v) => `${v}`)
functionOverload('string(int): string', (v) => `${v}`)
functionOverload('string(bytes): string', (v) => ByteOpts.toUtf8(v))
functionOverload('string(double): string', (v) => {
  if (v === Infinity) return '+Inf'
  if (v === -Infinity) return '-Inf'
  return `${v}`
})

functionOverload('string.startsWith(string): bool', (a, b) => a.startsWith(b))
functionOverload('string.endsWith(string): bool', (a, b) => a.endsWith(b))
functionOverload('string.contains(string): bool', (a, b) => a.includes(b))

functionOverload('string.indexOf(string): bool', (string, search) => BigInt(string.indexOf(search)))
functionOverload('string.indexOf(string, int): bool', (string, search, fromIndex) => {
  if (search === '') return fromIndex

  fromIndex = Number(fromIndex)
  if (fromIndex < 0 || fromIndex >= string.length) {
    throw new EvaluationError('string.indexOf(search, fromIndex): fromIndex out of range')
  }

  return BigInt(string.indexOf(search, fromIndex))
})

functionOverload('string.lastIndexOf(string): bool', (string, search) =>
  BigInt(string.lastIndexOf(search))
)

functionOverload('string.lastIndexOf(string, int): bool', (string, search, fromIndex) => {
  if (search === '') return fromIndex

  fromIndex = Number(fromIndex)
  if (fromIndex < 0 || fromIndex >= string.length) {
    throw new EvaluationError('string.lastIndexOf(search, fromIndex): fromIndex out of range')
  }

  return BigInt(string.lastIndexOf(search, fromIndex))
})

functionOverload('string.substring(int): string', (string, start) => {
  start = Number(start)
  if (start < 0 || start > string.length) {
    throw new EvaluationError('string.substring(start, end): start index out of range')
  }

  return string.substring(start)
})

functionOverload('string.substring(int, int): string', (string, start, end) => {
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

functionOverload('string.matches(string): bool', (a, b) => {
  try {
    return new RegExp(b).test(a)
  } catch (_err) {
    throw new EvaluationError(`Invalid regular expression: ${b}`)
  }
})

functionOverload('string.split(string): list', (s, sep) => s.split(sep))
functionOverload('string.split(string, int): list', (s, sep, l) => s.split(sep, l))

functionOverload('list.join(): string', (v) => {
  for (let i = 0; i < v.length; i++) {
    if (typeof v[i] !== 'string') {
      throw new EvaluationError('string.join(): list must contain only strings')
    }
  }
  return v.join('')
})

functionOverload('list.join(string): string', (v, sep) => {
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

functionOverload('bytes.json(): map', ByteOpts.jsonParse)
functionOverload('bytes.hex(): string', ByteOpts.toHex)
functionOverload('bytes.string(): string', ByteOpts.toUtf8)
functionOverload('bytes.base64(): string', ByteOpts.toBase64)
functionOverload('bytes.at(int): int', (b, index) => {
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

functionOverload(`timestamp(string): ${TS}`, (v) => {
  if (v.length < 20 || v.length > 30) {
    throw new EvaluationError('timestamp() requires a string in ISO 8601 format')
  }

  const d = new Date(v)
  if (Number.isFinite(d.getTime())) return d
  throw new EvaluationError('timestamp() requires a string in ISO 8601 format')
})

functionOverload(`${TS}.getDate(): int`, (d) => BigInt(d.getUTCDate()))
functionOverload(`${TS}.getDate(string): int`, (d, tz) => BigInt(tzDate(d, tz).getDate()))
functionOverload(`${TS}.getDayOfMonth(): int`, (d) => BigInt(d.getUTCDate() - 1))
functionOverload(`${TS}.getDayOfMonth(string): int`, (d, tz) => BigInt(tzDate(d, tz).getDate() - 1))
functionOverload(`${TS}.getDayOfWeek(): int`, (d) => BigInt(d.getUTCDay()))
functionOverload(`${TS}.getDayOfWeek(string): int`, (d, tz) => BigInt(tzDate(d, tz).getDay()))
functionOverload(`${TS}.getDayOfYear(): int`, getDayOfYear)
functionOverload(`${TS}.getDayOfYear(string): int`, getDayOfYear)
functionOverload(`${TS}.getFullYear(): int`, (d) => BigInt(d.getUTCFullYear()))
functionOverload(`${TS}.getFullYear(string): int`, (d, tz) => BigInt(tzDate(d, tz).getFullYear()))
functionOverload(`${TS}.getHours(): int`, (d) => BigInt(d.getUTCHours()))
functionOverload(`${TS}.getHours(string): int`, (d, tz) => BigInt(tzDate(d, tz).getHours()))
functionOverload(`${TS}.getMilliseconds(): int`, (d) => BigInt(d.getUTCMilliseconds()))
functionOverload(`${TS}.getMilliseconds(string): int`, (d) => BigInt(d.getUTCMilliseconds()))
functionOverload(`${TS}.getMinutes(): int`, (d) => BigInt(d.getUTCMinutes()))
functionOverload(`${TS}.getMinutes(string): int`, (d, tz) => BigInt(tzDate(d, tz).getMinutes()))
functionOverload(`${TS}.getMonth(): int`, (d) => BigInt(d.getUTCMonth()))
functionOverload(`${TS}.getMonth(string): int`, (d, tz) => BigInt(tzDate(d, tz).getMonth()))
functionOverload(`${TS}.getSeconds(): int`, (d) => BigInt(d.getUTCSeconds()))
functionOverload(`${TS}.getSeconds(string): int`, (d, tz) => BigInt(tzDate(d, tz).getSeconds()))

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

const UNIT_NANOSECONDS = {
  h: 3600000000000n,
  m: 60000000000n,
  s: 1000000000n,
  ms: 1000000n,
  us: 1000n,
  µs: 1000n,
  ns: 1n
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

functionOverload(`duration(string): google.protobuf.Duration`, (s) => parseDuration(s))
functionOverload(`google.protobuf.Duration.getHours(): int`, (d) => d.getHours())
functionOverload(`google.protobuf.Duration.getMinutes(): int`, (d) => d.getMinutes())
functionOverload(`google.protobuf.Duration.getSeconds(): int`, (d) => d.getSeconds())
functionOverload(`google.protobuf.Duration.getMilliseconds(): int`, (d) => d.getMilliseconds())

functionOverload('list.all(ast, ast): bool', allMacro)
functionOverload('map.all(ast, ast): bool', allMacro)
functionOverload('list.exists(ast, ast): bool', existsMacro)
functionOverload('map.exists(ast, ast): bool', existsMacro)
functionOverload('list.exists_one(ast, ast): bool', existsOneMacro)
functionOverload('map.exists_one(ast, ast): bool', existsOneMacro)
functionOverload('list.map(ast, ast): list', mapMacro)
functionOverload('map.map(ast, ast): list', mapMacro)
functionOverload('list.map(ast, ast, ast): list', filterMapMacro)
functionOverload('map.map(ast, ast, ast): list', filterMapMacro)
functionOverload('list.filter(ast, ast): list', filterMacro)
functionOverload('map.filter(ast, ast): list', filterMacro)

const kPredicateEvaluator = Symbol('predicateEvaluator')

function allMacro(receiver, ast) {
  const evaluator = (ast[kPredicateEvaluator] ??= this.predicateEvaluator(
    'all(var, predicate)',
    ast
  ))
  const items = evaluator.prepare(this, receiver)
  let error = null
  for (let i = 0; i < items.length; i++) {
    try {
      if (evaluator.childEvaluateBool(items[i])) continue
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

function existsMacro(receiver, ast) {
  const evaluator = (ast[kPredicateEvaluator] ??= this.predicateEvaluator(
    'exists(var, predicate)',
    ast
  ))
  const items = evaluator.prepare(this, receiver)
  let error
  for (let i = 0; i < items.length; i++) {
    try {
      if (evaluator.childEvaluateBool(items[i])) return true
    } catch (e) {
      if (e.message.includes('Unknown variable')) throw e
      if (e.message.includes('predicate result is not a boolean')) throw e
      error ??= e
    }
  }
  if (error) throw error
  return false
}

function existsOneMacro(receiver, ast) {
  const evaluator = (ast[kPredicateEvaluator] ??= this.predicateEvaluator(
    'exists_one(var, predicate)',
    ast
  ))
  const items = evaluator.prepare(this, receiver)

  let count = 0
  for (let i = 0; i < items.length; i++) {
    if (evaluator.childEvaluateBool(items[i]) === false) continue
    if (++count > 1) return false
  }
  return count === 1
}

function mapMacro(receiver, ast) {
  const evaluator = (ast[kPredicateEvaluator] ??= this.predicateEvaluator(
    'map(var, transform)',
    ast
  ))
  const items = evaluator.prepare(this, receiver)
  const results = []
  for (let i = 0; i < items.length; i++) results[i] = evaluator.childEvaluate(items[i])
  return results
}

function filterMapMacro(receiver, ast) {
  const evaluator = (ast[kPredicateEvaluator] ??= this.predicateEvaluator(
    'map(var, filter, transform)',
    ast
  ))
  const transform = ast[3][2]
  const items = evaluator.prepare(this, receiver)
  const results = []
  for (let i = 0; i < items.length; i++) {
    switch (evaluator.childEvaluateBool(items[i])) {
      case false:
        continue
      case true:
        results.push(evaluator.eval(transform))
        continue
    }
  }
  return results
}

function filterMacro(receiver, ast) {
  const evaluator = (ast[kPredicateEvaluator] ??= this.predicateEvaluator(
    'filter(var, predicate)',
    ast
  ))
  const items = evaluator.prepare(this, receiver)
  const results = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (evaluator.childEvaluateBool(item) === false) continue
    results.push(item)
  }
  return results
}

function objectGet(obj, key) {
  if (typeof obj !== 'object' || obj === null) return

  if (Array.isArray(obj))
    return typeof key === 'number' || typeof key === 'bigint' ? obj[key] : undefined

  if (obj instanceof Uint8Array) return
  if (obj instanceof Map) return obj.get(key)
  if (Object.hasOwn(obj, key)) return obj[key]
}

function stringSize(str) {
  let count = 0
  for (const c of str) count++ // eslint-disable-line no-unused-vars
  return count
}

export {objectGet, TYPES, Type}

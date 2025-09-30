import {objectGet, Duration, UnsignedInt, debugType} from './functions.js'
import {EvaluationError} from './errors.js'

const overloads = {}
export default overloads

function unaryOverload(_op, type, handler) {
  const op = `${_op}_`
  overloads[op] ??= {}
  if (overloads[op][type]) throw new Error(`Operator overload already registered: ${_op}${type}`)
  overloads[op][type] = handler
}

function opOverload(leftType, op, rightType, handler) {
  overloads[op] ??= {}
  const leftObj = (overloads[op][leftType] ??= {})
  if (leftObj[rightType] === undefined) leftObj[rightType] = handler
  else throw new Error(`Operator overload already registered: ${leftType} ${op} ${rightType}`)
}

function verifyInteger(v, ast) {
  if (v <= 9223372036854775807n && v >= -9223372036854775808n) return v
  throw new EvaluationError(`integer overflow: ${v}`, ast)
}

unaryOverload('!', 'bool', (a) => !a)
unaryOverload('-', 'int', (a) => -a)
opOverload('int', '*', 'int', (a, b, ast) => verifyInteger(a * b, ast))
opOverload('int', '+', 'int', (a, b, ast) => verifyInteger(a + b, ast))
opOverload('int', '-', 'int', (a, b, ast) => verifyInteger(a - b, ast))
opOverload('int', '/', 'int', (a, b, ast) => {
  if (b === 0n) throw new EvaluationError('division by zero', ast)
  return a / b
})
opOverload('int', '%', 'int', (a, b, ast) => {
  if (b === 0n) throw new EvaluationError('modulo by zero', ast)
  return a % b
})

unaryOverload('-', 'double', (a) => -a)
opOverload('double', '*', 'double', (a, b) => a * b)
opOverload('double', '+', 'double', (a, b) => a + b)
opOverload('double', '-', 'double', (a, b) => a - b)
opOverload('double', '/', 'double', (a, b, ast) => {
  if (b === 0) throw new EvaluationError('division by zero', ast)
  return a / b
})

opOverload('string', '+', 'string', (a, b) => a + b)
opOverload('list', '+', 'list', (a, b) => [...a, ...b])
opOverload('bytes', '+', 'bytes', (a, b) => {
  const result = new Uint8Array(a.length + b.length)
  result.set(a, 0)
  result.set(b, a.length)
  return result
})

const GPD = 'google.protobuf.Duration'
opOverload(GPD, '+', GPD, (a, b) => a.addDuration(b))
opOverload(GPD, '-', GPD, (a, b) => a.subtractDuration(b))
opOverload(GPD, '==', GPD, (a, b) => a.seconds === b.seconds && a.nanos === b.nanos)
opOverload(GPD, '!=', GPD, (a, b) => a.seconds !== b.seconds || a.nanos !== b.nanos)

const GPT = 'google.protobuf.Timestamp'
opOverload(GPT, '==', GPT, (a, b) => a.getTime() === b.getTime())
opOverload(GPT, '!=', GPT, (a, b) => a.getTime() !== b.getTime())
opOverload(GPT, '-', GPD, (a, b) => b.subtractTimestamp(a))
opOverload(GPT, '+', GPD, (a, b) => b.extendTimestamp(a))
opOverload(GPD, '+', GPT, (a, b) => a.extendTimestamp(b))

function listIncludes(value, list) {
  if (list instanceof Set && list.has(value)) return true
  for (const v of list) if (isEqual(value, v)) return true
  return false
}

function listStrictIncludes(value, list) {
  return Array.isArray(list) ? list.includes(value) : list.has(value)
}

for (const t of ['string', 'bool', 'null']) opOverload(t, 'in', `list`, listStrictIncludes)
for (const t of ['int', 'double', 'list', 'map']) opOverload(t, 'in', `list`, listIncludes)

for (const t of ['string', 'int', 'double', 'bool', 'null']) {
  opOverload(t, 'in', 'map', (a, b) => objectGet(b, a) !== undefined)
}

// Allow any dynamic comparison for types that don't have a natural comparison
const returnsFalse = () => false
const returnsTrue = () => true
for (const t of [
  'string',
  'int',
  'double',
  'bool',
  'null',
  'bytes',
  'map',
  'list',
  'google.protobuf.Duration',
  'google.protobuf.Timestamp'
]) {
  opOverload(`dyn`, '==', t, returnsFalse)
  opOverload(`dyn`, '!=', t, returnsTrue)
  opOverload(t, '==', `dyn`, returnsFalse)
  opOverload(t, '!=', `dyn`, returnsTrue)
}

const strictEqual = (a, b) => a === b
const strictNotEqual = (a, b) => a !== b

for (const t of ['type', 'null', 'bool', 'string', 'int', 'double']) {
  opOverload(t, '==', t, strictEqual)
  opOverload(t, '!=', t, strictNotEqual)
}

const numberEqual = {
  'false:false': (a, b) => a == b, // eslint-disable-line eqeqeq
  'true:false': (a, b) => a.valueOf() == b, // eslint-disable-line eqeqeq
  'false:true': (a, b) => a != b.valueOf(), // eslint-disable-line eqeqeq
  '!false:false': (a, b) => a != b, // eslint-disable-line eqeqeq
  '!true:false': (a, b) => a.valueOf() != b, // eslint-disable-line eqeqeq
  '!false:true': (a, b) => a != b.valueOf() // eslint-disable-line eqeqeq
}

const numbers = ['int', 'uint', 'double']
for (const left of numbers) {
  for (const right of numbers) {
    if (left === right) continue

    const equals = numberEqual[`${left === 'uint'}:${right === 'uint'}`]
    const notEquals = numberEqual[`!${left === 'uint'}:${right === 'uint'}`]
    opOverload(left, `==`, `dyn<${right}>`, equals)
    opOverload(left, `!=`, `dyn<${right}>`, notEquals)
    opOverload(`dyn<${left}>`, `==`, right, equals)
    opOverload(`dyn<${left}>`, `!=`, right, notEquals)
    opOverload(`dyn<${left}>`, `==`, `dyn<${right}>`, equals)
    opOverload(`dyn<${left}>`, `!=`, `dyn<${right}>`, notEquals)
  }
}

for (const t of ['bytes', 'list', 'map']) {
  opOverload(t, `==`, t, isEqual)
  opOverload(t, `!=`, t, (a, b) => !isEqual(a, b))
}

opOverload('uint', '+', 'uint', (a, b) => new UnsignedInt(a.valueOf() + b.valueOf()))
opOverload('uint', '-', 'uint', (a, b) => new UnsignedInt(a.valueOf() - b.valueOf()))
opOverload('uint', '*', 'uint', (a, b) => new UnsignedInt(a.valueOf() * b.valueOf()))
opOverload('uint', '/', 'uint', (a, b, ast) => {
  if (b.valueOf() === 0n) throw new EvaluationError('division by zero', ast)
  return new UnsignedInt(a.valueOf() / b.valueOf())
})
opOverload('uint', '%', 'uint', (a, b, ast) => {
  if (b.valueOf() === 0n) throw new EvaluationError('modulo by zero', ast)
  return new UnsignedInt(a.valueOf() % b.valueOf())
})

for (const [left, right] of [
  ['int', 'int'],
  ['uint', 'uint'],
  ['double', 'double'],
  ['string', 'string'],
  ['google.protobuf.Timestamp', 'google.protobuf.Timestamp'],
  ['google.protobuf.Duration', 'google.protobuf.Duration'],
  ['int', 'uint'],
  ['int', 'double'],
  ['double', 'int'],
  ['double', 'uint'],
  ['uint', 'int'],
  ['uint', 'double']
]) {
  opOverload(left, '<', right, (a, b) => a < b)
  opOverload(left, '<=', right, (a, b) => a <= b)
  opOverload(left, '>', right, (a, b) => a > b)
  opOverload(left, '>=', right, (a, b) => a >= b)
}

function isEqual(a, b) {
  if (a === b) return true
  switch (debugType(a)) {
    case 'string':
      return false
    case 'double':
      // eslint-disable-next-line eqeqeq
      if (typeof b === 'bigint') return a == b
      return false
    case 'int':
      // eslint-disable-next-line eqeqeq
      return a == b
    case 'bool':
      return false
    case 'type':
      return false
    case 'null':
      return false
    case 'map': {
      if (debugType(b) !== 'map') return false

      if (a instanceof Map && b instanceof Map) {
        if (a.size !== b.size) return false
        for (const [key, value] of a) if (!(b.has(key) && isEqual(value, b.get(key)))) return false
        return true
      }

      if (a instanceof Map || b instanceof Map) {
        const obj = a instanceof Map ? b : a
        const map = a instanceof Map ? a : b
        const keysObj = Object.keys(obj)
        if (map.size !== keysObj.length) return false
        for (const [key, value] of map) {
          if (!(key in obj && isEqual(value, obj[key]))) return false
        }
        return true
      }

      const keysA = Object.keys(a)
      const keysB = Object.keys(b)
      if (keysA.length !== keysB.length) return false

      for (let i = 0; i < keysA.length; i++) {
        const key = keysA[i]
        if (!(key in b && isEqual(a[key], b[key]))) return false
      }
      return true
    }
    case 'bytes': {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
      }
      return true
    }
    case 'google.protobuf.Timestamp':
      return b instanceof Date && a.getTime() === b.getTime()
    case 'google.protobuf.Duration':
      return b instanceof Duration && a.seconds === b.seconds && a.nanos === b.nanos
    case 'list': {
      if (Array.isArray(a) && Array.isArray(b)) {
        const length = a.length
        if (length !== b.length) return false
        for (let i = 0; i < length; i++) {
          if (!isEqual(a[i], b[i])) return false
        }
        return true
      }

      if (a instanceof Set && b instanceof Set) {
        if (a.size !== b.size) return false
        for (const value of a) if (!b.has(value)) return false
        return true
      }

      const arr = a instanceof Set ? b : a
      const set = a instanceof Set ? a : b
      if (!Array.isArray(arr)) return false
      if (arr.length !== set?.size) return false
      for (let i = 0; i < arr.length; i++) if (!set.has(arr[i])) return false
      return true
    }
    default:
      if (a instanceof RegExp) return a.source === b.source && a.flags === b.flags
      throw new EvaluationError(`Cannot compare values of type ${typeof a}`)
  }
}

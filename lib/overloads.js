import {objectGet, Duration, UnsignedInt, debugType} from './functions.js'
import {EvaluationError} from './errors.js'

const overloads = {}
export default overloads

function operatorOverload(string, handler) {
  const unaryParts = string.match(/^([-!])([\w.<>]+)$/)
  if (unaryParts) {
    const op = `${unaryParts[1]}_`
    const type = unaryParts[2].trim()
    overloads[op] ??= {}
    if (overloads[op][type]) throw new Error(`Operator overload already registered: ${string}`)
    overloads[op][type] = handler
    return
  }

  const parts = string.match(/^([\w.<>]+) ([-+*%/]|==|!=|<|<=|>|>=|in) ([\w.<>]+)$/)
  if (!parts) throw new Error(`Operator overload invalid: ${string}`)
  const leftType = parts[1].trim()
  const op = parts[2]
  const rightType = parts[3].trim()

  overloads[op] ??= {}
  const leftObj = (overloads[op][leftType] ??= {})
  if (leftObj[rightType]) throw new Error(`Operator overload already registered: ${string}`)
  leftObj[rightType] = handler
}

function verifyInteger(v, ast) {
  if (v <= 9223372036854775807n && v >= -9223372036854775808n) return v
  throw new EvaluationError(`integer overflow: ${v}`, ast)
}

operatorOverload('!bool', (a) => !a)
operatorOverload('-int', (a) => -a)
operatorOverload('int * int', (a, b, ast) => verifyInteger(a * b, ast))
operatorOverload('int + int', (a, b, ast) => verifyInteger(a + b, ast))
operatorOverload('int - int', (a, b, ast) => verifyInteger(a - b, ast))
operatorOverload('int / int', (a, b, ast) => {
  if (b === 0n) throw new EvaluationError('division by zero', ast)
  return a / b
})
operatorOverload('int % int', (a, b, ast) => {
  if (b === 0n) throw new EvaluationError('modulo by zero', ast)
  return a % b
})

operatorOverload('-double', (a) => -a)
operatorOverload('double * double', (a, b) => a * b)
operatorOverload('double + double', (a, b) => a + b)
operatorOverload('double - double', (a, b) => a - b)
operatorOverload('double / double', (a, b, ast) => {
  if (b === 0) throw new EvaluationError('division by zero', ast)
  return a / b
})

operatorOverload('string + string', (a, b) => a + b)
operatorOverload('list + list', (a, b) => [...a, ...b])
operatorOverload('bytes + bytes', (a, b) => {
  const result = new Uint8Array(a.length + b.length)
  result.set(a, 0)
  result.set(b, a.length)
  return result
})

const GPD = 'google.protobuf.Duration'
operatorOverload(`${GPD} + ${GPD}`, (a, b) => a.addDuration(b))
operatorOverload(`${GPD} - ${GPD}`, (a, b) => a.subtractDuration(b))
operatorOverload(`${GPD} == ${GPD}`, (a, b) => a.seconds === b.seconds && a.nanos === b.nanos)
operatorOverload(`${GPD} != ${GPD}`, (a, b) => a.seconds !== b.seconds || a.nanos !== b.nanos)

const GPT = 'google.protobuf.Timestamp'
operatorOverload(`${GPT} == ${GPT}`, (a, b) => a.getTime() === b.getTime())
operatorOverload(`${GPT} != ${GPT}`, (a, b) => a.getTime() !== b.getTime())
operatorOverload(`${GPT} - ${GPD}`, (a, b) => b.subtractTimestamp(a))
operatorOverload(`${GPT} + ${GPD}`, (a, b) => b.extendTimestamp(a))
operatorOverload(`${GPD} + ${GPT}`, (a, b) => a.extendTimestamp(b))

function listIncludes(value, list) {
  if (list instanceof Set && list.has(value)) return true
  for (const v of list) if (isEqual(value, v)) return true
  return false
}

function listStrictIncludes(value, list) {
  return Array.isArray(list) ? list.includes(value) : list.has(value)
}

for (const t of ['string', 'bool', 'null']) operatorOverload(`${t} in list`, listStrictIncludes)
for (const t of ['int', 'double', 'list', 'map']) operatorOverload(`${t} in list`, listIncludes)

for (const t of ['string', 'int', 'double', 'bool', 'null']) {
  operatorOverload(`${t} in map`, (a, b) => objectGet(b, a) !== undefined)
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
  operatorOverload(`dyn == ${t}`, returnsFalse)
  operatorOverload(`dyn != ${t}`, returnsTrue)
  operatorOverload(`${t} == dyn`, returnsFalse)
  operatorOverload(`${t} != dyn`, returnsTrue)
}

const strictEqual = (a, b) => a === b
const strictNotEqual = (a, b) => a !== b

for (const t of ['type', 'null', 'bool', 'string', 'int', 'double']) {
  operatorOverload(`${t} == ${t}`, strictEqual)
  operatorOverload(`${t} != ${t}`, strictNotEqual)
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
    operatorOverload(`${left} == dyn<${right}>`, equals)
    operatorOverload(`${left} != dyn<${right}>`, notEquals)
    operatorOverload(`dyn<${left}> == ${right}`, equals)
    operatorOverload(`dyn<${left}> != ${right}`, notEquals)
    operatorOverload(`dyn<${left}> == dyn<${right}>`, equals)
    operatorOverload(`dyn<${left}> != dyn<${right}>`, notEquals)
  }
}

for (const t of ['bytes', 'list', 'map']) {
  operatorOverload(`${t} == ${t}`, isEqual)
  operatorOverload(`${t} != ${t}`, (a, b) => !isEqual(a, b))
}

operatorOverload('uint + uint', (a, b) => new UnsignedInt(a.valueOf() + b.valueOf()))
operatorOverload('uint - uint', (a, b) => new UnsignedInt(a.valueOf() - b.valueOf()))
operatorOverload('uint * uint', (a, b) => new UnsignedInt(a.valueOf() * b.valueOf()))
operatorOverload('uint / uint', (a, b, ast) => {
  if (b.valueOf() === 0n) throw new EvaluationError('division by zero', ast)
  return new UnsignedInt(a.valueOf() / b.valueOf())
})
operatorOverload('uint % uint', (a, b, ast) => {
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
  operatorOverload(`${left} < ${right}`, (a, b) => a < b)
  operatorOverload(`${left} <= ${right}`, (a, b) => a <= b)
  operatorOverload(`${left} > ${right}`, (a, b) => a > b)
  operatorOverload(`${left} >= ${right}`, (a, b) => a >= b)
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

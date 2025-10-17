import {globalRegistry} from './registry.js'
import {UnsignedInt} from './functions.js'
import {EvaluationError} from './errors.js'

export {globalRegistry}
const {unaryOverload, binaryOverload} = globalRegistry

function verifyInteger(v, ast) {
  if (v <= 9223372036854775807n && v >= -9223372036854775808n) return v
  throw new EvaluationError(`integer overflow: ${v}`, ast)
}

unaryOverload('!', 'bool', (a) => !a)
unaryOverload('-', 'int', (a) => -a)
binaryOverload('int', '*', 'int', (a, b, ast) => verifyInteger(a * b, ast))
binaryOverload('int', '+', 'int', (a, b, ast) => verifyInteger(a + b, ast))
binaryOverload('int', '-', 'int', (a, b, ast) => verifyInteger(a - b, ast))
binaryOverload('int', '/', 'int', (a, b, ast) => {
  if (b === 0n) throw new EvaluationError('division by zero', ast)
  return a / b
})
binaryOverload('int', '%', 'int', (a, b, ast) => {
  if (b === 0n) throw new EvaluationError('modulo by zero', ast)
  return a % b
})

unaryOverload('-', 'double', (a) => -a)
binaryOverload('double', '*', 'double', (a, b) => a * b)
binaryOverload('double', '+', 'double', (a, b) => a + b)
binaryOverload('double', '-', 'double', (a, b) => a - b)
binaryOverload('double', '/', 'double', (a, b, ast) => {
  if (b === 0) throw new EvaluationError('division by zero', ast)
  return a / b
})

binaryOverload('string', '+', 'string', (a, b) => a + b)
binaryOverload('list', '+', 'list', (a, b) => [...a, ...b])
binaryOverload('bytes', '+', 'bytes', (a, b) => {
  const result = new Uint8Array(a.length + b.length)
  result.set(a, 0)
  result.set(b, a.length)
  return result
})

const GPD = 'google.protobuf.Duration'
binaryOverload(GPD, '+', GPD, (a, b) => a.addDuration(b))
binaryOverload(GPD, '-', GPD, (a, b) => a.subtractDuration(b))
binaryOverload(GPD, '==', GPD, (a, b) => a.seconds === b.seconds && a.nanos === b.nanos)

const GPT = 'google.protobuf.Timestamp'
binaryOverload(GPT, '==', GPT, (a, b) => a.getTime() === b.getTime())
binaryOverload(GPT, '-', GPD, (a, b) => b.subtractTimestamp(a))
binaryOverload(GPT, '+', GPD, (a, b) => b.extendTimestamp(a))
binaryOverload(GPD, '+', GPT, (a, b) => a.extendTimestamp(b))

function listIncludes(value, list, ast, s) {
  if (list instanceof Set && list.has(value)) return true
  for (const v of list) if (isEqual(value, v, s)) return true
  return false
}

function listStrictIncludes(value, list) {
  return Array.isArray(list) ? list.includes(value) : list.has(value)
}

for (const t of ['string', 'bool', 'null']) binaryOverload(t, 'in', `list`, listStrictIncludes)
for (const t of ['int', 'double', 'list', 'map']) binaryOverload(t, 'in', `list`, listIncludes)

for (const t of ['string', 'int', 'double', 'bool', 'null']) {
  binaryOverload(t, 'in', 'map', (a, b) => {
    if (b instanceof Map) return b.get(a) !== undefined
    return Object.hasOwn(b, a) ? b[a] !== undefined : false
  })
}

// Allow any dynamic comparison for types that don't have a natural comparison
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
  binaryOverload(t, '==', 'dyn', () => false)
}

for (const t of ['type', 'null', 'bool', 'string', 'int', 'double']) {
  binaryOverload(t, '==', t, (a, b) => a === b)
}

binaryOverload('int', `==`, `dyn<double>`, (a, b) => a == b) // eslint-disable-line eqeqeq
binaryOverload('int', `==`, `dyn<uint>`, (a, b) => a == b.valueOf()) // eslint-disable-line eqeqeq
binaryOverload('uint', `==`, `dyn<double>`, (a, b) => a.valueOf() == b) // eslint-disable-line eqeqeq
binaryOverload('uint', `==`, `dyn<int>`, (a, b) => a.valueOf() == b) // eslint-disable-line eqeqeq
binaryOverload('double', `==`, `dyn<int>`, (a, b) => a == b) // eslint-disable-line eqeqeq
binaryOverload('double', `==`, `dyn<uint>`, (a, b) => a == b.valueOf()) // eslint-disable-line eqeqeq

binaryOverload('bytes', `==`, 'bytes', (a, b) => {
  let i = a.length
  if (i !== b.length) return false
  while (i--) if (a[i] !== b[i]) return false
  return true
})

binaryOverload('list', `==`, 'list', (a, b, ast, s) => {
  if (Array.isArray(a) && Array.isArray(b)) {
    const length = a.length
    if (length !== b.length) return false
    for (let i = 0; i < length; i++) {
      if (!isEqual(a[i], b[i], s)) return false
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
})

binaryOverload('map', `==`, 'map', (a, b, ast, s) => {
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false
    for (const [key, value] of a) if (!(b.has(key) && isEqual(value, b.get(key), s))) return false
    return true
  }

  if (a instanceof Map || b instanceof Map) {
    const obj = a instanceof Map ? b : a
    const map = a instanceof Map ? a : b
    const keysObj = Object.keys(obj)
    if (map.size !== keysObj.length) return false
    for (const [key, value] of map) {
      if (!(key in obj && isEqual(value, obj[key], s))) return false
    }
    return true
  }

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]
    if (!(key in b && isEqual(a[key], b[key], s))) return false
  }
  return true
})

binaryOverload('uint', '+', 'uint', (a, b) => new UnsignedInt(a.valueOf() + b.valueOf()))
binaryOverload('uint', '-', 'uint', (a, b) => new UnsignedInt(a.valueOf() - b.valueOf()))
binaryOverload('uint', '*', 'uint', (a, b) => new UnsignedInt(a.valueOf() * b.valueOf()))
binaryOverload('uint', '/', 'uint', (a, b, ast) => {
  if (b.valueOf() === 0n) throw new EvaluationError('division by zero', ast)
  return new UnsignedInt(a.valueOf() / b.valueOf())
})
binaryOverload('uint', '%', 'uint', (a, b, ast) => {
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
  binaryOverload(left, '<', right, (a, b) => a < b)
  binaryOverload(left, '<=', right, (a, b) => a <= b)
  binaryOverload(left, '>', right, (a, b) => a > b)
  binaryOverload(left, '>=', right, (a, b) => a >= b)
}

function isEqual(a, b, s) {
  if (a === b) return true
  switch (typeof a) {
    case 'string':
      return false
    case 'bigint':
      // eslint-disable-next-line eqeqeq
      if (typeof b === 'number') return a == b
      return false
    case 'number':
      // eslint-disable-next-line eqeqeq
      if (typeof b === 'bigint') return a == b
      return false
    case 'boolean':
      return false
    case 'object':
      if (typeof b !== 'object' || a === null || b === null) return false

      const leftType = s.objectTypesByConstructor.get(a.constructor)
      const rightType = s.objectTypesByConstructor.get(b.constructor)
      if (!leftType || leftType !== rightType) return false
      const handler = s.overloads['=='][leftType.name]?.[rightType.name]?.handler
      if (!handler) return false
      return handler(a, b, null, s)
  }
  throw new EvaluationError(`Cannot compare values of type ${typeof a}`)
}

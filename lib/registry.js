export class Type {
  #name
  constructor(name) {
    this.#name = name
    Object.freeze(this)
  }

  get name() {
    return this.#name
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
  google: {
    protobuf: {
      Timestamp: new Type('google.protobuf.Timestamp'),
      Duration: new Type('google.protobuf.Duration')
    }
  }
}

TYPES['google.protobuf.Timestamp'] = TYPES.google.protobuf.Timestamp
TYPES['google.protobuf.Duration'] = TYPES.google.protobuf.Duration

const typesForOperators = new Set(Object.keys(TYPES)).add('null').add('dyn')
typesForOperators.delete('google')

const typesForFunctions = new Set(Object.keys(TYPES)).add('null').add('ast')
typesForFunctions.delete('google')

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map((v) => deepClone(v))
  if (obj instanceof Map) return new Map([...obj].map(([k, v]) => [k, deepClone(v)]))
  if (obj instanceof Set) return new Set([...obj].map((v) => deepClone(v)))
  if (obj.constructor && obj.constructor !== Object) return obj

  const clone = {}
  for (const key of Object.keys(obj)) clone[key] = deepClone(obj[key])
  return clone
}

export function createRegistry(opts) {
  opts = deepClone(opts || {})
  opts.overloads ??= {}
  opts.functions ??= {standalone: Object.create(null), returnTypes: Object.create(null)}
  opts.objectTypes ??= new Map()
  opts.objectTypesByConstructor ??= new Map()
  opts.objectTypeInstances ??= new Map()
  const {functions, overloads, objectTypes, objectTypesByConstructor, objectTypeInstances} = opts

  return {
    registerFunctionOverload,
    registerOperatorOverload,
    registerType,
    unaryOverload,
    binaryOverload,
    clone,
    overloads,
    functions,
    objectTypes,
    objectTypeInstances,
    objectTypesByConstructor
  }

  function registerType(typename, constructor, withoutDynRegistration) {
    objectTypes.set(typename, constructor)
    objectTypesByConstructor.set(constructor, typename)
    if (withoutDynRegistration) return

    const type = new Type(typename)
    objectTypeInstances.set(typename, type)
    registerFunctionOverload(`dyn(${typename}): dyn`, (v) => v)
    registerFunctionOverload(`type(${typename}): type`, () => type)
  }

  function hasType(type) {
    const withoutDyn = type.replace(/^dyn<(.+)>$/, '$1')
    return typesForOperators.has(withoutDyn) || objectTypes.has(withoutDyn)
  }

  function clone() {
    return createRegistry({functions, overloads, objectTypes, objectTypesByConstructor})
  }

  function parseFunctionDeclaration(signature) {
    // Parse "string.indexOf(string, string, integer): integer"
    const match = signature.match(/^(?:([a-zA-Z0-9.]+)\.)?(\w+)\((.*?)\):\s*(.+)$/)
    if (!match) throw new Error(`Invalid signature: ${signature}`)

    const [, receiverType, name, argsStr, returnType] = match
    const argTypes = argsStr ? argsStr.split(',').map((s) => s.trim()) : []

    if (returnType && !(typesForOperators.has(returnType) || objectTypes.has(returnType))) {
      throw new Error(`Invalid return type '${returnType}' in ${signature}`)
    }

    for (let i = 0; i < argTypes.length; i++) {
      const argType = argTypes[i]
      if (typesForFunctions.has(argType) || objectTypes.has(argType)) continue
      throw new Error(`Invalid argument type '${argType}' in ${signature}`)
    }

    return {
      receiverType: receiverType || null,
      name,
      argTypes,
      returnType,
      argCount: argTypes.length
    }
  }

  function registerFunctionOverload(s, handlerOrOptions) {
    const handler = typeof handlerOrOptions === 'function'
      ? handlerOrOptions
      : handlerOrOptions.handler
    const options = typeof handlerOrOptions === 'function'
      ? {}
      : handlerOrOptions

    const dec = parseFunctionDeclaration(s)

    let fnTarget = dec.receiverType
      ? (functions[dec.receiverType] ??= Object.create(null))
      : functions.standalone

    functions.returnTypes[dec.name] ??= dec.returnType
    fnTarget = fnTarget[dec.name] ??= Object.create(null)

    const isMacro = dec.argTypes.includes('ast')
    fnTarget.macro = isMacro

    for (const argType of dec.argTypes) fnTarget = fnTarget[argType] ??= Object.create(null)
    if (fnTarget.handler) throw new Error(`Function overload already registered: ${s}`)
    fnTarget.macro = isMacro
    fnTarget.handler = handler
    fnTarget.returnType = dec.returnType
    if (options.typeCheck) fnTarget.typeCheck = options.typeCheck
  }

  function registerOperatorOverload(string, handler) {
    // Parse with optional return type: "Vector + Vector: Vector" or "Vector + Vector"
    const unaryParts = string.match(/^([-!])([\w.<>]+)(?::\s*([\w.<>]+))?$/)
    if (unaryParts) {
      const [, op, operandType, returnType] = unaryParts
      return unaryOverload(op, operandType, handler, returnType || operandType)
    }

    const parts = string.match(
      /^([\w.<>]+) ([-+*%/]|==|!=|<|<=|>|>=|in) ([\w.<>]+)(?::\s*([\w.<>]+))?$/
    )
    if (!parts) throw new Error(`Operator overload invalid: ${string}`)
    const [, leftType, op, rightType, returnType] = parts
    return binaryOverload(leftType, op, rightType, handler, returnType)
  }

  function unaryOverload(_op, type, handler, returnType) {
    if (!hasType(type)) {
      throw new Error(`Invalid type '${type}' in '${_op}${type}'`)
    }

    if (returnType && !hasType(returnType)) {
      throw new Error(`Invalid return type '${returnType}' in '${_op}${type}: ${returnType}'`)
    }

    const op = `${_op}_`
    overloads[op] ??= {}
    if (!overloads[op][type]) overloads[op][type] = {handler, returnType}
    else throw new Error(`Operator overload already registered: ${_op}${type}`)
  }

  function binaryOverload(leftType, op, rightType, handler, returnType) {
    if (!hasType(leftType)) {
      throw new Error(`Invalid left type '${leftType}' in '${leftType} ${op} ${rightType}'`)
    }

    if (!hasType(rightType)) {
      throw new Error(`Invalid right type '${rightType}' in '${leftType} ${op} ${rightType}'`)
    }

    if (returnType && !hasType(returnType)) {
      throw new Error(
        `Invalid return type '${returnType}' in '${leftType} ${op} ${rightType}: ${returnType}'`
      )
    }

    if (
      op === '<' ||
      op === '<=' ||
      op === '>' ||
      op === '>=' ||
      op === '==' ||
      op === '!=' ||
      op === 'in'
    ) {
      returnType ??= 'bool'
      if (returnType !== 'bool') {
        throw new Error(`Comparison operator '${op}' must return 'bool', got '${returnType}'`)
      }
    } else {
      returnType ??= leftType
    }

    overloads[op] ??= {}

    if (op === '==') {
      overloads['!='] ??= {}
      const leftEqObj = (overloads[op][leftType] ??= {})
      const rightEqObj = (overloads[op][rightType] ??= {})
      const leftNeqObj = (overloads['!='][leftType] ??= {})
      const rightNeqObj = (overloads['!='][rightType] ??= {})

      if (leftEqObj[rightType])
        throw new Error(`Operator overload already registered: ${leftType} == ${rightType}`)
      if (rightEqObj[leftType])
        throw new Error(`Operator overload already registered: ${rightType} == ${leftType}`)
      if (leftNeqObj[rightType])
        throw new Error(`Operator overload already registered: ${leftType} != ${rightType}`)
      if (rightNeqObj[leftType])
        throw new Error(`Operator overload already registered: ${rightType} != ${leftType}`)

      leftEqObj[rightType] = {handler, returnType}
      rightEqObj[leftType] = {handler: (a, b, ast, s) => handler(b, a, ast, s), returnType}
      leftNeqObj[rightType] = {handler: (a, b, ast, s) => !handler(a, b, ast, s), returnType}
      rightNeqObj[leftType] = {handler: (a, b, ast, s) => !handler(b, a, ast, s), returnType}
    } else {
      const leftObj = (overloads[op][leftType] ??= {})
      if (leftObj[rightType] === undefined) leftObj[rightType] = {handler, returnType}
      else throw new Error(`Operator overload already registered: ${leftType} ${op} ${rightType}`)
    }
  }
}

export const globalRegistry = createRegistry()

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

class TypeDeclaration {
  #stringValue
  constructor({name, kind, type, keyType, valueType, stringValue}) {
    if (type) this.type = type
    if (stringValue) this.#stringValue = stringValue
    if (name) this.name = name
    if (kind) this.kind = kind
    if (keyType) this.keyType = keyType
    if (valueType) this.valueType = valueType
    Object.freeze(this)
  }

  isDynOrBool() {
    return this.type === 'bool' || this.type === 'dyn'
  }

  toString() {
    return this.#stringValue || this.type
  }
}

function _createListType(valueType) {
  return new TypeDeclaration({
    kind: 'list',
    type: 'list',
    stringValue: `list<${valueType}>`,
    valueType
  })
}

function _createPrimitiveType(type) {
  return new TypeDeclaration({
    kind: 'primitive',
    type
  })
}

function _createMessageType(name) {
  return new TypeDeclaration({
    kind: 'message',
    name: name,
    type: name
  })
}

function _createMapType(keyType, valueType) {
  return new TypeDeclaration({
    kind: 'map',
    type: 'map',
    keyType: keyType,
    valueType: valueType,
    stringValue: `map<${keyType}, ${valueType}>`
  })
}

const TYPE_DECLARATIONS = {}
TYPE_DECLARATIONS.string = _createPrimitiveType('string')
TYPE_DECLARATIONS.bool = _createPrimitiveType('bool')
TYPE_DECLARATIONS.int = _createPrimitiveType('int')
TYPE_DECLARATIONS.uint = _createPrimitiveType('uint')
TYPE_DECLARATIONS.double = _createPrimitiveType('double')
TYPE_DECLARATIONS.bytes = _createPrimitiveType('bytes')
TYPE_DECLARATIONS.dyn = _createPrimitiveType('dyn')
TYPE_DECLARATIONS.null = _createPrimitiveType('null')
TYPE_DECLARATIONS.type = _createPrimitiveType('type')
TYPE_DECLARATIONS['google.protobuf.Timestamp'] = _createPrimitiveType('google.protobuf.Timestamp')
TYPE_DECLARATIONS['google.protobuf.Duration'] = _createPrimitiveType('google.protobuf.Duration')

TYPE_DECLARATIONS.list = TYPE_DECLARATIONS['list<dyn>'] = _createListType(TYPE_DECLARATIONS.dyn)

TYPE_DECLARATIONS.map = TYPE_DECLARATIONS['map<dyn, dyn>'] = _createMapType(
  TYPE_DECLARATIONS.dyn,
  TYPE_DECLARATIONS.dyn
)

function parseTypeString(typeStr, objectTypes, requireKnownTypes = false) {
  if (TYPE_DECLARATIONS[typeStr]) return TYPE_DECLARATIONS[typeStr]
  if (objectTypes?.has(typeStr)) return createObjectType(typeStr)

  const listMatch = typeStr.match(/^list<(.+)>$/)
  if (listMatch) {
    const valueType = parseTypeString(listMatch[1].trim(), objectTypes, requireKnownTypes)
    return createListType(valueType)
  }

  const mapMatch = typeStr.match(/^map<(.+)>$/)
  if (mapMatch) {
    const parts = splitByComma(mapMatch[1])
    if (parts.length !== 2) throw new Error(`Invalid map type: ${typeStr}`)

    const keyType = parseTypeString(parts[0].trim(), objectTypes, requireKnownTypes)
    const valueType = parseTypeString(parts[1].trim(), objectTypes, requireKnownTypes)
    return createMapType(keyType, valueType)
  }

  if (requireKnownTypes) throw new Error(`Unknown type: ${typeStr}`)

  return createObjectType(typeStr)
}

function createObjectType(name) {
  return (TYPE_DECLARATIONS[name] ??= _createMessageType(name))
}

function createListType(vType) {
  return (TYPE_DECLARATIONS[`list<${vType}>`] ??= _createListType(vType))
}

function createMapType(kType, vType) {
  return (TYPE_DECLARATIONS[`map<${kType}, ${vType}>`] ??= _createMapType(kType, vType))
}

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

function toCelFieldDeclaration(
  objectTypes,
  typename,
  fieldname,
  fielddecl,
  requireKnownTypes = false
) {
  const p = `Field '${fieldname}' in type '${typename}'`
  const field = typeof fielddecl === 'string' ? {type: fielddecl} : {...fielddecl}
  if (typeof field !== 'object')
    throw new Error(`Unsupported protobuf field declaration: ${JSON.stringify(fielddecl)}`)

  if (field.keyType) field.type ??= 'map'

  // Handle repeated fields
  if (field.rule === 'repeated') {
    const valueTypeStr = field.type.includes('<') ? field.type : field.type
    const valueType = parseTypeString(valueTypeStr, objectTypes, requireKnownTypes)
    return createListType(valueType)
  } else if (field.rule) {
    throw new Error(`${p} has unsupported rule: ${field.rule}`)
  }

  const typeDecl = parseTypeString(field.type, objectTypes, requireKnownTypes)
  if (!typeDecl) throw new Error(`${p} unknown field type: ${JSON.stringify(fielddecl)}`)

  return typeDecl
}

function splitByComma(str) {
  const parts = []
  let current = ''
  let depth = 0

  for (const char of str) {
    if (char === '<') depth++
    else if (char === '>') depth--
    else if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }

  if (current) parts.push(current)
  return parts
}

function normalizeFields(objectTypes, typename, fields) {
  if (!fields) return
  const all = {}
  for (const k of Object.keys(fields))
    all[k] = toCelFieldDeclaration(objectTypes, typename, k, fields[k])
  return all
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
    getType,
    unaryOverload,
    binaryOverload,
    clone,
    overloads,
    functions,
    objectTypes,
    objectTypeInstances,
    objectTypesByConstructor
  }

  function getType(typename) {
    return parseTypeString(typename, objectTypes, true)
  }

  function registerType(typename, _d, withoutDynRegistration) {
    const decl = {
      name: typename,
      ctor: typeof _d === 'function' ? _d : _d?.ctor,
      fields: normalizeFields(objectTypes, typename, _d?.fields)
    }

    if (!withoutDynRegistration) {
      if (objectTypes.has(typename)) throw new Error(`Type already registered: ${typename}`)

      if (typeof decl.ctor !== 'function') {
        throw new Error(`Constructor function missing for type '${typename}'`)
      }
    }

    objectTypes.set(typename, decl)
    objectTypesByConstructor.set(decl.ctor, decl)
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

    const [, receiverType, name, argsStr, _returnType] = match
    const argTypes = argsStr ? argsStr.split(',').map((s) => s.trim()) : []

    let returnType
    try {
      returnType = getType(_returnType || 'dyn')
    } catch (e) {
      throw new Error(`Invalid return type '${_returnType}' in ${signature}`)
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
    const handler =
      typeof handlerOrOptions === 'function' ? handlerOrOptions : handlerOrOptions.handler
    const options = typeof handlerOrOptions === 'function' ? {} : handlerOrOptions

    const dec = parseFunctionDeclaration(s)

    let fnTarget = dec.receiverType
      ? (functions[dec.receiverType] ??= Object.create(null))
      : functions.standalone

    fnTarget = fnTarget[dec.name] ??= Object.create(null)

    const isMacro = dec.argTypes.includes('ast')
    fnTarget.macro = isMacro

    if (!fnTarget.returnType) {
      functions.returnTypes[dec.name] = fnTarget.returnType = dec.returnType
    } else if (fnTarget.returnType.type !== dec.returnType.type) {
      functions.returnTypes[dec.name] = fnTarget.returnType = TYPE_DECLARATIONS.dyn
    }

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
      return unaryOverload(op, operandType, handler, returnType)
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

    try {
      returnType = getType(returnType || type)
    } catch (e) {
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

    try {
      returnType = returnType ? getType(returnType) : undefined
    } catch (e) {
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
      returnType ??= getType('bool')
      if (returnType.type !== 'bool') {
        throw new Error(`Comparison operator '${op}' must return 'bool', got '${returnType.type}'`)
      }
    } else {
      returnType ??= getType(leftType)
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

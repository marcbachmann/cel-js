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

export class TypeDeclaration {
  constructor({kind, type, stringValue, name, keyType, valueType, values}) {
    if (kind) this.kind = kind
    if (type) this.type = type
    if (name) this.name = name
    if (keyType) this.keyType = keyType
    if (valueType) this.valueType = valueType
    if (values) this.values = values
    Object.freeze(this)
  }

  isDynOrBool() {
    return this.type === 'bool' || this.type === 'dyn'
  }

  toString() {
    return this.name
  }
}

export class FunctionDeclaration {
  constructor({name, receiverType, argTypes, returnType, handler, typeCheck = null}) {
    this.name = name
    this.macro = argTypes.includes(astType)

    // Normalize receiver type to string
    if (receiverType) {
      const receiverName = receiverType.name || String(receiverType)
      if (receiverName === 'list<dyn>') this.receiverType = 'list'
      else if (receiverName === 'map<dyn, dyn>') this.receiverType = 'map'
      else this.receiverType = receiverName
    } else {
      this.receiverType = null
    }

    this.argTypes = argTypes
    this.returnType = returnType

    const receiverString = receiverType ? `${receiverType}.` : ''
    this.signature = `${receiverString}${name}(${argTypes.join(', ')}): ${returnType}`

    this.handler = handler
    this.typeCheck = typeCheck
    Object.freeze(this)
  }
}

function _createListType(valueType) {
  return new TypeDeclaration({
    kind: 'list',
    name: `list<${valueType}>`,
    type: 'list',
    valueType
  })
}

function _createPrimitiveType(type) {
  return new TypeDeclaration({
    kind: 'primitive',
    name: type,
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
    name: `map<${keyType}, ${valueType}>`,
    type: 'map',
    keyType: keyType,
    valueType: valueType
  })
}

// eslint-disable-next-line no-unused-vars
function _createEnumType(name, _values) {
  const values = {}
  for (const [k, v] of Object.entries(_values)) values[k] = BigInt(v)

  return new TypeDeclaration({
    kind: 'enum',
    name: name,
    type: name,
    values
  })
}

// Global immutable cache for built-in primitive types (shared across all registries)
const dynType = _createPrimitiveType('dyn')
const astType = _createPrimitiveType('ast')

class FunctionsByReceiver {
  /** @type {Array<FunctionDeclaration>} */
  #functions = []
  exists = false
  hasMacro = false

  add(decl) {
    this.exists = true
    if (decl.macro) this.hasMacro = true
    this.#functions.push(decl)
  }

  get functions() {
    return this.#functions
  }

  findMatch(argTypes) {
    if (!this.exists) return null
    for (const fn of this.#functions) {
      if (this.#matchesArgs(fn, argTypes)) return fn
    }
    return null
  }

  #matchesArgs(fn, argTypes) {
    for (let i = 0; i < argTypes.length; i++) {
      const declType = fn.argTypes[i]
      const runtimeType = argTypes[i]
      // dyn matches anything
      if (declType.type === 'dyn' || runtimeType === 'dyn') continue
      if (declType.type !== runtimeType) return false
    }
    return true
  }
}

const NO_RECEIVER = new FunctionsByReceiver()
class FunctionCandidates {
  exists = false
  hasMacro = false
  returnType = null
  /** @type {Map<string|null, FunctionsByReceiver>} */
  #byReceiverType = new Map()

  add(declaration) {
    this.exists = true
    if (declaration.macro) this.hasMacro = true

    if (!this.returnType) this.returnType = declaration.returnType
    else if (this.returnType !== declaration.returnType) this.returnType = dynType

    const receiverType = declaration.receiverType
    const coll =
      this.#byReceiverType.get(receiverType) ||
      this.#byReceiverType.set(receiverType, new FunctionsByReceiver()).get(receiverType)

    coll.add(declaration)
  }

  filterByReceiverType(receiverType) {
    return this.#byReceiverType.get(receiverType) || NO_RECEIVER
  }
}

const PRIMITIVE_TYPE_DECLARATIONS = Object.freeze({
  string: _createPrimitiveType('string'),
  bool: _createPrimitiveType('bool'),
  int: _createPrimitiveType('int'),
  uint: _createPrimitiveType('uint'),
  double: _createPrimitiveType('double'),
  bytes: _createPrimitiveType('bytes'),
  dyn: dynType,
  null: _createPrimitiveType('null'),
  type: _createPrimitiveType('type'),
  'google.protobuf.Timestamp': _createPrimitiveType('google.protobuf.Timestamp'),
  'google.protobuf.Duration': _createPrimitiveType('google.protobuf.Duration'),
  list: _createListType(dynType),
  'list<dyn>': _createListType(dynType),
  map: _createMapType(dynType, dynType),
  'map<dyn, dyn>': _createMapType(dynType, dynType)
})

// Helper function for splitting map type parameters
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

const typesForOperators = new Set(Object.keys(TYPES)).add('null').add('dyn')
typesForOperators.delete('google')

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map((v) => deepClone(v))
  if (obj instanceof Map) return new Map([...obj].map(([k, v]) => [k, deepClone(v)]))
  if (obj instanceof Set) return new Set([...obj].map((v) => deepClone(v)))
  // Handle objects with constructors (except plain Objects and null-prototype objects)
  if (obj.constructor && obj.constructor !== Object) return obj

  // Clone plain objects and null-prototype objects (from Object.create(null))
  const clone = Object.create(Object.getPrototypeOf(obj))
  for (const key of Object.keys(obj)) clone[key] = deepClone(obj[key])
  return clone
}

export class Registry {
  #overloads
  #objectTypes
  #objectTypesByConstructor
  #objectTypeInstances
  #typeDeclarations

  constructor({typeDeclarations, ...opts} = {}) {
    opts = deepClone(opts || {})
    this.#overloads = opts.overloads ?? {}
    this.#objectTypes = opts.objectTypes ?? new Map()
    this.#objectTypesByConstructor = opts.objectTypesByConstructor ?? new Map()
    this.#objectTypeInstances = opts.objectTypeInstances ?? new Map()
    this.#typeDeclarations = {...(typeDeclarations || PRIMITIVE_TYPE_DECLARATIONS)}
  }

  get overloads() {
    return this.#overloads
  }

  getFunctionCandidates(receiverType, functionName, argCount) {
    const candidates = new FunctionCandidates()
    for (const sig in this.#typeDeclarations) {
      const dec = this.#typeDeclarations[sig]
      if (!(dec instanceof FunctionDeclaration)) continue
      if (functionName !== dec.name) continue
      if (receiverType === null && dec.receiverType) continue // Skip receiver methods when looking for standalone
      if (receiverType && dec.receiverType === null) continue // Skip standalone when looking for receiver methods

      candidates.exists = true
      if (dec.macro) candidates.hasMacro = true

      // Only add to candidates if arg count matches
      if (dec.argTypes.length !== argCount) continue
      candidates.add(dec)
    }
    return candidates
  }

  get objectTypes() {
    return this.#objectTypes
  }

  get objectTypesByConstructor() {
    return this.#objectTypesByConstructor
  }

  get objectTypeInstances() {
    return this.#objectTypeInstances
  }

  getType(typename) {
    return this.#parseTypeString(typename, true)
  }

  getFunctionType(typename) {
    if (typename === 'ast') return astType
    return this.#parseTypeString(typename, true)
  }

  registerType(typename, _d, withoutDynRegistration) {
    const decl = {
      name: typename,
      ctor: typeof _d === 'function' ? _d : _d?.ctor,
      fields: this.#normalizeFields(typename, _d?.fields)
    }

    if (!withoutDynRegistration) {
      if (this.#objectTypes.has(typename)) throw new Error(`Type already registered: ${typename}`)

      if (typeof decl.ctor !== 'function') {
        throw new Error(`Constructor function missing for type '${typename}'`)
      }
    }

    this.#objectTypes.set(typename, decl)
    this.#objectTypesByConstructor.set(decl.ctor, decl)
    if (withoutDynRegistration) return

    const type = new Type(typename)
    this.#objectTypeInstances.set(typename, type)
    this.registerFunctionOverload(`type(${typename}): type`, () => type)
  }

  #hasType(type) {
    const withoutDyn = type.replace(/^dyn<(.+)>$/, '$1')
    return typesForOperators.has(withoutDyn) || this.#objectTypes.has(withoutDyn)
  }

  /** @returns {TypeDeclaration} */
  #parseTypeString(typeStr, requireKnownTypes = false) {
    // Check primitives first (fast path - shared immutable cache)
    if (PRIMITIVE_TYPE_DECLARATIONS[typeStr]) return PRIMITIVE_TYPE_DECLARATIONS[typeStr]

    // Check registry-specific cache
    if (this.#typeDeclarations[typeStr]) return this.#typeDeclarations[typeStr]

    // Check if this is a registered custom type
    if (this.#objectTypes.has(typeStr)) return this.#createObjectType(typeStr)

    const listMatch = typeStr.match(/^list<(.+)>$/)
    if (listMatch) {
      const valueType = this.#parseTypeString(listMatch[1].trim(), requireKnownTypes)
      return this.#createListType(valueType)
    }

    const mapMatch = typeStr.match(/^map<(.+)>$/)
    if (mapMatch) {
      const parts = splitByComma(mapMatch[1])
      if (parts.length !== 2) throw new Error(`Invalid map type: ${typeStr}`)

      const keyType = this.#parseTypeString(parts[0].trim(), requireKnownTypes)
      const valueType = this.#parseTypeString(parts[1].trim(), requireKnownTypes)
      return this.#createMapType(keyType, valueType)
    }

    if (requireKnownTypes) throw new Error(`Unknown type: ${typeStr}`)

    return this.#createObjectType(typeStr)
  }

  #createObjectType(name) {
    return (this.#typeDeclarations[name] ??= _createMessageType(name))
  }

  #createListType(vType) {
    const key = `list<${vType}>`
    return (this.#typeDeclarations[key] ??= _createListType(vType))
  }

  #createMapType(kType, vType) {
    const key = `map<${kType}, ${vType}>`
    return (this.#typeDeclarations[key] ??= _createMapType(kType, vType))
  }

  #toCelFieldDeclaration(typename, fields, k, requireKnownTypes = false) {
    try {
      const field = typeof fields[k] === 'string' ? {type: fields[k]} : {...fields[k]}
      if (typeof field?.type !== 'string') throw new Error(`unsupported declaration`)
      return this.#parseTypeString(field.type, requireKnownTypes)
    } catch (e) {
      e.message =
        `Field '${k}' in type '${typename}' has unsupported declaration: ` +
        `${JSON.stringify(fields[k])}`
      throw e
    }
  }

  #normalizeFields(typename, fields) {
    if (!fields) return
    const all = {}
    for (const k of Object.keys(fields)) all[k] = this.#toCelFieldDeclaration(typename, fields, k)
    return all
  }

  clone() {
    return new Registry({
      overloads: this.#overloads,
      objectTypes: this.#objectTypes,
      objectTypesByConstructor: this.#objectTypesByConstructor,
      objectTypeInstances: this.#objectTypeInstances,
      typeDeclarations: this.#typeDeclarations
    })
  }

  /** @param {string} signature */
  #parseFunctionDeclaration(signature, handler, typeCheck) {
    // Parse "string.indexOf(string, string, integer): integer"
    const match = signature.match(/^(?:([a-zA-Z0-9.]+)\.)?(\w+)\((.*?)\):\s*(.+)$/)
    if (!match) throw new Error(`Invalid signature: ${signature}`)

    const [, receiverType, name, argsStr, _returnType] = match

    try {
      return new FunctionDeclaration({
        name: name,
        receiverType: receiverType ? this.getType(receiverType.trim()) : null,
        returnType: this.getType(_returnType.trim() || 'dyn'),
        argTypes: splitByComma(argsStr).map((s) => this.getFunctionType(s.trim())),
        handler,
        typeCheck
      })
    } catch (e) {
      throw new Error(`Invalid function declaration: ${signature}`)
    }
  }

  /**
   * @param {FunctionDeclaration} a
   * @param {FunctionDeclaration} b
   */
  #functionSignatureOverlaps(a, b) {
    if (a.name !== b.name) return false
    if (a.argTypes.length !== b.argTypes.length) return false
    if ((a.receiverType || b.receiverType) && (!a.receiverType || !b.receiverType)) return false

    const isDifferentReceiver =
      a.receiverType !== b.receiverType && a.receiverType !== dynType && b.receiverType !== dynType

    return (
      !isDifferentReceiver &&
      (b.macro ||
        a.macro ||
        b.argTypes.every((type1, i) => {
          const type2 = a.argTypes[i]
          if (type1 === type2) return true
          if (type1 === astType || type2 === astType) return true
          if (type1 === dynType || type2 === dynType) return true
          return false
        }))
    )
  }

  /** @param {FunctionDeclaration} newDec */
  #checkOverlappingSignatures(newDec) {
    for (const key in this.#typeDeclarations) {
      const decl = this.#typeDeclarations[key]
      if (decl instanceof FunctionDeclaration && this.#functionSignatureOverlaps(decl, newDec)) {
        throw new Error(
          `Function signature '${newDec.signature}' overlaps with existing overload '${decl.signature}'.`
        )
      }
    }
  }

  registerFunctionOverload(s, handlerOrOptions) {
    const handler =
      typeof handlerOrOptions === 'function' ? handlerOrOptions : handlerOrOptions.handler
    const options = typeof handlerOrOptions === 'function' ? {} : handlerOrOptions

    const dec = this.#parseFunctionDeclaration(s, handler, options.typeCheck)
    this.#checkOverlappingSignatures(dec)
    this.#typeDeclarations[dec.signature] = dec
  }

  registerOperatorOverload(string, handler) {
    // Parse with optional return type: "Vector + Vector: Vector" or "Vector + Vector"
    const unaryParts = string.match(/^([-!])([\w.<>]+)(?::\s*([\w.<>]+))?$/)
    if (unaryParts) {
      const [, op, operandType, returnType] = unaryParts
      return this.unaryOverload(op, operandType, handler, returnType)
    }

    const parts = string.match(
      /^([\w.<>]+) ([-+*%/]|==|!=|<|<=|>|>=|in) ([\w.<>]+)(?::\s*([\w.<>]+))?$/
    )
    if (!parts) throw new Error(`Operator overload invalid: ${string}`)
    const [, leftType, op, rightType, returnType] = parts
    return this.binaryOverload(leftType, op, rightType, handler, returnType)
  }

  unaryOverload(_op, type, handler, returnType) {
    if (!this.#hasType(type)) {
      throw new Error(`Invalid type '${type}' in '${_op}${type}'`)
    }

    try {
      returnType = this.getType(returnType || type)
    } catch (e) {
      throw new Error(`Invalid return type '${returnType}' in '${_op}${type}: ${returnType}'`)
    }

    const op = `${_op}_`
    this.#overloads[op] ??= {}
    if (!this.#overloads[op][type]) this.#overloads[op][type] = {handler, returnType}
    else throw new Error(`Operator overload already registered: ${_op}${type}`)
  }

  binaryOverload(leftType, op, rightType, handler, returnType) {
    if (!this.#hasType(leftType)) {
      throw new Error(`Invalid left type '${leftType}' in '${leftType} ${op} ${rightType}'`)
    }

    if (!this.#hasType(rightType)) {
      throw new Error(`Invalid right type '${rightType}' in '${leftType} ${op} ${rightType}'`)
    }

    try {
      returnType = returnType ? this.getType(returnType) : undefined
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
      returnType ??= this.getType('bool')
      if (returnType.type !== 'bool') {
        throw new Error(`Comparison operator '${op}' must return 'bool', got '${returnType.type}'`)
      }
    } else {
      returnType ??= this.getType(leftType)
    }

    this.#overloads[op] ??= {}

    if (op === '==') {
      this.#overloads['!='] ??= {}
      const leftEqObj = (this.#overloads[op][leftType] ??= {})
      const rightEqObj = (this.#overloads[op][rightType] ??= {})
      const leftNeqObj = (this.#overloads['!='][leftType] ??= {})
      const rightNeqObj = (this.#overloads['!='][rightType] ??= {})

      if (leftEqObj[rightType])
        throw new Error(`Operator overload already registered: ${leftType} == ${rightType}`)
      if (rightEqObj[leftType])
        throw new Error(`Operator overload already registered: ${rightType} == ${leftType}`)
      if (leftNeqObj[rightType])
        throw new Error(`Operator overload already registered: ${leftType} != ${rightType}`)
      if (rightNeqObj[leftType])
        throw new Error(`Operator overload already registered: ${rightType} != ${leftType}`)

      leftEqObj[rightType] = {handler, returnType}
      rightEqObj[leftType] = {handler: (a, b, ast, ev) => handler(b, a, ast, ev), returnType}
      leftNeqObj[rightType] = {handler: (a, b, ast, ev) => !handler(a, b, ast, ev), returnType}
      rightNeqObj[leftType] = {handler: (a, b, ast, ev) => !handler(b, a, ast, ev), returnType}
    } else {
      const leftObj = (this.#overloads[op][leftType] ??= {})
      if (leftObj[rightType] === undefined) leftObj[rightType] = {handler, returnType}
      else throw new Error(`Operator overload already registered: ${leftType} ${op} ${rightType}`)
    }
  }
}

export function createRegistry(opts) {
  return new Registry(opts)
}

export const globalRegistry = createRegistry()

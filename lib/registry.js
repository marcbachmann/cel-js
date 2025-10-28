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
  constructor({kind, type, name, keyType, valueType, values}) {
    this.kind = kind
    this.type = type
    this.name = name

    if (keyType) this.keyType = keyType
    if (valueType) this.valueType = valueType
    if (values) this.values = values
    Object.freeze(this)
  }

  isDynOrBool() {
    return this.type === 'bool' || this.kind === 'dyn'
  }

  toString() {
    return this.name
  }

  matches(other) {
    if (this === other || other.name === 'dyn') return true

    switch (this.kind) {
      case 'dyn':
        return true
      case 'list':
        return other.kind === 'list' && this.valueType.matches(other.valueType)
      case 'map':
        return (
          other.kind === 'map' &&
          this.keyType.matches(other.keyType) &&
          this.valueType.matches(other.valueType)
        )
      default:
        return this.name === other.name
    }
  }
}

export class FunctionDeclaration {
  constructor({name, receiverType, argTypes, returnType, handler, typeCheck}) {
    this.name = name
    this.macro = argTypes.includes(astType)
    this.receiverType = receiverType || null
    this.argTypes = argTypes
    this.returnType = returnType

    const receiverString = receiverType ? `${receiverType}.` : ''
    this.signature = `${receiverString}${name}(${argTypes.join(', ')}): ${returnType}`

    this.handler = handler
    this.typeCheck = typeCheck
    Object.freeze(this)
  }

  matchesArgs(argTypes) {
    if (argTypes.length !== this.argTypes.length) return false
    return this.argTypes.every((t, i) => t.matches(argTypes[i]))
  }
}

export class OperatorDeclaration {
  constructor({operator, leftType, rightType, handler, returnType}) {
    this.operator = operator
    this.leftType = leftType
    this.rightType = rightType || null
    this.handler = handler
    this.returnType = returnType

    if (rightType) {
      this.signature = `${leftType} ${operator} ${rightType}: ${returnType}`
    } else {
      this.signature = `${operator}${leftType}: ${returnType}`
    }

    Object.freeze(this)
  }

  get isUnary() {
    return this.rightType === null
  }

  get isBinary() {
    return this.rightType !== null
  }

  equals(other) {
    return (
      this.operator === other.operator &&
      this.leftType === other.leftType &&
      this.rightType === other.rightType
    )
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

function _createPrimitiveType(name) {
  return new TypeDeclaration({
    kind: 'primitive',
    name,
    type: name
  })
}

function _createMessageType(name) {
  return new TypeDeclaration({
    kind: 'message',
    name,
    type: name
  })
}

function _createDynType(valueType) {
  const name = valueType ? `dyn<${valueType}>` : 'dyn'
  return new TypeDeclaration({
    kind: 'dyn',
    name,
    type: name,
    valueType
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
export const dynType = _createDynType()
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
      if (fn.matchesArgs(argTypes)) return fn
    }
    return null
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
    else if (declaration.typeCheck) this.returnType = dynType
    else if (this.returnType !== declaration.returnType) this.returnType = dynType

    const receiverType = declaration.receiverType
    const coll =
      this.#byReceiverType.get(receiverType) ||
      this.#byReceiverType.set(receiverType, new FunctionsByReceiver()).get(receiverType)

    coll.add(declaration)
  }

  filterByReceiverType(receiverType) {
    if (receiverType === null) return this.#byReceiverType.get(null) || NO_RECEIVER

    return (
      // First try exact match
      this.#byReceiverType.get(receiverType) ||
      // For generic types, also try matching with the base type
      // e.g., if looking for list<string>, also check list<dyn>
      (receiverType.type === 'list' || receiverType.type === 'map'
        ? this.#byReceiverType.get(PRIMITIVE_TYPE_DECLARATIONS[receiverType.type])
        : null) ||
      NO_RECEIVER
    )
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
  if (Array.isArray(obj)) return obj.map(deepClone)
  if (obj instanceof Map) return new Map([...obj].map(([k, v]) => [k, deepClone(v)]))
  if (obj instanceof Set) return new Set([...obj].map(deepClone))
  // Handle objects with constructors (except plain Objects and null-prototype objects)
  if (obj.constructor && obj.constructor !== Object) return obj

  // Clone plain objects and null-prototype objects (from Object.create(null))
  const clone = Object.create(Object.getPrototypeOf(obj))
  for (const key of Object.keys(obj)) clone[key] = deepClone(obj[key])
  return clone
}

export class Registry {
  #overloadsCache = null
  #objectTypes
  #objectTypesByConstructor
  #objectTypeInstances
  #typeDeclarations

  constructor({typeDeclarations, ...opts} = {}) {
    opts = deepClone(opts || {})
    this.#objectTypes = opts.objectTypes ?? new Map()
    this.#objectTypesByConstructor = opts.objectTypesByConstructor ?? new Map()
    this.#objectTypeInstances = opts.objectTypeInstances ?? new Map()
    this.#typeDeclarations = new Map(
      typeDeclarations || Object.entries(PRIMITIVE_TYPE_DECLARATIONS)
    )
  }

  get overloads() {
    if (this.#overloadsCache) return this.#overloadsCache

    // Compute overloads from OperatorDeclaration instances
    // Uses TypeDeclaration instances as keys (via Map)
    const overloads = {}
    for (const [, decl] of this.#typeDeclarations) {
      if (!(decl instanceof OperatorDeclaration)) continue

      const op = decl.operator
      if (!overloads[op]) overloads[op] = new Map()

      if (decl.isUnary) {
        overloads[op].set(decl.leftType, {
          handler: decl.handler,
          returnType: decl.returnType
        })
      } else {
        let leftMap = overloads[op].get(decl.leftType)
        if (!leftMap) {
          leftMap = new Map()
          overloads[op].set(decl.leftType, leftMap)
        }
        leftMap.set(decl.rightType, {
          handler: decl.handler,
          returnType: decl.returnType
        })
      }
    }

    this.#overloadsCache = overloads
    return overloads
  }

  #invalidateOverloadsCache() {
    this.#overloadsCache = null
  }

  getFunctionCandidates(receiverType, functionName, argCount) {
    const candidates = new FunctionCandidates()
    for (const [, dec] of this.#typeDeclarations) {
      if (!(dec instanceof FunctionDeclaration)) continue
      if (functionName !== dec.name) continue
      if (receiverType === null && dec.receiverType) continue // Skip receiver methods when looking for standalone
      if (receiverType && dec.receiverType === null) continue // Skip standalone when looking for receiver methods

      candidates.exists = true
      if (dec.macro) candidates.hasMacro = true

      if (receiverType && !receiverType.matches(dec.receiverType)) continue

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

  getVerifiedType(typeStr) {
    return PRIMITIVE_TYPE_DECLARATIONS[typeStr] || this.#typeDeclarations.get(typeStr)
  }

  assertType(typename, type, signature) {
    try {
      return this.#parseTypeString(typename, true)
    } catch (e) {
      e.message = `Invalid ${type} '${e.unknownType || typename}' in '${signature}'`
      throw e
    }
  }

  getFunctionType(typename) {
    if (typename === 'ast') return astType
    return this.#parseTypeString(typename, true)
  }

  registerType(typename, _d, withoutDynRegistration) {
    const decl = {
      name: typename,
      type: this.#parseTypeString(typename, false),
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

  /** @returns {TypeDeclaration} */
  #parseTypeString(typeStr, requireKnownTypes = false) {
    const existing = this.getVerifiedType(typeStr)
    if (existing) return existing

    // Handle dyn<type> patterns used for dynamic overloads
    const dynMatch = typeStr.match(/^dyn<(.+)>$/)
    if (dynMatch) {
      const innerType = this.#parseTypeString(dynMatch[1].trim(), requireKnownTypes)
      return this.#createDynType(innerType)
    }

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

    if (requireKnownTypes) {
      const err = new Error(`Unknown type: ${typeStr}`)
      err.unknownType = typeStr
      throw err
    }

    return this.#createObjectType(typeStr)
  }

  #createObjectType(name) {
    return (
      this.#typeDeclarations.get(name) ||
      this.#typeDeclarations.set(name, _createMessageType(name)).get(name)
    )
  }

  #createDynType(innerType) {
    const key = `dyn<${innerType}>`
    return (
      this.#typeDeclarations.get(key) ||
      this.#typeDeclarations.set(key, _createDynType(innerType)).get(key)
    )
  }

  #createListType(vType) {
    const key = `list<${vType}>`
    return (
      this.#typeDeclarations.get(key) ||
      this.#typeDeclarations.set(key, _createListType(vType)).get(key)
    )
  }

  #createMapType(kType, vType) {
    const key = `map<${kType}, ${vType}>`
    return (
      this.#typeDeclarations.get(key) ||
      this.#typeDeclarations.set(key, _createMapType(kType, vType)).get(key)
    )
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
    for (const [, decl] of this.#typeDeclarations) {
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
    this.#typeDeclarations.set(dec.signature, dec)
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

  unaryOverload(op, typeStr, handler, returnTypeStr) {
    const leftType = this.assertType(typeStr, 'type', `${op}${typeStr}`)
    const returnType = this.assertType(
      returnTypeStr || typeStr,
      'return type',
      `${op}${typeStr}: ${returnTypeStr || typeStr}`
    )

    const decl = new OperatorDeclaration({operator: `${op}_`, leftType, returnType, handler})
    if (this.#hasOverload(decl)) {
      throw new Error(`Operator overload already registered: ${op}${typeStr}`)
    }
    this.#typeDeclarations.set(decl.signature, decl)
    this.#invalidateOverloadsCache()
  }

  #hasOverload(decl) {
    for (const [, other] of this.#typeDeclarations) {
      if (other instanceof OperatorDeclaration && decl.equals(other)) return true
    }
    return false
  }

  binaryOverload(leftTypeStr, op, rightTypeStr, handler, returnTypeStr) {
    if (!returnTypeStr) {
      if (isRelational(op)) returnTypeStr = 'bool'
      else returnTypeStr = leftTypeStr
    }

    const sig = `${leftTypeStr} ${op} ${rightTypeStr}: ${returnTypeStr}`
    const leftType = this.assertType(leftTypeStr, 'left type', sig)
    const rightType = this.assertType(rightTypeStr, 'right type', sig)
    const returnType = this.assertType(returnTypeStr, 'return type', sig)

    if (isRelational(op) && returnType.type !== 'bool') {
      throw new Error(`Comparison operator '${op}' must return 'bool', got '${returnType.type}'`)
    }

    const dec = new OperatorDeclaration({operator: op, leftType, rightType, returnType, handler})
    if (this.#hasOverload(dec)) {
      throw new Error(`Operator overload already registered: ${dec.signature}`)
    }

    if (op === '==') {
      // Create four declarations: right==left, left!=right, right!=left
      const declarations = [
        new OperatorDeclaration({
          operator: '==',
          leftType: rightType,
          rightType: leftType,
          handler(a, b, ast, ev) {
            return handler(b, a, ast, ev)
          },
          returnType
        }),
        new OperatorDeclaration({
          operator: '!=',
          leftType,
          rightType,
          handler(a, b, ast, ev) {
            return !handler(a, b, ast, ev)
          },
          returnType
        }),
        new OperatorDeclaration({
          operator: '!=',
          leftType: rightType,
          rightType: leftType,
          handler(a, b, ast, ev) {
            return !handler(b, a, ast, ev)
          },
          returnType
        })
      ]

      for (const decl of declarations) {
        if (!this.#hasOverload(decl)) continue
        throw new Error(`Operator overload already registered: ${decl.signature}`)
      }

      for (const decl of declarations) this.#typeDeclarations.set(decl.signature, decl)
    }

    this.#typeDeclarations.set(dec.signature, dec)
    this.#invalidateOverloadsCache()
  }
}

function isRelational(op) {
  return (
    op === '<' ||
    op === '<=' ||
    op === '>' ||
    op === '>=' ||
    op === '==' ||
    op === '!=' ||
    op === 'in'
  )
}

export function createRegistry(opts) {
  return new Registry(opts)
}

export const globalRegistry = createRegistry()

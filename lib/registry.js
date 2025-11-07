import {EvaluationError} from './errors.js'
import {Duration, UnsignedInt} from './functions.js'

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

class DynVariableRegistry extends Map {
  get(name) {
    return super.get(name) || dynType
  }
}

export class TypeDeclaration {
  #matchesCache = new Map()
  constructor({kind, type, name, keyType, valueType, values}) {
    this.kind = kind
    this.type = type
    this.name = name

    if (keyType) this.keyType = keyType
    if (valueType) this.valueType = valueType
    if (values) this.values = values

    if (kind === 'list') this.fieldLazy = this.#getListField
    else if (kind === 'map') this.fieldLazy = this.#getMapField
    else if (kind === 'message') this.fieldLazy = this.#getMessageField
    else if (kind === 'dyn') this.fieldLazy = this.#getMapField

    Object.freeze(this)
  }

  isDynOrBool() {
    return this.type === 'bool' || this.kind === 'dyn'
  }

  toString() {
    return this.name
  }

  #getMessageField(obj, key, ast, ev) {
    const type = ev.objectTypesByConstructor.get(obj.constructor)
    if (!type) return

    if (!type.fields) return Object.hasOwn(obj, key) ? obj[key] : undefined

    const valueType = type.fields[key]
    if (!valueType) return

    const value = obj[key]
    if (valueType.kind === 'dyn') return value

    const actualType = ev.debugType(value)
    if (valueType.matches(actualType)) return value
    throw new EvaluationError(
      `Field '${key}' is not of type '${valueType}', got '${actualType}'`,
      ast
    )
  }

  #getMapField(obj, key, ast, ev) {
    let value
    if (obj instanceof Map) value = obj.get(key)
    else value = Object.hasOwn(obj, key) ? obj[key] : undefined

    if (value === undefined) return
    if (this.valueType.kind === 'dyn') return value

    const type = ev.debugType(value)
    if (this.valueType.matches(type)) return value
    throw new EvaluationError(
      `Field '${key}' is not of type '${this.valueType}', got '${type}'`,
      ast
    )
  }

  #getListField(obj, key, ast, ev) {
    if (!(typeof key === 'number' || typeof key === 'bigint')) return

    const value = obj[key]
    if (value === undefined) {
      throw new EvaluationError(
        `No such key: index out of bounds, index ${key} ${
          key < 0 ? '< 0' : `>= size ${obj.length}`
        }`,
        ast
      )
    }

    const type = ev.debugType(value)
    if (this.valueType.matches(type)) return value

    throw new EvaluationError(
      `List item with index '${key}' is not of type '${this.valueType}', got '${type}'`,
      ast
    )
  }

  fieldLazy() {}
  field(obj, key, ast, ev) {
    const v = this.fieldLazy(obj, key, ast, ev)
    if (v !== undefined) return v
    throw new EvaluationError(`No such key: ${key}`, ast)
  }

  matchesBoth(other) {
    return this.matches(other) && other.matches(this)
  }

  matches(other) {
    return (
      this.#matchesCache.get(other) ??
      this.#matchesCache.set(other, this.#matches(other)).get(other)
    )
  }

  #matches(other) {
    if (this === other) return true
    if (other.kind === 'dyn') return other.valueType ? this.matches(other.valueType) : true

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
const dynType = _createDynType()
const astType = _createPrimitiveType('ast')
const listType = _createListType(dynType)
const mapType = _createMapType(dynType, dynType)

export const celTypes = Object.freeze({
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
  list: listType,
  'list<dyn>': listType,
  map: mapType,
  'map<dyn, dyn>': mapType
})

class FunctionsByReceiver {
  /** @type {Array<FunctionDeclaration>} */
  functions = []
  exists = false
  hasMacro = false

  add(decl) {
    this.exists = true
    if (decl.macro) this.hasMacro = true
    this.functions.push(decl)
  }

  findMatch(argTypes) {
    if (!this.exists) return null
    for (const fn of this.functions) {
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
        ? this.#byReceiverType.get(celTypes[receiverType.type])
        : null) ||
      NO_RECEIVER
    )
  }
}

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

const builtinObjectTypes = [
  [undefined, 'map'],
  [Object, 'map'],
  [Map, 'map'],
  [Array, 'list'],
  [Uint8Array, 'bytes'],
  [Date, 'google.protobuf.Timestamp'],
  [Duration, 'google.protobuf.Duration'],
  [UnsignedInt, 'uint'],
  [Type, 'type']
]

if (typeof Buffer !== 'undefined') builtinObjectTypes.push([Buffer, 'bytes'])

export class Registry {
  #overloadResolutionCache = {}
  #overloadCheckCache = {}
  #typeDeclarations
  #dynTypes = new Map()

  constructor(opts = {}) {
    this.objectTypes = new Map(opts.objectTypes || [])
    this.objectTypesByConstructor = new Map(opts.objectTypesByConstructor || [])
    this.objectTypeInstances = new Map(opts.objectTypeInstances || [])

    this.#typeDeclarations = new Map(opts.typeDeclarations || Object.entries(celTypes))
    this.variables = opts.unlistedVariablesAreDyn
      ? new DynVariableRegistry(opts.variables || [])
      : new Map(opts.variables || [])

    if (!this.variables.size) {
      for (const [instance, name] of builtinObjectTypes) {
        this.registerType(name, instance, true)
      }

      const globalValues = new Map(Object.entries(TYPES))
      if (!this.variables.size) {
        for (const [name, type] of globalValues) {
          if (!(type instanceof Type)) continue
          this.registerVariable(name, 'type')
        }
      }
    }
  }

  #invalidateOverloadsCache() {
    this.#overloadResolutionCache = {}
    this.#overloadCheckCache = {}
  }

  registerVariable(name, type) {
    if (this.variables.has(name)) throw new Error(`Variable already registered: ${name}`)
    this.variables.set(name, type instanceof TypeDeclaration ? type : this.getType(type))
    return this
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

  getType(typename) {
    return this.#parseTypeString(typename, true)
  }

  getDynType(type) {
    return (
      this.#dynTypes.get(type) ||
      this.#dynTypes.set(type, this.#parseTypeString(`dyn<${type}>`, true)).get(type)
    )
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
      if (this.objectTypes.has(typename)) throw new Error(`Type already registered: ${typename}`)

      if (typeof decl.ctor !== 'function') {
        throw new Error(`Constructor function missing for type '${typename}'`)
      }
    }

    this.objectTypes.set(typename, decl)
    this.objectTypesByConstructor.set(decl.ctor, decl)
    if (withoutDynRegistration) return

    const type = new Type(typename)
    this.objectTypeInstances.set(typename, type)
    this.registerFunctionOverload(`type(${typename}): type`, () => type)
  }

  /** @returns {TypeDeclaration} */
  #parseTypeString(typeStr, requireKnownTypes = false) {
    const existing = this.#typeDeclarations.get(typeStr)
    if (existing) return existing

    // Handle dyn<type> patterns used for dynamic overloads
    const dynMatch = typeStr.match(/^dyn<(.+)>$/)
    if (dynMatch) {
      const type = this.#parseTypeString(dynMatch[1].trim(), requireKnownTypes)
      return this.#createDeclaration(_createDynType, `dyn<${type}>`, type)
    }

    const listMatch = typeStr.match(/^list<(.+)>$/)
    if (listMatch) {
      const vType = this.#parseTypeString(listMatch[1].trim(), requireKnownTypes)
      return this.#createDeclaration(_createListType, `list<${vType}>`, vType)
    }

    const mapMatch = typeStr.match(/^map<(.+)>$/)
    if (mapMatch) {
      const parts = splitByComma(mapMatch[1])
      if (parts.length !== 2) throw new Error(`Invalid map type: ${typeStr}`)

      const kType = this.#parseTypeString(parts[0].trim(), requireKnownTypes)
      const vType = this.#parseTypeString(parts[1].trim(), requireKnownTypes)
      return this.#createDeclaration(_createMapType, `map<${kType}, ${vType}>`, kType, vType)
    }

    if (requireKnownTypes) {
      const err = new Error(`Unknown type: ${typeStr}`)
      err.unknownType = typeStr
      throw err
    }

    return this.#createDeclaration(_createMessageType, typeStr, typeStr)
  }

  #createDeclaration(creator, key, ...args) {
    return (
      this.#typeDeclarations.get(key) || this.#typeDeclarations.set(key, creator(...args)).get(key)
    )
  }

  #findBinaryOverloads(operator, leftType, rightType) {
    const nonexactMatches = []
    for (const [, decl] of this.#typeDeclarations) {
      if (!(decl instanceof OperatorDeclaration)) continue
      if (decl.operator !== operator) continue
      if (this.#exactMatch(decl, leftType, rightType)) return [decl]
      if (this.#matchesOverload(decl, leftType, rightType)) nonexactMatches.push(decl)
    }

    if (
      nonexactMatches.length === 0 &&
      (operator === '==' || operator === '!=') &&
      this.#hasDynOperand(leftType, rightType)
    ) {
      const handler = operator === '==' ? (a, b) => a === b : (a, b) => a !== b
      return [{handler, returnType: this.getType('bool')}]
    }

    return nonexactMatches
  }

  findUnaryOverload(op, left) {
    const cached = this.#overloadResolutionCache[op]?.get(left)
    if (cached !== undefined) return cached

    let value = false
    for (const [, decl] of this.#typeDeclarations) {
      if (!(decl instanceof OperatorDeclaration)) continue
      if (decl.operator !== op || decl.leftType !== left) continue
      value = decl
      break
    }

    return (this.#overloadResolutionCache[op] ??= new Map()).set(left, value).get(left)
  }

  findBinaryOverload(op, left, right) {
    return (
      this.#overloadResolutionCache[op]?.get(left)?.get(right) ??
      this.#cacheOverloadResult(
        this.#overloadResolutionCache,
        op,
        left,
        right,
        this.#findBinaryOverloadUncached(op, left, right)
      )
    )
  }

  checkBinaryOverload(op, left, right) {
    return (
      this.#overloadCheckCache[op]?.get(left)?.get(right) ??
      this.#cacheOverloadResult(
        this.#overloadCheckCache,
        op,
        left,
        right,
        this.#checkBinaryOverloadUncached(op, left, right)
      )
    )
  }

  #findBinaryOverloadUncached(operator, leftType, rightType) {
    const ops = this.#findBinaryOverloads(operator, leftType, rightType)
    if (ops.length === 0) return false
    if (ops.length === 1) return ops[0]
    throw new Error(`Operator overload '${ops[0].signature}' overlaps with '${ops[1].signature}'.`)
  }

  #checkBinaryOverloadUncached(op, left, right) {
    const ops = this.#findBinaryOverloads(op, left, right)
    if (ops.length === 0) return false
    if (ops.length === 1) return ops[0].returnType
    if (['==', '!=', '<', '<=', '>', '>=', 'in'].includes(op)) return ops[0].returnType

    const firstType = ops[0].returnType
    if (ops.every((d) => d.returnType === firstType)) return firstType
    if (
      (firstType.kind === 'list' || firstType.kind === 'map') &&
      ops.every((d) => d.returnType.kind === firstType.kind)
    ) {
      return firstType.kind === 'list' ? celTypes.list : celTypes.map
    }
    return celTypes.dyn
  }

  #cacheOverloadResult(cache, op, left, right, result) {
    const opMap = (cache[op] ??= new Map())
    const leftMap = opMap.get(left) || opMap.set(left, new Map()).get(left)
    leftMap.set(right, result)
    return result
  }

  #exactMatch(decl, actualLeft, actualRight) {
    return (
      (actualLeft === decl.leftType && actualRight === decl.rightType) ||
      (actualLeft.name === `dyn<${decl.leftType}>` && actualRight === decl.rightType) ||
      (actualLeft === decl.leftType && actualRight.name === `dyn<${decl.rightType}>`) ||
      (actualLeft.name === `dyn<${decl.leftType}>` && actualRight.name === `dyn<${decl.rightType}>`)
    )
  }

  #matchesOverload(decl, actualLeft, actualRight) {
    if (!this.#isAssignable(actualLeft, decl.leftType)) return false
    if (!this.#isAssignable(actualRight, decl.rightType)) return false
    return this.#validateParameters(decl.operator, actualLeft, actualRight)
  }

  #isAssignable(actual, declared) {
    if (actual === declared) return true
    if (actual.kind === 'dyn') {
      return actual.valueType ? this.#isAssignable(actual.valueType, declared) : true
    }

    if (actual.type !== declared.type) return false
    if (declared === celTypes.list) return true
    if (declared === celTypes.map) return true
    return false
  }

  #validateParameters(operator, leftType, rightType) {
    if (operator === 'in') {
      if (leftType.kind === 'dyn') return true
      if (rightType.kind === 'list') return rightType.valueType.matchesBoth(leftType)
      if (rightType.kind === 'map') return rightType.keyType.matchesBoth(leftType)
      return true
    }

    if (operator === '+' || operator === '==' || operator === '!=') {
      if (leftType.kind === 'list' && rightType.kind === 'list') {
        return leftType.matchesBoth(rightType)
      }

      if (leftType.kind === 'map' && rightType.kind === 'map') {
        return leftType.matchesBoth(rightType)
      }
    }

    return true
  }

  #hasDynOperand(leftType, rightType) {
    if (leftType.kind === 'dyn' || rightType.kind === 'dyn') return true
    return false
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

  clone(opts = {}) {
    return new Registry({
      objectTypes: this.objectTypes,
      objectTypesByConstructor: this.objectTypesByConstructor,
      objectTypeInstances: this.objectTypeInstances,
      typeDeclarations: this.#typeDeclarations,
      variables: this.variables,
      unlistedVariablesAreDyn: opts.unlistedVariablesAreDyn
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
    returnTypeStr ??= isRelational(op) ? 'bool' : leftTypeStr

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
      const declarations = [
        new OperatorDeclaration({
          operator: '!=',
          leftType,
          rightType,
          handler(a, b, ast, ev) {
            return !handler(a, b, ast, ev)
          },
          returnType
        })
      ]

      if (leftType !== rightType) {
        declarations.push(
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
            leftType: rightType,
            rightType: leftType,
            handler(a, b, ast, ev) {
              return !handler(b, a, ast, ev)
            },
            returnType
          })
        )
      }

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

import {EvaluationError} from './errors.js'
import {UnsignedInt} from './functions.js'
import {Optional, OPTIONAL_NONE, toggleOptionalTypes} from './optional.js'

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
  type: new Type('type')
}

class LayeredMap {
  #parent = null
  #entries = null

  constructor(source) {
    if (source instanceof LayeredMap) {
      this.#parent = source
      this.#entries = new Map()
    } else {
      this.#entries = new Map(source)
    }
  }

  fork(lock = true) {
    if (lock) this.set = this.#throwLocked
    return new this.constructor(this)
  }

  #throwLocked() {
    throw new Error('Cannot modify frozen registry')
  }

  set(key, value) {
    this.#entries.set(key, value)
    return this
  }

  has(key) {
    return this.#entries.has(key) || (this.#parent ? this.#parent.has(key) : false)
  }

  get(key) {
    return this.#entries.get(key) || this.#parent?.get(key)
  }

  *#entryIterator() {
    if (this.#parent) yield* this.#parent
    yield* this.#entries
  }

  [Symbol.iterator]() {
    return this.#entryIterator()
  }

  get size() {
    return this.#entries.size + (this.#parent ? this.#parent.size : 0)
  }
}

class DynVariableRegistry extends LayeredMap {
  constructor(source = null, marker = null) {
    super(source, marker)
  }

  get(name) {
    const value = super.get(name)
    return value === undefined ? dynType : value
  }
}

function createLayeredMap(source, MapCtor = LayeredMap, lock = true) {
  if (source instanceof MapCtor) return source.fork(lock)
  return new MapCtor(source)
}

export class TypeDeclaration {
  #matchesCache = new WeakMap()
  #hasDynTypes = null
  #hasPlaceholderTypes = null
  constructor({kind, type, name, keyType, valueType, values}) {
    this.kind = kind
    this.type = type
    this.name = name

    if (keyType) this.keyType = keyType
    if (valueType) this.valueType = valueType
    if (values) this.values = values

    this.unwrappedType = kind === 'dyn' && valueType ? valueType.unwrappedType : this

    if (kind === 'list') this.fieldLazy = this.#getListField
    else if (kind === 'map') this.fieldLazy = this.#getMapField
    else if (kind === 'message') this.fieldLazy = this.#getMessageField
    else if (kind === 'dyn') this.fieldLazy = this.#getMapField
    else if (kind === 'optional') this.fieldLazy = this.#getOptionalField

    Object.freeze(this)
  }

  hasDyn() {
    return (this.#hasDynTypes ??=
      this.kind === 'dyn' || this.valueType?.hasDyn() || this.keyType?.hasDyn() || false)
  }

  hasNoDynTypes() {
    return this.hasDyn() === false
  }

  isDynOrBool() {
    return this.type === 'bool' || this.kind === 'dyn'
  }

  hasPlaceholder() {
    return (this.#hasPlaceholderTypes ??=
      this.kind === 'param' ||
      this.keyType?.hasPlaceholder() ||
      this.valueType?.hasPlaceholder() ||
      false)
  }

  unify(r, t2) {
    const t1 = this
    if (t1 === t2 || t1.kind === 'dyn' || t2.kind === 'param') return t1
    if (t2.kind === 'dyn' || t1.kind === 'param') return t2
    if (t1.kind !== t2.kind) return null
    if (!(t1.hasPlaceholder() || t2.hasPlaceholder() || t1.hasDyn() || t2.hasDyn())) return null

    const valueType = t1.valueType.unify(r, t2.valueType)
    if (!valueType) return null
    switch (t1.kind) {
      case 'optional':
        return r.getOptionalType(valueType)
      case 'list':
        return r.getListType(valueType)
      case 'map':
        const keyType = t1.keyType.unify(r, t2.keyType)
        return keyType ? r.getMapType(keyType, valueType) : null
    }
  }

  templated(r, bind) {
    if (!this.hasPlaceholder()) return this

    switch (this.kind) {
      case 'dyn':
        return this.valueType.templated(r, bind)
      case 'param':
        return bind?.get(this.name) || this
      case 'map':
        return r.getMapType(this.keyType.templated(r, bind), this.valueType.templated(r, bind))
      case 'list':
        return r.getListType(this.valueType.templated(r, bind))
      case 'optional':
        return r.getOptionalType(this.valueType.templated(r, bind))
      default:
        return this
    }
  }

  toString() {
    return this.name
  }

  #getOptionalField(obj, key, ast, ev) {
    obj = obj instanceof Optional ? obj.orValue() : obj
    if (obj === undefined) return OPTIONAL_NONE

    const type = ev.debugType(obj)
    try {
      return Optional.of(type.fieldLazy(obj, key, ast, ev))
    } catch (e) {
      if (e instanceof EvaluationError) return OPTIONAL_NONE
      throw e
    }
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
    const s = this.unwrappedType
    const o = other.unwrappedType
    if (s === o || o.kind === 'dyn') return true
    if (o.kind === 'param') return false

    switch (s.kind) {
      case 'dyn':
      case 'param':
        return true
      case 'list':
        return o.kind === 'list' && s.valueType.matches(o.valueType)
      case 'map':
        return o.kind === 'map' && s.keyType.matches(o.keyType) && s.valueType.matches(o.valueType)
      case 'optional':
        // optional<T> matches optional and optional<U> if T matches U
        return (
          o.kind === 'optional' &&
          (!s.valueType || !o.valueType || s.valueType.matches(o.valueType))
        )
      default:
        return s.name === o.name
    }
  }
}

function wrapMacroExpander(name, handler) {
  const p = `Macro '${name}' must `
  return function macroExpander(opts) {
    const macro = handler(opts)
    if (!macro || typeof macro !== 'object') throw new Error(`${p} must return an object.`)
    if (!macro?.typeCheck) throw new Error(`${p} have a .typeCheck(checker, macro, ctx) method.`)
    if (!macro?.evaluate) throw new Error(`${p} have a .evaluate(evaluator, macro, ctx) method.`)
    return macro
  }
}

export class FunctionDeclaration {
  #hasPlaceholderTypes
  constructor({name, receiverType, argTypes, returnType, handler}) {
    this.name = name
    this.receiverType = receiverType || null
    this.argTypes = argTypes
    this.returnType = returnType

    this.macro = argTypes.includes(astType)

    const receiverString = receiverType ? `${receiverType}.` : ''
    this.signature = `${receiverString}${name}(${argTypes.join(', ')}): ${returnType}`
    this.handler = this.macro ? wrapMacroExpander(this.signature, handler) : handler
    Object.freeze(this)
  }

  hasPlaceholder() {
    return (this.#hasPlaceholderTypes ??=
      this.returnType.hasPlaceholder() ||
      this.receiverType?.hasPlaceholder() ||
      this.argTypes.some((t) => t.hasPlaceholder()) ||
      false)
  }

  matchesArgs(argTypes) {
    return argTypes.length === this.argTypes.length &&
      this.argTypes.every((t, i) => t.matches(argTypes[i]))
      ? this
      : null
  }
}

export class OperatorDeclaration {
  #hasPlaceholderTypes
  constructor({operator, leftType, rightType, handler, returnType}) {
    this.operator = operator
    this.leftType = leftType
    this.rightType = rightType || null
    this.handler = handler
    this.returnType = returnType

    if (rightType) this.signature = `${leftType} ${operator} ${rightType}: ${returnType}`
    else this.signature = `${operator}${leftType}: ${returnType}`

    Object.freeze(this)
  }

  hasPlaceholder() {
    return (this.#hasPlaceholderTypes ??=
      this.leftType.hasPlaceholder() || this.rightType?.hasPlaceholder() || false)
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
  return new TypeDeclaration({kind: 'primitive', name, type: name})
}

function _createMessageType(name) {
  return new TypeDeclaration({kind: 'message', name, type: name})
}

function _createDynType(valueType) {
  const name = valueType ? `dyn<${valueType}>` : 'dyn'
  return new TypeDeclaration({kind: 'dyn', name, type: name, valueType})
}

function _createOptionalType(valueType) {
  const name = valueType ? `optional<${valueType}>` : 'optional'
  return new TypeDeclaration({kind: 'optional', name, type: 'optional', valueType})
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

function _createPlaceholderType(name) {
  return new TypeDeclaration({kind: 'param', name, type: name})
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
  optional: _createOptionalType(dynType),
  list: listType,
  'list<dyn>': listType,
  map: mapType,
  'map<dyn, dyn>': mapType
})

const AGGREGATE_RECEIVER_TYPES = new Set(['list', 'map', 'optional'])

class FunctionCandidates {
  exists = false
  returnType = null
  /** @type {Map<TypeDeclaration|null, Array<FunctionDeclaration>>} */
  #byReceiverType = new Map()

  add(declaration) {
    this.exists = true
    if (!this.returnType) this.returnType = declaration.returnType
    else if (this.returnType !== declaration.returnType) this.returnType = dynType

    let receiverType = declaration.receiverType
    this.#addToReceiverBucket(receiverType, declaration)
    if (!receiverType || !AGGREGATE_RECEIVER_TYPES.has(receiverType.type)) return
    if (receiverType === (receiverType = celTypes[receiverType.type])) return
    this.#addToReceiverBucket(receiverType, declaration)
  }

  #addToReceiverBucket(receiverType, declaration) {
    const functions = this.#byReceiverType.get(receiverType)
    if (functions) functions.push(declaration)
    else this.#byReceiverType.set(receiverType, [declaration])
  }

  findMatch(argTypes, receiverType, registry) {
    // Try exact receiver type match
    let match = this.#findInFunctions(
      this.#byReceiverType.get(receiverType),
      argTypes,
      receiverType,
      registry
    )
    if (match) return match

    // Try aggregate base type (e.g., list<int> -> list)
    if (receiverType && AGGREGATE_RECEIVER_TYPES.has(receiverType.type)) {
      match = this.#findInFunctions(
        this.#byReceiverType.get(celTypes[receiverType.type]),
        argTypes,
        receiverType,
        registry
      )
      if (match) return match
    }

    // Try placeholder receiver types
    for (const [key, funcs] of this.#byReceiverType) {
      if (key?.hasPlaceholder?.()) {
        match = this.#findInFunctions(funcs, argTypes, receiverType, registry)
        if (match) return match
      }
    }

    return null
  }

  #findInFunctions(functions, argTypes, receiverType, registry) {
    if (!functions) return null

    let fn
    let match
    for (let i = 0; i < functions.length; i++) {
      fn = functions[i]
      if (fn.hasPlaceholder()) {
        match = this.#matchWithPlaceholders(fn, argTypes, receiverType, registry)
        if (match) return match
        else continue
      }

      if (receiverType && fn.receiverType && !receiverType.matches(fn.receiverType)) continue
      if ((match = fn.matchesArgs(argTypes))) return match
    }
    return null
  }

  #matchWithPlaceholders(fn, argTypes, receiverType, registry) {
    const bindings = new Map()
    if (receiverType && fn.receiverType) {
      if (!registry.matchTypeWithPlaceholders(fn.receiverType, receiverType, bindings)) {
        return null
      }
    }

    for (let i = 0; i < argTypes.length; i++) {
      if (!registry.matchTypeWithPlaceholders(fn.argTypes[i], argTypes[i], bindings)) {
        return null
      }
    }

    return {
      handler: fn.handler,
      signature: fn.signature,
      returnType: fn.returnType.templated(registry, bindings)
    }
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
  [UnsignedInt, 'uint'],
  [Type, 'type'],
  [Optional, 'optional']
]

if (typeof Buffer !== 'undefined') builtinObjectTypes.push([Buffer, 'bytes'])

export class Registry {
  #overloadResolutionCache = {}
  #overloadCheckCache = {}
  #typeDeclarations
  #operatorDeclarations
  #functionDeclarations
  #dynTypes = new Map()
  #listTypes = new Map()
  #mapTypes = new Map()
  #optionalTypes = new Map()

  constructor(opts = {}) {
    this.enableOptionalTypes = opts.enableOptionalTypes ?? false
    this.objectTypes = createLayeredMap(opts.objectTypes)
    this.objectTypesByConstructor = createLayeredMap(opts.objectTypesByConstructor)
    this.objectTypeInstances = createLayeredMap(opts.objectTypeInstances)
    this.#functionDeclarations = createLayeredMap(opts.functionDeclarations)
    this.#operatorDeclarations = createLayeredMap(opts.operatorDeclarations)
    this.#typeDeclarations = createLayeredMap(
      opts.typeDeclarations || Object.entries(celTypes),
      undefined,
      false
    )

    this.constants = createLayeredMap(opts.constants)
    this.variables = opts.unlistedVariablesAreDyn
      ? createLayeredMap(opts.variables, DynVariableRegistry)
      : createLayeredMap(opts.variables)

    if (!this.variables.size) {
      for (const t of builtinObjectTypes) this.registerType(t[1], t[0], true)
      for (const n in TYPES) this.registerConstant(n, 'type', TYPES[n])
    } else {
      toggleOptionalTypes(this, this.enableOptionalTypes)
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

  registerConstant(name, type, value) {
    this.registerVariable(name, type)
    this.constants.set(name, value)
    return this
  }

  getFunctionCandidates(receiverType, functionName, argCount) {
    const candidates = new FunctionCandidates()
    for (const [, dec] of this.#functionDeclarations) {
      if (functionName !== dec.name || dec.macro) continue
      if (receiverType === null && dec.receiverType) continue // Skip receiver methods when looking for standalone
      if (receiverType && dec.receiverType === null) continue // Skip standalone when looking for receiver methods

      candidates.exists = true

      // For functions with placeholder types in receiver, skip the simple match check
      // as we'll do proper placeholder matching later in findMatch()
      if (receiverType && !dec.receiverType.hasPlaceholder()) {
        if (!receiverType.matches(dec.receiverType)) continue
      }

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
      this.#dynTypes.set(type, this.#parseTypeString(`dyn<${type.unwrappedType}>`, true)).get(type)
    )
  }

  getListType(type) {
    return (
      this.#listTypes.get(type) ||
      this.#listTypes.set(type, this.#parseTypeString(`list<${type}>`, true)).get(type)
    )
  }

  getMapType(a, b) {
    return (
      this.#mapTypes.get(a)?.get(b) ||
      (this.#mapTypes.get(a) || this.#mapTypes.set(a, new Map()).get(a))
        .set(b, this.#parseTypeString(`map<${a}, ${b}>`, true))
        .get(b)
    )
  }

  getOptionalType(type) {
    return (
      this.#optionalTypes.get(type) ||
      this.#optionalTypes.set(type, this.#parseTypeString(`optional<${type}>`, true)).get(type)
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
    if (typeof typename !== 'string' || typename.length < 2) {
      throw new Error(`Invalid type name: ${typename}`)
    }

    const decl = {
      name: typename,
      typeType: TYPES[typename] || new Type(typename),
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
    if (withoutDynRegistration) return this

    this.objectTypeInstances.set(typename, decl.typeType)
    this.registerFunctionOverload(`type(${typename}): type`, () => decl.typeType)
    return this
  }

  getObjectType(name) {
    return this.objectTypes.get(name)
  }

  /** @returns {TypeDeclaration} */
  #parseTypeString(typeStr, requireKnownTypes = false) {
    let match = this.#typeDeclarations.get(typeStr)
    if (match) return match

    match = typeStr.match(/^[A-Z]$/)
    if (match) return this.#createDeclaration(_createPlaceholderType, typeStr, typeStr)

    match = typeStr.match(/^dyn<(.+)>$/)
    if (match) {
      const type = this.#parseTypeString(match[1].trim(), requireKnownTypes)
      return this.#createDeclaration(_createDynType, `dyn<${type}>`, type)
    }

    match = typeStr.match(/^list<(.+)>$/)
    if (match) {
      const vType = this.#parseTypeString(match[1].trim(), requireKnownTypes)
      return this.#createDeclaration(_createListType, `list<${vType}>`, vType)
    }

    match = typeStr.match(/^map<(.+)>$/)
    if (match) {
      const parts = splitByComma(match[1])
      if (parts.length !== 2) throw new Error(`Invalid map type: ${typeStr}`)

      const kType = this.#parseTypeString(parts[0].trim(), requireKnownTypes)
      const vType = this.#parseTypeString(parts[1].trim(), requireKnownTypes)
      return this.#createDeclaration(_createMapType, `map<${kType}, ${vType}>`, kType, vType)
    }

    match = typeStr.match(/^optional<(.+)>$/)
    if (match) {
      const vType = this.#parseTypeString(match[1].trim(), requireKnownTypes)
      return this.#createDeclaration(_createOptionalType, `optional<${vType}>`, vType)
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

  #findMacroUncached(functionName, hasReceiver, argCount) {
    for (const [, dec] of this.#functionDeclarations) {
      if (!dec.macro || dec.name !== functionName) continue
      if (!!dec.receiverType !== !!hasReceiver) continue
      if (dec.argTypes.length !== argCount) continue
      return dec
    }
    return false
  }

  findMacro(functionName, hasReceiver, argCount) {
    return (
      this.#overloadResolutionCache[hasReceiver]?.get(functionName)?.get(argCount) ??
      this.#cacheOverloadResult(
        this.#overloadResolutionCache,
        hasReceiver,
        functionName,
        argCount,
        this.#findMacroUncached(functionName, hasReceiver, argCount)
      )
    )
  }

  #findBinaryOverloads(operator, leftType, rightType) {
    const nonexactMatches = []
    for (const [, decl] of this.#operatorDeclarations) {
      if (decl.operator !== operator) continue
      if (decl.leftType === leftType && decl.rightType === rightType) return [decl]

      const secondary = this.#matchesOverload(decl, leftType, rightType)
      if (secondary) nonexactMatches.push(secondary)
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
    for (const [, decl] of this.#operatorDeclarations) {
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

  #matchesOverload(decl, actualLeft, actualRight) {
    const bindings = decl.hasPlaceholder() ? new Map() : null
    const leftType = this.matchTypeWithPlaceholders(decl.leftType, actualLeft, bindings)
    if (!leftType) return

    const rightType = this.matchTypeWithPlaceholders(decl.rightType, actualRight, bindings)
    if (!rightType) return

    if ((decl.operator === '==' || decl.operator === '!=') && !leftType.matchesBoth(rightType))
      return false

    return decl.hasPlaceholder()
      ? {
          handler: decl.handler,
          leftType,
          rightType,
          returnType: decl.returnType.templated(this, bindings)
        }
      : decl
  }

  matchTypeWithPlaceholders(declared, actual, bindings) {
    if (!declared.hasPlaceholder()) return actual.matches(declared) ? actual : null

    const treatAsDyn = actual.kind === 'dyn'
    if (!this.#collectPlaceholderBindings(declared, actual, bindings, treatAsDyn)) return null
    if (treatAsDyn) return actual
    return actual.matches(declared.templated(this, bindings)) ? actual : null
  }

  #bindPlaceholder(name, candidateType, bindings) {
    const existing = bindings.get(name)
    if (!existing) return bindings.set(name, candidateType) && true
    return existing.kind === 'dyn' || candidateType.kind === 'dyn'
      ? true
      : existing.matchesBoth(candidateType)
  }

  #collectPlaceholderBindings(declared, actual, bindings, fromDyn = false) {
    if (!declared.hasPlaceholder()) return true
    if (!actual) return false

    const treatAsDyn = fromDyn || actual.kind === 'dyn'
    actual = actual.unwrappedType

    switch (declared.kind) {
      case 'param': {
        const candidateType = treatAsDyn ? celTypes.dyn : actual
        return this.#bindPlaceholder(declared.name, candidateType, bindings)
      }
      case 'list': {
        if (actual.name === 'dyn') actual = declared
        if (actual.kind !== 'list') return false
        return this.#collectPlaceholderBindings(
          declared.valueType,
          actual.valueType,
          bindings,
          treatAsDyn
        )
      }
      case 'map': {
        if (actual.name === 'dyn') actual = declared
        if (actual.kind !== 'map') return false
        return (
          this.#collectPlaceholderBindings(
            declared.keyType,
            actual.keyType,
            bindings,
            treatAsDyn
          ) &&
          this.#collectPlaceholderBindings(
            declared.valueType,
            actual.valueType,
            bindings,
            treatAsDyn
          )
        )
      }
      case 'optional': {
        if (actual.name === 'dyn') actual = declared
        if (actual.kind !== 'optional') return false
        return this.#collectPlaceholderBindings(
          declared.valueType,
          actual.valueType,
          bindings,
          treatAsDyn
        )
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
    const all = Object.create(null)
    for (const k of Object.keys(fields)) all[k] = this.#toCelFieldDeclaration(typename, fields, k)
    return all
  }

  clone(opts) {
    return new Registry({
      objectTypes: this.objectTypes,
      objectTypesByConstructor: this.objectTypesByConstructor,
      objectTypeInstances: this.objectTypeInstances,
      typeDeclarations: this.#typeDeclarations,
      operatorDeclarations: this.#operatorDeclarations,
      functionDeclarations: this.#functionDeclarations,
      variables: this.variables,
      constants: this.constants,
      unlistedVariablesAreDyn: opts.unlistedVariablesAreDyn,
      enableOptionalTypes: opts.enableOptionalTypes
    })
  }

  /** @param {string} signature */
  #parseFunctionDeclaration(signature, handler) {
    // Parse "optional<A>.value(): A" or "dyn(A): dyn<A>" or "string.indexOf(string): int"
    const match = signature.match(/^(?:([a-zA-Z0-9.<>]+)\.)?(\w+)\((.*?)\):\s*(.+)$/)
    if (!match) throw new Error(`Invalid signature: ${signature}`)
    const [, receiverType, name, argsStr, _returnType] = match

    try {
      return new FunctionDeclaration({
        name: name,
        receiverType: receiverType ? this.getType(receiverType) : null,
        returnType: this.getType(_returnType.trim()),
        argTypes: splitByComma(argsStr).map((s) => this.getFunctionType(s.trim())),
        handler
      })
    } catch (e) {
      throw new Error(`Invalid function declaration: ${signature}: ${e.message}`)
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
        b.argTypes.every((t, i) => {
          const o = a.argTypes[i]
          return t === o || t === astType || o === astType || t === dynType || o === dynType
        }))
    )
  }

  /** @param {FunctionDeclaration} newDec */
  #checkOverlappingSignatures(newDec) {
    for (const [, decl] of this.#functionDeclarations) {
      if (!this.#functionSignatureOverlaps(decl, newDec)) continue
      throw new Error(
        `Function signature '${newDec.signature}' overlaps with existing overload '${decl.signature}'.`
      )
    }
  }

  registerFunctionOverload(s, _opts) {
    const handler = typeof _opts === 'function' ? _opts : _opts?.handler
    const dec = this.#parseFunctionDeclaration(s, handler)
    this.#checkOverlappingSignatures(dec)
    this.#functionDeclarations.set(dec.signature, dec)
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
    this.#operatorDeclarations.set(decl.signature, decl)
    this.#invalidateOverloadsCache()
  }

  #hasOverload(decl) {
    for (const [, other] of this.#operatorDeclarations) if (decl.equals(other)) return true
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
    if (dec.hasPlaceholder() && !(rightType.hasPlaceholder() && leftType.hasPlaceholder())) {
      throw new Error(
        `Operator overload with placeholders must use them in both left and right types: ${sig}`
      )
    }

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

      for (const decl of declarations) this.#operatorDeclarations.set(decl.signature, decl)
    }

    this.#operatorDeclarations.set(dec.signature, dec)
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

export class RootContext {
  constructor(variables, fallbackValues) {
    this.variables = variables
    this.fallbackValues = fallbackValues
  }

  getType(name) {
    return this.variables.get(name)
  }

  getValue(name) {
    return this.fallbackValues.get(name)
  }

  fork() {
    return new OverlayContext(this)
  }
}

export class OverlayContext {
  parent
  context
  variableName
  variableType
  variableValue
  constructor(parent) {
    this.parent = parent
  }

  fork() {
    return new OverlayContext(this)
  }

  forkWithVariable(variableType, variableName) {
    const ctx = new OverlayContext(this)
    ctx.variableType = variableType
    ctx.variableName = variableName
    return ctx
  }

  withContext(context) {
    if (typeof context !== 'object') throw new EvaluationError('Context must be an object')
    this.context = context
    if (!context) this.getValue = this.#getValueFromParent
    else if (context instanceof Map) this.getValue = this.#getValueFromMap
    else this.getValue = this.#getValueFromObject
    return this
  }

  setVariableValue(value) {
    this.variableValue = value
    return this
  }

  getValue(key) {
    return this.#getValueFromParent(key)
  }

  #getValueFromObject(key) {
    if (this.variableName === key) return this.variableValue
    const v = Object.hasOwn(this.context, key) ? this.context[key] : undefined
    if (v !== undefined) return v
    return this.parent.getValue(key)
  }

  #getValueFromMap(key) {
    if (this.variableName === key) return this.variableValue
    const v = this.context.get(key)
    if (v !== undefined) return v
    return this.parent.getValue(key)
  }

  #getValueFromParent(key) {
    if (this.variableName === key) return this.variableValue
    return this.parent.getValue(key)
  }

  getType(key) {
    if (this.variableName === key) return this.variableType
    return this.parent.getType(key)
  }
}

import {EvaluationError} from './errors.js'
import {UnsignedInt} from './functions.js'
import {Optional, OPTIONAL_NONE, toggleOptionalTypes} from './optional.js'
import {hasOwn, objFreeze, objKeys, objEntries, RESERVED} from './globals.js'

export class Type {
  #name
  constructor(name) {
    this.#name = name
    objFreeze(this)
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

// not exposed to cel expression
const optionalType = new Type('optional')

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
    if (this.#entries.has(key)) return !!this.#entries.get(key)
    return this.#parent ? this.#parent.has(key) : false
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
  get(name) {
    return (
      super.get(name) ?? (RESERVED.has(name) ? undefined : new VariableDeclaration(name, dynType))
    )
  }
}

function createLayeredMap(source, MapCtor = LayeredMap, lock = true) {
  if (source instanceof MapCtor) return source.fork(lock)
  return new MapCtor(source)
}

export class TypeDeclaration {
  #matchesCache = new WeakMap()
  constructor({kind, type, name, keyType, valueType}) {
    this.kind = kind
    this.type = type
    this.name = name
    this.keyType = keyType
    this.valueType = valueType

    this.unwrappedType = kind === 'dyn' && valueType ? valueType.unwrappedType : this
    this.wrappedType = kind === 'dyn' ? this : _createDynType(this.unwrappedType)

    this.hasDynType =
      this.kind === 'dyn' || this.valueType?.hasDynType || this.keyType?.hasDynType || false

    this.hasPlaceholderType =
      this.kind === 'param' ||
      this.keyType?.hasPlaceholderType ||
      this.valueType?.hasPlaceholderType ||
      false

    if (kind === 'list') this.fieldLazy = this.#getListField
    else if (kind === 'map') this.fieldLazy = this.#getMapField
    else if (kind === 'message') this.fieldLazy = this.#getMessageField
    else if (kind === 'optional') this.fieldLazy = this.#getOptionalField

    objFreeze(this)
  }

  /** @deprecated Please use .hasDynType */
  hasDyn() {
    return this.hasDynType
  }

  /** @deprecated Please use .hasDynType === false */
  hasNoDynTypes() {
    return this.hasDynType === false
  }

  isDynOrBool() {
    return this.type === 'bool' || this.kind === 'dyn'
  }

  isEmpty() {
    return this.valueType && this.valueType.kind === 'param'
  }

  /** @deprecated Please use .hasPlaceholderType */
  hasPlaceholder() {
    return this.hasPlaceholderType
  }

  unify(r, t2) {
    const t1 = this
    if (t1 === t2 || t1.kind === 'dyn' || t2.kind === 'param') return t1
    if (t2.kind === 'dyn' || t1.kind === 'param') return t2
    if (t1.kind !== t2.kind) return null
    if (!(t1.hasPlaceholderType || t2.hasPlaceholderType || t1.hasDynType || t2.hasDynType))
      return null

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
    if (!this.hasPlaceholderType) return this

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
    const message = obj ? ev.objectTypesByConstructor.get(obj.constructor) : undefined
    if (!message) return

    const type = message.fields ? message.fields[key] : dynType
    if (!type) return undefined

    const value = obj instanceof Map ? obj.get(key) : obj[key]
    if (value === undefined) return

    const valueType = ev.debugType(value)
    switch (type) {
      case dynType:
      case valueType:
        return value
      default:
        if (type.matches(valueType)) return value
    }
    throw new EvaluationError(`Field '${key}' is not of type '${type}', got '${valueType}'`, ast)
  }

  #getMapField(obj, key, ast, ev) {
    // eslint-disable-next-line no-nested-ternary
    const value = obj instanceof Map ? obj.get(key) : obj && hasOwn(obj, key) ? obj[key] : undefined
    if (value === undefined) return

    const type = ev.debugType(value)
    if (this.valueType.matches(type)) return value

    throw new EvaluationError(
      `Field '${key}' is not of type '${this.valueType}', got '${type}'`,
      ast
    )
  }

  #getListElementAtIndex(list, pos) {
    switch (list?.constructor) {
      case Array:
        return list[pos]
      case Set: {
        let i = 0
        for (const item of list) {
          if (i++ !== pos) continue
          return item
        }
      }
    }
  }

  #getListField(obj, key, ast, ev) {
    if (typeof key === 'bigint') key = Number(key)
    else if (typeof key !== 'number') return

    const value = this.#getListElementAtIndex(obj, key)
    if (value === undefined) {
      if (!obj) return
      throw new EvaluationError(
        `No such key: index out of bounds, index ${key} ${
          key < 0 ? '< 0' : `>= size ${obj.length || obj.size}`
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

  matches(o) {
    const s = this.unwrappedType
    o = o.unwrappedType
    if (s === o || s.kind === 'dyn' || o.kind === 'dyn' || o.kind === 'param') return true
    return this.#matchesCache.get(o) ?? this.#matchesCache.set(o, this.#matches(s, o)).get(o)
  }

  #matches(s, o) {
    switch (s.kind) {
      case 'dyn':
      case 'param':
        return true
      case 'list':
        return o.kind === 'list' && s.valueType.matches(o.valueType)
      case 'map':
        return o.kind === 'map' && s.keyType.matches(o.keyType) && s.valueType.matches(o.valueType)
      case 'optional':
        return o.kind === 'optional' && s.valueType.matches(o.valueType)
      default:
        return s.name === o.name
    }
  }
}

const macroEvaluateErr = `have a .callAst property or .evaluate(checker, macro, ctx) method.`
const macroTypeCheckErr = `have a .callAst property or .typeCheck(checker, macro, ctx) method.`
function wrapMacroExpander(name, handler) {
  const p = `Macro '${name}' must`
  return function macroExpander(opts) {
    const macro = handler(opts)
    if (!macro || typeof macro !== 'object') throw new Error(`${p} return an object.`)
    if (macro.callAst) return macro
    if (!macro.evaluate) throw new Error(`${p} ${macroEvaluateErr}`)
    if (!macro.typeCheck) throw new Error(`${p} ${macroTypeCheckErr}`)
    return macro
  }
}

export class VariableDeclaration {
  constructor(name, type, description, value) {
    this.name = name
    this.type = type
    this.description = description ?? null
    this.constant = value !== undefined
    this.value = value
    objFreeze(this)
  }
}

export class FunctionDeclaration {
  constructor({name, receiverType, returnType, handler, description, params}) {
    if (typeof name !== 'string') throw new Error('name must be a string')
    if (typeof handler !== 'function') throw new Error('handler must be a function')

    this.name = name
    this.receiverType = receiverType ?? null
    this.returnType = returnType
    this.description = description ?? null
    this.params = params
    this.argTypes = params.map((p) => p.type)
    this.macro = this.argTypes.includes(astType)

    const receiverString = receiverType ? `${receiverType}.` : ''
    this.signature = `${receiverString}${name}(${this.argTypes.join(', ')}): ${returnType}`
    this.handler = this.macro ? wrapMacroExpander(this.signature, handler) : handler

    this.hasPlaceholderType =
      this.returnType.hasPlaceholderType ||
      this.receiverType?.hasPlaceholderType ||
      this.argTypes.some((t) => t.hasPlaceholderType) ||
      false

    objFreeze(this)
  }

  hasPlaceholder() {
    return this.hasPlaceholderType
  }

  matchesArgs(argTypes) {
    return argTypes.length === this.argTypes.length &&
      this.argTypes.every((t, i) => t.matches(argTypes[i]))
      ? this
      : null
  }
}

export class OperatorDeclaration {
  constructor({operator, leftType, rightType, handler, returnType}) {
    this.operator = operator
    this.leftType = leftType
    this.rightType = rightType || null
    this.handler = handler
    this.returnType = returnType

    if (rightType) this.signature = `${leftType} ${operator} ${rightType}: ${returnType}`
    else this.signature = `${operator}${leftType}: ${returnType}`

    this.hasPlaceholderType =
      this.leftType.hasPlaceholderType || this.rightType?.hasPlaceholderType || false

    objFreeze(this)
  }

  hasPlaceholder() {
    return this.hasPlaceholderType
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
  const name = `optional<${valueType}>`
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
export const celTypes = {
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
}

for (const t of [celTypes.string, celTypes.double, celTypes.int]) {
  const list = _createListType(t)
  const map = _createMapType(celTypes.string, t)
  celTypes[list.name] = list
  celTypes[map.name] = map
}

Object.freeze(celTypes)

class FunctionCandidates {
  returnType = null
  /** @type {Array<FunctionDeclaration>} */
  declarations = []
  constructor(registry) {
    this.registry = registry
  }

  add(decl) {
    this.returnType =
      (this.returnType || decl.returnType).unify(this.registry, decl.returnType) || dynType

    if (decl.macro) this.macro = decl
    this.declarations.push(decl)
  }

  findMatch(argTypes, receiverType = null) {
    for (let i = 0; i < this.declarations.length; i++) {
      const match = this.#matchesFunction(this.declarations[i], argTypes, receiverType)
      if (match) return match
    }
    return null
  }

  #matchesFunction(fn, argTypes, receiverType) {
    if (fn.hasPlaceholderType) return this.#matchWithPlaceholders(fn, argTypes, receiverType)
    if (receiverType && fn.receiverType && !receiverType.matches(fn.receiverType)) return
    return fn.matchesArgs(argTypes)
  }

  #matchWithPlaceholders(fn, argTypes, receiverType) {
    const bindings = new Map()
    if (receiverType && fn.receiverType) {
      if (!this.registry.matchTypeWithPlaceholders(fn.receiverType, receiverType, bindings)) {
        return null
      }
    }

    for (let i = 0; i < argTypes.length; i++) {
      if (!this.registry.matchTypeWithPlaceholders(fn.argTypes[i], argTypes[i], bindings)) {
        return null
      }
    }

    return {
      handler: fn.handler,
      signature: fn.signature,
      returnType: fn.returnType.templated(this.registry, bindings)
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
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }

  if (current) parts.push(current.trim())
  return parts
}

const objTypesDecls = [
  [UnsignedInt, 'uint', TYPES.uint, celTypes.uint],
  [Type, 'type', TYPES.type, celTypes.type],
  [Optional, 'optional', optionalType, celTypes.optional],
  [Uint8Array, 'bytes', TYPES.bytes, celTypes.bytes],
  ...(typeof Buffer !== 'undefined' ? [[Buffer, 'bytes', TYPES.bytes, celTypes.bytes]] : [])
].map(([ctor, name, typeType, type]) => Object.freeze({name, typeType, type, ctor}))

const objTypes = objTypesDecls.map((t) => [t.name, t])
const objTypesCtor = objTypesDecls.map((t) => [t.ctor, t])

const invalidVar = (postfix) => new Error(`Invalid variable declaration: ${postfix}`)
const invalidType = (postfix) => new Error(`Invalid type declaration: ${postfix}`)

const fallbackDynEqualityMatchers = {
  '==': [{handler: (a, b) => a === b, returnType: celTypes.bool}],
  '!=': [{handler: (a, b) => a !== b, returnType: celTypes.bool}]
}

export class Registry {
  #overloadResolutionCache = {}
  #overloadCheckCache = {}
  #typeDeclarations
  #operatorDeclarations
  #functionDeclarations
  #functionsCache = new Map()
  #listTypes = new Map()
  #mapTypes = new Map()
  #optionalTypes = new Map()

  constructor(opts = {}) {
    this.enableOptionalTypes = opts.enableOptionalTypes ?? false
    this.objectTypes = createLayeredMap(opts.objectTypes || objTypes)
    this.objectTypesByConstructor = createLayeredMap(opts.objectTypesByConstructor || objTypesCtor)
    this.#functionDeclarations = createLayeredMap(opts.functionDeclarations)
    this.#operatorDeclarations = createLayeredMap(opts.operatorDeclarations)
    this.#typeDeclarations = createLayeredMap(
      opts.typeDeclarations || objEntries(celTypes),
      undefined,
      false
    )

    this.constants = createLayeredMap(opts.constants)
    this.variables = opts.unlistedVariablesAreDyn
      ? createLayeredMap(opts.variables, DynVariableRegistry)
      : createLayeredMap(opts.variables)

    if (!this.variables.size) {
      for (const n in TYPES) this.registerConstant(n, 'type', TYPES[n])
    } else {
      toggleOptionalTypes(this, this.enableOptionalTypes)
    }
  }

  #invalidateOverloadsCache() {
    this.#overloadResolutionCache = {}
    this.#overloadCheckCache = {}
  }

  registerVariable(name, type, opts) {
    let description = opts?.description
    let value
    if (
      typeof name === 'string' &&
      typeof type === 'object' &&
      !(type instanceof TypeDeclaration)
    ) {
      description = type.description
      value = type.value
      if (type.schema) type = this.registerType({name: `$${name}`, schema: type.schema}).type
      else type = type.type
    } else if (typeof name === 'object') {
      if (name.schema) type = this.registerType({name: `$${name.name}`, schema: name.schema}).type
      else type = name.type
      description = name.description
      value = name.value
      name = name.name
    }

    if (typeof name !== 'string' || !name) throw invalidVar(`name must be a string`)
    if (RESERVED.has(name)) throw invalidVar(`'${name}' is a reserved name`)
    if (this.variables.has(name)) throw invalidVar(`'${name}' is already registered`)

    if (typeof type === 'string') type = this.getType(type)
    else if (!(type instanceof TypeDeclaration)) throw invalidVar(`type is required`)

    this.variables.set(name, new VariableDeclaration(name, type, description, value))
    return this
  }

  #registerSchemaAsType(name, schema) {
    const fields = Object.create(null)
    for (const key of objKeys(schema)) {
      const def = schema[key]
      if (typeof def === 'object' && def) {
        fields[key] = this.registerType({name: `${name}.${key}`, schema: def}).type.name
      } else if (typeof def === 'string') {
        fields[key] = def
      } else {
        throw new Error(`Invalid field definition for '${name}.${key}'`)
      }
    }
    return fields
  }

  registerConstant(name, type, value) {
    if (typeof name === 'object') this.registerVariable(name)
    else this.registerVariable({name, type, value})
    return this
  }

  #getCandidates(useReceiver, name, argLen) {
    // to reduce Map allocations, we're keying functions by argLen
    // Receiver functions are below 0, regular ones above 0
    const l = useReceiver ? -(argLen + 1) : argLen
    const cache = this.#functionsCache.get(l) || this.#functionsCache.set(l, new Map()).get(l)
    return cache.get(name) || cache.set(name, new FunctionCandidates(this)).get(name)
  }

  getFunctionCandidates(rec, name, argLen) {
    const cached = this.#functionsCache.get(rec ? -(argLen + 1) : argLen)?.get(name)
    if (cached) return cached

    for (const [, dec] of this.#functionDeclarations) {
      this.#getCandidates(!!dec.receiverType, dec.name, dec.argTypes.length).add(dec)
    }
    return this.#getCandidates(rec, name, argLen)
  }

  getType(typename) {
    return this.#parseTypeString(typename, true)
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
    const t = this.#parseTypeString(typename, true)
    if (t.kind === 'dyn' && t.valueType) throw new Error(`type '${t.name}' is not supported`)
    return t
  }

  registerType(name, _d) {
    if (typeof name === 'object') ((_d = name), (name = _d.fullName || _d.name || _d.ctor?.name))
    if (typeof name === 'string' && name[0] === '.') name = name.slice(1)
    if (typeof name !== 'string' || name.length < 2 || RESERVED.has(name)) {
      throw invalidType(`name '${name}' is not valid`)
    }

    if (this.objectTypes.has(name)) throw invalidType(`type '${name}' already registered`)

    const type = this.#parseTypeString(name, false)
    if (type.kind !== 'message') throw invalidType(`type '${name}' is not valid`)

    const decl = {
      name,
      typeType: new Type(name),
      type,
      ctor: typeof _d === 'function' ? _d : _d?.ctor,
      convert: typeof _d === 'function' ? undefined : _d?.convert,
      fields:
        typeof _d?.schema === 'object'
          ? this.#normalizeFields(name, this.#registerSchemaAsType(name, _d.schema))
          : this.#normalizeFields(name, typeof _d === 'function' ? undefined : _d?.fields)
    }

    if (typeof decl.ctor !== 'function') {
      if (!decl.fields) throw invalidType(`type '${name}' requires a constructor or fields`)
      Object.assign(decl, this.#createDefaultConvert(name, decl.fields))
    }

    this.objectTypes.set(name, Object.freeze(decl))
    this.objectTypesByConstructor.set(decl.ctor, decl)
    this.registerFunctionOverload(`type(${name}): type`, () => decl.typeType)
    return decl
  }

  /** @returns {TypeDeclaration} */
  #parseTypeString(typeStr, requireKnownTypes = true) {
    let match = this.#typeDeclarations.get(typeStr)
    if (match) return match

    if (typeof typeStr !== 'string' || !typeStr.length) {
      throw new Error(`Invalid type: must be a string`)
    }

    match = typeStr.match(/^[A-Z]$/)
    if (match) return this.#createDeclaration(_createPlaceholderType, typeStr, typeStr)

    match = typeStr.match(/^(dyn|list|map|optional)<(.+)>$/)
    if (!match) {
      if (requireKnownTypes) {
        const err = new Error(`Unknown type: ${typeStr}`)
        err.unknownType = typeStr
        throw err
      }
      return this.#createDeclaration(_createMessageType, typeStr, typeStr)
    }

    const kind = match[1]
    const inner = match[2].trim()
    switch (kind) {
      case 'dyn': {
        const type = this.#parseTypeString(inner, requireKnownTypes).wrappedType
        this.#typeDeclarations.set(type.name, type)
        return type
      }
      case 'list': {
        const vType = this.#parseTypeString(inner, requireKnownTypes)
        return this.#createDeclaration(_createListType, `list<${vType}>`, vType)
      }
      case 'map': {
        const parts = splitByComma(inner)
        if (parts.length !== 2) throw new Error(`Invalid map type: ${typeStr}`)
        const kType = this.#parseTypeString(parts[0], requireKnownTypes)
        const vType = this.#parseTypeString(parts[1], requireKnownTypes)
        return this.#createDeclaration(_createMapType, `map<${kType}, ${vType}>`, kType, vType)
      }
      case 'optional': {
        const vType = this.#parseTypeString(inner, requireKnownTypes)
        return this.#createDeclaration(_createOptionalType, `optional<${vType}>`, vType)
      }
    }
  }

  #createDeclaration(creator, key, ...args) {
    return (
      this.#typeDeclarations.get(key) || this.#typeDeclarations.set(key, creator(...args)).get(key)
    )
  }

  findMacro(name, hasReceiver, argLen) {
    return this.getFunctionCandidates(hasReceiver, name, argLen).macro || false
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
      leftType.kind === 'dyn'
    ) {
      return fallbackDynEqualityMatchers[operator]
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
    if (left.kind === 'dyn' && left.valueType) right = right.wrappedType
    else if (right.kind === 'dyn' && right.valueType) left = left.wrappedType

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

  #findBinaryOverloadUncached(operator, left, right) {
    const ops = this.#findBinaryOverloads(operator, left, right)
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
    return dynType
  }

  #cacheOverloadResult(cache, op, left, right, result) {
    const opMap = (cache[op] ??= new Map())
    const leftMap = opMap.get(left) || opMap.set(left, new Map()).get(left)
    leftMap.set(right, result)
    return result
  }

  #matchesOverload(decl, actualLeft, actualRight) {
    const bindings = decl.hasPlaceholderType ? new Map() : null
    const leftType = this.matchTypeWithPlaceholders(decl.leftType, actualLeft, bindings)
    if (!leftType) return

    const rightType = this.matchTypeWithPlaceholders(decl.rightType, actualRight, bindings)
    if (!rightType) return

    if (
      (decl.operator === '==' || decl.operator === '!=') &&
      decl.leftType.kind === 'dyn' &&
      decl.leftType.valueType &&
      actualLeft.kind !== 'dyn' &&
      actualRight.kind !== 'dyn'
    )
      return false

    return decl.hasPlaceholderType
      ? {
          signature: decl.signature,
          handler: decl.handler,
          leftType,
          rightType,
          returnType: decl.returnType.templated(this, bindings)
        }
      : decl
  }

  matchTypeWithPlaceholders(declared, actual, bindings) {
    if (!declared.hasPlaceholderType) return actual.matches(declared) ? actual : null

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
    if (!declared.hasPlaceholderType) return true
    if (!actual) return false

    const treatAsDyn = fromDyn || actual.kind === 'dyn'
    actual = actual.unwrappedType

    switch (declared.kind) {
      case 'param': {
        const candidateType = treatAsDyn ? dynType : actual
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

  #toCelFieldType(field) {
    if (typeof field === 'string') return {type: field}
    if (field.id) return protobufjsFieldToCelType(field)
    return field
  }

  #toCelFieldDeclaration(typename, fields, k, requireKnownTypes = false) {
    try {
      const field = this.#toCelFieldType(fields[k])
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
    for (const k of objKeys(fields)) all[k] = this.#toCelFieldDeclaration(typename, fields, k)
    return all
  }

  #createDefaultConvert(name, fields) {
    const keys = objKeys(fields)

    const conversions = Object.create(null)
    for (const k of keys) {
      const type = fields[k]
      const decl = type.kind === 'message' && this.objectTypes.get(type.name)
      if (decl === false) conversions[k] = false
      else conversions[k] = decl.convert ? decl : false
    }

    const Ctor = {
      [name]: class extends Map {
        #raw
        constructor(v) {
          super()
          this.#raw = v
        }

        [Symbol.iterator]() {
          if (this.size !== keys.length) for (const k of keys) this.get(k)
          return super[Symbol.iterator]()
        }

        get(field) {
          let v = super.get(field)
          if (v !== undefined || this.has(field)) return v

          const dec = conversions[field]
          if (dec === undefined) return

          v = this.#raw instanceof Map ? this.#raw.get(field) : this.#raw?.[field]
          if (dec && v && typeof v === 'object') {
            switch (v.constructor) {
              case undefined:
              case Object:
              case Map:
                v = dec.convert(v)
            }
          }
          return (super.set(field, v), v)
        }
      }
    }[name]

    return {
      ctor: Ctor,
      convert(v) {
        if (!v) return
        if (v.constructor === Ctor) return v
        return new Ctor(v)
      }
    }
  }

  clone(opts) {
    return new Registry({
      objectTypes: this.objectTypes,
      objectTypesByConstructor: this.objectTypesByConstructor,
      typeDeclarations: this.#typeDeclarations,
      operatorDeclarations: this.#operatorDeclarations,
      functionDeclarations: this.#functionDeclarations,
      variables: this.variables,
      constants: this.constants,
      unlistedVariablesAreDyn: opts.unlistedVariablesAreDyn,
      enableOptionalTypes: opts.enableOptionalTypes
    })
  }

  getDefinitions() {
    const variables = []
    const functions = []
    for (const [, varDecl] of this.variables) {
      if (!varDecl) continue
      variables.push({
        name: varDecl.name,
        description: varDecl.description || null,
        type: varDecl.type.name
      })
    }

    for (const [, decl] of this.#functionDeclarations) {
      functions.push({
        signature: decl.signature,
        name: decl.name,
        description: decl.description,
        receiverType: decl.receiverType ? decl.receiverType.name : null,
        returnType: decl.returnType.name,
        params: decl.params.map((p) => ({
          name: p.name,
          type: p.type.name,
          description: p.description
        }))
      })
    }

    return {variables, functions}
  }

  #parseSignature(signature) {
    if (typeof signature !== 'string') throw new Error('Invalid signature: must be a string')
    const match = signature.match(/^(?:([a-zA-Z0-9.<>]+)\.)?(\w+)\((.*?)\):\s*(.+)$/)
    if (!match) throw new Error(`Invalid signature: ${signature}`)
    return {
      receiverType: match[1] || null,
      name: match[2],
      argTypes: splitByComma(match[3]),
      returnType: match[4].trim()
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
          return t === o || t === dynType || o === dynType
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

  #normalizeParam(i, aType, param) {
    if (!param) return {type: this.getFunctionType(aType), name: `arg${i}`, description: null}

    const type = param.type || aType
    if (!type) throw new Error(`params[${i}].type is required`)
    if (aType && type !== aType) throw new Error(`params[${i}].type not equal to signature type`)
    return {
      name: param.name || `arg${i}`,
      type: this.getFunctionType(type),
      description: param.description ?? null
    }
  }

  registerFunctionOverload(s, handler, opts) {
    if (typeof s === 'object') opts = s
    else if (typeof handler === 'object') opts = handler
    else if (!opts) opts = {}

    const sig = typeof s === 'string' ? s : (opts.signature ?? undefined)
    const parsed = sig !== undefined ? this.#parseSignature(sig) : undefined
    const name = parsed?.name || opts.name
    const receiverType = parsed?.receiverType || opts.receiverType
    const argTypes = parsed?.argTypes
    const returnType = parsed?.returnType || opts.returnType
    const params = opts.params

    let dec
    try {
      if (!name) throw new Error(`signature or name are required`)
      if (!returnType) throw new Error(`must have a returnType`)

      if (params) {
        if (argTypes && params.length !== argTypes.length) {
          throw new Error(`mismatched length in params and args in signature`)
        }
      } else if (!argTypes) throw new Error(`signature or params are required`)

      dec = new FunctionDeclaration({
        name,
        receiverType: receiverType ? this.getType(receiverType) : null,
        returnType: this.getType(returnType),
        handler: typeof handler === 'function' ? handler : opts.handler,
        description: opts.description,
        params: (argTypes || params).map((_, i) =>
          this.#normalizeParam(i, argTypes?.[i], params?.[i])
        )
      })
    } catch (e) {
      if (typeof sig === 'string') e.message = `Invalid function declaration '${sig}': ${e.message}`
      else if (name) e.message = `Invalid function declaration '${name}': ${e.message}`
      else e.message = `Invalid function declaration: ${e.message}`
      throw e
    }

    this.#checkOverlappingSignatures(dec)
    this.#functionDeclarations.set(dec.signature, dec)
    if (this.#functionsCache.size) this.#functionsCache.clear()
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
    let leftType = this.assertType(leftTypeStr, 'left type', sig)
    let rightType = this.assertType(rightTypeStr, 'right type', sig)
    const returnType = this.assertType(returnTypeStr, 'return type', sig)

    // Register both types as wrapped with dyn<> if one of them is wrapped
    if (leftType.kind === 'dyn' && leftType.valueType) rightType = rightType.wrappedType
    else if (rightType.kind === 'dyn' && rightType.valueType) leftType = leftType.wrappedType

    if (isRelational(op) && returnType.type !== 'bool') {
      throw new Error(`Comparison operator '${op}' must return 'bool', got '${returnType.type}'`)
    }

    const dec = new OperatorDeclaration({operator: op, leftType, rightType, returnType, handler})
    if (dec.hasPlaceholderType && !(rightType.hasPlaceholderType && leftType.hasPlaceholderType)) {
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
  #variables
  #contextObj
  #contextMap
  #convertCache
  constructor(registry, context) {
    this.#variables = registry.variables
    if (context === undefined || context === null) return
    if (typeof context !== 'object') throw new EvaluationError('Context must be an object')
    if (context instanceof Map) this.#contextMap = context
    else this.#contextObj = context
  }

  getType(name) {
    return this.#variables.get(name)?.type
  }

  getValue(key) {
    return (
      this.#convertCache?.get(key) ||
      (this.#contextMap ? this.#contextMap.get(key) : this.#contextObj?.[key])
    )
  }

  getVariable(name) {
    return this.#variables.get(name)
  }

  getCheckedValue(ev, ast) {
    const value = this.getValue(ast.args)
    if (value === undefined) throw new ev.Error(`Unknown variable: ${ast.args}`, ast)
    const valueType = ev.debugType(value)
    switch (ast.checkedType) {
      case valueType:
      case dynType:
        return value
      default:
        if (ast.checkedType.matches(valueType)) return value

        // Convert plain objects to typed instances when a convert function is registered
        if (ast.checkedType.kind === 'message' && valueType.kind === 'map') {
          const converted = ev.objectTypes.get(ast.checkedType.name)?.convert?.(value)
          if (converted)
            return ((this.#convertCache ??= new Map()).set(ast.args, converted), converted)
        }
    }

    throw new ev.Error(
      `Variable '${ast.args}' is not of type '${ast.checkedType}', got '${valueType}'`,
      ast
    )
  }

  forkWithVariable(iterVar, iterType) {
    return new OverlayContext(this, iterVar, iterType)
  }
}

class OverlayContext {
  #parent
  accuType
  accuValue
  iterValue
  constructor(parent, iterVar, iterType) {
    this.#parent = parent
    this.iterVar = iterVar
    this.iterType = iterType
  }

  forkWithVariable(iterVar, iterType) {
    return new OverlayContext(this, iterVar, iterType)
  }

  reuse(parent) {
    if (!this.async) return ((this.#parent = parent), this)
    const ctx = new OverlayContext(parent, this.iterVar, this.iterType)
    ctx.accuType = this.accuType
    return ctx
  }

  setIterValue(v, ev, ast) {
    const valueType = ev.debugType(v)
    switch (this.iterType) {
      case valueType:
      case dynType:
        return ((this.iterValue = v), this)
      default:
        if (this.iterType.matches(valueType)) return ((this.iterValue = v), this)

        // Convert plain objects to typed instances when a convert function is registered
        if (this.iterType.kind === 'message' && valueType.kind === 'map') {
          const converted = ev.objectTypes.get(this.iterType.name)?.convert?.(v)
          if (converted) return ((this.iterValue = converted), this)
        }
    }

    throw new ev.Error(
      `Variable '${this.iterVar}' is not of type '${this.iterType}', got '${valueType}'`,
      ast
    )
  }

  setAccuType(type) {
    return ((this.accuType = type), this)
  }

  setAccuValue(v) {
    return ((this.accuValue = v), this)
  }

  getValue(key) {
    return this.iterVar === key ? this.iterValue : this.#parent.getValue(key)
  }

  getCheckedValue(ev, ast) {
    if (this.iterVar === ast.args) return this.iterValue
    return this.#parent.getCheckedValue(ev, ast)
  }

  getVariable(name) {
    if (this.iterVar === name) return new VariableDeclaration(name, this.iterType)
    return this.#parent.getVariable(name)
  }

  setConverted(name, value) {
    return this.iterVar === name ? (this.iterValue = value) : this.#parent.setConverted(name, value)
  }

  // getVariable makes this obsolete
  getType(key) {
    return this.iterVar === key ? this.iterType : this.#parent.getType(key)
  }
}

/**
 * Extract CEL field declarations from a protobufjs message type.
 * Maps protobuf types to CEL types.
 * @param {protobuf.Type} messageType - The protobufjs message type
 * @returns {Object} Field declarations in CEL format {fieldName: 'celType'}
 */
function protobufjsFieldToCelType(field) {
  let fieldType
  if (field.map) {
    const keyType = protobufjsTypeToCelType(field.keyType, field.resolvedKeyType)
    const valueType = protobufjsTypeToCelType(field.type, field.resolvedType)
    fieldType = `map<${keyType}, ${valueType}>`
  } else {
    fieldType = protobufjsTypeToCelType(field.type, field.resolvedType)
  }
  return {type: field.repeated ? `list<${fieldType}>` : fieldType}
}

/**
 * Map protobuf type names to CEL type names.
 * @param {string} protoType - The protobuf type name
 * @param {protobuf.Type|null} resolvedType - The resolved type for message/enum fields
 * @returns {string} The CEL type name
 */
function protobufjsTypeToCelType(protoType, resolvedType) {
  switch (protoType) {
    case 'string':
      return 'string'
    case 'bytes':
      return 'bytes'
    case 'bool':
      return 'bool'
    // protobufjs uses JavaScript numbers for all numeric types
    case 'double':
    case 'float':
    case 'int32':
    case 'int64':
    case 'sint32':
    case 'sint64':
    case 'sfixed32':
    case 'sfixed64':
    case 'uint32':
    case 'uint64':
    case 'fixed32':
    case 'fixed64':
      return 'double'
    default:
      switch (resolvedType?.constructor.name) {
        case 'Type':
          return resolvedType.fullName.slice(1)
        case 'Enum':
          return 'int'
      }

      if (protoType?.includes('.')) return protoType

      // Unknown type, treat as dyn
      return 'dyn'
  }
}

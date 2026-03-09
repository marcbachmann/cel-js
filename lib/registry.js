import {EvaluationError} from './errors.js'
import {UnsignedInt} from './functions.js'
import {Optional, OPTIONAL_NONE, toggleOptionalTypes} from './optional.js'
import {isAsync, hasOwn, objFreeze, objKeys, objEntries, RESERVED} from './globals.js'

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

  isDynOrBool() {
    return this.type === 'bool' || this.kind === 'dyn'
  }

  isEmpty() {
    return this.valueType && this.valueType.kind === 'param'
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
    if (type.matchesDebugType(valueType)) return value
    throw new EvaluationError(`Field '${key}' is not of type '${type}', got '${valueType}'`, ast)
  }

  #getMapField(obj, key, ast, ev) {
    // eslint-disable-next-line no-nested-ternary
    const value = obj instanceof Map ? obj.get(key) : obj && hasOwn(obj, key) ? obj[key] : undefined
    if (value === undefined) return

    const type = ev.debugType(value)
    if (this.valueType.matchesDebugType(type)) return value

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
    if (this.valueType.matchesDebugType(type)) return value

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

  matchesDebugType(o) {
    return this === o || this === dynType || !!this.valueType
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
  constructor({name, receiverType, returnType, handler, description, params, async}) {
    if (typeof name !== 'string') throw new Error('name must be a string')
    if (typeof handler !== 'function') throw new Error('handler must be a function')

    this.name = name
    this.async = isAsync(handler, async)
    this.receiverType = receiverType ?? null
    this.returnType = returnType
    this.description = description ?? null
    this.params = params
    this.argTypes = params.map((p) => p.type)
    this.macro = this.argTypes.includes(astType)

    const receiverString = receiverType ? `${receiverType}.` : ''
    this.signature = `${receiverString}${name}(${this.argTypes.join(', ')}): ${returnType}`
    this.handler = this.macro ? wrapMacroExpander(this.signature, handler) : handler
    this.partitionKey = `${receiverType ? 'rcall' : 'call'}:${name}:${params.length}`

    this.hasPlaceholderType =
      this.returnType.hasPlaceholderType ||
      this.receiverType?.hasPlaceholderType ||
      this.argTypes.some((t) => t.hasPlaceholderType) ||
      false

    objFreeze(this)
  }

  matchesArgs(argTypes) {
    return argTypes.length === this.argTypes.length &&
      this.argTypes.every((t, i) => t.matches(argTypes[i]))
      ? this
      : null
  }
}

export class OperatorDeclaration {
  constructor({op, leftType, rightType, handler, returnType, async}) {
    this.operator = op
    this.leftType = leftType
    this.rightType = rightType || null
    this.handler = handler
    this.async = isAsync(handler, async)
    this.returnType = returnType

    if (rightType) this.signature = `${leftType} ${op} ${rightType}: ${returnType}`
    else this.signature = `${op}${leftType}: ${returnType}`

    this.hasPlaceholderType =
      this.leftType.hasPlaceholderType || this.rightType?.hasPlaceholderType || false

    objFreeze(this)
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

class Candidates {
  returnType = null
  async = false
  macro = false
  #matchCache = null
  #checkCache = null
  /** @type {Array<FunctionDeclaration>|Array<OperatorDeclaration>} */
  declarations = []
  constructor(registry) {
    this.registry = registry
  }

  [Symbol.iterator]() {
    return this.declarations[Symbol.iterator]()
  }

  add(decl) {
    this.returnType =
      (this.returnType || decl.returnType).unify(this.registry, decl.returnType) || dynType

    if (decl.macro) this.macro = decl
    if (decl.async && !this.async) this.async = true
    this.declarations.push(decl)
    this.#matchCache?.clear()
    this.#checkCache?.clear()
  }

  findFunction(argTypes, receiverType = null) {
    for (let i = 0; i < this.declarations.length; i++) {
      const match = this.#matchesFunction(this.declarations[i], argTypes, receiverType)
      if (match) return match
    }
    return null
  }

  findUnaryOverload(left) {
    const cached = (this.#matchCache ??= new Map()).get(left)
    if (cached !== undefined) return cached

    let value = false
    for (const decl of this.declarations) {
      if (decl.leftType !== left) continue
      value = decl
      break
    }

    this.#matchCache.set(left, value)
    return value
  }

  findBinaryOverload(left, right) {
    if (left.kind === 'dyn' && left.valueType) right = right.wrappedType
    else if (right.kind === 'dyn' && right.valueType) left = left.wrappedType
    return (
      (this.#matchCache ??= new Map()).get(left)?.get(right) ??
      this.#cacheBinary(this.#matchCache, left, right, this.#findBinaryUncached(left, right))
    )
  }

  checkBinaryOverload(left, right) {
    return (
      (this.#checkCache ??= new Map()).get(left)?.get(right) ??
      this.#cacheBinary(this.#checkCache, left, right, this.#checkBinaryUncached(left, right))
    )
  }

  #cacheBinary(c, l, r, v) {
    return ((c.get(l) || c.set(l, new Map()).get(l)).set(r, v), v)
  }

  #findBinaryUncached(left, right) {
    const ops = this.#findBinaryOverloads(left, right)
    if (ops.length === 0) return false
    if (ops.length === 1) return ops[0]
    throw new Error(`Operator overload '${ops[0].signature}' overlaps with '${ops[1].signature}'.`)
  }

  #checkBinaryUncached(left, right) {
    const ops = this.#findBinaryOverloads(left, right)
    if (ops.length === 0) return false
    let rt = ops[0].returnType
    for (let i = 1; i < ops.length; i++) rt = rt.unify(this.registry, ops[i].returnType) || dynType
    return rt
  }

  #findBinaryOverloads(leftType, rightType) {
    const nonexactMatches = []
    for (const decl of this.declarations) {
      if (decl.leftType === leftType && decl.rightType === rightType) return [decl]
      const secondary = this.#matchBinaryOverload(decl, leftType, rightType)
      if (secondary) nonexactMatches.push(secondary)
    }

    if (nonexactMatches.length === 0) {
      const op = this.declarations[0]?.operator
      if ((op === '==' || op === '!=') && leftType.kind === 'dyn') {
        return fallbackDynEqualityMatchers[op]
      }
    }

    return nonexactMatches
  }

  #matchBinaryOverload(decl, actualLeft, actualRight) {
    const bindings = decl.hasPlaceholderType ? new Map() : null
    const leftType = this.#matchTypeWithPlaceholders(decl.leftType, actualLeft, bindings)
    if (!leftType) return
    const rightType = this.#matchTypeWithPlaceholders(decl.rightType, actualRight, bindings)
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
          async: decl.async,
          signature: decl.signature,
          handler: decl.handler,
          leftType,
          rightType,
          returnType: decl.returnType.templated(this.registry, bindings)
        }
      : decl
  }

  #matchesFunction(fn, argTypes, receiverType) {
    if (fn.hasPlaceholderType) return this.#matchWithPlaceholders(fn, argTypes, receiverType)
    if (receiverType && fn.receiverType && !receiverType.matches(fn.receiverType)) return
    return fn.matchesArgs(argTypes)
  }

  #matchWithPlaceholders(fn, argTypes, receiverType) {
    const bindings = new Map()
    if (receiverType && fn.receiverType) {
      if (!this.#matchTypeWithPlaceholders(fn.receiverType, receiverType, bindings)) {
        return null
      }
    }

    for (let i = 0; i < argTypes.length; i++) {
      if (!this.#matchTypeWithPlaceholders(fn.argTypes[i], argTypes[i], bindings)) {
        return null
      }
    }

    return {
      async: fn.async,
      handler: fn.handler,
      signature: fn.signature,
      returnType: fn.returnType.templated(this.registry, bindings)
    }
  }

  #matchTypeWithPlaceholders(declared, actual, bindings) {
    if (!declared.hasPlaceholderType) return actual.matches(declared) ? actual : null

    const treatAsDyn = actual.kind === 'dyn'
    if (!this.#collectPlaceholderBindings(declared, actual, bindings, treatAsDyn)) return null
    if (treatAsDyn) return actual
    return actual.matches(declared.templated(this.registry, bindings)) ? actual : null
  }

  #collectPlaceholderBindings(dec, act, bind, fromDyn = false) {
    if (!dec.hasPlaceholderType) return true
    if (!act) return false

    const asDyn = fromDyn || act.kind === 'dyn'
    act = act.unwrappedType

    switch (dec.kind) {
      case 'param': {
        const type = asDyn ? dynType : act
        const existing = bind.get(dec.name)
        if (!existing) return bind.set(dec.name, type) && true
        return existing.kind === 'dyn' || type.kind === 'dyn' ? true : existing.matchesBoth(type)
      }
      case 'list': {
        if (act.name === 'dyn') act = dec
        if (act.kind !== 'list') return false
        return this.#collectPlaceholderBindings(dec.valueType, act.valueType, bind, asDyn)
      }
      case 'map': {
        if (act.name === 'dyn') act = dec
        if (act.kind !== 'map') return false
        return (
          this.#collectPlaceholderBindings(dec.keyType, act.keyType, bind, asDyn) &&
          this.#collectPlaceholderBindings(dec.valueType, act.valueType, bind, asDyn)
        )
      }
      case 'optional': {
        if (act.name === 'dyn') act = dec
        if (act.kind !== 'optional') return false
        return this.#collectPlaceholderBindings(dec.valueType, act.valueType, bind, asDyn)
      }
    }
    return true
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
  #parent = null
  #typeDeclarations

  #ownsVariables = true
  #operators = null
  #functions = null
  #operatorsByOp = null
  #functionsByKey = null
  #listTypes = null
  #mapTypes = null
  #optionalTypes = null
  #others = null

  #locked = false

  constructor(opts = {}) {
    this.enableOptionalTypes = opts.enableOptionalTypes ?? false
    this.unlistedVariablesAreDyn = opts.unlistedVariablesAreDyn ?? false

    const parent = opts.parent instanceof Registry ? opts.parent : null
    if (parent) {
      this.#parent = parent

      let opParent = parent
      while (opParent && !opParent.#operators) opParent = opParent.#parent

      let fnParent = parent
      while (fnParent && !fnParent.#functions) fnParent = fnParent.#parent

      this.#operatorsByOp = parent.#operatorsByOp
      this.#functionsByKey = parent.#functionsByKey
      this.#others = {operators: opParent.#operators, functions: fnParent.#functions}

      this.objectTypes = new Map(parent.objectTypes)
      this.objectTypesByConstructor = new Map(parent.objectTypesByConstructor)
      this.variables = parent.variables
      this.#ownsVariables = false
      this.#typeDeclarations = parent.#typeDeclarations
      this.#listTypes = parent.#listTypes
      this.#mapTypes = parent.#mapTypes
      this.#optionalTypes = parent.#optionalTypes

      if (
        this.enableOptionalTypes !== parent.enableOptionalTypes ||
        this.unlistedVariablesAreDyn !== parent.unlistedVariablesAreDyn
      ) {
        toggleOptionalTypes(this, this.enableOptionalTypes)
      }
    } else {
      this.#operators = []
      this.#functions = []
      this.objectTypes = new Map(objTypes)
      this.objectTypesByConstructor = new Map(objTypesCtor)
      this.#typeDeclarations = new Map(objEntries(celTypes))
      this.#listTypes = new Map()
      this.#mapTypes = new Map()
      this.#optionalTypes = new Map()
      this.variables = new Map()
      this.variables.dyn = this.unlistedVariablesAreDyn
      for (const n in TYPES) this.registerConstant(n, 'type', TYPES[n])
    }
  }

  #ensureOwnVariables() {
    if (this.#ownsVariables) return
    this.variables = new Map(this.variables)
    this.variables.dyn = this.unlistedVariablesAreDyn
    this.#ownsVariables = true
  }

  // Used by toggleOptionalTypes in optional.js to clear a variable before re-registering it
  deleteVariable(name) {
    this.#ensureOwnVariables()
    this.variables.delete(name)
  }

  #pushOperator(decl) {
    if (!this.#operators) this.#operatorsByOp = null
    this.operatorCandidates(decl.operator).add(decl)
    this.#operators.push(decl)
  }

  #pushFunction(decl) {
    if (!this.#functions) this.#functionsByKey = null
    this.#functionCandidates(decl.partitionKey).add(decl)
    this.#functions.push(decl)
  }

  #ensureCandiate(c, key) {
    return c.get(key) || c.set(key, new Candidates(this)).get(key)
  }

  #getOperators() {
    if (this.#operators) return this.#operators
    return (this.#operators = [...this.#others.operators])
  }

  #getFunctions() {
    if (this.#functions) return this.#functions
    return (this.#functions = [...this.#others.functions])
  }

  operatorCandidates(op) {
    if (this.#operatorsByOp) return this.#ensureCandiate(this.#operatorsByOp, op)
    const c = (this.#operatorsByOp = new Map())
    for (const decl of this.#getOperators()) this.#ensureCandiate(c, decl.operator).add(decl)
    return this.#ensureCandiate(c, op)
  }

  functionCandidates(rec, name, argLen) {
    return this.#functionCandidates(`${rec ? 'rcall' : 'call'}:${name}:${argLen}`)
  }

  #functionCandidates(key) {
    if (this.#functionsByKey) return this.#ensureCandiate(this.#functionsByKey, key)
    const c = (this.#functionsByKey = new Map())
    for (const decl of this.#getFunctions()) this.#ensureCandiate(c, decl.partitionKey).add(decl)
    return this.#ensureCandiate(c, key)
  }

  registerVariable(name, type, opts) {
    if (this.#locked) throw new Error('Cannot modify frozen registry')
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
    if (this.variables.get(name) !== undefined) throw invalidVar(`'${name}' is already registered`)

    if (typeof type === 'string') type = this.getType(type)
    else if (!(type instanceof TypeDeclaration)) throw invalidVar(`type is required`)

    this.#ensureOwnVariables()
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
    if (this.#locked) throw new Error('Cannot modify frozen registry')
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
    this.registerFunctionOverload(`type(${name}): type`, () => decl.typeType, {async: false})
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
    return this.functionCandidates(hasReceiver, name, argLen).macro
  }

  findUnaryOverload(op, left) {
    return this.operatorCandidates(op).findUnaryOverload(left)
  }

  findBinaryOverload(op, left, right) {
    return this.operatorCandidates(op).findBinaryOverload(left, right)
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
    this.#locked = true
    return new Registry({
      parent: this,
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

    for (const decl of this.#getFunctions()) {
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
    for (const decl of this.#functionCandidates(newDec.partitionKey)) {
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
    if (this.#locked) throw new Error('Cannot modify frozen registry')
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
    handler = typeof handler === 'function' ? handler : opts.handler

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
        async: opts?.async,
        receiverType: receiverType ? this.getType(receiverType) : null,
        returnType: this.getType(returnType),
        handler,
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
    this.#pushFunction(dec)
  }

  registerOperatorOverload(string, handler, opts) {
    // Parse with optional return type: "Vector + Vector: Vector" or "Vector + Vector"
    const unaryParts = string.match(/^([-!])([\w.<>]+)(?::\s*([\w.<>]+))?$/)
    if (unaryParts) {
      const [, op, operandType, returnType] = unaryParts
      return this.unaryOverload(op, operandType, handler, returnType, opts?.async)
    }

    const parts = string.match(
      /^([\w.<>]+) ([-+*%/]|==|!=|<|<=|>|>=|in) ([\w.<>]+)(?::\s*([\w.<>]+))?$/
    )
    if (!parts) throw new Error(`Operator overload invalid: ${string}`)
    const [, leftType, op, rightType, returnType] = parts
    return this.binaryOverload(leftType, op, rightType, handler, returnType)
  }

  unaryOverload(op, typeStr, handler, returnTypeStr, async) {
    if (this.#locked) throw new Error('Cannot modify frozen registry')
    const leftType = this.assertType(typeStr, 'type', `${op}${typeStr}`)
    const returnType = this.assertType(
      returnTypeStr || typeStr,
      'return type',
      `${op}${typeStr}: ${returnTypeStr || typeStr}`
    )

    const d = new OperatorDeclaration({op: `${op}_`, leftType, returnType, handler, async})
    this.#pushOperator(this.#assertOverload(d))
  }

  #hasOverload(d) {
    for (const o of this.operatorCandidates(d.operator)) if (d.equals(o)) return true
    return false
  }

  #assertOverload(decl) {
    if (!this.#hasOverload(decl)) return decl
    throw new Error(`Operator overload already registered: ${decl.signature}`)
  }

  binaryOverload(leftTypeStr, op, rightTypeStr, handler, returnTypeStr, async) {
    if (this.#locked) throw new Error('Cannot modify frozen registry')
    returnTypeStr ??= isRelational.has(op) ? 'bool' : leftTypeStr

    const sig = `${leftTypeStr} ${op} ${rightTypeStr}: ${returnTypeStr}`
    let leftType = this.assertType(leftTypeStr, 'left type', sig)
    let rightType = this.assertType(rightTypeStr, 'right type', sig)
    const returnType = this.assertType(returnTypeStr, 'return type', sig)

    // Register both types as wrapped with dyn<> if one of them is wrapped
    if (leftType.kind === 'dyn' && leftType.valueType) rightType = rightType.wrappedType
    else if (rightType.kind === 'dyn' && rightType.valueType) leftType = leftType.wrappedType

    if (isRelational.has(op) && returnType.type !== 'bool') {
      throw new Error(`Comparison operator '${op}' must return 'bool', got '${returnType.type}'`)
    }

    const dec = new OperatorDeclaration({op, leftType, rightType, returnType, handler, async})
    if (dec.hasPlaceholderType && !(rightType.hasPlaceholderType && leftType.hasPlaceholderType)) {
      throw new Error(
        `Operator overload with placeholders must use them in both left and right types: ${sig}`
      )
    }

    this.#assertOverload(dec)
    if (op === '==') {
      const declarations = [
        new OperatorDeclaration({
          op: '!=',
          leftType,
          rightType,
          handler(a, b, ast, ev) {
            return !handler(a, b, ast, ev)
          },
          returnType,
          async
        })
      ]

      if (leftType !== rightType) {
        declarations.push(
          new OperatorDeclaration({
            op: '==',
            leftType: rightType,
            rightType: leftType,
            handler(a, b, ast, ev) {
              return handler(b, a, ast, ev)
            },
            returnType,
            async
          }),
          new OperatorDeclaration({
            op: '!=',
            leftType: rightType,
            rightType: leftType,
            handler(a, b, ast, ev) {
              return !handler(b, a, ast, ev)
            },
            returnType,
            async
          })
        )
      }

      for (const decl of declarations) this.#assertOverload(decl)
      for (const decl of declarations) this.#pushOperator(decl)
    }

    this.#pushOperator(dec)
  }
}

const isRelational = new Set(['<', '<=', '>', '>=', '==', '!=', 'in'])

export function createRegistry(opts) {
  return new Registry(opts)
}

export class RootContext {
  #vars
  #contextObj
  #contextMap
  #convertCache
  constructor(registry, context) {
    this.#vars = registry.variables
    if (context === undefined || context === null) return
    if (typeof context !== 'object') throw new EvaluationError('Context must be an object')
    if (context instanceof Map) this.#contextMap = context
    else this.#contextObj = context
  }

  getValue(key) {
    return (
      this.#convertCache?.get(key) ||
      (this.#contextObj ? this.#contextObj[key] : this.#contextMap?.get(key))
    )
  }

  getVariable(name) {
    return (
      this.#vars.get(name) ??
      (this.#vars.dyn && !RESERVED.has(name) ? new VariableDeclaration(name, dynType) : undefined)
    )
  }

  getCheckedValue(ev, ast) {
    const v = this.getValue(ast.args)
    if (v === undefined) throw new ev.Error(`Unknown variable: ${ast.args}`, ast)

    if (ast.checkedType === dynType) {
      // prettier-ignore
      switch (typeof v) {
        case 'string': case 'bigint': case 'number': case 'boolean': return v
        case 'object':
          switch (v ? v.constructor : v) {
            case null: return v
            case undefined: case Object: case Map: case Array: case Set: return v
            default: if (ev.objectTypesByConstructor.get(v.constructor)) return v
          }
      }
    }

    const type = ast.checkedType
    const valueType = ev.debugType(v)
    if (type.matchesDebugType(valueType)) return v

    // Convert plain objects to typed instances when a convert function is registered
    if (type.kind === 'message' && valueType.kind === 'map') {
      const c = ev.objectTypes.get(type.name)?.convert?.(v)
      if (c) return ((this.#convertCache ??= new Map()).set(ast.args, c), c)
    }

    throw new ev.Error(`Variable '${ast.args}' is not of type '${type}', got '${valueType}'`, ast)
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

  setIterValue(v, ev) {
    if (this.iterType === dynType) {
      // prettier-ignore
      switch (typeof v) {
        case 'string': case 'bigint': case 'number': case 'boolean':
          return ((this.iterValue = v), this)
        case 'object':
          switch (v ? v.constructor : v) {
            case null: case undefined: case Object: case Map: case Array: case Set:
              return ((this.iterValue = v), this)
            default:
              if (ev.objectTypesByConstructor.get(v.constructor))
                return ((this.iterValue = v), this)
          }
      }
    }

    const valueType = ev.debugType(v)
    if (this.iterType.matchesDebugType(valueType)) return ((this.iterValue = v), this)

    // Convert plain objects to typed instances when a convert function is registered
    if (this.iterType.kind === 'message' && valueType.kind === 'map') {
      const c = ev.objectTypes.get(this.iterType.name)?.convert?.(v)
      if (c) return ((this.iterValue = c), this)
    }

    throw new ev.Error(
      `Variable '${this.iterVar}' is not of type '${this.iterType}', got '${valueType}'`
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

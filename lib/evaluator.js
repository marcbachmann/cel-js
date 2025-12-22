import {celTypes, createRegistry, RootContext} from './registry.js'
import {EvaluationError} from './errors.js'
import {registerFunctions, Duration, UnsignedInt} from './functions.js'
import {registerMacros} from './macros.js'
import {registerOverloads} from './overloads.js'
import {TypeChecker} from './type-checker.js'
import {Parser} from './parser.js'
import {createOptions} from './options.js'

const globalRegistry = createRegistry({enableOptionalTypes: false})
registerFunctions(globalRegistry)
registerOverloads(globalRegistry)
registerMacros(globalRegistry)

function handleId(ast, ev, ctx) {
  const name = ast[1]
  const type = ctx.getType(name)
  const value = type ? ctx.getValue(name) : undefined
  if (value === undefined) throw new EvaluationError(`Unknown variable: ${name}`, ast)

  const valueType = ev.debugType(value)
  if (type.matches(valueType)) return value
  throw new EvaluationError(`Variable '${name}' is not of type '${type}', got '${valueType}'`, ast)
}

function handleLogicalOr(ast, ev, ctx) {
  const left = ev.tryEval(ast[1], ctx)
  if (left instanceof Promise) return left.then((l) => _or(ast, ev, ctx, l))
  return _or(ast, ev, ctx, left)
}

function handleLogicalAnd(ast, ev, ctx) {
  const left = ev.tryEval(ast[1], ctx)
  if (left instanceof Promise) return left.then((l) => _and(ast, ev, ctx, l))
  return _and(ast, ev, ctx, left)
}

function handleReceiverCall(ast, ev, ctx) {
  if (ast.macro) return ast.macro.evaluate(ev, ast.macro, ctx)
  return withPromise(ast, ev, ev.eval(ast[2], ctx), resolveAstArray(ev, ctx, ast[3]), _receiverCall)
}

function handleCall(ast, ev, ctx) {
  if (ast.macro) return ast.macro.evaluate(ev, ast.macro, ctx)
  return withPromise(ast, ev, resolveAstArray(ev, ctx, ast[2]), null, _call)
}

function unknownOperationError(ast) {
  return new EvaluationError(`Unknown operation: ${ast[0]}`, ast)
}

function logicalOperandError(ev, value, node) {
  const type = ev.debugRuntimeType(value, node.checkedType)
  return new EvaluationError(`Logical operator requires bool operands, got '${type}'`, node)
}

function _or(ast, ev, ctx, left) {
  if (left === true) return true
  const right = ev.eval(ast[2], ctx)
  if (right instanceof Promise) return right.then((r) => _orRight(ast, ev, left, r))
  return _orRight(ast, ev, left, right)
}

function _orRight(ast, ev, left, right) {
  if (right === true) return true
  if (right !== false) throw logicalOperandError(ev, right, ast[2])
  if (left instanceof Error) throw left
  if (left !== false) throw logicalOperandError(ev, left, ast[1])
  return false
}

function _and(ast, ev, ctx, left) {
  if (left === false) return false
  const right = ev.eval(ast[2], ctx)
  if (right instanceof Promise) return right.then((r) => _andRight(ast, ev, left, r))
  return _andRight(ast, ev, left, right)
}

function _andRight(ast, ev, left, right) {
  if (right === false) return false
  if (right !== true) throw logicalOperandError(ev, right, ast[2])
  if (left instanceof Error) throw left
  if (left !== true) throw logicalOperandError(ev, left, ast[1])
  return true
}

function ternaryConditionError(ev, value, node) {
  const type = ev.debugRuntimeType(value, node.checkedType)
  return new EvaluationError(`Ternary condition must be bool, got '${type}'`, node)
}

function handleTernary(ast, ev, condition, ctx) {
  if (condition === true) return ev.eval(ast[2], ctx)
  if (condition === false) return ev.eval(ast[3], ctx)
  throw ternaryConditionError(ev, condition, ast[1])
}

function handleUnary(ast, ev, left) {
  const leftType = ev.debugRuntimeType(left, ast[1].checkedType)
  const overload = ev.registry.findUnaryOverload(ast[0], leftType)
  if (overload) return overload.handler(left)
  throw new EvaluationError(`no such overload: ${ast[0][0]}${leftType}`, ast)
}

function handleBinary(ast, ev, left, right) {
  const leftType = ev.debugOperandType(left, ast[1].checkedType)
  const rightType = ev.debugOperandType(right, ast[2].checkedType)
  const overload = ev.registry.findBinaryOverload(ast[0], leftType, rightType)
  if (overload) return overload.handler(left, right, ast, ev)
  throw new EvaluationError(`no such overload: ${leftType} ${ast[0]} ${rightType}`, ast)
}

function _call(ast, ev, args) {
  const functionName = ast[1]
  const argAst = ast[2]
  const argLen = argAst.length
  const functionCandidates = (ast.functionCandidates ??= ev.registry.getFunctionCandidates(
    false,
    functionName,
    argLen
  ))

  const types = (ast.types ??= new Array(argLen))
  let i = argLen
  while (i--) types[i] = ev.debugOperandType(args[i], argAst[i].checkedType)

  const decl = functionCandidates.findMatch(types, null)
  if (decl) return decl.handler.apply(ev, args)
  throw new EvaluationError(
    `found no matching overload for '${functionName}(${types
      .map((t) => t.unwrappedType)
      .join(', ')})'`,
    ast
  )
}

function _receiverCall(ast, ev, receiver, args) {
  const [, functionName, receiverAst, argAst] = ast
  const functionCandidates = (ast.functionCandidates ??= ev.registry.getFunctionCandidates(
    true,
    functionName,
    argAst.length
  ))

  let i = args.length
  const types = (ast.argTypes ??= new Array(i))
  while (i--) types[i] = ev.debugOperandType(args[i], argAst[i].checkedType)

  const receiverType = ev.debugRuntimeType(receiver, receiverAst.checkedType || celTypes.dyn)
  const decl = functionCandidates.findMatch(types, receiverType)
  if (decl) return decl.handler.call(ev, receiver, ...args)

  throw new EvaluationError(
    `found no matching overload for '${receiverType.type}.${functionName}(${types
      .map((t) => t.unwrappedType)
      .join(', ')})'`,
    ast
  )
}

function resolveAstArray(ev, ctx, astArray, i = astArray.length) {
  let async
  const results = new Array(i)
  while (i--) if ((results[i] = ev.eval(astArray[i], ctx)) instanceof Promise) async ??= true
  return async ? Promise.all(results) : results
}

function resolveAstEntries(ev, ctx, astEntries) {
  const len = astEntries.length
  const results = new Array(len)
  let async
  for (let i = 0; i < len; i++) {
    const [key, value] = astEntries[i]
    const k = ev.eval(key, ctx)
    const v = ev.eval(value, ctx)
    if (k instanceof Promise || v instanceof Promise) {
      results[i] = Promise.all([k, v])
      async ??= true
    } else {
      results[i] = [k, v]
    }
  }
  if (async) return Promise.all(results).then(safeFromEntries)
  return safeFromEntries(results)
}

function safeFromEntries(entries) {
  const obj = {}
  for (let i = 0; i < entries.length; i++) {
    const [k, v] = entries[i]
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue
    obj[k] = v
  }
  return obj
}

function withPromise(ast, ev, a, b, fn) {
  if (a instanceof Promise || b instanceof Promise) {
    return Promise.all([a, b]).then(([l, r]) => fn(ast, ev, l, r))
  }
  return fn(ast, ev, a, b)
}

function oFieldAccess(ast, ev, left, right) {
  return celTypes.optional.field(left, right, ast, ev)
}

function fieldAccess(ast, ev, left, right) {
  return ev.debugType(left).field(left, right, ast, ev)
}

const registryByEnvironment = new WeakMap()

class Environment {
  #registry
  #evaluator
  #typeChecker
  #evalTypeChecker
  #parser
  #rootContext

  constructor(opts, inherited) {
    this.opts = createOptions(opts, inherited?.opts)
    this.#registry = (
      inherited instanceof Environment ? registryByEnvironment.get(inherited) : globalRegistry
    ).clone(this.opts)

    const childOpts = {
      objectTypes: this.#registry.objectTypes,
      objectTypesByConstructor: this.#registry.objectTypesByConstructor,
      registry: this.#registry,
      opts: this.opts
    }

    this.#typeChecker = new TypeChecker(childOpts)
    this.#evalTypeChecker = new TypeChecker(childOpts, true)
    this.#evaluator = new Evaluator(childOpts)
    this.#parser = new Parser(this.opts.limits, this.#registry)
    this.#rootContext = new RootContext(this.#registry.variables, this.#registry.constants)
    registryByEnvironment.set(this, this.#registry)
    Object.freeze(this)
  }

  clone(opts) {
    return new Environment(opts, this)
  }

  registerFunction(string, handler) {
    this.#registry.registerFunctionOverload(string, handler)
    return this
  }

  registerOperator(string, handler) {
    this.#registry.registerOperatorOverload(string, handler)
    return this
  }

  registerType(typename, constructor) {
    this.#registry.registerType(typename, constructor)
    return this
  }

  registerVariable(name, type) {
    this.#registry.registerVariable(name, type)
    return this
  }

  registerConstant(name, type, value) {
    this.#registry.registerConstant(name, type, value)
    return this
  }

  hasVariable(name) {
    return this.#registry.variables.has(name)
  }

  check(expression) {
    try {
      return this.#checkAST(this.#parser.parse(expression))
    } catch (e) {
      return {valid: false, error: e}
    }
  }

  #checkAST(ast) {
    try {
      const typeDecl = this.#typeChecker.check(ast, this.#rootContext.fork())
      return {valid: true, type: this.#formatTypeForCheck(typeDecl)}
    } catch (e) {
      return {valid: false, error: e}
    }
  }

  #formatTypeForCheck(typeDecl) {
    if (typeDecl.name === `list<dyn>`) return 'list'
    if (typeDecl.name === `map<dyn, dyn>`) return 'map'
    return typeDecl.name
  }

  parse(expression) {
    const ast = this.#parser.parse(expression)
    const evaluateParsed = this.#evaluateAST.bind(this, ast)
    evaluateParsed.check = this.#checkAST.bind(this, ast)
    evaluateParsed.ast = ast
    return evaluateParsed
  }

  evaluate(expression, context) {
    return this.#evaluateAST(this.#parser.parse(expression), context)
  }

  #evaluateAST(ast, context = null) {
    const ctx = this.#rootContext.fork().withContext(context)
    if (!ast.checkedType) this.#evalTypeChecker.check(ast, ctx)
    return this.#evaluator.eval(ast, ctx)
  }
}

function unsupportedType(type) {
  throw new EvaluationError(`Unsupported type: ${type}`)
}

class Evaluator {
  stringType = celTypes.string
  intType = celTypes.int
  doubleType = celTypes.double
  boolType = celTypes.bool
  nullType = celTypes.null
  listType = celTypes.list
  mapType = celTypes.map

  constructor(opts) {
    this.objectTypes = opts.objectTypes
    this.objectTypesByConstructor = opts.objectTypesByConstructor
    this.registry = opts.registry
  }

  debugType(v) {
    switch (typeof v) {
      case 'string':
        return this.stringType
      case 'bigint':
        return this.intType
      case 'number':
        return this.doubleType
      case 'boolean':
        return this.boolType
      case 'object':
        if (v === null) return this.nullType
        return (
          this.objectTypesByConstructor.get(v.constructor)?.type ||
          unsupportedType(v.constructor?.name || typeof v)
        )
      default:
        unsupportedType(typeof v)
    }
  }

  #inferListType(list, fb) {
    const first = list instanceof Array ? list[0] : list.values().next().value
    if (first === undefined) return fb
    return this.registry.getListType(this.debugRuntimeType(first, fb.valueType))
  }

  #firstMapElement(coll) {
    if (coll instanceof Map) return coll.entries().next().value
    for (const key in coll) return [key, coll[key]]
  }

  #inferMapType(value, fb) {
    const first = this.#firstMapElement(value)
    if (!first) return fb
    return this.registry.getMapType(
      this.debugRuntimeType(first[0], fb.keyType),
      this.debugRuntimeType(first[1], fb.valueType)
    )
  }

  debugOperandType(value, checkedType) {
    if (checkedType?.hasNoDynTypes()) return checkedType
    return this.registry.getDynType(this.debugRuntimeType(value, checkedType))
  }

  debugRuntimeType(value, checkedType) {
    if (checkedType?.hasNoDynTypes()) return checkedType

    const runtimeType = this.debugType(value)
    switch (runtimeType.kind) {
      case 'list':
        return this.#inferListType(value, runtimeType)
      case 'map':
        return this.#inferMapType(value, runtimeType)
      default:
        return runtimeType
    }
  }

  tryEval(ast, ctx) {
    try {
      const res = this.eval(ast, ctx)
      if (res instanceof Promise) return res.catch((err) => err)
      return res
    } catch (err) {
      return err
    }
  }

  eval(ast, ctx) {
    switch (ast[0]) {
      case 'value':
        return ast[1]
      case 'id':
        return handleId(ast, this, ctx)
      case '||':
        return handleLogicalOr(ast, this, ctx)
      case '&&':
        return handleLogicalAnd(ast, this, ctx)
      case '.':
        return withPromise(ast, this, this.eval(ast[1], ctx), ast[2], fieldAccess)
      case '.?':
        return withPromise(ast, this, this.eval(ast[1], ctx), ast[2], oFieldAccess)
      case '[]':
        return withPromise(ast, this, this.eval(ast[1], ctx), this.eval(ast[2], ctx), fieldAccess)
      case '[?]':
        return withPromise(ast, this, this.eval(ast[1], ctx), this.eval(ast[2], ctx), oFieldAccess)
      case 'rcall':
        return handleReceiverCall(ast, this, ctx)
      case 'call':
        return handleCall(ast, this, ctx)
      case 'list':
        return resolveAstArray(this, ctx, ast[1])
      case 'map':
        return resolveAstEntries(this, ctx, ast[1])
      case '?:':
        return withPromise(ast, this, this.eval(ast[1], ctx), ctx, handleTernary)
      case '!_':
      case '-_':
        return withPromise(ast, this, this.eval(ast[1], ctx), null, handleUnary)
      case '!=':
      case '==':
      case 'in':
      case '+':
      case '-':
      case '*':
      case '/':
      case '%':
      case '<':
      case '<=':
      case '>':
      case '>=':
        return withPromise(ast, this, this.eval(ast[1], ctx), this.eval(ast[2], ctx), handleBinary)
      default:
        throw unknownOperationError(ast)
    }
  }
}

const globalEnvironment = new Environment({
  unlistedVariablesAreDyn: true
})

export function parse(expression) {
  return globalEnvironment.parse(expression)
}

export function evaluate(expression, context) {
  return globalEnvironment.evaluate(expression, context)
}

export function check(expression) {
  return globalEnvironment.check(expression)
}

export {Duration, UnsignedInt, Environment}

export default {
  parse,
  evaluate,
  check,
  Environment,
  Duration,
  UnsignedInt
}

import {TYPES, celTypes, createRegistry} from './registry.js'
import {EvaluationError} from './errors.js'
import {registerFunctions, Duration, UnsignedInt} from './functions.js'
import {registerOverloads} from './overloads.js'
import {TypeChecker} from './type-checker.js'
import {Parser} from './parser.js'
import {createOptions} from './options.js'

const globalRegistry = createRegistry()
registerOverloads(globalRegistry)
registerFunctions(globalRegistry)

const handlers = new Map(
  Object.entries({
    value(ast) {
      return ast[1]
    },
    id(ast, ev) {
      return ev.value(ast[1], ast).value
    },
    '||'(ast, ev) {
      try {
        const left = ev.eval(ast[1])
        if (left === true) return true
        if (left !== false) throw logicalOperandError(ev, left, ast[1])
      } catch (err) {
        if (
          err.message.includes('Unknown variable') ||
          err.message.includes('Logical operator requires bool operands')
        ) {
          throw err
        }

        const right = ev.eval(ast[2])
        if (right === true) return true
        if (right === false) throw err
        throw logicalOperandError(ev, right, ast[2])
      }

      const right = ev.eval(ast[2])
      if (typeof right === 'boolean') return right
      throw logicalOperandError(ev, right, ast[2])
    },
    '&&'(ast, ev) {
      try {
        const left = ev.eval(ast[1])
        if (left === false) return false
        if (left !== true) throw logicalOperandError(ev, left, ast[1])
      } catch (err) {
        if (
          err.message.includes('Unknown variable') ||
          err.message.includes('Logical operator requires bool operands')
        ) {
          throw err
        }

        const right = ev.eval(ast[2])
        if (right === false) return false
        if (right === true) throw err
        throw logicalOperandError(ev, right, ast[2])
      }

      const right = ev.eval(ast[2])
      if (typeof right === 'boolean') return right
      throw logicalOperandError(ev, right, ast[2])
    },
    '.'(ast, ev) {
      const left = ev.eval(ast[1])
      return ev.debugType(left).field(left, ast[2], ast, ev)
    },
    '[]'(ast, ev) {
      const left = ev.eval(ast[1])
      return ev.debugType(left).field(left, ev.eval(ast[2]), ast, ev)
    },
    rcall(ast, ev) {
      const functionName = ast[1]
      const receiver = ev.eval(ast[2])
      const checkedType = ast[2].checkedType || ev.celTypes.dyn
      const argAst = ast[3]
      const argLen = argAst.length
      const functionCandidates = (ast.functionCandidates ??= ev.registry.getFunctionCandidates(
        checkedType,
        functionName,
        argLen
      ))

      const receiverType = ev.debugRuntimeType(receiver, checkedType)
      if (!functionCandidates.exists) {
        throw new EvaluationError(
          `Function not found: '${functionName}' for value of type '${receiverType}'`,
          ast
        )
      }

      const byReceiver = functionCandidates.filterByReceiverType(receiverType)

      let args
      let argTypes
      if (byReceiver.hasMacro) {
        args = argAst
        argTypes = ast.argMacroTypes ??= new Array(argLen).fill(ev.registry.getFunctionType('ast'))
      } else {
        args = ast.argValues ??= new Array(argLen)
        argTypes = ast.argTypes ??= new Array(argLen)
        for (let i = 0; i < argLen; i++) {
          const arg = argAst[i]
          argTypes[i] = ev.debugRuntimeType((args[i] = ev.eval(arg)), arg.checkedType)
        }
      }

      const decl = byReceiver.findMatch(argTypes)

      if (!decl) {
        throw new EvaluationError(
          `found no matching overload for '${receiverType.type}.${functionName}(${argTypes.join(
            ', '
          )})'`,
          ast
        )
      }

      try {
        if (decl.macro) return decl.handler.call(ev, receiver, ast)
        return decl.handler.call(ev, receiver, ...args)
      } catch (err) {
        if (err instanceof EvaluationError) throw err.withAst(ast)
        throw err
      }
    },
    call(ast, ev) {
      const functionName = ast[1]
      const argAst = ast[2]
      const argLen = argAst.length
      const functionCandidates = (ast.functionCandidates ??= ev.registry.getFunctionCandidates(
        null,
        functionName,
        argLen
      ))

      if (functionCandidates.exists === false) {
        throw new EvaluationError(`Function not found: '${functionName}'`, ast)
      }

      const byReceiver = functionCandidates.filterByReceiverType(null)

      let args
      let argTypes
      if (functionCandidates.hasMacro) {
        args = argAst
        argTypes = ast.argMacroTypes ??= new Array(argLen).fill(ev.registry.getFunctionType('ast'))
      } else {
        args = ast.argValues ??= new Array(argLen)
        argTypes = ast.argTypes ??= new Array(argLen)
        for (let i = 0; i < argLen; i++) {
          const arg = argAst[i]
          argTypes[i] = ev.debugRuntimeType((args[i] = ev.eval(arg)), arg.checkedType)
        }
      }

      const decl = byReceiver.findMatch(argTypes)

      if (!decl) {
        throw new EvaluationError(
          `found no matching overload for '${functionName}(${argTypes.join(', ')})'`,
          ast
        )
      }

      try {
        if (decl.macro) return decl.handler.call(ev, ast)
        return decl.handler.apply(ev, args)
      } catch (err) {
        if (err instanceof EvaluationError) throw err.withAst(ast)
        throw err
      }
    },
    list(ast, ev) {
      const elements = ast[1]
      const result = new Array(elements.length)
      for (let i = 0; i < elements.length; i++) result[i] = ev.eval(elements[i])
      return result
    },
    map(ast, ev) {
      const result = {}
      const props = ast[1]
      for (let i = 0; i < props.length; i++) {
        const [k, v] = props[i]
        const key = ev.eval(k)
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
        result[key] = ev.eval(v)
      }
      return result
    },
    '?:'(ast, ev) {
      const condition = ev.eval(ast[1])
      if (condition === true) return ev.eval(ast[2])
      if (condition === false) return ev.eval(ast[3])
      throw ternaryConditionError(ev, condition, ast[1])
    },
    '!_': unaryOverload,
    '-_': unaryOverload,
    '!=': binaryOverload,
    '==': binaryOverload,
    in: binaryOverload,
    '+': binaryOverload,
    '-': binaryOverload,
    '*': binaryOverload,
    '/': binaryOverload,
    '%': binaryOverload,
    '<': binaryOverload,
    '<=': binaryOverload,
    '>': binaryOverload,
    '>=': binaryOverload
  })
)

function logicalOperandError(ev, value, node) {
  const type = ev.debugRuntimeType(value, node.checkedType)
  return new EvaluationError(`Logical operator requires bool operands, got '${type}'`, node)
}

function ternaryConditionError(ev, value, node) {
  const type = ev.debugRuntimeType(value, node.checkedType)
  return new EvaluationError(`Ternary condition must be bool, got '${type}'`, node)
}

function predicateReturnError(ev, value, node, functionName) {
  const type = ev.debugRuntimeType(value, node.checkedType)
  return new EvaluationError(`${functionName} predicate must return bool, got '${type}'`, node)
}

function unaryOverload(ast, ev) {
  const left = ev.eval(ast[1])
  const leftType = ev.debugRuntimeType(left, ast[1].checkedType)
  const overload = ev.registry.findUnaryOverload(ast[0], leftType)
  if (overload) return overload.handler(left)
  throw new EvaluationError(`no such overload: ${ast[0][0]}${leftType}`, ast)
}

function binaryOverload(ast, ev) {
  const left = ev.eval(ast[1])
  const right = ev.eval(ast[2])
  const leftType = getOperandType(ast[1].checkedType, left, ev)
  const rightType = getOperandType(ast[2].checkedType, right, ev)

  const overload = ev.registry.findBinaryOverload(ast[0], leftType, rightType)
  if (overload) return overload.handler(left, right, ast, ev)
  throw new EvaluationError(`no such overload: ${leftType} ${ast[0]} ${rightType}`, ast)
}

function getOperandType(checkedType, value, ev) {
  if (!checkedType) return ev.debugRuntimeType(value, checkedType)
  if (checkedType.hasNoDynTypes()) return checkedType
  return ev.registry.getDynType(ev.debugRuntimeType(value, checkedType))
}

class Context {
  createOverlay(name, type) {
    return new OverlayContext(this, name, type)
  }

  getVariable(name) {
    const type = this.getType(name)
    if (!type) return

    const value = this.getValue(name)
    if (value === undefined) return
    return {type, value}
  }
}

class RootContext extends Context {
  constructor(variables, fallbackValues) {
    super()
    this.variables = variables
    this.fallbackValues = fallbackValues
    this.primary = null
    this.primaryGetter = this.#getFromSecondary
  }

  getType(name) {
    return this.variables.get(name)
  }

  getValue() {}

  setPrimaryContext(primary) {
    if (typeof primary !== 'object') throw new EvaluationError('Context must be an object')
    this.primary = primary
    if (!primary) this.getValue = this.#getFromSecondary
    else if (primary instanceof Map) this.getValue = this.#getFromMap
    else this.getValue = this.#getFromObject
  }

  #getFromSecondary(key) {
    return this.fallbackValues.get(key)
  }

  #getFromObject(key) {
    const v = Object.hasOwn(this.primary, key) ? this.primary[key] : undefined
    if (v !== undefined) return v
    return this.fallbackValues.get(key)
  }

  #getFromMap(key) {
    const v = this.primary.get(key)
    if (v !== undefined) return v
    return this.fallbackValues.get(key)
  }
}

class OverlayContext extends Context {
  constructor(parent, variableName, variableType) {
    super()
    this.parent = parent
    this.variableName = variableName
    this.variableType = variableType
    this.variableValue = undefined
  }

  getType(name) {
    if (this.variableName === name) return this.variableType
    return this.parent.getType(name)
  }

  getValue(name) {
    if (this.variableName === name) return this.variableValue
    return this.parent.getValue(name)
  }

  setVariableValue(value) {
    this.variableValue = value
  }
}

const registryByEnvironment = new WeakMap()
const globalValues = new Map(Object.entries(TYPES))

class Environment {
  #registry
  #evaluator
  #typeChecker

  constructor(opts, inherited) {
    this.opts = createOptions(opts, inherited?.opts)
    this.#registry = (
      inherited instanceof Environment ? registryByEnvironment.get(inherited) : globalRegistry
    ).clone(this.opts)

    const childOpts = {
      registry: this.#registry,
      objectTypes: this.#registry.objectTypes,
      objectTypesByConstructor: this.#registry.objectTypesByConstructor,
      opts: this.opts,
      ctx: new RootContext(this.#registry.variables, globalValues)
    }

    this.#typeChecker = new TypeChecker(childOpts.ctx, childOpts)
    const evaluateTypeChecker = new TypeChecker(childOpts.ctx, childOpts, true)
    this.#evaluator = new Evaluator(childOpts, evaluateTypeChecker)
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

  hasVariable(name) {
    return this.#registry.variables.has(name)
  }

  check(expression) {
    try {
      const typeDecl = this.#typeChecker.check(new Parser(expression, this.opts.limits).parse())
      return {valid: true, type: this.#formatTypeForCheck(typeDecl)}
    } catch (e) {
      return {valid: false, error: e}
    }
  }

  #checkAST(ast) {
    try {
      const typeDecl = this.#typeChecker.check(ast)
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
    const ast = new Parser(expression, this.opts.limits).parse()
    const evaluateParsed = this.#evaluateAST.bind(this, ast)
    evaluateParsed.check = this.#checkAST.bind(this, ast)
    evaluateParsed.ast = ast
    return evaluateParsed
  }

  evaluate(expression, context) {
    return this.#evaluateAST(new Parser(expression, this.opts.limits).parse(), context)
  }

  #evaluateAST(ast, context = null) {
    const evaluator = this.#evaluator
    evaluator.ctx.setPrimaryContext(context)
    evaluator.typeChecker.check(ast)
    return evaluator.eval(ast)
  }
}

function unsupportedType(type) {
  throw new EvaluationError(`Unsupported type: ${type}`)
}

class Evaluator {
  handlers = handlers
  celTypes = celTypes
  constructor({registry, objectTypes, objectTypesByConstructor, ctx, limits}, typeChecker) {
    this.objectTypes = objectTypes
    this.objectTypesByConstructor = objectTypesByConstructor
    this.registry = registry
    this.typeChecker = typeChecker
    this.ctx = ctx
    this.limits = limits
  }

  value(name, ast) {
    const dec = this.ctx.getVariable(name)
    if (!dec) throw new EvaluationError(`Unknown variable: ${name}`, ast)

    const valueType = this.debugType(dec.value)
    if (dec.type.matches(valueType)) return dec

    throw new EvaluationError(
      `Variable '${name}' is not of type '${dec.type}', got '${valueType}'`,
      ast
    )
  }

  predicateEvaluator(functionName, ast) {
    return new PredicateEvaluator(this, functionName, ast)
  }

  debugType(v) {
    switch (typeof v) {
      case 'string':
        return this.celTypes.string
      case 'bigint':
        return this.celTypes.int
      case 'number':
        return this.celTypes.double
      case 'boolean':
        return this.celTypes.bool
      case 'object':
        if (v === null) return this.celTypes.null
        return (
          this.objectTypesByConstructor.get(v.constructor)?.type ||
          unsupportedType(v.constructor?.name || typeof v)
        )
      default:
        unsupportedType(typeof v)
    }
  }

  #firstListElement(coll) {
    if (coll instanceof Array) return coll[0]
    for (const el of coll) return el
  }

  #inferListType(list, fb) {
    const firstValue = this.#firstListElement(list)
    if (firstValue === undefined) return fb

    const elementType = this.debugRuntimeType(firstValue, fb.valueType)
    if (elementType === fb.valueType) return fb
    return this.registry.getType(`list<${elementType.name}>`)
  }

  #firstMapElement(coll) {
    if (coll instanceof Map) return coll.entries().next().value
    for (const key in coll) return [key, coll[key]]
  }

  #inferMapType(value, fb) {
    const entry = this.#firstMapElement(value)
    if (!entry) return fb

    const keyType = this.debugRuntimeType(entry[0], fb.keyType)
    const valueType = this.debugRuntimeType(entry[1], fb.valueType)
    if (keyType === fb.keyType && valueType === fb.valueType) return fb
    return this.registry.getType(`map<${keyType.name}, ${valueType.name}>`)
  }

  debugRuntimeType(value, checkedType) {
    if (checkedType?.hasNoDynTypes()) return checkedType

    const runtimeType = this.debugType(value)
    switch (runtimeType.kind) {
      case 'primitive':
        return runtimeType
      case 'message':
        return runtimeType
      case 'list':
        return this.#inferListType(value, runtimeType)
      case 'map':
        return this.#inferMapType(value, runtimeType)
    }
  }

  eval(ast) {
    const handler = this.handlers.get(ast[0])
    if (handler) return handler(ast, this)
    throw new EvaluationError(`Unknown operation: ${ast[0]}`, ast)
  }
}

class PredicateEvaluator extends Evaluator {
  constructor(e, functionName, ast) {
    super(e, e.typeChecker)

    const [identifier, predicate] = ast[3]
    if (identifier?.[0] !== 'id') {
      throw new EvaluationError(`${functionName} invalid predicate iteration variable`, ast)
    }

    this.ast = ast
    this.functionName = functionName
    this.predicateVariable = identifier[1]
    this.predicateExpression = predicate

    const receiverType = ast[2].checkedType || this.celTypes.dyn
    let predicateType = this.celTypes.dyn
    if (receiverType.type === 'list') predicateType = receiverType.valueType
    if (receiverType.type === 'map') predicateType = receiverType.keyType

    this.ctx = this.ctx.createOverlay(this.predicateVariable, predicateType)
    this.typeChecker.check(predicate)
  }

  getIterableItems(collection) {
    if (Array.isArray(collection)) return collection
    if (collection instanceof Set) return [...collection]
    if (collection instanceof Map) return [...collection.keys()]
    if (typeof collection === 'object') return Object.keys(collection)
    throw new EvaluationError(
      `${this.functionName} cannot iterate over non-collection type. argument must be a list, map, or object`,
      this.ast
    )
  }

  childEvaluateBool(item) {
    this.ctx.setVariableValue(item)
    const result = this.eval(this.predicateExpression)
    if (result === true) return true
    if (result === false) return false
    throw predicateReturnError(this, result, this.predicateExpression, this.functionName)
  }

  childEvaluate(item) {
    this.ctx.setVariableValue(item)
    return this.eval(this.predicateExpression)
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

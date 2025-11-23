import {TYPES, celTypes, createRegistry, RootContext} from './registry.js'
import {EvaluationError} from './errors.js'
import {registerFunctions, Duration, UnsignedInt} from './functions.js'
import {registerMacros} from './macros.js'
import {registerOverloads} from './overloads.js'
import {TypeChecker} from './type-checker.js'
import {Parser} from './parser.js'
import {createOptions} from './options.js'

const globalRegistry = createRegistry()
registerOverloads(globalRegistry)
registerFunctions(globalRegistry)
registerMacros(globalRegistry)

const handlers = new Map(
  Object.entries({
    value(ast) {
      return ast[1]
    },
    id(ast, ev, ctx) {
      const name = ast[1]
      const type = ctx.getType(name)
      const value = type ? ctx.getValue(name) : undefined
      if (value === undefined) throw new EvaluationError(`Unknown variable: ${name}`, ast)

      const valueType = ev.debugType(value)
      if (type.matches(valueType)) return value
      throw new EvaluationError(
        `Variable '${name}' is not of type '${type}', got '${valueType}'`,
        ast
      )
    },
    '||'(ast, ev, ctx) {
      try {
        const left = ev.eval(ast[1], ctx)
        if (left === true) return true
        if (left !== false) throw logicalOperandError(ev, left, ast[1])
      } catch (err) {
        if (
          err.message.includes('Unknown variable') ||
          err.message.includes('Logical operator requires bool operands')
        ) {
          throw err
        }

        const right = ev.eval(ast[2], ctx)
        if (right === true) return true
        if (right === false) throw err
        throw logicalOperandError(ev, right, ast[2])
      }

      const right = ev.eval(ast[2], ctx)
      if (typeof right === 'boolean') return right
      throw logicalOperandError(ev, right, ast[2])
    },
    '&&'(ast, ev, ctx) {
      try {
        const left = ev.eval(ast[1], ctx)
        if (left === false) return false
        if (left !== true) throw logicalOperandError(ev, left, ast[1])
      } catch (err) {
        if (
          err.message.includes('Unknown variable') ||
          err.message.includes('Logical operator requires bool operands')
        ) {
          throw err
        }

        const right = ev.eval(ast[2], ctx)
        if (right === false) return false
        if (right === true) throw err
        throw logicalOperandError(ev, right, ast[2])
      }

      const right = ev.eval(ast[2], ctx)
      if (typeof right === 'boolean') return right
      throw logicalOperandError(ev, right, ast[2])
    },
    '.'(ast, ev, ctx) {
      const left = ev.eval(ast[1], ctx)
      return ev.debugType(left).field(left, ast[2], ast, ev)
    },
    '[]'(ast, ev, ctx) {
      const left = ev.eval(ast[1], ctx)
      return ev.debugType(left).field(left, ev.eval(ast[2], ctx), ast, ev)
    },
    rcall(ast, ev, ctx) {
      if (ast.macro) return ast.macro.evaluate(ev, ast.macro, ctx)
      const [, functionName, receiverAst, argAst] = ast
      const receiver = ev.eval(receiverAst, ctx)
      const checkedType = receiverAst.checkedType || ev.celTypes.dyn
      const argLen = argAst.length
      const functionCandidates = (ast.functionCandidates ??= ev.registry.getFunctionCandidates(
        checkedType,
        functionName,
        argLen
      ))

      const receiverType = ev.debugRuntimeType(receiver, checkedType)
      if (!functionCandidates.exists) {
        throw new EvaluationError(
          `Function not found: '${functionName}' for receiver of type '${receiverType}'`,
          ast
        )
      }

      const byReceiver = functionCandidates.filterByReceiverType(receiverType)
      const args = (ast.argValues ??= new Array(argLen))
      const argTypes = (ast.argTypes ??= new Array(argLen))
      for (let i = 0; i < argLen; i++) {
        const arg = argAst[i]
        argTypes[i] = ev.debugRuntimeType((args[i] = ev.eval(arg, ctx)), arg.checkedType)
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
        return decl.handler.call(ev, receiver, ...args)
      } catch (err) {
        if (err instanceof EvaluationError) throw err.withAst(ast)
        throw err
      }
    },
    call(ast, ev, ctx) {
      if (ast.macro) return ast.macro.evaluate(ev, ast.macro, ctx)
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
      const args = (ast.argValues ??= new Array(argLen))
      const argTypes = (ast.argTypes ??= new Array(argLen))
      for (let i = 0; i < argLen; i++) {
        const arg = argAst[i]
        argTypes[i] = ev.debugRuntimeType((args[i] = ev.eval(arg, ctx)), arg.checkedType)
      }

      const decl = byReceiver.findMatch(argTypes)
      if (!decl) {
        throw new EvaluationError(
          `found no matching overload for '${functionName}(${argTypes.join(', ')})'`,
          ast
        )
      }

      try {
        return decl.handler.apply(ev, args)
      } catch (err) {
        if (err instanceof EvaluationError) throw err.withAst(ast)
        throw err
      }
    },
    list(ast, ev, ctx) {
      const elements = ast[1]
      const result = new Array(elements.length)
      for (let i = 0; i < elements.length; i++) result[i] = ev.eval(elements[i], ctx)
      return result
    },
    map(ast, ev, ctx) {
      const result = {}
      const props = ast[1]
      for (let i = 0; i < props.length; i++) {
        const [k, v] = props[i]
        const key = ev.eval(k, ctx)
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
        result[key] = ev.eval(v, ctx)
      }
      return result
    },
    '?:'(ast, ev, ctx) {
      const condition = ev.eval(ast[1], ctx)
      if (condition === true) return ev.eval(ast[2], ctx)
      if (condition === false) return ev.eval(ast[3], ctx)
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

function unaryOverload(ast, ev, ctx) {
  const left = ev.eval(ast[1], ctx)
  const leftType = ev.debugRuntimeType(left, ast[1].checkedType)
  const overload = ev.registry.findUnaryOverload(ast[0], leftType)
  if (overload) return overload.handler(left)
  throw new EvaluationError(`no such overload: ${ast[0][0]}${leftType}`, ast)
}

function binaryOverload(ast, ev, ctx) {
  const left = ev.eval(ast[1], ctx)
  const right = ev.eval(ast[2], ctx)
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

const registryByEnvironment = new WeakMap()
const globalValues = new Map(Object.entries(TYPES))

class Environment {
  #registry
  #evaluator
  #typeChecker
  #evalTypeChecker
  #rootContext
  #parser

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

    this.#rootContext = new RootContext(this.#registry.variables, globalValues)
    this.#typeChecker = new TypeChecker(childOpts)
    this.#evalTypeChecker = new TypeChecker(childOpts, true)
    this.#evaluator = new Evaluator(childOpts)
    this.#parser = new Parser(this.opts.limits, this.#registry)
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
      const typeDecl = this.#typeChecker.check(this.#parser.parse(expression), this.#rootContext)
      return {valid: true, type: this.#formatTypeForCheck(typeDecl)}
    } catch (e) {
      return {valid: false, error: e}
    }
  }

  #checkAST(ast) {
    try {
      const typeDecl = this.#typeChecker.check(ast, this.#rootContext)
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
    const ctx = this.#rootContext.setPrimaryContext(context)
    this.#evalTypeChecker.check(ast, ctx)
    return this.#evaluator.eval(ast, ctx)
  }
}

function unsupportedType(type) {
  throw new EvaluationError(`Unsupported type: ${type}`)
}

class Evaluator {
  handlers = handlers
  celTypes = celTypes
  constructor(opts) {
    this.objectTypes = opts.objectTypes
    this.objectTypesByConstructor = opts.objectTypesByConstructor
    this.registry = opts.registry
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

  eval(ast, ctx) {
    const handler = this.handlers.get(ast[0])
    if (handler) return handler(ast, this, ctx)
    throw new EvaluationError(`Unknown operation: ${ast[0]}`, ast)
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

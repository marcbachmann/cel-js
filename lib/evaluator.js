import {Type, TYPES, dynType} from './registry.js'
import {objectGet, Duration, UnsignedInt} from './functions.js'
import {EvaluationError} from './errors.js'
import {globalRegistry} from './overloads.js'
import {TypeChecker} from './type-checker.js'
import {Parser} from './parser.js'

const handlers = new Map(
  Object.entries({
    value(ast) {
      return ast[1]
    },
    id(ast, ev) {
      const key = ast[1]
      const variableDecl = ev.variables.get(key)
      if (variableDecl === undefined) throw new EvaluationError(`Unknown variable: ${key}`, ast)

      const val = ev.ctx.get(key)
      if (val === undefined) throw new EvaluationError(`Unknown variable: ${key}`, ast)

      const type = ev.debugType(val)
      if (variableDecl.matches(type)) return val

      throw new EvaluationError(
        `Variable '${key}' is not of type '${variableDecl}', got '${type}'`,
        ast
      )
    },
    '||'(ast, ev) {
      try {
        const left = ev.eval(ast[1])
        if (left === true) return true
        if (left !== false) {
          throw new EvaluationError('Left operand of || is not a boolean', ast[1])
        }
      } catch (err) {
        if (err.message.includes('Unknown variable')) throw err
        if (err.message.includes('is not a boolean')) throw err

        const right = ev.eval(ast[2])
        if (right === true) return true
        if (right === false) throw err
        throw new EvaluationError('Right operand of || is not a boolean', ast[2])
      }

      const right = ev.eval(ast[2])
      if (typeof right === 'boolean') return right
      throw new EvaluationError('Right operand of || is not a boolean', ast[2])
    },
    '&&'(ast, ev) {
      try {
        const left = ev.eval(ast[1])
        if (left === false) return false
        if (left !== true) {
          throw new EvaluationError('Left operand of && is not a boolean', ast[1])
        }
      } catch (err) {
        if (err.message.includes('Unknown variable')) throw err
        if (err.message.includes('is not a boolean')) throw err

        const right = ev.eval(ast[2])
        if (right === false) return false
        if (right === true) throw err
        throw new EvaluationError('Right operand of && is not a boolean', ast[2])
      }

      const right = ev.eval(ast[2])
      if (typeof right === 'boolean') return right
      throw new EvaluationError('Right operand of && is not a boolean', ast[2])
    },
    '.'(ast, ev) {
      const left = ev.eval(ast[1])
      const right = ast[2]
      const value = objectGet(left, right, ev.objectTypesByConstructor)
      if (value !== undefined) return value
      throw new EvaluationError(`No such key: ${right}`, ast)
    },
    '[]'(ast, ev) {
      const left = ev.eval(ast[1])
      const right = ev.eval(ast[2])
      const value = objectGet(left, right, ev.objectTypesByConstructor)
      if (value !== undefined) return value

      if (Array.isArray(left)) {
        if (!(typeof right === 'number' || typeof right === 'bigint')) {
          const rightType = ev.debugType(right)
          throw new EvaluationError(
            `No such key: ${right} (${rightType.type || rightType.name})`,
            ast
          )
        }
        if (right < 0) {
          throw new EvaluationError(`No such key: index out of bounds, index ${right} < 0`, ast)
        }
        if (right >= left.length) {
          throw new EvaluationError(
            `No such key: index out of bounds, index ${right} >= size ${left.length}`,
            ast
          )
        }
      }
      throw new EvaluationError(`No such key: ${right}`, ast)
    },
    rcall(ast, ev) {
      const functionName = ast[1]
      const receiver = ev.eval(ast[2])
      let args = ast[3]
      const functionCandidates = (ast.functionCandidates ??= ev.registry.getFunctionCandidates(
        ev.tryCheck(ast[2]) || dynType,
        functionName,
        args.length
      ))

      const receiverType = ev.debugType(receiver)
      if (!functionCandidates.exists) {
        throw new EvaluationError(
          `Function not found: '${functionName}' for value of type '${receiverType}'`,
          ast
        )
      }

      const byReceiver = functionCandidates.filterByReceiverType(receiverType)

      let argTypes
      if (byReceiver.hasMacro) {
        argTypes = ast.macroArgTypes ??= args.map(() => ev.registry.getFunctionType('ast'))
      } else {
        args = args.map(ev.eval, ev)
        argTypes = args.map(ev.debugType, ev)
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
      let args = ast[2]
      const functionCandidates = (ast.functionCandidates ??= ev.registry.getFunctionCandidates(
        null,
        functionName,
        args.length
      ))

      if (functionCandidates.exists === false) {
        throw new EvaluationError(`Function not found: '${functionName}'`, ast)
      }

      const byReceiver = functionCandidates.filterByReceiverType(null)

      let argTypes
      if (functionCandidates.hasMacro) {
        argTypes = ast.macroArgTypes ??= args.map(() => ev.registry.getFunctionType('ast'))
      } else {
        args = args.map(ev.eval, ev)
        argTypes = args.map(ev.debugType, ev)
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
        const e = props[i]
        result[ev.eval(e[0])] = ev.eval(e[1])
      }
      return result
    },
    '?:'(ast, ev) {
      const condition = ev.eval(ast[1])
      if (condition === true) return ev.eval(ast[2])
      else if (condition === false) return ev.eval(ast[3])
      throw new EvaluationError('Ternary condition must be a boolean')
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

function unaryOverload(ast, ev) {
  const left = ev.eval(ast[1])
  const leftType = ev.debugType(left)
  const overload = ev.getUnaryOverload(ast[0], leftType)
  if (overload) return overload.handler(left)
  throw new EvaluationError(`no such overload: ${ast[0][0]}${leftType}`, ast)
}

const kAstCache = Symbol('astCache')
function getDynOverload(ev, ast, leftType, rightType) {
  if (!(ev.isDynamic(ast[1]) || ev.isDynamic(ast[2]))) return

  const cache =
    (ast[kAstCache] ??= new Map()).get(leftType) ||
    ast[kAstCache].set(leftType, new Map()).get(leftType)

  const cached = cache.get(rightType)
  if (cached !== undefined) return cached

  const overload = computeDynamicOverload(ev, ast, leftType, rightType)
  cache.set(rightType, overload)
  return overload
}

function computeDynamicOverload(ev, ast, leftType, rightType) {
  const op = ev.overloads[ast[0]]
  const leftIsDyn = ev.isDynamic(ast[1])
  const rightIsDyn = ev.isDynamic(ast[2])
  const dynLeft = leftIsDyn && ev.registry.getVerifiedType(`dyn<${leftType.type}>`)
  const dynRight = rightIsDyn && ev.registry.getVerifiedType(`dyn<${rightType.type}>`)

  return (
    (dynLeft && dynRight && op.get(dynLeft)?.get(dynRight)) ||
    (dynLeft && op.get(dynLeft)?.get(rightType)) ||
    (dynRight && op.get(leftType)?.get(dynRight)) ||
    (leftIsDyn && op.get(dynType)?.get(rightType)) ||
    (rightIsDyn && op.get(leftType)?.get(dynType)) ||
    (leftIsDyn && rightIsDyn && op.get(dynType)?.get(dynType)) ||
    false
  )
}

function binaryOverload(ast, ev) {
  const left = ev.eval(ast[1])
  const right = ev.eval(ast[2])
  const leftType = ev.debugType(left)
  const rightType = ev.debugType(right)

  const overload =
    ev.overloads[ast[0]]?.get(leftType)?.get(rightType) ||
    getDynOverload(ev, ast, leftType, rightType)

  if (overload) return overload.handler(left, right, ast, ev)
  throw new EvaluationError(`no such overload: ${leftType} ${ast[0]} ${rightType}`, ast)
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

class DynVariableRegistry extends Map {
  get(name) {
    return super.get(name) || dynType
  }
}

class Context {}

class ContextOverlay extends Context {
  #primary
  #secondary
  constructor(secondary) {
    super()
    this.#secondary = secondary
  }

  setPrimaryContext(primary) {
    this.#primary = primary
    if (!primary) return (this.get = this.#getFromSecondary)
    if (typeof primary !== 'object') throw new EvaluationError('Context must be an object')

    if (primary instanceof Map) this.get = this.#getFromMap
    else this.get = this.#getFromObject
  }

  get() {
    throw new EvaluationError('Context not initialized')
  }

  #getFromSecondary(key) {
    return this.#secondary.get(key)
  }

  #getFromObject(key) {
    const v = Object.hasOwn(this.#primary, key) ? this.#primary[key] : undefined
    if (v !== undefined) return v
    return this.#secondary?.get(key)
  }

  #getFromMap(key) {
    const v = this.#primary.get(key)
    if (v !== undefined) return v
    return this.#secondary?.get(key)
  }
}

class PredicateContextOverlay extends Context {
  #parent
  #variableName
  #variableValue
  constructor(name) {
    super()
    this.#variableName = name
  }

  setContext(ctx) {
    this.#parent = ctx
  }

  setOverride(value) {
    this.#variableValue = value
  }

  get(name) {
    if (name === this.#variableName) return this.#variableValue
    return this.#parent.get(name)
  }
}

class VariablesOverlay {
  #parent
  #variableName
  #variableType
  constructor(parent, variableName, variableType) {
    this.#parent = parent
    this.#variableName = variableName
    this.#variableType = variableType
  }

  get(name) {
    if (name === this.#variableName) return this.#variableType
    return this.#parent.get(name)
  }
}

class Environment {
  #variables
  #objectTypes
  #objectTypesByConstructor
  #functions

  #registry

  #evaluator
  #typeChecker

  constructor(opts) {
    if (opts?.unlistedVariablesAreDyn) {
      this.#variables = new DynVariableRegistry()
    } else {
      this.#variables = new Map()
    }

    this.#registry = globalRegistry.clone()
    this.#objectTypes = this.#registry.objectTypes
    this.#objectTypesByConstructor = this.#registry.objectTypesByConstructor
    this.#functions = this.#registry.functions

    for (const [instance, name] of builtinObjectTypes) {
      this.#registry.registerType(name, instance, true)
    }

    const childOpts = {
      environment: this,
      variables: this.#variables,
      functions: this.#functions,
      objectTypes: this.#objectTypes,
      objectTypesByConstructor: this.#objectTypesByConstructor,
      registry: this.#registry
    }

    this.#typeChecker = childOpts.typeChecker = new TypeChecker(childOpts)
    this.#evaluator = new Evaluator(childOpts)

    Object.freeze(this)
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
    if (this.#variables.has(name)) throw new Error(`Variable already registered: ${name}`)
    this.#variables.set(name, this.#registry.getType(type))
    return this
  }

  hasVariable(name) {
    return this.#variables.has(name)
  }

  check(expression) {
    try {
      const typeDecl = this.#typeChecker.check(new Parser(expression).parse())
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
    return `${typeDecl.name}`
  }

  parse(expression) {
    const ast = new Parser(expression).parse()
    const evaluateParsed = this.#evaluateAST.bind(this, ast)
    evaluateParsed.check = this.#checkAST.bind(this, ast)
    evaluateParsed.ast = ast
    return evaluateParsed
  }

  evaluate(expression, context) {
    return this.#evaluateAST(new Parser(expression).parse(), context)
  }

  #evaluateAST(ast, context) {
    const evaluator = this.#evaluator
    evaluator.ctx.setPrimaryContext(context)
    return evaluator.eval(ast)
  }
}

function unsupportedType(type) {
  throw new EvaluationError(`Unsupported type: ${type}`)
}

class Evaluator {
  handlers = handlers
  constructor({
    environment,
    registry,
    variables,
    functions,
    objectTypes,
    objectTypesByConstructor,
    typeChecker,
    ctx
  }) {
    this.environment = environment
    this.variables = variables
    this.objectTypes = objectTypes
    this.objectTypesByConstructor = objectTypesByConstructor
    this.functions = functions
    this.registry = registry
    this.typeChecker = typeChecker
    if (ctx) return
    this.ctx = new ContextOverlay(new Map(Object.entries(TYPES)))
  }

  get overloads() {
    return this.registry.overloads
  }

  getUnaryOverload(op, left) {
    return this.registry.overloads[op]?.get(left)
  }

  getBinaryOverload(op, left, right) {
    return op?.get(left)?.get(right)
  }

  predicateEvaluator(functionName, ast) {
    return new PredicateEvaluator(this, functionName, ast)
  }

  debugType(v) {
    switch (typeof v) {
      case 'string':
        return this.registry.getVerifiedType('string')
      case 'bigint':
        return this.registry.getVerifiedType('int')
      case 'number':
        return this.registry.getVerifiedType('double')
      case 'boolean':
        return this.registry.getVerifiedType('bool')
      case 'object':
        if (v === null) return this.registry.getVerifiedType('null')
        return (
          this.objectTypesByConstructor.get(v.constructor)?.type ||
          unsupportedType(v.constructor?.name || typeof v)
        )
      default:
        unsupportedType(typeof v)
    }
  }

  tryCheck(ast) {
    try {
      return ast.checkedType || this.typeChecker.check(ast)
    } catch (_e) {}
  }

  eval(ast) {
    const handler = this.handlers.get(ast[0])
    if (handler) return handler(ast, this)
    throw new EvaluationError(`Unknown operation: ${ast[0]}`, ast)
  }

  isDynamic(ast) {
    return this.tryCheck(ast)?.kind === 'dyn'
  }
}

class PredicateEvaluator extends Evaluator {
  constructor(e, functionName, ast) {
    super(e)

    const [identifier, predicate] = ast[3]
    if (identifier?.[0] !== 'id') {
      throw new EvaluationError(`${functionName} invalid predicate iteration variable`, ast)
    }

    this.ast = ast
    this.functionName = functionName
    this.predicateVariable = identifier[1]
    this.predicateExpression = predicate

    const receiverType = ast[2].checkedType || dynType
    let predicateType = dynType
    if (receiverType.type === 'list') predicateType = receiverType.valueType
    if (receiverType.type === 'map') predicateType = receiverType.keyType

    this.variables = new VariablesOverlay(this.variables, this.predicateVariable, predicateType)
    this.ctx = new PredicateContextOverlay(this.predicateVariable)
  }

  prepare(parent, receiver) {
    this.ctx.setContext(parent.ctx)
    return this.getIterableItems(receiver)
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
    this.ctx.setOverride(item)
    switch (this.eval(this.predicateExpression)) {
      case true:
        return true
      case false:
        return false
      default:
        throw new EvaluationError(
          `${this.functionName} predicate result is not a boolean`,
          Array.isArray(this.predicateExpression) ? this.predicateExpression : this.ast
        )
    }
  }

  childEvaluate(item) {
    this.ctx.setOverride(item)
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

import {TYPES, celTypes, createRegistry} from './registry.js'
import {EvaluationError} from './errors.js'
import {registerFunctions, Duration, UnsignedInt} from './functions.js'
import {registerOverloads} from './overloads.js'
import {TypeChecker} from './type-checker.js'
import {Parser} from './parser.js'

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
      return ev.debugType(left).field(left, ast[2], ast, ev)
    },
    '[]'(ast, ev) {
      const left = ev.eval(ast[1])
      return ev.debugType(left).field(left, ev.eval(ast[2]), ast, ev)
    },
    rcall(ast, ev) {
      const functionName = ast[1]
      const receiver = ev.eval(ast[2])
      let args = ast[3]
      const functionCandidates = (ast.functionCandidates ??= ev.registry.getFunctionCandidates(
        ast[2].checkedType || ev.celTypes.dyn,
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
  const overload = ev.registry.findUnaryOverload(ast[0], leftType)
  if (overload) return overload.handler(left)
  throw new EvaluationError(`no such overload: ${ast[0][0]}${leftType}`, ast)
}

function binaryOverload(ast, ev) {
  const left = ev.eval(ast[1])
  const right = ev.eval(ast[2])
  const leftType = getOperandType(ast[1].checkedType, ev.debugType(left), ev)
  const rightType = getOperandType(ast[2].checkedType, ev.debugType(right), ev)

  const overload = ev.registry.findBinaryOverload(ast[0], leftType, rightType)
  if (overload) return overload.handler(left, right, ast, ev)
  throw new EvaluationError(`no such overload: ${leftType} ${ast[0]} ${rightType}`, ast)
}

function getOperandType(checkedType, runtimeType, ev) {
  if (!checkedType) return runtimeType
  if (checkedType.kind !== 'dyn') return checkedType
  return ev.registry.getDynType(runtimeType)
}

class Context {
  createOverlay(name, type) {
    return new OverlayContext({
      parent: this,
      variableName: name,
      variableType: type
    })
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
  constructor({variables, fallbackValues}) {
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
  constructor({parent, variableName, variableType}) {
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
  #variables
  #registry
  #evaluator
  #typeChecker
  #opts

  constructor(opts) {
    this.#opts = opts

    this.#registry = (
      opts?.inherit instanceof Environment
        ? registryByEnvironment.get(opts.inherit)
        : globalRegistry
    ).clone({
      unlistedVariablesAreDyn: opts?.unlistedVariablesAreDyn ?? false
    })

    this.#variables = this.#registry.variables

    const childOpts = {
      registry: this.#registry,
      variables: this.#variables,
      objectTypes: this.#registry.objectTypes,
      objectTypesByConstructor: this.#registry.objectTypesByConstructor,
      ctx: new RootContext({
        variables: this.#variables,
        fallbackValues: globalValues
      })
    }

    this.#typeChecker = new TypeChecker(childOpts)
    this.#evaluator = new Evaluator({...childOpts, typeChecker: this.#typeChecker})
    registryByEnvironment.set(this, this.#registry)
    Object.freeze(this)
  }

  clone(opts) {
    return new Environment({
      inherit: this,
      unlistedVariablesAreDyn: this.#opts?.unlistedVariablesAreDyn ?? false
    })
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

  #evaluateAST(ast, context = null) {
    const evaluator = this.#evaluator
    evaluator.ctx.setPrimaryContext(context)
    evaluator.tryCheck(ast)
    return evaluator.eval(ast)
  }
}

function unsupportedType(type) {
  throw new EvaluationError(`Unsupported type: ${type}`)
}

class Evaluator {
  handlers = handlers
  celTypes = celTypes
  constructor({registry, objectTypes, objectTypesByConstructor, typeChecker, ctx}) {
    this.objectTypes = objectTypes
    this.objectTypesByConstructor = objectTypesByConstructor
    this.registry = registry
    this.typeChecker = typeChecker
    this.ctx = ctx
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

    const receiverType = ast[2].checkedType || this.celTypes.dyn
    let predicateType = this.celTypes.dyn
    if (receiverType.type === 'list') predicateType = receiverType.valueType
    if (receiverType.type === 'map') predicateType = receiverType.keyType

    this.ctx = this.ctx.createOverlay(this.predicateVariable, predicateType)
    this.tryCheck(predicate)
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

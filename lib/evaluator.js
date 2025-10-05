import {objectGet, TYPES, Type, Duration, UnsignedInt} from './functions.js'
import {EvaluationError, ParseError, TypeError} from './errors.js'
import {globalRegistry} from './overloads.js'
import {TypeChecker} from './type-checker.js'
import {Parser} from './parser.js'

function firstNode(a, b) {
  return Array.isArray(a) ? a : b
}

const handlers = new Map(
  Object.entries({
    id(ast, s) {
      const key = ast[1]
      const expectedType = s.variables.get(key)
      if (expectedType === undefined) throw new EvaluationError(`Unknown variable: ${key}`, ast)

      const val = s.ctx.get(key)
      if (val === undefined) throw new EvaluationError(`Unknown variable: ${key}`, ast)

      const type = s.debugType(val)
      if (expectedType === type || expectedType === 'dyn') return val

      throw new EvaluationError(
        `Variable '${key}' is not of type '${expectedType}', got '${type}'`,
        ast
      )
    },
    '||'(ast, s) {
      try {
        const left = s.eval(ast[1])
        if (left === true) return true
        if (left !== false) {
          throw new EvaluationError('Left operand of || is not a boolean', firstNode(ast[1], ast))
        }
      } catch (err) {
        if (err.message.includes('Unknown variable')) throw err
        if (err.message.includes('is not a boolean')) throw err

        const right = s.eval(ast[2])
        if (right === true) return true
        if (right === false) throw err
        throw new EvaluationError('Right operand of || is not a boolean', firstNode(ast[2], ast))
      }

      const right = s.eval(ast[2])
      if (typeof right === 'boolean') return right
      throw new EvaluationError('Right operand of || is not a boolean', firstNode(ast[2], ast))
    },
    '&&'(ast, s) {
      try {
        const left = s.eval(ast[1])
        if (left === false) return false
        if (left !== true) {
          throw new EvaluationError('Left operand of && is not a boolean', firstNode(ast[1], ast))
        }
      } catch (err) {
        if (err.message.includes('Unknown variable')) throw err
        if (err.message.includes('is not a boolean')) throw err

        const right = s.eval(ast[2])
        if (right === false) return false
        if (right === true) throw err
        throw new EvaluationError('Right operand of && is not a boolean', firstNode(ast[2], ast))
      }

      const right = s.eval(ast[2])
      if (typeof right === 'boolean') return right
      throw new EvaluationError('Right operand of && is not a boolean', firstNode(ast[2], ast))
    },
    '[]'(ast, s) {
      const left = s.eval(ast[1])
      const right = s.eval(ast[2])
      const value = objectGet(left, right)
      if (value !== undefined) return value

      if (Array.isArray(left)) {
        if (!(typeof right === 'number' || typeof right === 'bigint')) {
          throw new EvaluationError(`No such key: ${right} (${s.debugType(right)})`, ast)
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
    rcall(ast, s) {
      const functionName = ast[1]
      const receiver = s.eval(ast[2])
      const receiverType = s.debugType(receiver)
      let fn = s.getFunction(functionName, receiverType)
      if (!fn) {
        throw new EvaluationError(
          `Function not found: '${functionName}' for value of type '${receiverType}'`,
          ast
        )
      }

      let args
      let argTypes
      if (fn.macro) {
        argTypes = ast[3].map(() => 'ast')
        fn = resolveFunction(fn, argTypes)
      } else {
        args = ast[3].map((arg) => s.eval(arg))
        argTypes = args.map((arg) => s.debugType(arg))
        fn = resolveFunction(fn, argTypes)
      }

      if (!fn?.handler) {
        throw new EvaluationError(
          `found no matching overload for '${receiverType}.${functionName}(${argTypes.join(
            ', '
          )})'`,
          ast
        )
      }

      try {
        if (fn.macro) return fn.handler.call(s, receiver, ast)
        return fn.handler.call(s, receiver, ...args)
      } catch (err) {
        if (err instanceof EvaluationError) throw err.withAst(ast)
        throw err
      }
    },
    call(ast, s) {
      const functionName = ast[1]
      let fn = s.getFunction(functionName)
      if (!fn) throw new EvaluationError(`Function not found: '${functionName}'`, ast)

      let args
      let argTypes
      if (fn.macro) {
        argTypes = ast[2].map(() => 'ast')
        fn = resolveFunction(fn, argTypes)
      } else {
        args = ast[2].map((arg) => s.eval(arg))
        argTypes = args.map((arg) => s.debugType(arg))
        fn = resolveFunction(fn, argTypes)
      }
      if (!fn?.handler) {
        throw new EvaluationError(
          `found no matching overload for '${functionName}(${argTypes.join(', ')})'`,
          ast
        )
      }

      try {
        if (fn.macro) return fn.handler.call(s, ast)
        return fn.handler.apply(s, args)
      } catch (err) {
        if (err instanceof EvaluationError) throw err.withAst(ast)
        throw err
      }
    },
    list(ast, s) {
      const elements = ast[1]
      const result = new Array(elements.length)
      for (let i = 0; i < elements.length; i++) result[i] = s.eval(elements[i])
      return result
    },
    map(ast, s) {
      const result = {}
      const props = ast[1]
      for (let i = 0; i < props.length; i++) {
        const e = props[i]
        result[s.eval(e[0])] = s.eval(e[1])
      }
      return result
    },
    '?:'(ast, s) {
      const condition = s.eval(ast[1])
      if (typeof condition !== 'boolean') {
        throw new EvaluationError('Ternary condition must be a boolean')
      }
      return condition ? s.eval(ast[2]) : s.eval(ast[3])
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

// handler aliases
handlers.set('.', handlers.get('[]'))

function unaryOverload(ast, s) {
  const left = s.eval(ast[1])
  const leftType = s.debugType(left)
  const overload = s.overloads[ast[0]]?.[leftType]
  if (overload) return overload.handler(left)
  throw new EvaluationError(`no such overload: ${ast[0][0]}${leftType}`, ast)
}

const kAstCache = Symbol('astCache')
function getOverload(s, ast, leftType, rightType) {
  const cache = ((ast[kAstCache] ??= {})[leftType] ??= {})

  const cached = cache[rightType]
  if (cached !== undefined) return cached

  const overload = computeDynamicOverload(s, ast, leftType, rightType)
  cache[rightType] = overload
  return overload
}

function computeDynamicOverload(s, ast, leftType, rightType) {
  const op = s.overloads[ast[0]]
  const leftDynamic = s.isDynamic(ast[1])
  const rightDynamic = s.isDynamic(ast[2])
  if (!leftDynamic && !rightDynamic) return false

  return (
    (leftDynamic && rightDynamic && op[`dyn<${leftType}>`]?.[`dyn<${rightType}>`]) ||
    (leftDynamic && op[`dyn<${leftType}>`]?.[rightType]) ||
    (rightDynamic && op[leftType]?.[`dyn<${rightType}>`]) ||
    (leftDynamic && op['dyn']?.[rightType]) ||
    (rightDynamic && op[leftType]?.['dyn']) ||
    (leftDynamic && rightDynamic && op['dyn']?.['dyn']) ||
    false
  )
}

function binaryOverload(ast, s) {
  const left = s.eval(ast[1])
  const right = s.eval(ast[2])
  const leftType = s.debugType(left)
  const rightType = s.debugType(right)
  const overload =
    s.overloads[ast[0]][leftType]?.[rightType] || getOverload(s, ast, leftType, rightType)

  if (overload) return overload.handler(left, right, ast, s)
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
    return super.get(name) || 'dyn'
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
  constructor(parent, name) {
    this.#parent = parent
    this.#variableName = name
  }

  get(name) {
    if (name === this.#variableName) return 'dyn'
    return this.#parent.get(name)
  }
}

class Environment {
  #variables
  #objectTypes
  #objectTypesByConstructor
  #overloads
  #functions
  #legacyFunctions

  #registry

  #evaluator
  #typeChecker

  constructor(opts) {
    if (opts?.supportLegacyFunctions) {
      this.getFunction = this.#getFunctionWithLegacyFunctions
      this.evaluate = this.#evaluateWithLegacyFunctions
    }

    if (opts?.unlistedVariablesAreDyn) {
      this.#variables = new DynVariableRegistry()
    } else {
      this.#variables = new Map()
    }

    this.#registry = globalRegistry.clone()
    this.#overloads = this.#registry.overloads
    this.#objectTypes = this.#registry.objectTypes
    this.#objectTypesByConstructor = this.#registry.objectTypesByConstructor
    this.#functions = this.#registry.functions

    for (const [instance, name] of builtinObjectTypes) this.registerType(name, instance)

    const childOpts = {
      environment: this,
      variables: this.#variables,
      overloads: this.#overloads,
      functions: this.#functions,
      objectTypes: this.#objectTypes,
      objectTypesByConstructor: this.#objectTypesByConstructor
    }

    this.#evaluator = new Evaluator(childOpts)
    this.#typeChecker = new TypeChecker(childOpts)

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

  #getFunctionWithLegacyFunctions(name, type) {
    if (this.#legacyFunctions) {
      const fn = type ? this.#legacyFunctions[type]?.name : this.#legacyFunctions[name]
      if (typeof fn === 'function') return {unknownargs: true, handler: fn}
    }

    return type ? this.#functions[type]?.[name] : this.#functions.standalone[name]
  }

  getFunction(name, type) {
    if (!type) return this.#functions.standalone[name]
    return this.#functions[type]?.[name]
  }

  registerType(typename, constructor) {
    this.#objectTypes.set(typename, constructor)
    this.#objectTypesByConstructor.set(constructor, typename)
    return this
  }

  registerVariable(name, type) {
    if (this.#variables.has(name)) throw new Error(`Variable already registered: ${name}`)
    this.#variables.set(name, type)
    return this
  }

  hasVariable(name) {
    return this.#variables.has(name)
  }

  parse(expression) {
    const ast = new Parser(expression).parse()
    const evaluateParsed = this.#evaluateAST.bind(this, ast)
    evaluateParsed.check = this.#checkAST.bind(this, ast)
    evaluateParsed.ast = ast
    return evaluateParsed
  }

  check(expression) {
    try {
      return {valid: true, type: this.#typeChecker.check(new Parser(expression).parse())}
    } catch (e) {
      return {valid: false, error: e}
    }
  }

  #checkAST(ast) {
    try {
      return {valid: true, type: this.#typeChecker.check(ast)}
    } catch (e) {
      return {valid: false, error: e}
    }
  }

  #evaluateWithLegacyFunctions(expression, context, legacyFunctions) {
    this.#legacyFunctions = legacyFunctions
    return this.#evaluateAST(new Parser(expression).parse(), context)
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
  constructor({environment, variables, overloads, functions, objectTypesByConstructor, ctx}) {
    this.environment = environment
    this.variables = variables
    this.overloads = overloads
    this.objectTypesByConstructor = objectTypesByConstructor
    this.functions = functions
    if (ctx) return
    this.ctx = new ContextOverlay(new Map(Object.entries(TYPES)))
  }

  getFunction(name, type) {
    return this.environment.getFunction(name, type)
  }

  predicateEvaluator(functionName, ast) {
    return new PredicateEvaluator(this, functionName, ast)
  }

  debugType(v) {
    switch (typeof v) {
      case 'string':
        return 'string'
      case 'bigint':
        return 'int'
      case 'number':
        return 'double'
      case 'boolean':
        return 'bool'
      case 'object':
        if (v === null) return 'null'
        return (
          this.objectTypesByConstructor.get(v.constructor) ||
          unsupportedType(v.constructor?.name || typeof v)
        )
      default:
        unsupportedType(typeof v)
    }
  }

  eval(ast) {
    if (!Array.isArray(ast)) return ast

    const handler = this.handlers.get(ast[0])
    if (handler) return handler(ast, this)
    throw new EvaluationError(`Unknown operation: ${ast[0]}`, ast)
  }

  // Check if an AST node contains any variable references (making it dynamic)
  isDynamic(ast) {
    if (!Array.isArray(ast)) return false

    switch (ast[0]) {
      case 'id':
        return true
      case '.':
      case '[]':
        return this.isDynamic(ast[1])
      case '+':
      case '-':
      case '-_':
        return false
      case '?:':
        return this.isDynamic(ast[2]) || this.isDynamic(ast[3])
      case 'rcall':
      case 'call': {
        const functionName = ast[1]
        if (functionName === 'dyn') return true

        switch (this.functions.returnTypes[functionName]) {
          case undefined: {
            for (let i = 1; i < ast.length; i++) {
              if (this.isDynamic(ast[i])) return true
            }
            return false
          }
          case 'list':
          case 'map':
            return this.isDynamic(ast[2])
          default:
            return false
        }
      }
      case 'list': {
        const elements = ast[1]
        for (let i = 0; i < elements.length; i++) {
          if (this.isDynamic(elements[i])) return true
        }
        return false
      }
      case 'map': {
        const props = ast[1]
        for (let i = 0; i < props.length; i++) {
          const p = props[i]
          if (this.isDynamic(p[0]) || this.isDynamic(p[1])) return true
        }
        return false
      }
      default:
        return false
    }
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
    this.variables = new VariablesOverlay(this.variables, this.predicateVariable)
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

function resolveFunction(fn, argTypes) {
  if (fn.unknownargs) return fn

  switch (argTypes.length) {
    case 0:
      return fn
    case 1:
      return fn[argTypes[0]]
    case 2:
      return fn[argTypes[0]]?.[argTypes[1]]
    case 3:
      return fn[argTypes[0]]?.[argTypes[1]]?.[argTypes[2]]
  }
}

const globalEnvironment = new Environment({
  supportLegacyFunctions: true,
  unlistedVariablesAreDyn: true
})

export function parse(expression) {
  return globalEnvironment.parse(expression)
}

export function evaluate(expression, context, functions) {
  return globalEnvironment.evaluate(expression, context, functions)
}

export {ParseError, EvaluationError, TypeError, Duration, UnsignedInt, Environment}

export default {
  parse,
  evaluate,
  Environment,
  ParseError,
  EvaluationError,
  TypeError,
  Duration,
  UnsignedInt
}

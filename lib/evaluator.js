import overloads from './overloads.js'
import Parser from './parser.js'
import {allFunctions, objectGet, TYPES, debugType, Duration, UnsignedInt} from './functions.js'
import {EvaluationError, ParseError} from './errors.js'

function firstNode(a, b) {
  return Array.isArray(a) ? a : b
}

const handlers = new Map(
  Object.entries({
    id(ast, s) {
      const val = objectGet(s.ctx, ast[1])
      if (val === undefined) throw new EvaluationError(`Unknown variable: ${ast[1]}`, ast)
      return val
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
          throw new EvaluationError(`No such key: ${right} (${debugType(right)})`, ast)
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
      const receiverType = debugType(receiver)
      let fn = s.fns.get(functionName, receiverType)
      if (!fn) {
        throw new EvaluationError(
          `Function not found: '${functionName}' for value of type '${receiverType}'`,
          ast
        )
      }

      if (fn.macro) {
        if (fn.argCount !== ast[3].length) {
          throw new EvaluationError(
            `found no matching overload for '${receiverType}.${functionName}(${ast[3]
              .map(() => 'ast')
              .join(', ')})'`,
            ast
          )
        }

        return fn.handler.call(s, receiver, ...ast[3])
      }

      try {
        const args = ast[3].map((arg) => s.eval(arg))
        fn = resolveFunction(fn, args)
        if (!fn?.handler) {
          throw new EvaluationError(
            `found no matching overload for '${receiverType}.${functionName}(${args
              .map(debugType)
              .join(', ')})'`,
            ast
          )
        }

        return fn.handler(receiver, ...args)
      } catch (err) {
        if (err instanceof EvaluationError) throw err.withAst(ast)
        throw new EvaluationError(err.message, ast, err)
      }
    },
    call(ast, s) {
      const functionName = ast[1]
      let fn = s.fns.get(functionName)
      if (!fn || fn.standalone === false) {
        throw new EvaluationError(`Function not found: '${functionName}'`, ast)
      }

      if (fn.macro) {
        if (fn.argCount !== ast[2].length) {
          throw new EvaluationError(
            `found no matching overload for '${functionName}(${ast[2]
              .map(() => 'ast')
              .join(', ')})'`,
            ast
          )
        }

        return fn.handler.call(s, ...ast[2])
      }

      try {
        const args = ast[2].map((arg) => s.eval(arg))
        fn = resolveFunction(fn, args)
        if (!fn?.handler || fn.standalone === false) {
          throw new EvaluationError(
            `found no matching overload for '${functionName}(${args.map(debugType).join(', ')})'`,
            ast
          )
        }

        return fn.handler.apply(fn.handler, args)
      } catch (err) {
        if (err instanceof EvaluationError) throw err.withAst(ast)
        throw new EvaluationError(err.message, ast, err)
      }
    },
    array(ast, s) {
      const elements = ast[1]
      const result = new Array(elements.length)
      for (let i = 0; i < elements.length; i++) result[i] = s.eval(elements[i])
      return result
    },
    object(ast, s) {
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
    '!=': anyOverload,
    '==': anyOverload,
    in: anyOverload,
    '+': anyOverload,
    '-': anyOverload,
    '*': anyOverload,
    '/': anyOverload,
    '%': anyOverload,
    '<': anyOverload,
    '<=': anyOverload,
    '>': anyOverload,
    '>=': anyOverload
  })
)

// handler aliases
handlers.set('.', handlers.get('[]'))

function unaryOverload(ast, s) {
  const left = s.eval(ast[1])
  const leftType = debugType(left)
  const overload = overloads[ast[0]]?.[leftType]
  if (!overload) throw new EvaluationError(`no such overload: ${ast[0][0]}${leftType}`, ast)
  return overload(left)
}

const kAstCache = Symbol('astCache')
function getOverload(s, ast, leftType, rightType) {
  const cache =
    (ast[kAstCache] ??= new Map()).get(leftType) || ast[kAstCache].set(leftType, {}).get(leftType)

  const cached = cache[rightType]
  if (cached !== undefined) return cached

  const overload = computeDynamicOverload(s, ast, leftType, rightType)
  cache[rightType] = overload
  return overload
}

function computeDynamicOverload(s, ast, leftType, rightType) {
  const op = overloads[ast[0]]
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

function anyOverload(ast, s) {
  const left = s.eval(ast[1])
  const right = s.eval(ast[2])
  const leftType = debugType(left)
  const rightType = debugType(right)
  const overload =
    overloads[ast[0]][leftType]?.[rightType] || getOverload(s, ast, leftType, rightType)
  if (overload) return overload(left, right, ast, s)

  throw new EvaluationError(`no such overload: ${leftType} ${ast[0]} ${rightType}`, ast)
}

class Evaluator {
  handlers = handlers
  predicateEvaluator(receiver, functionName, identifier, predicate) {
    return new PredicateEvaluator(this, receiver, functionName, identifier, predicate)
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

        switch (allFunctions.returnTypes[functionName]) {
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
      case 'array': {
        const elements = ast[1]
        for (let i = 0; i < elements.length; i++) {
          if (this.isDynamic(elements[i])) return true
        }
        return false
      }
      case 'object': {
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

class InstanceFunctions {
  constructor(fns) {
    const normalized = Object.create(null)
    normalized.standalone = Object.create(null)

    for (const key in fns) {
      const fn = fns[key]
      if (typeof fn === 'function') {
        normalized.standalone[key] = {
          standalone: true,
          unknownargs: true,
          handler: fn
        }
      } else if (typeof fn === 'object') {
        const namespace = (normalized[key] ??= Object.create(null))

        for (const functionName in fn) {
          namespace[functionName] = {
            standalone: false,
            unknownargs: true,
            handler: fn[functionName]
          }
        }
      }
    }

    this.instanceFunctions = normalized
  }

  get(name, type) {
    if (!type) return this.instanceFunctions.standalone[name] || allFunctions.standalone[name]
    return this.instanceFunctions[type]?.[name] || allFunctions[type]?.[name]
  }
}

class PredicateEvaluator extends Evaluator {
  constructor(parent, receiver, functionName, identifier, predicate) {
    if (identifier?.[0] !== 'id') {
      throw new EvaluationError(
        `${functionName}(var, predicate) invalid predicate iteration variable`,
        identifier
      )
    }

    super()
    this.ctx = {...parent.ctx}
    this.fns = parent.fns
    this.functionName = functionName
    this.predicateVariable = identifier[1]
    this.predicateExpression = predicate
    this.items = this.getIterableItems(functionName, receiver)
  }

  getIterableItems(functionName, collection) {
    if (Array.isArray(collection)) return collection
    if (collection instanceof Set) return [...collection]
    if (collection instanceof Map) return [...collection.keys()]
    if (typeof collection === 'object' && collection !== null) return Object.keys(collection)
    throw new EvaluationError(
      `${functionName}() cannot iterate over non-collection type. argument must be a list, map, or object`
    )
  }

  childEvaluateBool(item) {
    const bool = this.childEvaluate(item)
    if (typeof bool === 'boolean') return bool
    throw new EvaluationError(
      `${this.functionName}() predicate result is not a boolean`,
      this.predicateExpression
    )
  }

  childEvaluate(item) {
    this.ctx[this.predicateVariable] = item
    return this.eval(this.predicateExpression)
  }
}

function resolveFunction(fn, args) {
  if (fn.unknownargs) return fn

  let resolved = fn
  for (const arg of args) {
    resolved = resolved?.[debugType(arg)]
    if (!resolved) return null
  }
  return resolved
}

const globalEvaluator = new Evaluator()
const globalInstanceFunctions = new InstanceFunctions({})

function evaluateAST(ast, context, instanceFunctions) {
  if (context !== undefined && typeof context !== 'object')
    throw new EvaluationError('Context must be an object')

  const evaluator = globalEvaluator
  evaluator.ctx = context ? {...context, ...TYPES} : TYPES
  evaluator.fns = instanceFunctions
    ? new InstanceFunctions(instanceFunctions)
    : globalInstanceFunctions

  return evaluator.eval(ast)
}

export function parse(expression) {
  const ast = new Parser(expression).parse()
  const evaluateParsed = (context, functions) => evaluateAST(ast, context, functions)
  evaluateParsed.ast = ast
  return evaluateParsed
}

export function evaluate(expression, context, functions) {
  const ast = new Parser(expression).parse()
  return evaluateAST(ast, context, functions)
}

export {ParseError, EvaluationError, Duration, UnsignedInt}

export default {
  parse,
  evaluate,
  ParseError,
  EvaluationError,
  Duration,
  UnsignedInt
}

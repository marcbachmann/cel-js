import {celTypes} from './registry.js'
import {objKeys, isArray} from './globals.js'

export class Base {
  dynType = celTypes.dyn
  optionalType = celTypes.optional
  stringType = celTypes.string
  intType = celTypes.int
  doubleType = celTypes.double
  boolType = celTypes.bool
  nullType = celTypes.null
  listType = celTypes.list
  mapType = celTypes.map

  constructor(opts) {
    this.opts = opts.opts
    this.objectTypes = opts.objectTypes
    this.objectTypesByConstructor = opts.objectTypesByConstructor
    this.registry = opts.registry
  }

  /**
   * Get a TypeDeclaration instance for a type name
   * @param {string} typeName - The type name (e.g., 'string', 'int', 'dyn')
   * @returns {TypeDeclaration} The type declaration instance
   */
  getType(typeName) {
    return this.registry.getType(typeName)
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
        switch (v.constructor) {
          case undefined:
          case Object:
          case Map:
            return this.mapType
          case Array:
          case Set:
            return this.listType
          default:
            return (
              this.objectTypesByConstructor.get(v.constructor)?.type ||
              unsupportedType(this, v.constructor?.name || typeof v)
            )
        }
      default:
        unsupportedType(this, typeof v)
    }
  }
}

function unsupportedType(self, type) {
  throw new self.Error(`Unsupported type: ${type}`)
}

function twoProm(ev, ast, a, b, fn) {
  if (!(a instanceof Promise)) return b.then((r) => fn(ev, ast, a, r))
  if (!(b instanceof Promise)) return a.then((l) => fn(ev, ast, l, b))
  return Promise.all([a, b]).then((r) => fn(ev, ast, r[0], r[1]))
}

function checkAccessNode(chk, ast, ctx) {
  const leftType = chk.check(ast.args[0], ctx)
  if (ast.op === '[]') chk.check(ast.args[1], ctx)
  if (leftType.kind !== 'optional') return chk.checkAccessOnType(ast, ctx, leftType)
  return chk.registry.getOptionalType(chk.checkAccessOnType(ast, ctx, leftType.valueType, true))
}

function checkOptionalAccessNode(chk, ast, ctx) {
  const leftType = chk.check(ast.args[0], ctx)
  if (ast.op === '[?]') chk.check(ast.args[1], ctx)
  const actualType = leftType.kind === 'optional' ? leftType.valueType : leftType
  return chk.registry.getOptionalType(chk.checkAccessOnType(ast, ctx, actualType, true))
}

function checkElementHomogenous(chk, ctx, expected, el, m) {
  const type = chk.check(el, ctx)
  if (type === expected || expected.isEmpty()) return type
  if (type.isEmpty()) return expected

  let prefix
  if (m === 0) prefix = 'List elements must have the same type,'
  else if (m === 1) prefix = 'Map key uses wrong type,'
  else if (m === 2) prefix = 'Map value uses wrong type,'
  throw new chk.Error(
    `${prefix} expected type '${chk.formatType(expected)}' but found '${chk.formatType(type)}'`,
    el
  )
}

function checkElement(chk, ctx, expected, el) {
  return expected.unify(chk.registry, chk.check(el, ctx)) || chk.dynType
}

function ternaryConditionError(ev, value, node) {
  const type = ev.debugRuntimeType(value, node.checkedType)
  return new ev.Error(`Ternary condition must be bool, got '${type}'`, node)
}

function handleTernary(ev, ast, ctx, condition) {
  if (condition === true) return ev.eval(ast.args[1], ctx)
  if (condition === false) return ev.eval(ast.args[2], ctx)
  throw ternaryConditionError(ev, condition, ast.args[0])
}

function handleUnary(ev, ast, left) {
  if (ast.staticHandler) return ast.staticHandler.handler(left)
  const leftType = ev.debugRuntimeType(left, ast.args.checkedType)
  const overload = ev.registry.findUnaryOverload(ast.op, leftType)
  if (overload) return overload.handler(left)
  throw new ev.Error(`no such overload: ${ast.op[0]}${leftType}`, ast)
}

function evaluateUnary(ev, ast, ctx) {
  const l = ev.eval(ast.args, ctx)
  if (l instanceof Promise) return l.then((_l) => handleUnary(ev, ast, _l))
  return handleUnary(ev, ast, l)
}

function handleBinary(ev, ast, left, right) {
  if (ast.staticHandler) return ast.staticHandler.handler(left, right, ast, ev)
  const leftType = ev.debugOperandType(left, ast.args[0].checkedType)
  const rightType = ev.debugOperandType(right, ast.args[1].checkedType)
  const overload = ev.registry.findBinaryOverload(ast.op, leftType, rightType)
  if (overload) return overload.handler(left, right, ast, ev)
  throw new ev.Error(`no such overload: ${leftType} ${ast.op} ${rightType}`, ast)
}

function logicalOperandError(ev, value, node) {
  const type = ev.debugRuntimeType(value, node.checkedType)
  return new ev.Error(`Logical operator requires bool operands, got '${type}'`, node)
}

function logicalValueOrErr(ev, v, node) {
  if (v instanceof Error) return v
  return logicalOperandError(ev, v, node)
}

function _logicalOp(exp, ev, ast, left, right) {
  if (right === exp) return exp
  if (right === !exp) {
    if (left === right) return right
    throw logicalValueOrErr(ev, left, ast.args[0])
  }
  if (right instanceof Promise) return right.then((r) => _logicalOpAsync(exp, ev, ast, left, r))
  throw logicalOperandError(ev, right, ast.args[1])
}

function _logicalOpAsync(exp, ev, ast, left, right) {
  if (right === exp) return exp
  if (typeof right !== 'boolean') throw logicalOperandError(ev, right, ast.args[1])
  if (typeof left !== 'boolean') throw logicalValueOrErr(ev, left, ast.args[0])
  return !exp
}

function checkLogicalOp(chk, ast, ctx) {
  const leftType = chk.check(ast.args[0], ctx)
  const rightType = chk.check(ast.args[1], ctx)

  if (!leftType.isDynOrBool()) {
    throw new chk.Error(
      `Logical operator requires bool operands, got '${chk.formatType(leftType)}'`,
      ast
    )
  }
  if (!rightType.isDynOrBool()) {
    throw new chk.Error(
      `Logical operator requires bool operands, got '${chk.formatType(rightType)}'`,
      ast
    )
  }

  return chk.boolType
}

function checkUnary(chk, ast, ctx) {
  const op = ast.op
  const right = chk.check(ast.args, ctx)
  if (right.kind === 'dyn') return op === '!_' ? chk.boolType : right

  const overload = chk.registry.findUnaryOverload(op, right)
  if (!overload) throw new chk.Error(`no such overload: ${op[0]}${chk.formatType(right)}`, ast)
  return (ast.staticHandler = overload).returnType
}

function checkBinary(chk, ast, ctx) {
  const op = ast.op
  const left = chk.check(ast.args[0], ctx)
  const right = chk.check(ast.args[1], ctx)

  if (!(left.hasDyn() || right.hasDyn())) {
    ast.staticHandler = chk.registry.findBinaryOverload(op, left, right)
  }

  const type = ast.staticHandler?.returnType || chk.registry.checkBinaryOverload(op, left, right)
  if (type) return type
  throw new chk.Error(
    `no such overload: ${chk.formatType(left)} ${op} ${chk.formatType(right)}`,
    ast
  )
}

function evaluateBinary(ev, ast, ctx) {
  const a = ast.args
  const l = ev.eval(a[0], ctx)
  const r = ev.eval(a[1], ctx)
  if (l instanceof Promise || r instanceof Promise) return twoProm(ev, ast, l, r, handleBinary)
  return handleBinary(ev, ast, l, r)
}

function callFunction(ev, ast, args) {
  if (ast.staticHandler) return ast.staticHandler.handler.apply(ev, args)

  const [functionName, argAst] = ast.args
  const argLen = argAst.length
  const candidates = (ast.functionCandidates ??= ev.registry.getFunctionCandidates(
    false,
    functionName,
    argLen
  ))

  const types = (ast.argTypes ??= new Array(argLen))
  let i = argLen
  while (i--) types[i] = ev.debugOperandType(args[i], argAst[i].checkedType)

  const decl = candidates.findMatch(types)
  if (decl) return decl.handler.apply(ev, args)
  throw new ev.Error(
    `found no matching overload for '${functionName}(${types
      .map((t) => t.unwrappedType)
      .join(', ')})'`,
    ast
  )
}

function callReceiverFunction(ev, ast, receiver, args) {
  if (ast.staticHandler) return ast.staticHandler.handler.call(ev, receiver, ...args)

  const [functionName, receiverAst, argAst] = ast.args
  const candidates = (ast.functionCandidates ??= ev.registry.getFunctionCandidates(
    true,
    functionName,
    argAst.length
  ))

  let i = args.length
  const types = (ast.argTypes ??= new Array(i))
  while (i--) types[i] = ev.debugOperandType(args[i], argAst[i].checkedType)

  const receiverType = ev.debugRuntimeType(receiver, receiverAst.checkedType || ev.dynType)
  const decl = candidates.findMatch(types, receiverType)
  if (decl) return decl.handler.call(ev, receiver, ...args)

  throw new ev.Error(
    `found no matching overload for '${receiverType.type}.${functionName}(${types
      .map((t) => t.unwrappedType)
      .join(', ')})'`,
    ast
  )
}

function resolveAstArray(ev, astArray, ctx, i = astArray.length) {
  if (i === 0) return []

  let async
  const results = new Array(i)
  while (i--) if ((results[i] = ev.eval(astArray[i], ctx)) instanceof Promise) async ??= true
  return async ? Promise.all(results) : results
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

function comprehensionElementType(chk, iterable, ctx) {
  const iterType = chk.check(iterable, ctx)
  if (iterType.kind === 'dyn') return iterType
  if (iterType.kind === 'list') return iterType.valueType
  if (iterType.kind === 'map') return iterType.keyType
  throw new chk.Error(
    `Expression of type '${chk.formatType(
      iterType
    )}' cannot be range of a comprehension (must be list, map, or dynamic).`,
    iterable
  )
}

function toIterable(ev, args, coll) {
  if (isArray(coll)) return coll
  if (coll instanceof Set) return [...coll]
  if (coll instanceof Map) return [...coll.keys()]
  if (coll && typeof coll === 'object') return objKeys(coll)
  throw new ev.Error(
    `Expression of type '${ev.debugType(
      coll
    )}' cannot be range of a comprehension (must be list, map, or dynamic).`,
    args.iterable
  )
}

function ensureBooleanResult(ev, value, ast, label) {
  if (value === true || value === false) return value
  const type = ev.debugRuntimeType(value, ast.checkedType)
  throw new ev.Error(`${label} must return bool, got '${type}'`, ast)
}

function runComprehension(ev, args, ctx, items) {
  items = toIterable(ev, args, items)
  ctx = args.iterCtx.reuse(ctx)
  const accu = ev.eval(args.init, ctx)
  if (args.errorsAreFatal) return iterateLoopSync(ev, ctx, args, items, accu)
  return iterateQuantifierSync(ev, ctx, args, items, accu)
}

function iterateLoopSync(ev, ctx, args, items, accu) {
  const len = items.length
  let i = 0
  while (i < len) {
    if (args.condition && !args.condition(accu)) return args.result(accu)
    accu = ev.eval(args.step, ctx.setValues(accu, items[i++]))
    if (accu instanceof Promise) return continueLoop(ev, ctx, args, items, i, accu)
  }
  return args.result(accu)
}

async function continueLoop(ev, ctx, args, items, start, accu) {
  if (ctx === args.iterCtx) ctx.async = true

  let i = start
  const len = items.length
  accu = await accu
  while (i < len) {
    if (args.condition && !args.condition(accu)) return args.result(accu)
    accu = ev.eval(args.step, ctx.setValues(accu, items[i++]))
    if (accu instanceof Promise) accu = await accu
  }
  return args.result(accu)
}

function iterateQuantifierSync(ev, ctx, args, items, accu) {
  const len = items.length
  let i = 0
  let error = null

  while (i < len) {
    if (!args.condition(accu)) return args.result(accu)
    const stp = ev.tryEval(args.step, ctx.setValues(accu, items[i++]))
    if (stp instanceof Promise) return continueQuantifier(ev, ctx, args, items, i, accu, error, stp)
    if (stp instanceof Error && (error ??= stp)) continue
    accu = stp
  }

  if (error && args.condition(accu)) throw error
  return args.result(accu)
}

async function continueQuantifier(ev, ctx, args, items, start, accu, error, promise) {
  if (ctx === args.iterCtx) ctx.async = true

  let i = start
  const len = items.length

  let stp = await promise
  if (stp instanceof Error) error ??= stp
  else accu = stp

  while (i < len) {
    if (!args.condition(accu)) return args.result(accu)
    stp = ev.tryEval(args.step, ctx.setValues(accu, items[i++]))
    if (stp instanceof Promise) stp = await stp
    if (stp instanceof Error && (error ??= stp)) continue
    accu = stp
  }
  if (error && args.condition(accu)) throw error
  return args.result(accu)
}

function oFieldAccess(ev, ast, left, right) {
  return ev.optionalType.field(left, right, ast, ev)
}

function fieldAccess(ev, ast, left, right) {
  return ev.debugType(left).field(left, right, ast, ev)
}

export const OPERATORS = {
  value: {
    check(chk, ast) {
      return chk.debugType(ast.args)
    },
    evaluate(_ev, ast) {
      return ast.args
    }
  },
  id: {
    check(chk, ast, ctx) {
      const varType = ctx.getType(ast.args)
      if (varType !== undefined) return varType
      throw new chk.Error(`Unknown variable: ${ast.args}`, ast)
    },
    evaluate(ev, ast, ctx) {
      const type = ast.checkedType || ctx.getType(ast.args)
      const value = type && ctx.getValue(ast.args)
      if (value === undefined) throw new ev.Error(`Unknown variable: ${ast.args}`, ast)
      const valueType = ev.debugType(value)
      if (type.matches(valueType)) return value
      throw new ev.Error(`Variable '${ast.args}' is not of type '${type}', got '${valueType}'`, ast)
    }
  },
  '.': {
    alias: 'fieldAccess',
    check: checkAccessNode,
    evaluate(ev, ast, ctx) {
      const a = ast.args
      const l = ev.eval(a[0], ctx)
      if (l instanceof Promise) return l.then((_l) => fieldAccess(ev, ast, _l, a[1]))
      return fieldAccess(ev, ast, l, a[1])
    }
  },
  '.?': {
    alias: 'optionalFieldAccess',
    check: checkOptionalAccessNode,
    evaluate(ev, ast, ctx) {
      const a = ast.args
      const l = ev.eval(a[0], ctx)
      if (l instanceof Promise) return l.then((_l) => oFieldAccess(ev, ast, _l, a[1]))
      return oFieldAccess(ev, ast, l, a[1])
    }
  },
  '[]': {
    alias: 'bracketAccess',
    check: checkAccessNode,
    evaluate(ev, ast, ctx) {
      const a = ast.args
      const l = ev.eval(a[0], ctx)
      const r = ev.eval(a[1], ctx)
      if (l instanceof Promise || r instanceof Promise) return twoProm(ev, ast, l, r, fieldAccess)
      return fieldAccess(ev, ast, l, r)
    }
  },
  '[?]': {
    alias: 'optionalBracketAccess',
    check: checkOptionalAccessNode,
    evaluate(ev, ast, ctx) {
      const a = ast.args
      const l = ev.eval(a[0], ctx)
      const r = ev.eval(a[1], ctx)
      if (l instanceof Promise || r instanceof Promise) return twoProm(ev, ast, l, r, oFieldAccess)
      return oFieldAccess(ev, ast, l, r)
    }
  },
  call: {
    check(chk, ast, ctx) {
      const [functionName, args] = ast.args
      const candidates = (ast.functionCandidates ??= chk.registry.getFunctionCandidates(
        false,
        functionName,
        args.length
      ))

      const argTypes = args.map((a) => chk.check(a, ctx))
      const decl = candidates.findMatch(argTypes)

      if (!decl) {
        throw new chk.Error(
          `found no matching overload for '${functionName}(${chk.formatTypeList(argTypes)})'`,
          ast
        )
      }

      if (!argTypes.some((t) => t.hasDyn())) ast.staticHandler = decl
      return decl.returnType
    },
    evaluate(ev, ast, ctx) {
      const l = resolveAstArray(ev, ast.args[1], ctx)
      if (l instanceof Promise) return l.then((_l) => callFunction(ev, ast, _l))
      return callFunction(ev, ast, l)
    }
  },
  rcall: {
    check(chk, ast, ctx) {
      const [methodName, receiver, args] = ast.args
      const receiverType = chk.check(receiver, ctx)
      const candidates = (ast.functionCandidates ??= chk.registry.getFunctionCandidates(
        true,
        methodName,
        args.length
      ))

      const argTypes = args.map((a) => chk.check(a, ctx))
      if (receiverType.kind === 'dyn' && candidates.returnType) return candidates.returnType
      const decl = candidates.findMatch(argTypes, receiverType)

      if (!decl) {
        throw new chk.Error(
          `found no matching overload for '${receiverType.type}.${methodName}(${chk.formatTypeList(
            argTypes
          )})'`,
          ast
        )
      }

      if (!receiverType.hasPlaceholder() && !argTypes.some((t) => t.hasDyn())) {
        ast.staticHandler = decl
      }
      return decl.returnType
    },
    evaluate(ev, ast, ctx) {
      const l = ev.eval(ast.args[1], ctx)
      const r = resolveAstArray(ev, ast.args[2], ctx)
      if (l instanceof Promise || r instanceof Promise)
        return twoProm(ev, ast, l, r, callReceiverFunction)
      return callReceiverFunction(ev, ast, l, r)
    }
  },
  list: {
    check(chk, ast, ctx) {
      const arr = ast.args
      const arrLen = arr.length
      if (arrLen === 0) return chk.getType('list<T>')

      let valueType = chk.check(arr[0], ctx)
      const check = chk.opts.homogeneousAggregateLiterals ? checkElementHomogenous : checkElement

      for (let i = 1; i < arrLen; i++) valueType = check(chk, ctx, valueType, arr[i], 0)
      return chk.registry.getListType(valueType)
    },
    evaluate(ev, ast, ctx) {
      return resolveAstArray(ev, ast.args, ctx)
    }
  },
  map: {
    check(chk, ast, ctx) {
      const arr = ast.args
      const arrLen = arr.length
      if (arrLen === 0) return chk.getType('map<K, V>')

      const check = chk.opts.homogeneousAggregateLiterals ? checkElementHomogenous : checkElement
      let keyType = chk.check(arr[0][0], ctx)
      let valueType = chk.check(arr[0][1], ctx)
      for (let i = 1; i < arrLen; i++) {
        const e = arr[i]
        keyType = check(chk, ctx, keyType, e[0], 1)
        valueType = check(chk, ctx, valueType, e[1], 2)
      }
      return chk.registry.getMapType(keyType, valueType)
    },
    evaluate(ev, ast, ctx) {
      const astEntries = ast.args
      const len = astEntries.length
      const results = new Array(len)
      let async
      for (let i = 0; i < len; i++) {
        const e = astEntries[i]
        const k = ev.eval(e[0], ctx)
        const v = ev.eval(e[1], ctx)
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
  },
  comprehension: {
    check(chk, ast, ctx) {
      const args = ast.args
      args.iterCtx = ctx
        .forkWithVariable('@accu', chk.check(args.init, ctx))
        .setSecondary(args.iterVarName, comprehensionElementType(chk, args.iterable, ctx))

      const stepType = chk.check(args.step, args.iterCtx)
      if (args.kind === 'quantifier') return chk.boolType
      return stepType
    },
    evaluate(ev, ast, ctx) {
      const a = ast.args
      const arr = ev.eval(a.iterable, ctx)
      if (arr instanceof Promise) return arr.then((_arr) => runComprehension(ev, a, ctx, _arr))
      return runComprehension(ev, a, ctx, arr)
    }
  },
  accuValue: {
    check(_chk, _ast, ctx) {
      return ctx.getType('@accu')
    },
    evaluate(_ev, _ast, ctx) {
      return ctx.getValue('@accu')
    }
  },
  accuInc: {
    check(_chk, _ast, ctx) {
      return ctx.getType('@accu')
    },
    evaluate(_ev, _ast, ctx) {
      return ctx.getValue('@accu') + 1
    }
  },
  accuPush: {
    check(chk, ast, ctx) {
      const listType = ctx.getType('@accu')
      const itemType = chk.check(ast.args, ctx)
      if (listType.kind === 'list' && listType.valueType.kind !== 'param') return listType
      return chk.registry.getListType(itemType)
    },
    evaluate(ev, ast, ctx) {
      const arr = ctx.getValue('@accu')
      const el = ev.eval(ast.args, ctx)
      if (el instanceof Promise) return el.then((_e) => arr.push(_e) && arr)
      arr.push(el)
      return arr
    }
  },
  predicateGuard: {
    check(chk, ast, ctx) {
      const predicateType = chk.check(ast.args.expr, ctx)
      if (predicateType.isDynOrBool()) return chk.boolType
      throw new chk.Error(
        `${ast.args.label} must return bool, got '${chk.formatType(predicateType)}'`,
        ast.args.expr
      )
    },
    evaluate(ev, ast, ctx) {
      const {expr, label} = ast.args
      const v = ev.eval(expr, ctx)
      if (v instanceof Promise) return v.then((_v) => ensureBooleanResult(ev, _v, expr, label))
      return ensureBooleanResult(ev, v, expr, label)
    }
  },
  '?:': {
    alias: 'ternary',
    check(chk, ast, ctx) {
      const condType = chk.check(ast.args[0], ctx)
      if (!condType.isDynOrBool()) {
        throw new chk.Error(
          `Ternary condition must be bool, got '${chk.formatType(condType)}'`,
          ast
        )
      }

      const trueType = chk.check(ast.args[1], ctx)
      const falseType = chk.check(ast.args[2], ctx)
      const unified = trueType.unify(chk.registry, falseType)
      if (unified) return unified

      throw new chk.Error(
        `Ternary branches must have the same type, got '${chk.formatType(
          trueType
        )}' and '${chk.formatType(falseType)}'`,
        ast
      )
    },
    evaluate(ev, ast, ctx) {
      const l = ev.eval(ast.args[0], ctx)
      if (l instanceof Promise) return l.then((_l) => handleTernary(ev, ast, ctx, _l))
      return handleTernary(ev, ast, ctx, l)
    }
  },
  '||': {
    check: checkLogicalOp,
    evaluate(ev, ast, ctx) {
      const a = ast.args
      const l = ev.tryEval(a[0], ctx)
      if (l === true) return true
      if (l === false) {
        const right = ev.eval(a[1], ctx)
        if (typeof right === 'boolean') return right
        return _logicalOp(true, ev, ast, l, right)
      }
      if (l instanceof Promise)
        return l.then((_l) =>
          _l === true ? _l : _logicalOp(true, ev, ast, _l, ev.eval(a[1], ctx))
        )
      return _logicalOp(true, ev, ast, l, ev.eval(a[1], ctx))
    }
  },
  '&&': {
    check: checkLogicalOp,
    evaluate(ev, ast, ctx) {
      const a = ast.args
      const l = ev.tryEval(a[0], ctx)
      if (l === false) return false
      if (l === true) {
        const right = ev.eval(a[1], ctx)
        if (typeof right === 'boolean') return right
        return _logicalOp(false, ev, ast, l, right)
      }
      if (l instanceof Promise)
        return l.then((_l) =>
          _l === false ? _l : _logicalOp(false, ev, ast, _l, ev.eval(a[1], ctx))
        )
      return _logicalOp(false, ev, ast, l, ev.eval(a[1], ctx))
    }
  },
  '!_': {alias: 'unaryNot', check: checkUnary, evaluate: evaluateUnary},
  '-_': {alias: 'unaryMinus', check: checkUnary, evaluate: evaluateUnary}
}

const binaryOperators = ['!=', '==', 'in', '+', '-', '*', '/', '%', '<', '<=', '>', '>=']
for (const op of binaryOperators) OPERATORS[op] = {check: checkBinary, evaluate: evaluateBinary}
for (const op of objKeys(OPERATORS)) {
  const obj = OPERATORS[op]
  obj.name = op
  if (obj.alias) OPERATORS[obj.alias] = obj
}

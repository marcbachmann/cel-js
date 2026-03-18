import {celTypes} from './registry.js'
import {objKeys, isArray, hasOwn} from './globals.js'
const dynType = celTypes.dyn

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
    this.registry = opts.registry
    this.objectTypes = this.registry.objectTypes
    this.objectTypesByConstructor = this.registry.objectTypesByConstructor
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
  throw self.createError('unsupported_type', `Unsupported type: ${type}`)
}

const maybeAsyncArray = (a) => (Array.isArray(a) ? a.some((n) => n.maybeAsync) : false)

function maybeAsync(l, r, h) {
  if (r === true || (r && (r?.maybeAsync || maybeAsyncArray(r)))) return maybeAsyncBoth(h)
  if (l === true || (l && (l?.maybeAsync || maybeAsyncArray(l)))) return maybeAsyncFirst(h)
  return h
}

function maybeAsyncBoth(handler) {
  return (handler.__asyncBoth ??= function handle(a, b, c, d) {
    if (!(a instanceof Promise || b instanceof Promise)) return handler(a, b, c, d)
    if (!(b instanceof Promise)) return a.then((_a) => handler(_a, b, c, d))
    if (!(a instanceof Promise)) return b.then((_b) => handler(a, _b, c, d))
    return Promise.all([a, b]).then((p) => handler(p[0], p[1], c, d))
  })
}

function maybeAsyncFirst(handler) {
  return (handler.__asyncFirst ??= function handle(a, b, c, d) {
    if (a instanceof Promise) return a.then((_a) => handler(_a, b, c, d))
    return handler(a, b, c, d)
  })
}

function checkAccessNode(chk, ast, ctx) {
  ast.right = ast.args[1]
  const leftType = chk.check((ast.left = ast.args[0]), ctx)
  if (ast.op === '[]') chk.check(ast.right, ctx)

  ast.handle = maybeAsync(
    ast.left,
    ast.op === '[]' ? ast.right : false,
    leftType !== dynType ? fieldAccessStatic : fieldAccess
  )

  if (leftType.kind !== 'optional') return chk.checkAccessOnType(ast, ctx, leftType)
  return chk.registry.getOptionalType(chk.checkAccessOnType(ast, ctx, leftType.valueType, true))
}

function checkOptionalAccessNode(chk, ast, ctx) {
  ast.right = ast.args[1]
  const leftType = chk.check((ast.left = ast.args[0]), ctx)
  if (ast.op === '[?]') chk.check(ast.right, ctx)

  ast.handle = maybeAsync(ast.left, ast.op === '[?]' ? ast.right : false, oFieldAccess)

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
  const code =
    m === 0 ? 'heterogeneous_list_element' : m === 1 ? 'heterogeneous_map_key' : 'heterogeneous_map_value'
  throw chk.createError(
    code,
    `${prefix} expected type '${chk.formatType(expected)}' but found '${chk.formatType(type)}'`,
    el
  )
}

function checkElement(chk, ctx, expected, el) {
  return expected.unify(chk.registry, chk.check(el, ctx)) || dynType
}

function ternaryConditionError(ev, value, node) {
  const type = ev.debugRuntimeType(value)
  return ev.createError(
    'invalid_condition_type',
    `${node.meta.label || 'Ternary condition must be bool'}, got '${type}'`,
    node
  )
}

function handleTernary(c, ev, ast, ctx) {
  if (c === true) return ev.eval(ast.left, ctx)
  if (c === false) return ev.eval(ast.right, ctx)
  throw ternaryConditionError(ev, c, ast.condition)
}

function logicalOperandError(ev, value, node) {
  const type = ev.debugRuntimeType(value)
  return ev.createError(
    'invalid_logical_operand',
    `Logical operator requires bool operands, got '${type}'`,
    node
  )
}

function logicalValueOrErr(ev, v, node) {
  if (v instanceof Error) return v
  return logicalOperandError(ev, v, node)
}

function _logicalOp(exp, ev, ast, left, right) {
  if (right === exp) return exp
  if (right === !exp) {
    if (left === right) return right
    throw logicalValueOrErr(ev, left, ast.left)
  }
  if (right instanceof Promise) return right.then((r) => _logicalOpAsync(exp, ev, ast, left, r))
  throw logicalOperandError(ev, right, ast.left)
}

function _logicalOpAsync(exp, ev, ast, left, right) {
  if (right === exp) return exp
  if (typeof right !== 'boolean') throw logicalOperandError(ev, right, ast.right)
  if (typeof left !== 'boolean') throw logicalValueOrErr(ev, left, ast.left)
  return !exp
}

function checkLogicalOp(chk, ast, ctx) {
  const leftType = chk.check((ast.left = ast.args[0]), ctx)
  const rightType = chk.check((ast.right = ast.args[1]), ctx)

  if (!leftType.isDynOrBool()) {
    throw chk.createError(
      'invalid_logical_operand',
      `Logical operator requires bool operands, got '${chk.formatType(leftType)}'`,
      ast
    )
  }
  if (!rightType.isDynOrBool()) {
    throw chk.createError(
      'invalid_logical_operand',
      `Logical operator requires bool operands, got '${chk.formatType(rightType)}'`,
      ast
    )
  }

  return chk.boolType
}

function checkUnary(chk, ast, ctx) {
  const op = ast.op
  const right = chk.check(ast.args, ctx)
  ast.candidates = chk.registry.operatorCandidates(op)

  if (right.kind === 'dyn') {
    ast.handle = maybeAsync(ast.args, false, handleUnary)
    return ast.candidates.returnType
  }

  const overload = ast.candidates.findUnaryOverload(right)
  if (!overload) {
    throw chk.createError('no_such_overload', `no such overload: ${op[0]}${chk.formatType(right)}`, ast)
  }

  ast.handle = maybeAsync(ast.args, false, overload.handler)
  return overload.returnType
}

function handleUnary(left, ast, ev) {
  const leftType = ev.debugRuntimeType(left, ast.args.checkedType)
  const overload = ast.candidates.findUnaryOverload(leftType)
  if (overload) return overload.handler(left)
  throw ev.createError('no_such_overload', `no such overload: ${ast.op[0]}${leftType}`, ast)
}

function evaluateUnary(ev, ast, ctx) {
  return ast.handle(ev.eval(ast.args, ctx), ast, ev)
}

function checkBinary(chk, ast, ctx) {
  const op = ast.op
  const left = chk.check((ast.left = ast.args[0]), ctx)
  const right = chk.check((ast.right = ast.args[1]), ctx)
  ast.candidates = chk.registry.operatorCandidates(op)

  const overload =
    left.hasDynType || right.hasDynType ? undefined : ast.candidates.findBinaryOverload(left, right)

  ast.handle = maybeAsync(ast.left, ast.right, overload?.handler || handleBinary)
  if (overload) return overload.returnType

  const type = ast.candidates.checkBinaryOverload(left, right)
  if (!left.hasDynType) ast.leftStaticType = left
  if (!right.hasDynType) ast.rightStaticType = right
  if (type) return type

  throw chk.createError(
    'no_such_overload',
    `no such overload: ${chk.formatType(left)} ${op} ${chk.formatType(right)}`,
    ast
  )
}

function evaluateBinary(ev, ast, ctx) {
  return ast.handle(ev.eval(ast.left, ctx), ev.eval(ast.right, ctx), ast, ev)
}

function evaluateBinaryFirst(ev, ast, ctx) {
  return ast.handle(ev.eval(ast.left, ctx), ast.right, ast, ev)
}

function handleBinary(left, right, ast, ev) {
  const leftType = ast.leftStaticType || ev.debugTypeDeep(left).wrappedType
  const rightType = ast.rightStaticType || ev.debugTypeDeep(right).wrappedType
  const overload = ast.candidates.findBinaryOverload(leftType, rightType)
  if (overload) return overload.handler(left, right, ast, ev)
  throw ev.createError('no_such_overload', `no such overload: ${leftType} ${ast.op} ${rightType}`, ast)
}

function callFn(args, ast, ev) {
  const argAst = ast.args[1]
  const types = ast.argTypes
  let i = argAst.length
  while (i--) types[i] = ev.debugRuntimeType(args[i], argAst[i].checkedType)

  const decl = ast.candidates.findFunction(types)
  if (decl) return decl.handler.apply(ev, args)
  throw ev.createError(
    'no_matching_overload',
    `found no matching overload for '${ast.args[0]}(${types
      .map((t) => t.unwrappedType)
      .join(', ')})'`,
    ast
  )
}

function callRecFn(args, ev, ast) {
  const [, receiverAst, argAst] = ast.args
  const types = ast.argTypes
  for (let i = 0; i < types.length; i++)
    types[i] = ev.debugRuntimeType(args[i + 1], argAst[i].checkedType)

  const receiverType = ev.debugRuntimeType(args[0], receiverAst.checkedType)
  const decl = ast.candidates.findFunction(types, receiverType)
  if (decl) return decl.handler.apply(ev, args)

  throw ev.createError(
    'no_matching_overload',
    `found no matching overload for '${receiverType.type}.${ast.args[0]}(${types
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
  throw chk.createError(
    'invalid_comprehension_range',
    `Expression of type '${chk.formatType(
      iterType
    )}' cannot be range of a comprehension (must be list, map, or dynamic).`,
    iterable
  )
}

function toIterable(ev, args, coll) {
  if (coll instanceof Set) return [...coll]
  if (coll instanceof Map) return [...coll.keys()]
  if (coll && typeof coll === 'object') return objKeys(coll)
  throw ev.createError(
    'invalid_comprehension_range',
    `Expression of type '${ev.debugType(
      coll
    )}' cannot be range of a comprehension (must be list, map, or dynamic).`,
    args.iterable
  )
}

function runQualifier(items, args, ev, ctx) {
  if (!isArray(items)) items = toIterable(ev, args, items)
  const accu = ev.eval(args.init, (ctx = args.iterCtx.reuse(ctx)))
  ctx.accuValue = accu
  if (ctx === args.iterCtx) return iterateQuantifier(ev, ctx, args, items, accu, 0)
  return continueQuantifier(ev, ctx, args, items, accu, 0)
}

function runComprehension(items, args, ev, ctx) {
  if (!isArray(items)) items = toIterable(ev, args, items)
  const accu = ev.eval(args.init, (ctx = args.iterCtx.reuse(ctx)))
  ctx.accuValue = accu
  if (ctx === args.iterCtx) return iterateLoop(ev, ctx, args, items, accu, 0)
  return continueLoop(ev, ctx, args, items, accu, 0)
}

function iterateLoop(ev, ctx, args, items, accu, i) {
  const condition = args.condition
  const step = args.step
  const len = items.length
  while (i < len) {
    if (condition && !condition(accu)) break
    accu = ev.eval(step, ctx.setIterValue(items[i++], ev))
    if (accu instanceof Promise) return continueLoop(ev, ctx, args, items, accu, i)
  }
  return args.result(accu)
}

async function continueLoop(ev, ctx, args, items, accu, i) {
  if (ctx === args.iterCtx) ctx.async = true
  const condition = args.condition
  const step = args.step
  const len = items.length
  accu = await accu
  while (i < len) {
    if (condition && !condition(accu)) return args.result(accu)
    accu = ev.eval(step, ctx.setIterValue(items[i++], ev))
    if (accu instanceof Promise) accu = await accu
  }
  return args.result(accu)
}

function iterateQuantifier(ev, ctx, args, items, accu, i, error, stp) {
  const condition = args.condition
  const step = args.step
  const len = items.length
  while (i < len) {
    if (!condition(accu)) return args.result(accu)
    stp = ev.tryEval(step, ctx.setIterValue(items[i++], ev))
    if (stp instanceof Promise) return continueQuantifier(ev, ctx, args, items, accu, i, error, stp)
    if (stp instanceof Error && (error ??= stp)) continue
    accu = stp
  }

  if (error && condition(accu)) throw error
  return args.result(accu)
}

async function continueQuantifier(ev, ctx, args, items, accu, i, error, stp) {
  if (ctx === args.iterCtx) ctx.async = true
  const condition = args.condition
  const step = args.step
  const len = items.length

  stp = await stp
  if (stp instanceof Error) error ??= stp
  else accu = stp

  while (i < len) {
    if (!condition(accu)) return args.result(accu)
    stp = ev.tryEval(step, ctx.setIterValue(items[i++], ev))
    if (stp instanceof Promise) stp = await stp
    if (stp instanceof Error && (error ??= stp)) continue
    accu = stp
  }
  if (error && condition(accu)) throw error
  return args.result(accu)
}

function oFieldAccess(left, right, ast, ev) {
  return ev.optionalType.field(left, right, ast, ev)
}

function fieldAccessStatic(left, right, ast, ev) {
  return ast.left.checkedType.field(left, right, ast, ev)
}

const empty = Object.create(null)
function fieldAccess(left, right, ast, ev) {
  switch (left?.constructor) {
    case undefined:
    case Object: {
      const v = hasOwn(left || empty, right) ? left[right] : undefined
      if (v !== undefined) return (ev.debugType(v), v)
      break
    }
    case Map: {
      const v = left.get(right)
      if (v !== undefined) return (ev.debugType(v), v)
      break
    }
    case Array:
    case Set:
      return ev.listType.field(left, right, ast, ev)
    default:
      const t = ev.objectTypesByConstructor.get(left.constructor)
      if (t) return t.type.field(left, right, ast, ev)
      else if (typeof left === 'object') unsupportedType(ev, left.constructor.name)
  }
  throw ev.createError('no_such_key', `No such key: ${right}`, ast)
}

const emptyList = () => []
const emptyMap = () => ({})

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
      const variable = ctx.getVariable(ast.args)
      if (!variable) throw chk.createError('unknown_variable', `Unknown variable: ${ast.args}`, ast)
      if (variable.constant) {
        const alternate = ast.clone(OPERATORS.value, variable.value)
        ast.setMeta('alternate', alternate)
        return chk.check(alternate, ctx)
      }
      return variable.type
    },
    evaluate(ev, ast, ctx) {
      return ctx.getCheckedValue(ev, ast)
    }
  },
  '.': {
    alias: 'fieldAccess',
    check: checkAccessNode,
    evaluate: evaluateBinaryFirst
  },
  '.?': {
    alias: 'optionalFieldAccess',
    check: checkOptionalAccessNode,
    evaluate: evaluateBinaryFirst
  },
  '[]': {
    alias: 'bracketAccess',
    check: checkAccessNode,
    evaluate: evaluateBinary
  },
  '[?]': {
    alias: 'optionalBracketAccess',
    check: checkOptionalAccessNode,
    evaluate: evaluateBinary
  },
  call: {
    check(chk, ast, ctx) {
      const [functionName, args] = ast.args
      const candidates = (ast.candidates = chk.registry.functionCandidates(
        false,
        functionName,
        args.length
      ))

      const argTypes = (ast.argTypes = args.map((a) => chk.check(a, ctx)))
      const decl = candidates.findFunction(argTypes)

      if (!decl) {
        throw chk.createError(
          'no_matching_overload',
          `found no matching overload for '${functionName}(${chk.formatTypeList(argTypes)})'`,
          ast
        )
      }

      const handle = argTypes.some((t) => t.hasDynType)
        ? callFn
        : (decl.handler.__handle ??= (l, _ast, e) => decl.handler.apply(e, l))

      ast.handle = maybeAsync(args, false, handle)
      return decl.returnType
    },
    evaluate(ev, ast, ctx) {
      return ast.handle(resolveAstArray(ev, ast.args[1], ctx), ast, ev)
    }
  },
  rcall: {
    check(chk, ast, ctx) {
      const [methodName, receiver, args] = ast.args
      const receiverType = chk.check(receiver, ctx)
      const candidates = (ast.candidates = chk.registry.functionCandidates(
        true,
        methodName,
        args.length
      ))

      const argTypes = (ast.argTypes = args.map((a) => chk.check(a, ctx)))
      ast.receiverWithArgs = [receiver, ...args]
      ast.handle = maybeAsync(ast.receiverWithArgs, false, callRecFn)

      if (receiverType.kind === 'dyn' && candidates.returnType) return candidates.returnType
      const decl = candidates.findFunction(argTypes, receiverType)

      if (!decl) {
        throw chk.createError(
          'no_matching_overload',
          `found no matching overload for '${receiverType.type}.${methodName}(${chk.formatTypeList(
            argTypes
          )})'`,
          ast
        )
      }

      if (!receiverType.hasPlaceholderType && !argTypes.some((t) => t.hasDynType)) {
        const handler = decl.handler
        const handle = (handler.__handle ??= (a, ev) => handler.apply(ev, a))
        ast.handle = maybeAsync(ast.receiverWithArgs, false, handle)
      }

      return decl.returnType
    },
    evaluate(ev, ast, ctx) {
      return ast.handle(resolveAstArray(ev, ast.receiverWithArgs, ctx), ev, ast)
    }
  },
  list: {
    check(chk, ast, ctx) {
      const arr = ast.args
      const arrLen = arr.length
      if (arrLen === 0) return ast.setMeta('evaluate', emptyList) && chk.getType('list<T>')

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
      if (arrLen === 0) return ast.setMeta('evaluate', emptyMap) && chk.getType('map<K, V>')

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
        .forkWithVariable(args.iterVarName, comprehensionElementType(chk, args.iterable, ctx))
        .setAccuType(chk.check(args.init, ctx))

      const stepType = chk.check(args.step, args.iterCtx)
      const handler = args.errorsAreFatal ? runComprehension : runQualifier
      ast.handle = maybeAsync(args.iterable, false, handler)
      if (args.kind === 'quantifier') return chk.boolType
      return stepType
    },
    evaluate(ev, ast, ctx) {
      return ast.handle(ev.eval(ast.args.iterable, ctx), ast.args, ev, ctx)
    }
  },
  accuValue: {
    check(_chk, _ast, ctx) {
      return ctx.accuType
    },
    evaluate(_ev, _ast, ctx) {
      return ctx.accuValue
    }
  },
  accuInc: {
    check(_chk, _ast, ctx) {
      return ctx.accuType
    },
    evaluate(_ev, _ast, ctx) {
      return (ctx.accuValue += 1)
    }
  },
  accuPush: {
    check(chk, ast, ctx) {
      const listType = ctx.accuType
      const itemType = chk.check(ast.args, ctx)
      if (!ast.args.maybeAsync) ast.setMeta('evaluate', OPERATORS.accuPush.evaluateSync)
      if (listType.kind === 'list' && listType.valueType.kind !== 'param') return listType
      return chk.registry.getListType(itemType)
    },
    evaluateSync(ev, ast, ctx) {
      return (ctx.accuValue.push(ev.eval(ast.args, ctx)), ctx.accuValue)
    },
    evaluate(ev, ast, ctx) {
      const arr = ctx.accuValue
      const el = ev.eval(ast.args, ctx)
      if (el instanceof Promise) return el.then((_e) => arr.push(_e) && arr)
      arr.push(el)
      return arr
    }
  },
  '?:': {
    alias: 'ternary',
    check(chk, ast, ctx) {
      const condast = (ast.condition = ast.args[0])
      const leftast = (ast.left = ast.args[1])
      const rightast = (ast.right = ast.args[2])
      const condType = chk.check(condast, ctx)
      if (!condType.isDynOrBool()) {
        throw chk.createError(
          'invalid_condition_type',
          `${condast.meta.label || 'Ternary condition must be bool'}, got '${chk.formatType(condType)}'`,
          condast
        )
      }

      const leftType = chk.check(leftast, ctx)
      const rightType = chk.check(rightast, ctx)
      const unified = leftType.unify(chk.registry, rightType)

      ast.handle = maybeAsync(condast, false, handleTernary)
      if (unified) return unified

      throw chk.createError(
        'incompatible_ternary_branches',
        `Ternary branches must have the same type, got '${chk.formatType(
          leftType
        )}' and '${chk.formatType(rightType)}'`,
        ast
      )
    },
    evaluate(ev, ast, ctx) {
      return ast.handle(ev.eval(ast.condition, ctx), ev, ast, ctx)
    }
  },
  '||': {
    check: checkLogicalOp,
    evaluate(ev, ast, ctx) {
      const l = ev.tryEval(ast.left, ctx)
      if (l === true) return true
      if (l === false) {
        const right = ev.eval(ast.right, ctx)
        if (typeof right === 'boolean') return right
        return _logicalOp(true, ev, ast, l, right)
      }
      if (l instanceof Promise)
        return l.then((_l) =>
          _l === true ? _l : _logicalOp(true, ev, ast, _l, ev.eval(ast.right, ctx))
        )
      return _logicalOp(true, ev, ast, l, ev.eval(ast.right, ctx))
    }
  },
  '&&': {
    check: checkLogicalOp,
    evaluate(ev, ast, ctx) {
      const l = ev.tryEval(ast.left, ctx)
      if (l === false) return false
      if (l === true) {
        const right = ev.eval(ast.right, ctx)
        if (typeof right === 'boolean') return right
        return _logicalOp(false, ev, ast, l, right)
      }
      if (l instanceof Promise)
        return l.then((_l) =>
          _l === false ? _l : _logicalOp(false, ev, ast, _l, ev.eval(ast.right, ctx))
        )
      return _logicalOp(false, ev, ast, l, ev.eval(ast.right, ctx))
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

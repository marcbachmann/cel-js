import {celTypes} from './registry.js'

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
        return (
          this.objectTypesByConstructor.get(v.constructor)?.type ||
          unsupportedType(this, v.constructor?.name || typeof v)
        )
      default:
        unsupportedType(this, typeof v)
    }
  }
}

function unsupportedType(self, type) {
  throw new self.Error(`Unsupported type: ${type}`)
}

function twoProm(ev, ast, a, b, fn) {
  if (!(a instanceof Promise || b instanceof Promise)) return fn(ev, ast, a, b)
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

function logicalOperandError(ev, value, node) {
  const type = ev.debugRuntimeType(value, node.checkedType)
  return new ev.Error(`Logical operator requires bool operands, got '${type}'`, node)
}

function ternaryConditionError(ev, value, node) {
  const type = ev.debugRuntimeType(value, node.checkedType)
  return new ev.Error(`Ternary condition must be bool, got '${type}'`, node)
}

function handleTernary(ev, ast, condition, ctx) {
  if (condition === true) return ev.eval(ast.args[1], ctx)
  if (condition === false) return ev.eval(ast.args[2], ctx)
  throw ternaryConditionError(ev, condition, ast.args[0])
}

function handleUnary(ev, ast, left) {
  const leftType = ev.debugRuntimeType(left, ast.args[0].checkedType)
  const overload = ev.registry.findUnaryOverload(ast.op, leftType)
  if (overload) return overload.handler(left)
  throw new ev.Error(`no such overload: ${ast.op[0]}${leftType}`, ast)
}

function evaluateUnary(ev, ast, ctx) {
  const p = ev.eval(ast.args[0], ctx)
  if (p instanceof Promise) return p.then((l) => handleUnary(ev, ast, l))
  return handleUnary(ev, ast, p)
}

function handleBinary(ev, ast, left, right) {
  const leftType = ev.debugOperandType(left, ast.args[0].checkedType)
  const rightType = ev.debugOperandType(right, ast.args[1].checkedType)
  const overload = ev.registry.findBinaryOverload(ast.op, leftType, rightType)
  if (overload) return overload.handler(left, right, ast, ev)
  throw new ev.Error(`no such overload: ${leftType} ${ast.op} ${rightType}`, ast)
}

function evaluateBinary(ev, ast, ctx) {
  return twoProm(ev, ast, ev.eval(ast.args[0], ctx), ev.eval(ast.args[1], ctx), handleBinary)
}

function _or(ev, ast, left, ctx) {
  if (left === true) return true
  const right = ev.eval(ast.args[1], ctx)
  if (right instanceof Promise) return right.then((r) => _orRight(ev, ast, left, r))
  return _orRight(ev, ast, left, right)
}

function _orRight(ev, ast, left, right) {
  if (right === true) return true
  if (right !== false) throw logicalOperandError(ev, right, ast.args[1])
  if (left instanceof Error) throw left
  if (left !== false) throw logicalOperandError(ev, left, ast.args[0])
  return false
}

function _and(ev, ast, left, ctx) {
  if (left === false) return false
  const right = ev.eval(ast.args[1], ctx)
  if (right instanceof Promise) return right.then((r) => _andRight(ev, ast, left, r))
  return _andRight(ev, ast, left, right)
}

function _andRight(ev, ast, left, right) {
  if (right === false) return false
  if (right !== true) throw logicalOperandError(ev, right, ast.args[1])
  if (left instanceof Error) throw left
  if (left !== true) throw logicalOperandError(ev, left, ast.args[0])
  return true
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
  const operandType = chk.check(ast.args[0], ctx)
  if (operandType.kind === 'dyn') return op === '!_' ? chk.boolType : operandType

  const overload = chk.registry.findUnaryOverload(op, operandType)
  if (overload) return overload.returnType
  throw new chk.Error(`no such overload: ${op[0]}${chk.formatType(operandType)}`, ast)
}

function checkBinary(chk, ast, ctx) {
  const op = ast.op
  const leftType = chk.check(ast.args[0], ctx)
  const rightType = chk.check(ast.args[1], ctx)
  const type = chk.registry.checkBinaryOverload(op, leftType, rightType)
  if (type) return type
  throw new chk.Error(
    `no such overload: ${chk.formatType(leftType)} ${op} ${chk.formatType(rightType)}`,
    ast
  )
}

function callFunction(ev, ast, args) {
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

  const decl = candidates.findMatch(types, null)
  if (decl) return decl.handler.apply(ev, args)
  throw new ev.Error(
    `found no matching overload for '${functionName}(${types
      .map((t) => t.unwrappedType)
      .join(', ')})'`,
    ast
  )
}

function callReceiverFunction(ev, ast, receiver, args) {
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

function resolveAstArray(ev, ctx, astArray, i = astArray.length) {
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
      if (type.kind === 'dyn') return ev.debugType(value) && value

      const valueType = ev.debugType(value)
      if (type.matches(valueType)) return value
      throw new ev.Error(`Variable '${ast.args}' is not of type '${type}', got '${valueType}'`, ast)
    }
  },
  '.': {
    check: checkAccessNode,
    evaluate(ev, ast, ctx) {
      const l = ev.eval(ast.args[0], ctx)
      if (l instanceof Promise) return l.then((_l) => fieldAccess(ev, ast, _l, ast.args[1]))
      return fieldAccess(ev, ast, l, ast.args[1])
    }
  },
  '.?': {
    check: checkOptionalAccessNode,
    evaluate(ev, ast, ctx) {
      const l = ev.eval(ast.args[0], ctx)
      if (l instanceof Promise) return l.then((_l) => oFieldAccess(ev, ast, _l, ast.args[1]))
      return oFieldAccess(ev, ast, l, ast.args[1])
    }
  },
  '[]': {
    check: checkAccessNode,
    evaluate(ev, ast, ctx) {
      return twoProm(ev, ast, ev.eval(ast.args[0], ctx), ev.eval(ast.args[1], ctx), fieldAccess)
    }
  },
  '[?]': {
    check: checkOptionalAccessNode,
    evaluate(ev, ast, ctx) {
      return twoProm(ev, ast, ev.eval(ast.args[0], ctx), ev.eval(ast.args[1], ctx), oFieldAccess)
    }
  },
  call: {
    check(chk, ast, ctx) {
      if (ast.macro) return ast.macro.typeCheck(chk, ast.macro, ctx)
      const functionName = ast.args[0]
      const args = ast.args[1]
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

      return decl.returnType
    },
    evaluate(ev, ast, ctx) {
      if (ast.macro) return ast.macro.evaluate(ev, ast.macro, ctx)
      const l = resolveAstArray(ev, ctx, ast.args[1])
      if (l instanceof Promise) return l.then((_l) => callFunction(ev, ast, _l))
      return callFunction(ev, ast, l)
    }
  },
  rcall: {
    check(chk, ast, ctx) {
      if (ast.macro) return ast.macro.typeCheck(chk, ast.macro, ctx)

      const methodName = ast.args[0]
      const args = ast.args[2]
      const receiverType = chk.check(ast.args[1], ctx)
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

      return decl.returnType
    },
    evaluate(ev, ast, ctx) {
      if (ast.macro) return ast.macro.evaluate(ev, ast.macro, ctx)
      return twoProm(
        ev,
        ast,
        ev.eval(ast.args[1], ctx),
        resolveAstArray(ev, ctx, ast.args[2]),
        callReceiverFunction
      )
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
      return resolveAstArray(ev, ctx, ast.args)
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
        const [keyAst, valueAst] = arr[i]
        keyType = check(chk, ctx, keyType, keyAst, 1)
        valueType = check(chk, ctx, valueType, valueAst, 2)
      }
      return chk.registry.getMapType(keyType, valueType)
    },
    evaluate(ev, ast, ctx) {
      const astEntries = ast.args
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
  },
  '?:': {
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
      if (l instanceof Promise) return l.then((_l) => handleTernary(ev, ast, _l, ctx))
      return handleTernary(ev, ast, l, ctx)
    }
  },
  '||': {
    check: checkLogicalOp,
    evaluate(ev, ast, ctx) {
      const l = ev.tryEval(ast.args[0], ctx)
      if (l instanceof Promise) return l.then((_l) => _or(ev, ast, _l, ctx))
      return _or(ev, ast, l, ctx)
    }
  },
  '&&': {
    check: checkLogicalOp,
    evaluate(ev, ast, ctx) {
      const l = ev.tryEval(ast.args[0], ctx)
      if (l instanceof Promise) return l.then((_l) => _and(ev, ast, _l, ctx))
      return _and(ev, ast, l, ctx)
    }
  },
  '!_': {check: checkUnary, evaluate: evaluateUnary},
  '-_': {check: checkUnary, evaluate: evaluateUnary}
}

const binaryOperators = ['!=', '==', 'in', '+', '-', '*', '/', '%', '<', '<=', '>', '>=']
for (const op of binaryOperators) OPERATORS[op] = {check: checkBinary, evaluate: evaluateBinary}
for (const op in OPERATORS) OPERATORS[op].name = op

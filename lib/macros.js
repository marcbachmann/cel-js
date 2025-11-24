import {EvaluationError, ParseError} from './errors.js'
import {OverlayContext} from './registry.js'

function assertIdentifier(ast, message) {
  if (ast[0] === 'id') return
  throw new ParseError(message, ast)
}

function evaluatePredicateBool(ev, ctx, ast, functionName) {
  const value = ev.eval(ast, ctx)
  if (typeof value === 'boolean') return value
  const type = ev.debugRuntimeType(value, ast.checkedType)
  throw new EvaluationError(`${functionName} predicate must return bool, got '${type}'`, ast)
}

function shouldPropagatePredicateError(err) {
  return (
    err.message.includes('predicate must return bool') || err.message.includes('Unknown variable')
  )
}

function getMacroIterable(ev, macro, ctx) {
  const coll = ev.eval(macro.receiver, ctx)
  if (Array.isArray(coll)) return coll
  if (coll instanceof Set) return [...coll]
  if (coll instanceof Map) return [...coll.keys()]
  if (coll && typeof coll === 'object') return Object.keys(coll)
  throw new EvaluationError(
    `Expression of type '${ev.debugType(coll)}' cannot be ` +
      `range of a comprehension (must be list, map, or dynamic).`,
    macro.receiver
  )
}

function macroAllHandler(ev, macro, ctx) {
  const arr = getMacroIterable(ev, macro, ctx)
  ctx = macro.overlayContext.setParentCtx(ctx, macro.variableType)

  let error = null
  const len = arr.length
  for (let i = 0; i < len; i++) {
    ctx.setVariableValue(arr[i])
    try {
      if (evaluatePredicateBool(ev, ctx, macro.predicate, macro.functionDesc)) continue
      return false
    } catch (err) {
      if (shouldPropagatePredicateError(err)) throw err
      error ??= err
    }
  }
  if (error) throw error
  return true
}

function macroExistsHandler(ev, macro, ctx) {
  const arr = getMacroIterable(ev, macro, ctx)
  ctx = macro.overlayContext.setParentCtx(ctx, macro.variableType)

  let error = null
  const len = arr.length
  for (let i = 0; i < len; i++) {
    ctx.setVariableValue(arr[i])
    try {
      if (evaluatePredicateBool(ev, ctx, macro.predicate, macro.functionDesc)) return true
    } catch (err) {
      if (shouldPropagatePredicateError(err)) throw err
      error ??= err
    }
  }
  if (error) throw error
  return false
}

function macroExistsOneHandler(ev, macro, ctx) {
  const arr = getMacroIterable(ev, macro, ctx)
  ctx = macro.overlayContext.setParentCtx(ctx, macro.variableType)

  let count = 0
  const len = arr.length
  for (let i = 0; i < len; i++) {
    ctx.setVariableValue(arr[i])
    if (evaluatePredicateBool(ev, ctx, macro.predicate, macro.functionDesc) === false) continue
    if (++count > 1) return false
  }
  return count === 1
}

function macroMapHandler(ev, macro, ctx) {
  const arr = getMacroIterable(ev, macro, ctx)
  ctx = macro.overlayContext.setParentCtx(ctx, macro.variableType)

  const len = arr.length
  const res = new Array(len)
  for (let i = 0; i < len; i++) res[i] = ev.eval(macro.transform, ctx.setVariableValue(arr[i]))
  return res
}

function macroFilterMapHandler(ev, macro, ctx) {
  const arr = getMacroIterable(ev, macro, ctx)
  ctx = macro.overlayContext.setParentCtx(ctx, macro.variableType)
  const res = []
  for (let i = 0; i < arr.length; i++) {
    ctx.setVariableValue(arr[i])
    if (evaluatePredicateBool(ev, ctx, macro.filter, macro.functionDesc) === false) continue
    res.push(ev.eval(macro.transform, ctx))
  }
  return res
}

function macroFilterHandler(ev, macro, ctx) {
  const arr = getMacroIterable(ev, macro, ctx)
  ctx = macro.overlayContext.setParentCtx(ctx, macro.variableType)

  const res = []
  const len = arr.length
  for (let i = 0; i < len; i++) {
    ctx.setVariableValue(arr[i])
    if (evaluatePredicateBool(ev, ctx, macro.predicate, macro.functionDesc) === false) continue
    res.push(arr[i])
  }
  return res
}

function getIterableElementType(typeChecker, receiverType, macro) {
  if (receiverType.kind === 'dyn') return receiverType
  if (receiverType.kind === 'list') return receiverType.valueType
  if (receiverType.kind === 'map') return receiverType.keyType
  throw new typeChecker.Error(
    `Expression of type '${receiverType}' cannot be range of a comprehension (must be list, map, or dynamic).`,
    macro.receiver
  )
}

function createCheckCtx(typeChecker, macro, ctx) {
  const receiverType = typeChecker.check(macro.receiver, ctx)
  const elementType = getIterableElementType(typeChecker, receiverType, macro)
  return macro.overlayContext.setParentCtx(ctx, elementType)
}

function typeCheckQuantifierMacro(typeChecker, macro, ctx) {
  ctx = createCheckCtx(typeChecker, macro, ctx)
  macro.variableType = ctx.variableType
  const predicateType = typeChecker.check(macro.predicate, ctx)
  if (predicateType.isDynOrBool()) return predicateType
  throw new typeChecker.Error(
    `${macro.functionDesc} predicate must return bool, got '${predicateType}'`,
    macro.predicate
  )
}

function typeCheckMapMacro(typeChecker, macro, ctx) {
  ctx = createCheckCtx(typeChecker, macro, ctx)
  macro.variableType = ctx.variableType
  if (macro.filter) {
    const filterType = typeChecker.check(macro.filter, ctx)
    if (!filterType.isDynOrBool()) {
      throw new typeChecker.Error(
        `${macro.functionDesc} filter predicate must return bool, got '${filterType}'`,
        macro.filter
      )
    }
  }
  return typeChecker.getType(`list<${typeChecker.check(macro.transform, ctx)}>`)
}

function typeCheckFilterMacro(typeChecker, macro, ctx) {
  ctx = createCheckCtx(typeChecker, macro, ctx)
  macro.variableType = ctx.variableType
  const predicateType = typeChecker.check(macro.predicate, ctx)
  if (predicateType.isDynOrBool()) return typeChecker.getType(`list<${macro.variableType}>`)
  throw new typeChecker.Error(
    `${macro.functionDesc} predicate must return bool, got '${predicateType}'`,
    macro.predicate
  )
}

function createQuantifierExpander({description, evaluator}) {
  const msg = `${description} invalid predicate iteration variable`
  if (!evaluator) throw new Error(`No evaluator provided for quantifier macro: ${description}`)

  return ({args, receiver}) => {
    const [variableAst, predicate] = args
    assertIdentifier(variableAst, msg)
    return {
      functionDesc: description,
      receiver,
      predicate,
      overlayContext: new OverlayContext(variableAst[1]),
      evaluate: evaluator,
      typeCheck: typeCheckQuantifierMacro
    }
  }
}

function createMapExpander(hasFilter) {
  const functionDesc = hasFilter ? 'map(var, filter, transform)' : 'map(var, transform)'
  const evaluate = hasFilter ? macroFilterMapHandler : macroMapHandler
  return ({args, receiver}) => {
    assertIdentifier(args[0], 'map(var, transform) invalid predicate iteration variable')
    return {
      args,
      functionDesc,
      receiver,
      filter: hasFilter ? args[1] : null,
      transform: hasFilter ? args[2] : args[1],
      overlayContext: new OverlayContext(args[0][1]),
      evaluate,
      typeCheck: typeCheckMapMacro
    }
  }
}

function filterExpander({args, receiver}) {
  assertIdentifier(args[0], 'filter(var, predicate) invalid predicate iteration variable')
  return {
    args,
    functionDesc: 'filter(var, predicate)',
    receiver,
    predicate: args[1],
    overlayContext: new OverlayContext(args[0][1]),
    evaluate: macroFilterHandler,
    typeCheck: typeCheckFilterMacro
  }
}

function evaluateHasMacro(ev, macro, ctx) {
  const nodes = macro.macroHasProps
  let i = nodes.length
  let obj = ev.eval(nodes[--i], ctx)
  while (i--) {
    const node = nodes[i]
    obj = ev.debugType(obj).fieldLazy(obj, node[2], node, ev)
    if (i && obj === undefined) throw new EvaluationError(`No such key: ${node[2]}`, node)
  }
  return obj !== undefined
}

function typeCheckHasMacro(checker, macro) {
  let node = macro.args[0]
  if (node[0] !== '.') throw new checker.Error('has() invalid argument', node)
  if (!macro.macroHasProps) {
    const props = []
    while (node[0] === '.' && props.push(node)) node = node[1]
    if (node[0] !== 'id') throw new checker.Error('has() invalid argument', node)
    props.push(node)
    macro.macroHasProps = props
  }
  return checker.getType('bool')
}

function hasExpander({args}) {
  return {
    args,
    functionDesc: 'has(field)',
    evaluate: evaluateHasMacro,
    typeCheck: typeCheckHasMacro
  }
}

export function registerMacros(registry) {
  registry.registerFunctionOverload('has(ast): bool', hasExpander)

  registry.registerFunctionOverload(
    'list.all(ast, ast): bool',
    createQuantifierExpander({
      description: 'all(var, predicate)',
      evaluator: macroAllHandler
    })
  )

  registry.registerFunctionOverload(
    'list.exists(ast, ast): bool',
    createQuantifierExpander({
      description: 'exists(var, predicate)',
      evaluator: macroExistsHandler
    })
  )

  registry.registerFunctionOverload(
    'list.exists_one(ast, ast): bool',
    createQuantifierExpander({
      description: 'exists_one(var, predicate)',
      evaluator: macroExistsOneHandler
    })
  )

  registry.registerFunctionOverload('list.map(ast, ast): list<dyn>', createMapExpander(false))
  registry.registerFunctionOverload('list.map(ast, ast, ast): list<dyn>', createMapExpander(true))
  registry.registerFunctionOverload('list.filter(ast, ast): list<dyn>', filterExpander)
}

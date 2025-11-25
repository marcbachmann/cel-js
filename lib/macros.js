import {EvaluationError, ParseError} from './errors.js'

function assertIdentifier(ast, message) {
  if (ast[0] === 'id') return
  throw new ParseError(message, ast)
}

function predicateBoolError(ev, value, ast, functionName) {
  const type = ev.debugRuntimeType(value, ast.checkedType)
  return new EvaluationError(`${functionName} predicate must return bool, got '${type}'`, ast)
}

function shouldPropagatePredicateError(err) {
  return (
    err.message.includes('predicate must return bool') || err.message.includes('Unknown variable')
  )
}

function getMacroIterable(ev, macro, ctx) {
  const coll = ev.eval(macro.receiver, ctx)
  if (coll instanceof Promise) return coll.then((c) => toIterable(ev, c, macro))
  return toIterable(ev, coll, macro)
}

function toIterable(ev, coll, macro) {
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

function evaluatePredicateResult(
  ev,
  macro,
  ctx,
  predicate = macro.predicate,
  func = macro.functionDesc
) {
  const v = ev.tryEval(predicate, ctx)
  if (v instanceof Promise) return v.then((_v) => normalizePredicateResult(ev, _v, predicate, func))
  return normalizePredicateResult(ev, v, predicate, func)
}

function normalizePredicateResult(ev, value, predicate, functionDesc) {
  if (value instanceof Error) return value
  if (typeof value === 'boolean') return value
  return predicateBoolError(ev, value, predicate, functionDesc)
}

function iterate(ev, macro, ctx, state, each) {
  const items = state.items
  const len = items.length
  while (state.index < len && state.return === undefined) {
    const index = state.index++
    const item = items[index]
    ctx.setVariableValue(item)
    const p = each(ev, macro, ctx, state, item, index)
    if (p instanceof Promise) return p.then(() => iterateAsync(ev, macro, ctx, state, each))
  }
  return state
}

async function iterateAsync(ev, macro, ctx, state, each) {
  const items = state.items
  const len = items.length
  while (state.index < len && state.return === undefined) {
    const index = state.index++
    const item = items[index]
    ctx.setVariableValue(item)
    const p = each(ev, macro, ctx, state, item, index)
    if (p instanceof Promise) await p
  }
  return state
}

function handleDeferredPredicateError(error, state) {
  if (shouldPropagatePredicateError(error)) throw error
  state.error ??= error
}

function macroAllHandler(ev, macro, ctx, arr) {
  const state = {items: arr, index: 0}
  const result = iterate(ev, macro, ctx, state, eachAllPredicate)
  if (result instanceof Promise) return result.then(finalizeAllState)
  return finalizeAllState(state)
}

function eachAllPredicate(ev, macro, ctx, state) {
  const predicate = evaluatePredicateResult(ev, macro, ctx)
  if (predicate instanceof Promise) return predicate.then((value) => handleAllValue(value, state))
  handleAllValue(predicate, state)
}

function handleAllValue(value, state) {
  if (value instanceof Error) return handleDeferredPredicateError(value, state)
  if (!value) state.return = false
}

function finalizeAllState(state) {
  if (state.return !== undefined) return state.return
  if (state.error) throw state.error
  return true
}

function createMacroHandler(fn) {
  return function (ev, macro, ctx) {
    const arr = getMacroIterable(ev, macro, ctx)
    ctx = ctx.fork().setParentCtx(macro.variableType, macro.predicateVar)
    if (!(arr instanceof Promise)) return fn(ev, macro, ctx, arr)
    return arr.then((a) => fn(ev, macro, ctx, a))
  }
}

function macroExistsHandler(ev, macro, ctx, arr) {
  const state = {items: arr, index: 0, return: undefined, error: null}
  const result = iterate(ev, macro, ctx, state, eachExistsPredicate)
  if (result instanceof Promise) return result.then(finalizeExistsState)
  return finalizeExistsState(state)
}

function eachExistsPredicate(ev, macro, ctx, state) {
  const predicate = evaluatePredicateResult(ev, macro, ctx)
  if (predicate instanceof Promise) return predicate.then((v) => handleExistsValue(v, state))
  handleExistsValue(predicate, state)
}

function handleExistsValue(value, state) {
  if (value instanceof Error) return handleDeferredPredicateError(value, state)
  if (value) state.return = true
}

function finalizeExistsState(state) {
  if (state.return !== undefined) return state.return
  if (state.error) throw state.error
  return false
}

function macroExistsOneHandler(ev, macro, ctx, arr) {
  const state = {items: arr, index: 0, return: undefined, count: 0}
  const result = iterate(ev, macro, ctx, state, eachExistsOnePredicate)
  if (result instanceof Promise) return result.then(finalizeExistsOneState)
  return finalizeExistsOneState(state)
}

function eachExistsOnePredicate(ev, macro, ctx, state) {
  const predicate = evaluatePredicateResult(ev, macro, ctx)
  if (predicate instanceof Promise) {
    return predicate.then((value) => handleExistsOneValue(value, state))
  }
  handleExistsOneValue(predicate, state)
}

function handleExistsOneValue(value, state) {
  if (value instanceof Error) throw value
  if (value && ++state.count > 1) state.return = false
}

function finalizeExistsOneState(state) {
  if (state.return !== undefined) return state.return
  return state.count === 1
}

function macroMapHandler(ev, macro, ctx, arr) {
  const state = {items: arr, index: 0, return: undefined, results: new Array(arr.length)}
  const iterator = iterate(ev, macro, ctx, state, eachMapTransform)
  if (iterator instanceof Promise) return iterator.then(() => state.results)
  return state.results
}

function eachMapTransform(ev, macro, ctx, state, _item, index) {
  const value = ev.eval(macro.transform, ctx)
  if (value instanceof Promise) return value.then((v) => (state.results[index] = v))
  state.results[index] = value
}

function macroFilterMapHandler(ev, macro, ctx, arr) {
  const state = {items: arr, index: 0, return: undefined, results: []}
  const iterator = iterate(ev, macro, ctx, state, eachFilterMap)
  if (iterator instanceof Promise) return iterator.then(() => state.results)
  return state.results
}

function eachFilterMap(ev, macro, ctx, state) {
  const p = evaluatePredicateResult(ev, macro, ctx, macro.filter, macro.functionDesc)
  if (p instanceof Promise) return p.then((v) => handleFilterMapPredicate(v, ev, macro, ctx, state))
  return handleFilterMapPredicate(p, ev, macro, ctx, state)
}

function handleFilterMapPredicate(value, ev, macro, ctx, state) {
  if (value instanceof Error) throw value
  if (!value) return
  return pushTransformValue(ev, macro, ctx, state)
}

function pushTransformValue(ev, macro, ctx, state) {
  const transformed = ev.eval(macro.transform, ctx)
  if (transformed instanceof Promise) return transformed.then((v) => state.results.push(v))
  state.results.push(transformed)
}

function macroFilterHandler(ev, macro, ctx, arr) {
  const state = {items: arr, index: 0, return: undefined, results: []}
  const iterator = iterate(ev, macro, ctx, state, eachFilterPredicate)
  if (iterator instanceof Promise) return iterator.then(() => state.results)
  return state.results
}

function eachFilterPredicate(ev, macro, ctx, state, item) {
  const predicate = evaluatePredicateResult(ev, macro, ctx)
  if (predicate instanceof Promise) {
    return predicate.then((value) => handleFilterValue(value, state, item))
  }
  handleFilterValue(predicate, state, item)
}

function handleFilterValue(value, state, item) {
  if (value instanceof Error) throw value
  if (value) state.results.push(item)
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
  return ctx.fork().setParentCtx(elementType, macro.predicateVar)
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
      predicateVar: variableAst[1],
      evaluate: evaluator,
      typeCheck: typeCheckQuantifierMacro
    }
  }
}

function createMapExpander(hasFilter) {
  const functionDesc = hasFilter ? 'map(var, filter, transform)' : 'map(var, transform)'
  const evaluate = createMacroHandler(hasFilter ? macroFilterMapHandler : macroMapHandler)
  return ({args, receiver}) => {
    assertIdentifier(args[0], 'map(var, transform) invalid predicate iteration variable')
    return {
      args,
      functionDesc,
      receiver,
      filter: hasFilter ? args[1] : null,
      transform: hasFilter ? args[2] : args[1],
      predicateVar: args[0][1],
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
    predicateVar: args[0][1],
    evaluate: createMacroHandler(macroFilterHandler),
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
      evaluator: createMacroHandler(macroAllHandler)
    })
  )

  registry.registerFunctionOverload(
    'list.exists(ast, ast): bool',
    createQuantifierExpander({
      description: 'exists(var, predicate)',
      evaluator: createMacroHandler(macroExistsHandler)
    })
  )

  registry.registerFunctionOverload(
    'list.exists_one(ast, ast): bool',
    createQuantifierExpander({
      description: 'exists_one(var, predicate)',
      evaluator: createMacroHandler(macroExistsOneHandler)
    })
  )

  registry.registerFunctionOverload('list.map(ast, ast): list<dyn>', createMapExpander(false))
  registry.registerFunctionOverload('list.map(ast, ast, ast): list<dyn>', createMapExpander(true))
  registry.registerFunctionOverload('list.filter(ast, ast): list<dyn>', filterExpander)
}

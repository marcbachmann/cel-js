import {EvaluationError, ParseError} from './errors.js'

function assertIdentifier(ast, message) {
  if (ast[0] === 'id') return ast[1]
  throw new ParseError(message, ast)
}

function getMacroIterable(ev, receiver, ctx) {
  const coll = ev.eval(receiver, ctx)
  if (coll instanceof Promise) return coll.then((c) => toIterable(ev, c, receiver))
  return toIterable(ev, coll, receiver)
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

function evaluatePredicateResult(ev, macro, ctx, predicate = macro.predicate) {
  const v = ev.tryEval(predicate, ctx)
  if (v instanceof Promise) return v.then((_v) => normalizePredicate(ev, macro, _v, predicate))
  return normalizePredicate(ev, macro, v, predicate)
}

function normalizePredicate(ev, macro, v, predicate) {
  if (v instanceof Error) return v
  if (typeof v === 'boolean') return v
  const type = ev.debugRuntimeType(v, predicate.checkedType)
  return new EvaluationError(
    `${macro.functionDesc} predicate must return bool, got '${type}'`,
    predicate
  )
}

function iterate(ev, macro, ctx, state, each) {
  const items = state.items
  const len = items.length
  while (state.index < len && state.return === undefined) {
    const index = state.index++
    const item = items[index]
    const p = each(ev, macro, ctx.setVariableValue(item), state, item, index)
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
    const p = each(ev, macro, ctx.setVariableValue(item), state, item, index)
    if (p instanceof Promise) await p
  }
  return state
}

function handleDeferredPredicateError(e, state) {
  if (e.message.includes('predicate must return bool') || e.message.includes('Unknown variable'))
    throw e
  state.error ??= e
}

function macroAllHandler(ev, macro, ctx, arr) {
  const state = iterate(ev, macro, ctx, {items: arr, index: 0}, eachAllPredicate)
  if (state instanceof Promise) return state.then(finalizeAllState)
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
    const {receiver, variableType, predicateVar} = macro
    const arr = getMacroIterable(ev, receiver, ctx)
    ctx = ctx.forkWithVariable(variableType, predicateVar)
    if (!(arr instanceof Promise)) return fn(ev, macro, ctx, arr)
    return arr.then((a) => fn(ev, macro, ctx, a))
  }
}

function macroExistsHandler(ev, macro, ctx, arr) {
  const state = {items: arr, index: 0, return: undefined, error: null}
  const p = iterate(ev, macro, ctx, state, eachExistsPredicate)
  if (p instanceof Promise) return p.then(finalizeExistsState)
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
  const p = iterate(ev, macro, ctx, state, eachExistsOnePredicate)
  if (p instanceof Promise) return p.then(finalizeExistsOneState)
  return finalizeExistsOneState(state)
}

function eachExistsOnePredicate(ev, macro, ctx, state) {
  const p = evaluatePredicateResult(ev, macro, ctx)
  if (p instanceof Promise) return p.then((value) => handleExistsOneValue(value, state))
  handleExistsOneValue(p, state)
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
  const p = iterate(ev, macro, ctx, state, eachMapTransform)
  if (p instanceof Promise) return p.then(() => state.results)
  return state.results
}

function eachMapTransform(ev, macro, ctx, state, _item, index) {
  const value = ev.eval(macro.transform, ctx)
  if (value instanceof Promise) return value.then((v) => (state.results[index] = v))
  state.results[index] = value
}

function macroFilterMapHandler(ev, macro, ctx, arr) {
  const state = {items: arr, index: 0, return: undefined, results: []}
  const p = iterate(ev, macro, ctx, state, eachFilterMap)
  if (p instanceof Promise) return p.then(() => state.results)
  return state.results
}

function eachFilterMap(ev, macro, ctx, state) {
  const p = evaluatePredicateResult(ev, macro, ctx, macro.filter)
  if (p instanceof Promise) return p.then((v) => handleFilterMapPredicate(v, ev, macro, ctx, state))
  return handleFilterMapPredicate(p, ev, macro, ctx, state)
}

function handleFilterMapPredicate(v, ev, macro, ctx, state) {
  if (v instanceof Error) throw v
  if (!v) return
  return pushTransformValue(ev, macro, ctx, state)
}

function pushTransformValue(ev, macro, ctx, state) {
  const value = ev.eval(macro.transform, ctx)
  if (value instanceof Promise) return value.then((v) => state.results.push(v))
  state.results.push(value)
}

function macroFilterHandler(ev, macro, ctx, arr) {
  const state = {items: arr, index: 0, return: undefined, results: []}
  const p = iterate(ev, macro, ctx, state, eachFilterPredicate)
  if (p instanceof Promise) return p.then(() => state.results)
  return state.results
}

function eachFilterPredicate(ev, macro, ctx, state, item) {
  const p = evaluatePredicateResult(ev, macro, ctx)
  if (p instanceof Promise) return p.then((value) => handleFilterValue(value, state, item))
  handleFilterValue(p, state, item)
}

function handleFilterValue(value, state, item) {
  if (value instanceof Error) throw value
  if (value) state.results.push(item)
}

function getIterableElementType(checker, receiverType, macro) {
  if (receiverType.kind === 'dyn') return receiverType
  if (receiverType.kind === 'list') return receiverType.valueType
  if (receiverType.kind === 'map') return receiverType.keyType
  throw new checker.Error(
    `Expression of type '${receiverType}' cannot be range of a comprehension (must be list, map, or dynamic).`,
    macro.receiver
  )
}

function createCheckCtx(checker, macro, ctx) {
  const elementType = getIterableElementType(checker, checker.check(macro.receiver, ctx), macro)
  return ctx.forkWithVariable(elementType, macro.predicateVar)
}

function typeCheckQuantifierMacro(checker, macro, ctx) {
  ctx = createCheckCtx(checker, macro, ctx)
  macro.variableType = ctx.variableType
  const type = checker.check(macro.predicate, ctx)
  if (type.isDynOrBool()) return type
  throw new checker.Error(
    `${macro.functionDesc} predicate must return bool, got '${type}'`,
    macro.predicate
  )
}

function typeCheckMapMacro(checker, macro, ctx) {
  ctx = createCheckCtx(checker, macro, ctx)
  macro.variableType = ctx.variableType
  if (macro.filter) {
    const filterType = checker.check(macro.filter, ctx)
    if (!filterType.isDynOrBool()) {
      throw new checker.Error(
        `${macro.functionDesc} filter predicate must return bool, got '${filterType}'`,
        macro.filter
      )
    }
  }
  return checker.getType(`list<${checker.check(macro.transform, ctx)}>`)
}

function typeCheckFilterMacro(checker, macro, ctx) {
  ctx = createCheckCtx(checker, macro, ctx)
  macro.variableType = ctx.variableType
  const predicateType = checker.check(macro.predicate, ctx)
  if (predicateType.isDynOrBool()) return checker.getType(`list<${macro.variableType}>`)
  throw new checker.Error(
    `${macro.functionDesc} predicate must return bool, got '${predicateType}'`,
    macro.predicate
  )
}

function createQuantifierExpander({description, evaluator}) {
  const msg = `${description} invalid predicate iteration variable`
  if (!evaluator) throw new Error(`No evaluator provided for quantifier macro: ${description}`)

  return ({args, receiver}) => {
    return {
      functionDesc: description,
      receiver,
      predicate: args[1],
      predicateVar: assertIdentifier(args[0], msg),
      evaluate: evaluator,
      typeCheck: typeCheckQuantifierMacro
    }
  }
}

function createMapExpander(hasFilter) {
  const functionDesc = hasFilter ? 'map(var, filter, transform)' : 'map(var, transform)'
  const invalidPredicateVarMsg = `${functionDesc} invalid predicate iteration variable`
  const evaluate = createMacroHandler(hasFilter ? macroFilterMapHandler : macroMapHandler)
  return ({args, receiver}) => {
    return {
      args,
      functionDesc,
      receiver,
      filter: hasFilter ? args[1] : null,
      transform: hasFilter ? args[2] : args[1],
      predicateVar: assertIdentifier(args[0], invalidPredicateVarMsg),
      evaluate,
      typeCheck: typeCheckMapMacro
    }
  }
}

const filterFunctionDesc = 'filter(var, predicate)'
const filterInvalidPredicateVarMsg = `${filterFunctionDesc} invalid predicate iteration variable`
function filterExpander({args, receiver}) {
  return {
    args,
    functionDesc: filterFunctionDesc,
    receiver,
    predicate: args[1],
    predicateVar: assertIdentifier(args[0], filterInvalidPredicateVarMsg),
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

const invalidHasArgument = 'has() invalid argument'
function typeCheckHasMacro(checker, macro) {
  let node = macro.args[0]
  if (node[0] !== '.') throw new checker.Error(invalidHasArgument, node)
  if (!macro.macroHasProps) {
    const props = []
    while (node[0] === '.' && props.push(node)) node = node[1]
    if (node[0] !== 'id') throw new checker.Error(invalidHasArgument, node)
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

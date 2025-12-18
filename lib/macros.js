import {EvaluationError, ParseError} from './errors.js'

function assertIdentifier(ast, message) {
  if (ast[0] === 'id') return ast[1]
  throw new ParseError(message, ast)
}

function isFatal(state, v) {
  if (typeof v === 'boolean') return false

  if (v instanceof Error) {
    state.error ??= v
    return /predicate must return bool|Unknown variable/.test(v.message)
  }

  const type = state.ev.debugRuntimeType(v, state.firstMacroIter.checkedType)
  state.error = new EvaluationError(
    `${state.macro.functionDesc} predicate must return bool, got '${type}'`,
    state.firstMacroIter
  )
  return true
}

class ComprehensionState {
  items
  results
  error
  constructor(ev, macro, ctx, each, finalizer) {
    this.ev = ev
    this.macro = macro
    this.firstMacroIter = macro.first
    this.ctx = ctx.forkWithVariable(macro.variableType, macro.predicateVar)
    this.each = each
    this.finalizer = finalizer
  }

  toIterable(coll) {
    if (Array.isArray(coll)) return coll
    if (coll instanceof Set) return [...coll]
    if (coll instanceof Map) return [...coll.keys()]
    if (coll && typeof coll === 'object') return Object.keys(coll)
    throw new EvaluationError(
      `Expression of type '${this.ev.debugType(coll)}' cannot be ` +
        `range of a comprehension (must be list, map, or dynamic).`,
      this.macro.receiver
    )
  }

  iterate(coll) {
    const items = this.toIterable(coll)
    for (let i = 0; i < items.length; ) {
      if (this.return !== undefined) break
      const ctx = this.ctx.setVariableValue(items[i++])
      let v = this.ev.tryEval(this.firstMacroIter, ctx)
      if (v instanceof Promise) v = v.then((_v) => this.each(this, ctx, _v))
      else v = this.each(this, ctx, v)
      if (v instanceof Promise) return v.then(() => this.iterateAsync(items, i))
    }
    return this.finalizer(this)
  }

  async iterateAsync(items, offset = 0) {
    if (items instanceof Promise) items = this.toIterable(await items)
    for (let i = offset; i < items.length; ) {
      if (this.return !== undefined) break
      const ctx = this.ctx.setVariableValue(items[i++])
      let v = this.ev.tryEval(this.firstMacroIter, ctx)
      v = this.each(this, ctx, v instanceof Promise ? await v : v)
      if (v instanceof Promise) await v
    }
    return this.finalizer(this)
  }
}

function createIteratee(each, finalizer) {
  return function (ev, macro, ctx) {
    const c = ev.eval(macro.receiver, ctx)
    const state = new ComprehensionState(ev, macro, ctx, each, finalizer)
    if (c instanceof Promise) return state.iterateAsync(c)
    return state.iterate(c)
  }
}

function handleAllValue(state, ctx, v) {
  if (isFatal(state, v)) throw state.error
  if (v === false) state.return = false
}

function finalizeAllState(state) {
  if (state.return !== undefined) return state.return
  if (state.error) throw state.error
  return true
}

function handleExistsValue(state, ctx, v) {
  if (isFatal(state, v)) throw state.error
  if (v === true) state.return = true
}

function finalizeExistsState(state) {
  if (state.return !== undefined) return state.return
  if (state.error) throw state.error
  return false
}

function handleExistsOneValue(state, ctx, v) {
  if (isFatal(state, v) || v instanceof Error) throw state.error
  if (v) {
    if (state.found) state.return = false
    else state.found = true
  }
}

function finalizeExistsOneState(state) {
  if (state.return !== undefined) return state.return
  return state.found === true
}

function finalizeMapState(state) {
  return state.results || []
}

function handleFilterMapPredicate(state, ctx, v) {
  if (v === false) return
  if (isFatal(state, v) || v instanceof Error) throw state.error

  const t = state.ev.eval(state.macro.second, ctx)
  if (t instanceof Promise) return t.then((_t) => (state.results ??= []).push(_t))
  return (state.results ??= []).push(t)
}

function handleTransformValue(state, ctx, v) {
  if (v instanceof Error) throw state.error
  return (state.results ??= []).push(v)
}

function handleFilterValue(state, ctx, v) {
  if (isFatal(state, v) || v instanceof Error) throw state.error
  if (v) (state.results ??= []).push(ctx.variableValue)
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

function createQuantifierExpander({description, evaluator}) {
  const msg = `${description} invalid predicate iteration variable`
  if (!evaluator) throw new Error(`No evaluator provided for quantifier macro: ${description}`)

  function typeCheck(checker, macro, ctx) {
    ctx = createCheckCtx(checker, macro, ctx)
    macro.variableType = ctx.variableType
    const type = checker.check(macro.first, ctx)
    if (type.isDynOrBool()) return type
    throw new checker.Error(
      `${macro.functionDesc} predicate must return bool, got '${type}'`,
      macro.first
    )
  }

  return ({args, receiver}) => {
    return {
      functionDesc: description,
      receiver,
      first: args[1],
      predicateVar: assertIdentifier(args[0], msg),
      evaluate: evaluator,
      typeCheck
    }
  }
}

function createMapExpander(hasFilter) {
  const functionDesc = hasFilter ? 'map(var, filter, transform)' : 'map(var, transform)'
  const invalidPredicateVarMsg = `${functionDesc} invalid predicate iteration variable`
  const evaluate = createIteratee(
    hasFilter ? handleFilterMapPredicate : handleTransformValue,
    finalizeMapState
  )

  function typeCheck(checker, macro, ctx) {
    ctx = createCheckCtx(checker, macro, ctx)
    macro.variableType = ctx.variableType
    if (hasFilter) {
      const filterType = checker.check(macro.first, ctx)
      if (!filterType.isDynOrBool()) {
        throw new checker.Error(
          `${macro.functionDesc} filter predicate must return bool, got '${filterType}'`,
          macro.first
        )
      }
    }
    return checker.getType(`list<${checker.check(hasFilter ? macro.second : macro.first, ctx)}>`)
  }

  return ({args, receiver}) => {
    return {
      args,
      functionDesc,
      receiver,
      first: args[1],
      second: hasFilter ? args[2] : null,
      predicateVar: assertIdentifier(args[0], invalidPredicateVarMsg),
      evaluate,
      typeCheck
    }
  }
}

function createFilterExpander() {
  const functionDesc = 'filter(var, predicate)'
  const invalidPredicateVarMsg = `${functionDesc} invalid predicate iteration variable`

  const evaluate = createIteratee(handleFilterValue, finalizeMapState)
  function typeCheck(checker, macro, ctx) {
    ctx = createCheckCtx(checker, macro, ctx)
    macro.variableType = ctx.variableType
    const type = checker.check(macro.first, ctx)
    if (type.isDynOrBool()) return checker.getType(`list<${macro.variableType}>`)
    throw new checker.Error(
      `${macro.functionDesc} predicate must return bool, got '${type}'`,
      macro.first
    )
  }

  return ({args, receiver}) => {
    return {
      args,
      functionDesc,
      receiver,
      first: args[1],
      predicateVar: assertIdentifier(args[0], invalidPredicateVarMsg),
      evaluate,
      typeCheck
    }
  }
}

function createHasExpander() {
  const invalidHasArgument = 'has() invalid argument'

  function evaluate(ev, macro, ctx) {
    const nodes = macro.macroHasProps
    let i = nodes.length
    let obj = ev.eval(nodes[--i], ctx)
    let inOptionalContext
    while (i--) {
      const node = nodes[i]
      if (node[0] === '.?') inOptionalContext ??= true
      obj = ev.debugType(obj).fieldLazy(obj, node[2], node, ev)
      if (obj !== undefined) continue
      if (!(!inOptionalContext && i && node[0] === '.')) break
      throw new EvaluationError(`No such key: ${node[2]}`, node)
    }
    return obj !== undefined
  }

  function typeCheck(checker, macro) {
    let node = macro.args[0]
    if (node[0] !== '.') throw new checker.Error(invalidHasArgument, node)
    if (!macro.macroHasProps) {
      const props = []
      while ((node[0] === '.' || node[0] === '.?') && props.push(node)) node = node[1]
      if (node[0] !== 'id') throw new checker.Error(invalidHasArgument, node)
      props.push(node)
      macro.macroHasProps = props
    }
    return checker.getType('bool')
  }

  return function ({args}) {
    return {args, evaluate, typeCheck}
  }
}

export function registerMacros(registry) {
  registry.registerFunctionOverload('has(ast): bool', createHasExpander())

  registry.registerFunctionOverload(
    'list.all(ast, ast): bool',
    createQuantifierExpander({
      description: 'all(var, predicate)',
      evaluator: createIteratee(handleAllValue, finalizeAllState)
    })
  )

  registry.registerFunctionOverload(
    'list.exists(ast, ast): bool',
    createQuantifierExpander({
      description: 'exists(var, predicate)',
      evaluator: createIteratee(handleExistsValue, finalizeExistsState)
    })
  )

  registry.registerFunctionOverload(
    'list.exists_one(ast, ast): bool',
    createQuantifierExpander({
      description: 'exists_one(var, predicate)',
      evaluator: createIteratee(handleExistsOneValue, finalizeExistsOneState)
    })
  )

  registry.registerFunctionOverload('list.map(ast, ast): list<dyn>', createMapExpander(false))
  registry.registerFunctionOverload('list.map(ast, ast, ast): list<dyn>', createMapExpander(true))
  registry.registerFunctionOverload('list.filter(ast, ast): list<dyn>', createFilterExpander())
}

import {EvaluationError, ParseError} from './errors.js'
import {ASTNode} from './parser.js'
import {OPERATORS as OPS} from './operators.js'
const identity = (x) => x

function assertIdentifier(node, message) {
  if (node.op === 'id') return node.args
  throw new ParseError(message, node)
}

function ast(callAst, op, args) {
  return new ASTNode(callAst.input, callAst.pos, op, args)
}

function createMapExpander(hasFilter) {
  const functionDesc = hasFilter ? 'map(var, filter, transform)' : 'map(var, transform)'
  const invalidMsg = `${functionDesc} invalid predicate iteration variable`
  const label = `${functionDesc} filter predicate must return bool`

  return ({args, receiver, ast: callAst}) => {
    const [iterVar, predicate, transform] = hasFilter ? args : [args[0], null, args[1]]

    let step = ast(transform, OPS.accuPush, transform)
    if (predicate) {
      const accuValue = ast(predicate, OPS.accuValue)
      step = ast(predicate, OPS.ternary, [predicate.setMeta('label', label), step, accuValue])
    }

    return {
      callAst: ast(callAst, OPS.comprehension, {
        errorsAreFatal: true,
        iterable: receiver,
        iterVarName: assertIdentifier(iterVar, invalidMsg),
        init: ast(callAst, OPS.list, []),
        step,
        result: identity
      })
    }
  }
}

function createFilterExpander() {
  const functionDesc = 'filter(var, predicate)'
  const invalidMsg = `${functionDesc} invalid predicate iteration variable`
  const label = `${functionDesc} predicate must return bool`

  return ({args, receiver, ast: callAst}) => {
    const iterVarName = assertIdentifier(args[0], invalidMsg)
    const accuValue = ast(callAst, OPS.accuValue)
    const predicate = args[1].setMeta('label', label)
    const appendItem = ast(callAst, OPS.accuPush, ast(callAst, OPS.id, iterVarName))
    const step = ast(predicate, OPS.ternary, [predicate, appendItem, accuValue])

    return {
      callAst: ast(callAst, OPS.comprehension, {
        errorsAreFatal: true,
        iterable: receiver,
        iterVarName,
        init: ast(callAst, OPS.list, []),
        step,
        result: identity
      })
    }
  }
}

function createQuantifierExpander(opts) {
  const invalidMsg = `${opts.name}(var, predicate) invalid predicate iteration variable`
  const label = `${opts.name}(var, predicate) predicate must return bool`
  return ({args, receiver, ast: callAst}) => {
    const predicate = args[1].setMeta('label', label)
    const transform = opts.transform({args, ast: callAst, predicate, opts})

    return {
      callAst: ast(callAst, OPS.comprehension, {
        kind: 'quantifier',
        errorsAreFatal: opts.errorsAreFatal || false,
        iterable: receiver,
        iterVarName: assertIdentifier(args[0], invalidMsg),
        init: transform.init,
        condition: transform.condition,
        step: transform.step,
        result: transform.result || identity
      })
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
      if (node.op === '.?') inOptionalContext ??= true
      obj = ev.debugType(obj).fieldLazy(obj, node.args[1], node, ev)
      if (obj !== undefined) continue
      if (!(!inOptionalContext && i && node.op === '.')) break
      throw new EvaluationError(`No such key: ${node.args[1]}`, node)
    }
    return obj !== undefined
  }

  function typeCheck(checker, macro, ctx) {
    let node = macro.args[0]
    if (node.op !== '.') throw new checker.Error(invalidHasArgument, node)
    if (!macro.macroHasProps) {
      const props = []
      while (node.op === '.' || node.op === '.?') node = props.push(node) && node.args[0]
      if (node.op !== 'id') throw new checker.Error(invalidHasArgument, node)
      checker.check(node, ctx)
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
      name: 'all',
      transform({ast: callAst, predicate, opts}) {
        return {
          init: ast(callAst, OPS.value, true),
          condition: identity,
          step: ast(predicate, OPS.ternary, [
            predicate,
            ast(predicate, OPS.value, true),
            ast(predicate, OPS.value, false)
          ])
        }
      }
    })
  )

  registry.registerFunctionOverload(
    'list.exists(ast, ast): bool',
    createQuantifierExpander({
      name: 'exists',
      condition(accu) {
        return !accu
      },
      transform({ast: callAst, predicate, opts}) {
        return {
          init: ast(callAst, OPS.value, false),
          condition: opts.condition,
          step: ast(predicate, OPS.ternary, [
            predicate,
            ast(predicate, OPS.value, true),
            ast(predicate, OPS.value, false)
          ])
        }
      }
    })
  )

  registry.registerFunctionOverload(
    'list.exists_one(ast, ast): bool',
    createQuantifierExpander({
      name: 'exists_one',
      errorsAreFatal: true,
      result(accu) {
        return accu === 1
      },
      transform({ast: callAst, predicate, opts}) {
        const accuValue = ast(callAst, OPS.accuValue)
        return {
          init: ast(callAst, OPS.value, 0),
          step: ast(predicate, OPS.ternary, [predicate, ast(callAst, OPS.accuInc), accuValue]),
          result: opts.result
        }
      }
    })
  )

  registry.registerFunctionOverload('list.map(ast, ast): list<dyn>', createMapExpander(false))
  registry.registerFunctionOverload('list.map(ast, ast, ast): list<dyn>', createMapExpander(true))
  registry.registerFunctionOverload('list.filter(ast, ast): list<dyn>', createFilterExpander())

  function bindOptionalEvaluate(ev, macro, ctx, boundValue) {
    const res = ev.eval(macro.exp, (ctx = macro.bindCtx.reuse(ctx).setIterValue(boundValue)))
    if (res instanceof Promise && ctx === macro.bindCtx) ctx.async = true
    return res
  }

  class CelNamespace {}
  const celNamespace = new CelNamespace()
  registry.registerType('CelNamespace', CelNamespace)
  registry.registerConstant('cel', 'CelNamespace', celNamespace)

  function bindTypeCheck(checker, macro, ctx) {
    macro.bindCtx = ctx.forkWithVariable(macro.var, checker.check(macro.val, ctx))
    return checker.check(macro.exp, macro.bindCtx)
  }

  function bindEvaluate(ev, macro, ctx) {
    const v = ev.eval(macro.val, ctx)
    if (v instanceof Promise) return v.then((_v) => bindOptionalEvaluate(ev, macro, ctx, _v))
    return bindOptionalEvaluate(ev, macro, ctx, v)
  }

  registry.registerFunctionOverload('CelNamespace.bind(ast, dyn, ast): dyn', ({args}) => {
    return {
      var: assertIdentifier(args[0], 'invalid variable argument'),
      val: args[1],
      exp: args[2],
      bindCtx: undefined,
      typeCheck: bindTypeCheck,
      evaluate: bindEvaluate
    }
  })
}

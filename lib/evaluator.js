import {createRegistry, RootContext} from './registry.js'
import {EvaluationError} from './errors.js'
import {registerFunctions, Duration, UnsignedInt} from './functions.js'
import {registerMacros} from './macros.js'
import {registerOverloads} from './overloads.js'
import {TypeChecker} from './type-checker.js'
import {Parser} from './parser.js'
import {createOptions} from './options.js'
import {Base} from './operators.js'

const globalRegistry = createRegistry({enableOptionalTypes: false})
registerFunctions(globalRegistry)
registerOverloads(globalRegistry)
registerMacros(globalRegistry)

const registryByEnvironment = new WeakMap()

class Environment {
  #registry
  #evaluator
  #typeChecker
  #evalTypeChecker
  #parser

  constructor(opts, inherited) {
    this.opts = createOptions(opts, inherited?.opts)
    this.#registry = (
      inherited instanceof Environment ? registryByEnvironment.get(inherited) : globalRegistry
    ).clone(this.opts)

    const childOpts = {
      objectTypes: this.#registry.objectTypes,
      objectTypesByConstructor: this.#registry.objectTypesByConstructor,
      registry: this.#registry,
      opts: this.opts
    }

    this.#typeChecker = new TypeChecker(childOpts)
    this.#evalTypeChecker = new TypeChecker(childOpts, true)
    this.#evaluator = new Evaluator(childOpts)
    this.#parser = new Parser(this.opts.limits, this.#registry)
    registryByEnvironment.set(this, this.#registry)
    Object.freeze(this)
  }

  clone(opts) {
    return new Environment(opts, this)
  }

  registerFunction(signature, handler, opts) {
    this.#registry.registerFunctionOverload(signature, handler, opts)
    return this
  }

  registerOperator(string, handler) {
    this.#registry.registerOperatorOverload(string, handler)
    return this
  }

  registerType(typename, constructor) {
    this.#registry.registerType(typename, constructor)
    return this
  }

  registerVariable(name, type, opts) {
    this.#registry.registerVariable(name, type, opts)
    return this
  }

  registerConstant(name, type, value) {
    this.#registry.registerConstant(name, type, value)
    return this
  }

  hasVariable(name) {
    return this.#registry.variables.has(name)
  }

  getDefinitions() {
    return this.#registry.getDefinitions()
  }

  check(expression) {
    try {
      return this.#checkAST(this.#parser.parse(expression))
    } catch (e) {
      return {valid: false, error: e}
    }
  }

  #checkAST(ast) {
    try {
      const typeDecl = this.#typeChecker.check(ast, new RootContext(this.#registry))
      return {valid: true, type: this.#formatTypeForCheck(typeDecl)}
    } catch (e) {
      return {valid: false, error: e}
    }
  }

  #formatTypeForCheck(typeDecl) {
    if (typeDecl.name === `list<dyn>`) return 'list'
    if (typeDecl.name === `map<dyn, dyn>`) return 'map'
    return typeDecl.name
  }

  parse(expression) {
    const ast = this.#parser.parse(expression)
    const evaluateParsed = this.#evaluateAST.bind(this, ast)
    evaluateParsed.check = this.#checkAST.bind(this, ast)
    evaluateParsed.ast = ast
    return evaluateParsed
  }

  evaluate(expression, context) {
    return this.#evaluateAST(this.#parser.parse(expression), context)
  }

  #evaluateAST(ast, ctx) {
    ctx = new RootContext(this.#registry, ctx)
    if (!ast.checkedType) this.#evalTypeChecker.check(ast, ctx)
    return this.#evaluator.eval(ast, ctx)
  }
}

class Evaluator extends Base {
  constructor(opts) {
    super(opts)
    this.Error = EvaluationError
  }

  #inferListType(list, fb) {
    const first = list instanceof Array ? list[0] : list.values().next().value
    if (first === undefined) return fb
    return this.registry.getListType(this.debugRuntimeType(first, fb.valueType))
  }

  #firstMapElement(coll) {
    if (coll instanceof Map) return coll.entries().next().value
    for (const key in coll) return [key, coll[key]]
  }

  #inferMapType(value, fb) {
    const first = this.#firstMapElement(value)
    if (!first) return fb
    return this.registry.getMapType(
      this.debugRuntimeType(first[0], fb.keyType),
      this.debugRuntimeType(first[1], fb.valueType)
    )
  }

  debugOperandType(value, checkedType) {
    if (checkedType?.hasNoDynTypes()) return checkedType
    return this.debugRuntimeType(value, checkedType).wrappedType
  }

  debugRuntimeType(value, checkedType) {
    if (checkedType?.hasNoDynTypes()) return checkedType

    const runtimeType = this.debugType(value)
    switch (runtimeType.kind) {
      case 'list':
        return this.#inferListType(value, runtimeType)
      case 'map':
        return this.#inferMapType(value, runtimeType)
      default:
        return runtimeType
    }
  }

  tryEval(ast, ctx) {
    try {
      const res = this.eval(ast, ctx)
      if (res instanceof Promise) return res.catch((err) => err)
      return res
    } catch (err) {
      return err
    }
  }

  eval(ast, ctx) {
    return ast.evaluate(this, ast, ctx)
  }
}

const globalEnvironment = new Environment({
  unlistedVariablesAreDyn: true
})

export function parse(expression) {
  return globalEnvironment.parse(expression)
}

export function evaluate(expression, context) {
  return globalEnvironment.evaluate(expression, context)
}

export function check(expression) {
  return globalEnvironment.check(expression)
}

export {Duration, UnsignedInt, Environment}

export default {
  parse,
  evaluate,
  check,
  Environment,
  Duration,
  UnsignedInt
}

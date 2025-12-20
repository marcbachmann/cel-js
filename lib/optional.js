import {EvaluationError} from './errors.js'

export class Optional {
  #value

  constructor(value) {
    this.#value = value
  }

  static of(value) {
    if (value === undefined) return OPTIONAL_NONE
    return new Optional(value)
  }

  static none() {
    return OPTIONAL_NONE
  }

  hasValue() {
    return this.#value !== undefined
  }

  value() {
    if (this.#value === undefined) throw new EvaluationError('Optional value is not present')
    return this.#value
  }

  or(optional) {
    if (this.#value !== undefined) return this
    if (optional instanceof Optional) return optional
    throw new EvaluationError('Optional.or must be called with an Optional argument')
  }

  orValue(defaultValue) {
    return this.#value === undefined ? defaultValue : this.#value
  }

  get [Symbol.toStringTag]() {
    return 'optional'
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.#value === undefined
      ? `Optional { none }`
      : `Optional { value: ${JSON.stringify(this.#value)} }`
  }
}

export const OPTIONAL_NONE = Object.freeze(new Optional())

class OptionalNamespace {}
const optionalNamespace = new OptionalNamespace()

export function toggleOptionalTypes(registry, enable) {
  registry.constants.set('optional', enable ? optionalNamespace : undefined)
}

export function register(registry) {
  const functionOverload = (sig, handler) => registry.registerFunctionOverload(sig, handler)

  const optionalConstant = registry.enableOptionalTypes ? optionalNamespace : undefined
  registry.registerType('OptionalNamespace', OptionalNamespace)
  registry.registerConstant('optional', 'OptionalNamespace', optionalConstant)
  functionOverload('optional.hasValue(): bool', (v) => v.hasValue())
  functionOverload('optional<A>.value(): A', (v) => v.value())
  registry.registerFunctionOverload('OptionalNamespace.none(): optional<T>', () => Optional.none())
  functionOverload('OptionalNamespace.of(A): optional<A>', (_, value) => Optional.of(value))
  function ensureOptional(value, ast, description) {
    if (value instanceof Optional) return value
    throw new EvaluationError(`${description} must be optional`, ast)
  }

  function evaluateOptional(ev, macro, ctx) {
    const v = ev.eval(macro.receiver, ctx)
    if (v instanceof Promise) return v.then((_v) => handleOptionalResolved(_v, ev, macro, ctx))
    return handleOptionalResolved(v, ev, macro, ctx)
  }

  function handleOptionalResolved(value, ev, macro, ctx) {
    const optional = ensureOptional(value, macro.receiver, `${macro.functionDesc} receiver`)
    if (optional.hasValue()) return macro.onHasValue(optional)
    return macro.onEmpty(ev, macro, ctx)
  }

  function ensureOptionalType(checker, node, ctx, description) {
    const type = checker.check(node, ctx)
    if (type.kind === 'optional') return type
    if (type.kind === 'dyn') return checker.getType('optional')
    throw new checker.Error(`${description} must be optional, got '${type}'`, node)
  }

  function createOptionalMacro({functionDesc, evaluate, typeCheck, onHasValue, onEmpty}) {
    return ({args, receiver}) => ({
      functionDesc,
      receiver,
      arg: args[0],
      evaluate,
      typeCheck,
      onHasValue,
      onEmpty
    })
  }

  const invalidOrValueReceiver = 'optional.orValue() receiver'
  const invalidOrReceiver = 'optional.or(optional) receiver'
  const invalidOrArg = 'optional.or(optional) argument'
  registry.registerFunctionOverload(
    'optional.or(ast): optional<dyn>',
    createOptionalMacro({
      functionDesc: 'optional.or(optional)',
      evaluate: evaluateOptional,
      typeCheck(check, macro, ctx) {
        const l = ensureOptionalType(check, macro.receiver, ctx, invalidOrReceiver)
        const r = ensureOptionalType(check, macro.arg, ctx, invalidOrArg)
        const unified = l.unify(check.registry, r)
        if (unified) return unified
        throw new check.Error(
          `${macro.functionDesc} argument must be compatible type, got '${l}' and '${r}'`,
          macro.arg
        )
      },
      onHasValue: (optional) => optional,
      onEmpty(ev, macro, ctx) {
        const ast = macro.arg
        const v = ev.eval(ast, ctx)
        if (v instanceof Promise) return v.then((_v) => ensureOptional(_v, ast, invalidOrArg))
        return ensureOptional(v, ast, invalidOrArg)
      }
    })
  )

  registry.registerFunctionOverload(
    'optional.orValue(ast): dyn',
    createOptionalMacro({
      functionDesc: 'optional.orValue(value)',
      onHasValue: (optionalValue) => optionalValue.value(),
      onEmpty(ev, macro, ctx) {
        return ev.eval(macro.arg, ctx)
      },
      evaluate: evaluateOptional,
      typeCheck(check, macro, ctx) {
        const l = ensureOptionalType(check, macro.receiver, ctx, invalidOrValueReceiver).valueType
        const r = check.check(macro.arg, ctx)
        const unified = l.unify(check.registry, r)
        if (unified) return unified
        throw new check.Error(
          `${macro.functionDesc} argument must be compatible type, got '${l}' and '${r}'`,
          macro.arg
        )
      }
    })
  )
}

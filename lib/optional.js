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

  or(defaultValue) {
    return this.#value === undefined ? new Optional(defaultValue) : this
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

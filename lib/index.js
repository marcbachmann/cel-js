import {ParseError, EvaluationError, TypeError} from './errors.js'
import {parse, evaluate, check, Environment} from './evaluator.js'
import {serialize} from './serialize.js'

export {parse, evaluate, check, Environment, ParseError, EvaluationError, TypeError, serialize}

export default {
  parse,
  evaluate,
  check,
  Environment,
  ParseError,
  EvaluationError,
  TypeError,
  serialize
}

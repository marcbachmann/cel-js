import {ParseError, EvaluationError, TypeError} from './errors.js'
import {parse, evaluate, check, Environment} from './evaluator.js'
import {serialize} from './serialize.js'
import {Optional} from './optional.js'

export {parse, evaluate, check, Environment, ParseError, EvaluationError, TypeError, serialize, Optional}

export default {
  parse,
  evaluate,
  check,
  Environment,
  ParseError,
  EvaluationError,
  TypeError,
  serialize,
  Optional
}

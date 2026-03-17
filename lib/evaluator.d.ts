import {Environment, check, evaluate, parse} from './index.js'
import {Duration, UnsignedInt} from './functions.js'

export {Environment, check, evaluate, parse}
export {Duration, UnsignedInt} from './functions.js'

declare const evaluator: {
  parse: typeof parse
  evaluate: typeof evaluate
  check: typeof check
  Environment: typeof Environment
  Duration: typeof Duration
  UnsignedInt: typeof UnsignedInt
}

export default evaluator

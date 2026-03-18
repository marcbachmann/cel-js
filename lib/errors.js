class CelError extends Error {
  #node
  #code
  #range
  #summary
  #diagnostic

  constructor(name, message, node, causeOrOptions) {
    const {cause, code, range, related} = normalizeErrorOptions(causeOrOptions)
    if (cause === undefined) super(message)
    else super(message, {cause})

    this.name = name
    this.#summary = message
    this.#node = node
    this.#range = normalizeRange(range || rangeFromNode(node))
    this.#code = code || inferDiagnosticCode(name, message)
    this.#diagnostic = createDiagnostic(this.#summary, this.#code, this.#range, related)

    if (!node?.input) return
    this.message = formatErrorWithHighlight(this.#summary, node, this.#range)
  }

  get node() {
    return this.#node
  }

  get code() {
    return this.#code
  }

  get range() {
    return this.#range
  }

  get summary() {
    return this.#summary
  }

  get diagnostic() {
    return this.#diagnostic
  }

  withAst(node) {
    if (this.#node || !node?.input) return this
    this.#node = node
    this.#range = this.#range || normalizeRange(rangeFromNode(node))
    this.#diagnostic = createDiagnostic(this.#summary, this.#code, this.#range, this.#diagnostic.related)
    this.message = formatErrorWithHighlight(this.#summary, node, this.#range)
    return this
  }
}

export class ParseError extends CelError {
  constructor(message, node, causeOrOptions) {
    super('ParseError', message, node, causeOrOptions)
  }
}

export class EvaluationError extends CelError {
  constructor(message, node, causeOrOptions) {
    super('EvaluationError', message, node, causeOrOptions)
  }
}

export class TypeError extends CelError {
  constructor(message, node, causeOrOptions) {
    super('TypeError', message, node, causeOrOptions)
  }
}

function normalizeErrorOptions(causeOrOptions) {
  if (!causeOrOptions || typeof causeOrOptions !== 'object' || causeOrOptions instanceof Error) {
    return {cause: causeOrOptions}
  }

  if (hasExplicitDiagnosticMetadata(causeOrOptions)) {
    return causeOrOptions
  }

  if (isCodeOnlyOptionBag(causeOrOptions)) {
    return causeOrOptions
  }

  return {cause: causeOrOptions}
}

function hasExplicitDiagnosticMetadata(causeOrOptions) {
  if (
    Object.hasOwn(causeOrOptions, 'cause') ||
    Object.hasOwn(causeOrOptions, 'range') ||
    Object.hasOwn(causeOrOptions, 'related')
  ) {
    return true
  }
  return false
}

function isCodeOnlyOptionBag(causeOrOptions) {
  return (
    Object.keys(causeOrOptions).length === 1 &&
    Object.hasOwn(causeOrOptions, 'code') &&
    typeof causeOrOptions.code === 'string' &&
    /^[a-z][a-z0-9_]*$/.test(causeOrOptions.code)
  )
}

function normalizeRange(range) {
  if (!range) return
  const start = range.start ?? range.pos
  if (typeof start !== 'number') return
  const end = typeof range.end === 'number' ? range.end : start
  return {start, end}
}

function rangeFromNode(node) {
  if (node?.pos === undefined) return
  const start = typeof node.start === 'number' ? node.start : node.pos
  const end = typeof node.end === 'number' ? node.end : start
  return {start, end}
}

function createDiagnostic(message, code, range, related) {
  return {
    message,
    code,
    severity: 'error',
    range,
    related
  }
}

function inferDiagnosticCode(name, message) {
  switch (name) {
    case 'ParseError':
      return inferParseDiagnosticCode(message) || 'parse_error'
    case 'TypeError':
      return inferSemanticDiagnosticCode(message) || 'type_error'
    case 'EvaluationError':
      return inferSemanticDiagnosticCode(message) || 'evaluation_error'
  }
}

function inferParseDiagnosticCode(message) {
  if (message === 'Expression must be a string') return 'expression_must_be_string'
  if (message.startsWith('Expected ')) return 'expected_token'
  if (message.startsWith('Unexpected token: ')) return 'unexpected_token'
  if (message.startsWith('Unexpected character: ')) return 'unexpected_character'
  if (message.startsWith('Exceeded ')) return 'limit_exceeded'
  if (message.startsWith('Reserved identifier: ')) return 'reserved_identifier'
  if (message.startsWith('Invalid number: ')) return 'invalid_number'
  if (message.startsWith('Invalid hex integer: ')) return 'invalid_hex_integer'
  if (message.startsWith('Invalid integer: ')) return 'invalid_integer'
  if (message === 'Invalid exponent') return 'invalid_exponent'
  if (message === 'Newlines not allowed in single-quoted strings') return 'newline_in_string'
  if (message === 'Unterminated string') return 'unterminated_string'
  if (message === 'Unterminated triple-quoted string') return 'unterminated_triple_quoted_string'
  if (message === '\\u not allowed in bytes literals') return 'bytes_unicode_escape'
  if (message === '\\U not allowed in bytes literals') return 'bytes_unicode_escape'
  if (message.startsWith('Invalid Unicode escape: ')) return 'invalid_unicode_escape'
  if (message.startsWith('Invalid Unicode surrogate: ')) return 'invalid_unicode_surrogate'
  if (message.startsWith('Invalid hex escape: ')) return 'invalid_hex_escape'
  if (message === 'Octal escape must be 3 digits') return 'invalid_octal_escape'
  if (message.startsWith('Octal escape out of range: ')) return 'octal_escape_out_of_range'
  if (message.startsWith('Invalid escape sequence: ')) return 'invalid_escape_sequence'
  if (message.endsWith(' invalid predicate iteration variable')) return 'invalid_macro_argument'
  if (message.endsWith(' invalid argument')) return 'invalid_macro_argument'
}

function inferSemanticDiagnosticCode(message) {
  if (message === 'Context must be an object') return 'invalid_context'
  if (message === 'Unsigned integer overflow' || message.startsWith('integer overflow: ')) {
    return 'numeric_overflow'
  }
  if (message === 'division by zero') return 'division_by_zero'
  if (message === 'modulo by zero') return 'modulo_by_zero'
  if (message.startsWith('Unknown variable: ')) return 'unknown_variable'
  if (message.startsWith('Variable ') && message.includes(` is not of type '`)) {
    return 'variable_type_mismatch'
  }
  if (message.startsWith('Field ') && message.includes(` is not of type '`)) {
    return 'field_type_mismatch'
  }
  if (message.startsWith('List item with index ')) return 'list_item_type_mismatch'
  if (message.startsWith('List index must be int')) return 'invalid_index_type'
  if (message.startsWith('Cannot index type ') && message.includes(` with type '`)) {
    return 'invalid_index_type'
  }
  if (message.startsWith('Cannot index type ')) return 'cannot_index_type'
  if (message.startsWith('No such key: index out of bounds')) return 'index_out_of_bounds'
  if (message.startsWith('No such key: ')) return 'no_such_key'
  if (message.startsWith('no such overload: ')) return 'no_such_overload'
  if (message.startsWith(`found no matching overload for '`)) return 'no_matching_overload'
  if (message.startsWith('Logical operator requires bool operands')) {
    return 'invalid_logical_operand'
  }
  if (message.includes('must return bool') || message.startsWith('Ternary condition must be bool')) {
    return 'invalid_condition_type'
  }
  if (message.startsWith('Ternary branches must have the same type')) {
    return 'incompatible_ternary_branches'
  }
  if (message.startsWith('List elements must have the same type')) {
    return 'heterogeneous_list_element'
  }
  if (message.startsWith('Map key uses wrong type')) return 'heterogeneous_map_key'
  if (message.startsWith('Map value uses wrong type')) return 'heterogeneous_map_value'
  if (message.includes('cannot be range of a comprehension')) return 'invalid_comprehension_range'
  if (message.includes('argument must be compatible type')) return 'incompatible_argument_type'
  if (message === 'Optional value is not present') return 'optional_value_missing'
  if (message === 'Optional.or must be called with an Optional argument') {
    return 'invalid_optional_argument'
  }
  if (message.endsWith(' must be optional') || message.includes(' must be optional, got ')) {
    return 'optional_expected'
  }
  if (message.startsWith('Unsupported type: ')) return 'unsupported_type'
  if (message.startsWith('bool() conversion error: ')) return 'bool_conversion_error'
  if (message.startsWith('double() type error: ')) return 'double_conversion_error'
  if (message === 'int() type error: integer overflow') return 'numeric_overflow'
  if (message.startsWith('int() type error: ')) return 'int_conversion_error'
  if (message === 'uint() type error: unsigned integer overflow') return 'numeric_overflow'
  if (message.startsWith('uint() type error: ')) return 'uint_conversion_error'
  if (message.startsWith('string.indexOf(search, fromIndex): fromIndex out of range')) {
    return 'index_out_of_range'
  }
  if (message.startsWith('string.lastIndexOf(search, fromIndex): fromIndex out of range')) {
    return 'index_out_of_range'
  }
  if (message.startsWith('string.substring(start, end): start index out of range')) {
    return 'index_out_of_range'
  }
  if (message.startsWith('string.substring(start, end): end index out of range')) {
    return 'index_out_of_range'
  }
  if (message === 'Bytes index out of range') return 'index_out_of_range'
  if (message.startsWith('Invalid regular expression: ')) return 'invalid_regular_expression'
  if (
    message === 'string.join(): list must contain only strings' ||
    message === 'string.join(separator): list must contain only strings'
  ) {
    return 'invalid_list_element_type'
  }
  if (
    message === 'timestamp() requires a string in ISO 8601 format' ||
    message === 'timestamp() requires a valid integer unix timestamp'
  ) {
    return 'invalid_timestamp'
  }
  if (message.startsWith('Invalid duration string: ')) return 'invalid_duration'
  if (message.startsWith('Cannot compare values of type ')) return 'invalid_comparison_type'
}

function formatErrorWithHighlight(message, node, range) {
  if (!node?.input) return message
  range = normalizeRange(range || rangeFromNode(node))
  if (!range) return message

  const pos = range.start
  const input = node.input

  let lineNum = 1
  let currentPos = 0
  let columnNum = 0
  while (currentPos < pos) {
    if (input[currentPos] === '\n') {
      lineNum++
      columnNum = 0
    } else {
      columnNum++
    }
    currentPos++
  }

  let contextStart = pos
  let contextEnd = pos
  while (contextStart > 0 && input[contextStart - 1] !== '\n') contextStart--
  while (contextEnd < input.length && input[contextEnd] !== '\n') contextEnd++

  const line = input.slice(contextStart, contextEnd)
  const end = Math.max(pos, Math.min(range.end, contextEnd))
  const highlightLength = Math.max(1, end - pos)
  const highlight = `> ${`${lineNum}`.padStart(4, ' ')} | ${line}\n${' '.repeat(
    9 + columnNum
  )}${'^'.repeat(highlightLength)}`

  return `${message}\n\n${highlight}`
}

export function attachErrorAst(error, node) {
  if (error?.withAst instanceof Function) return error.withAst(node)
  return error
}

class CelError extends Error {
  #node
  #code
  #range
  #summary
  #diagnostic

  constructor(name, defaultCode, message, node, cause, options = {}) {
    super(message, cause ? {cause} : undefined)

    this.name = name
    this.#summary = message
    this.#node = node
    this.#range = normalizeRange(options.range) || normalizeRange(node)
    this.#code = options.code || defaultCode
    this.#diagnostic = createDiagnostic(this.#summary, this.#code, this.#range, options.related)

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
    this.#range ??= normalizeRange(node)
    this.#diagnostic = createDiagnostic(
      this.#summary,
      this.#code,
      this.#range,
      this.#diagnostic.related
    )
    this.message = formatErrorWithHighlight(this.#summary, node, this.#range)
    return this
  }
}

export class ParseError extends CelError {
  constructor(message, node, cause, options) {
    super('ParseError', 'parse_error', message, node, cause, options)
  }
}

export class EvaluationError extends CelError {
  constructor(message, node, cause, options) {
    super('EvaluationError', 'evaluation_error', message, node, cause, options)
  }
}

export class TypeError extends CelError {
  constructor(message, node, cause, options) {
    super('TypeError', 'type_error', message, node, cause, options)
  }
}

function diagnosticOptions(code, options) {
  return options ? {...options, code} : {code}
}

export function parseError(code, message, node, cause, options) {
  return new ParseError(message, node, cause, diagnosticOptions(code, options))
}

export function evaluationError(code, message, node, cause, options) {
  return new EvaluationError(message, node, cause, diagnosticOptions(code, options))
}

export function typeError(code, message, node, cause, options) {
  return new TypeError(message, node, cause, diagnosticOptions(code, options))
}

function normalizeRange(node) {
  const start = node?.start ?? node?.pos
  if (typeof start !== 'number') return
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

function formatErrorWithHighlight(message, node, range) {
  const pos = node.pos ?? (normalizeRange(range) || normalizeRange(node))?.start
  if (typeof pos !== 'number') return message

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
  const highlight = `> ${`${lineNum}`.padStart(4, ' ')} | ${line}\n${' '.repeat(9 + columnNum)}^`

  return `${message}\n\n${highlight}`
}

export function attachErrorAst(error, node) {
  if (error instanceof CelError) return error.withAst(node)
  return error
}

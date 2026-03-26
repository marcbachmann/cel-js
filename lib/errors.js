class CelError extends Error {
  #node
  #code
  #range
  #summary

  constructor({name, code, message, node, cause, range}) {
    super(message, cause ? {cause} : undefined)

    this.name = name
    this.#code = code

    this.#summary = message
    this.#node = node
    this.#range = (range && normalizeRange(range)) || normalizeRange(node)

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

  withAst(node) {
    if (this.#node || !node?.input) return this
    this.#node = node
    this.#range ??= normalizeRange(node)
    this.message = formatErrorWithHighlight(this.#summary, node, this.#range)
    return this
  }
}

function normalizeArgs(name, defaultCode, message, node, cause) {
  if (typeof message === 'string') return {name, code: defaultCode, message, node, cause}

  const opts = message
  if (typeof opts !== 'object') throw new Error('First param to error must be a string or object')

  return {
    name,
    code: opts.code || defaultCode,
    message: opts.message,
    node: opts.node,
    cause: opts.cause,
    range: opts.range
  }
}

export class ParseError extends CelError {
  constructor(message, node, cause) {
    super(normalizeArgs('ParseError', 'parse_error', message, node, cause))
  }
}

export class EvaluationError extends CelError {
  constructor(message, node, cause) {
    super(normalizeArgs('EvaluationError', 'evaluation_error', message, node, cause))
  }
}

export class TypeError extends CelError {
  constructor(message, node, cause) {
    super(normalizeArgs('TypeError', 'type_error', message, node, cause))
  }
}

export function parseError(code, message, node) {
  if (typeof code === 'object') return new ParseError(code)
  return new ParseError({code, message, node})
}

export function evaluationError(code, message, node) {
  if (typeof code === 'object') return new EvaluationError(code)
  return new EvaluationError({code, message, node})
}

export function typeError(code, message, node) {
  if (typeof code === 'object') return new TypeError(code)
  return new TypeError({code, message, node})
}

function normalizeRange(node) {
  const start = node?.pos ?? node?.start
  if (typeof start !== 'number') return
  const end = typeof node.end === 'number' ? node.end : start
  return {start, end}
}

function formatErrorWithHighlight(message, node, range) {
  const pos = node.pos ?? range?.start
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

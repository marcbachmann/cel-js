class CelError extends Error {
  #node
  #range
  #summary

  constructor(name, message, node, cause) {
    if (cause === undefined) super(message)
    else super(message, {cause})

    this.name = name
    this.#summary = message
    this.#node = node
    this.#range = normalizeRange(rangeFromNode(node))

    if (!node?.input) return
    this.message = formatErrorWithHighlight(this.#summary, node, this.#range)
  }

  get node() {
    return this.#node
  }

  get range() {
    return this.#range
  }

  withAst(node) {
    if (this.#node || !node?.input) return this
    this.#node = node
    this.#range = this.#range || normalizeRange(rangeFromNode(node))
    this.message = formatErrorWithHighlight(this.#summary, node, this.#range)
    return this
  }
}

export class ParseError extends CelError {
  constructor(message, node, cause) {
    super('ParseError', message, node, cause)
  }
}

export class EvaluationError extends CelError {
  constructor(message, node, cause) {
    super('EvaluationError', message, node, cause)
  }
}

export class TypeError extends CelError {
  constructor(message, node, cause) {
    super('TypeError', message, node, cause)
  }
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

export class ParseError extends Error {
  #wasConstructedWithAst = false
  #node
  constructor(message, node, cause) {
    super(message, {cause})
    this.name = 'ParseError'
    this.#node = node

    if (!node?.input) return
    this.message = formatErrorWithHighlight(this.message, node)
  }

  get node() {
    return this.#node
  }

  withAst(node) {
    if (this.#node) return this
    this.#node = node
    if (!node?.input) return this
    this.message = formatErrorWithHighlight(this.message, node)
    return this
  }
}

export class EvaluationError extends Error {
  #node
  constructor(message, node, cause) {
    super(message, {cause})
    this.name = 'EvaluationError'
    this.#node = node

    if (!node?.input) return
    this.message = formatErrorWithHighlight(this.message, node)
  }

  get node() {
    return this.#node
  }

  withAst(node) {
    if (this.#node) return this
    this.#node = node
    if (!node?.input) return this
    this.message = formatErrorWithHighlight(this.message, node)
    return this
  }
}

export class TypeError extends Error {
  #node
  constructor(message, node, cause) {
    super(message, {cause})
    this.name = 'TypeError'
    this.#node = node

    if (!node?.input) return
    this.message = formatErrorWithHighlight(this.message, node)
  }

  get node() {
    return this.#node
  }

  withAst(node) {
    if (this.#node) return this
    this.#node = node
    if (!node?.input) return this
    this.message = formatErrorWithHighlight(this.message, node)
    return this
  }
}

function formatErrorWithHighlight(message, node) {
  if (node?.pos === undefined) return message
  const pos = node.pos
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

  // Show a few lines of context
  let contextStart = pos
  let contextEnd = pos
  while (contextStart > 0 && input[contextStart - 1] !== '\n') contextStart--
  while (contextEnd < input.length && input[contextEnd] !== '\n') contextEnd++

  const line = input.slice(contextStart, contextEnd)

  const lineNumber = `${lineNum}`.padStart(4, ' ')
  const spaces = ' '.repeat(9 + columnNum)
  return `${message}\n\n> ${lineNumber} | ${line}\n${spaces}^`
}

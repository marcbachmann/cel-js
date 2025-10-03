export const nodePositionCache = new WeakMap()

export class ParseError extends Error {
  #wasConstructedWithAst = false
  constructor(message, node, cause) {
    super(message, {cause})
    this.name = 'ParseError'

    const pos = node && (node.input ? node : nodePositionCache.get(node))
    if (pos) {
      this.#wasConstructedWithAst = true
      this.message = formatErrorWithHighlight(this.message, pos)
    }
  }

  withAst(node) {
    if (this.#wasConstructedWithAst) return this
    const pos = node && (node.input ? node : nodePositionCache.get(node))
    if (pos) this.message = formatErrorWithHighlight(this.message, pos)
    return this
  }
}

export class EvaluationError extends Error {
  #wasConstructedWithAst = false
  constructor(message, node, cause) {
    super(message, {cause})
    this.name = 'EvaluationError'

    const pos = node && (node.input ? node : nodePositionCache.get(node))
    if (pos) {
      this.#wasConstructedWithAst = true
      this.message = formatErrorWithHighlight(this.message, pos)
    }
  }

  withAst(node) {
    if (this.#wasConstructedWithAst) return this
    const pos = node && (node.input ? node : nodePositionCache.get(node))
    if (pos) this.message = formatErrorWithHighlight(this.message, pos)
    return this
  }
}

export class TypeError extends Error {
  #wasConstructedWithAst = false
  constructor(message, node, cause) {
    super(message, {cause})
    this.name = 'TypeError'

    const pos = node && (node.input ? node : nodePositionCache.get(node))
    if (pos) {
      this.#wasConstructedWithAst = true
      this.message = formatErrorWithHighlight(this.message, pos)
    }
  }

  withAst(node) {
    if (this.#wasConstructedWithAst) return this
    const pos = node && (node.input ? node : nodePositionCache.get(node))
    if (pos) this.message = formatErrorWithHighlight(this.message, pos)
    return this
  }
}

function formatErrorWithHighlight(message, position) {
  if (position?.pos === undefined) return message
  const pos = position.pos
  const input = position.input

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

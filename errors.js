export const nodePositionCache = new WeakMap()

export class ParseError extends Error {
  constructor(message, node) {
    super(message)
    this.name = 'ParseError'

    const pos = node && (node.input ? node : nodePositionCache.get(node))
    if (pos) this.message = formatErrorWithHighlight(this.message, pos)
  }
}

export class EvaluationError extends Error {
  constructor(message, node) {
    super(message)
    this.name = 'EvaluationError'

    const pos = node && (node.input ? node : nodePositionCache.get(node))
    if (pos) this.message = formatErrorWithHighlight(this.message, pos)
  }
}

function formatErrorWithHighlight(message, position) {
  if (!position?.input) return message
  const pos = position.pos
  const input = position.input

  let lineNum = 1
  let currentPos = 0
  let columnNum = 0
  while (currentPos < pos) {
    if (input[currentPos] === '\n') {
      lineNum++
      columnNum = 0
    }
    currentPos++
    columnNum++
  }

  // Show a few lines of context
  let contextStart = pos
  let contextEnd = pos
  while (contextStart > 0 && input[contextStart - 1] !== '\n') contextStart--
  while (contextEnd < input.length && input[contextEnd] !== '\n') contextEnd++

  const line = input.slice(contextStart, contextEnd)

  const lineNumber = `${lineNum}`.padStart(4, ' ')
  const spaces = ' '.repeat(8 + columnNum + 1)
  return `${message}\n\n> ${lineNumber} | ${line}\n${spaces}^`
}

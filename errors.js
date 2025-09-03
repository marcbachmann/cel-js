export class ParseError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ParseError'
  }
}

export class EvaluationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'EvaluationError'
  }
}

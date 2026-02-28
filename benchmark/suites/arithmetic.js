export default [
  {
    name: 'Basic Arithmetic',
    expression: '1 + 2 * 2'
  },
  {
    name: 'Basic Arithmetic (dyn variable)',
    expression: 'x + y * 2',
    context: {x: 1n, y: 2n}
  },
  {
    name: 'Basic Arithmetic (typed variable)',
    expression: 'intA + intB * 2',
    context: {intA: 1n, intB: 2n}
  },
  {
    name: 'Complex Arithmetic',
    expression: '(10.0 + 20.0) * 5.0 - 100.0 / 4.0'
  },
  {
    name: 'Complex Arithmetic with int',
    expression: '(10 + 20) * 5 - 100 / 4'
  },
  {
    name: 'Complex Arithmetic with variables',
    expression: '(a + b) * c - d / e',
    context: {a: 10, b: 20, c: 5, d: 100, e: 4}
  },
  {
    name: 'Complex Arithmetic with typed variables',
    expression: '(doubleA + doubleB) * doubleC - doubleD / doubleE',
    context: {doubleA: 10, doubleB: 20, doubleC: 5, doubleD: 100, doubleE: 4}
  }
]

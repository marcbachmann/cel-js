export default [
  {
    name: 'Basic Arithmetic',
    expression: '1 + 2 * 3'
  },
  {
    name: 'Complex Arithmetic',
    expression: '(10.0 + 20.0) * 5.0 - 100.0 / 4.0'
  },
  {
    name: 'Complex Arithmetic with int',
    expression: '(10u + 20u) * 5u - 100u / 4u'
  },
  {
    name: 'Complex Arithmetic with variables',
    expression: '(a + b) * c - d / e',
    context: {a: 10, b: 20, c: 5, d: 100, e: 4}
  }
]

export default [
  {
    name: 'String Methods',
    expression: 'name.startsWith("John") && email.endsWith("@example.com")',
    context: {name: 'John Doe', email: 'john@example.com'}
  },
  {
    name: 'Function Calls',
    expression: 'size(items) > 0 && string(count) == "5"',
    context: {items: [1, 2, 3], count: 5}
  },
  {
    name: 'String Regex',
    expression: 'email.matches("^[a-z0-9._%+-]+@example[.]com$")',
    context: {email: 'john.doe@example.com'}
  }
]

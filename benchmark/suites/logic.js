export default [
  {
    name: 'Logical Expression',
    expression: 'a && b || c',
    context: {a: true, b: false, c: true}
  },
  {
    name: 'Logical OR',
    expression: 'false || false || false || false || false || true',
    context: {a: true, b: false, c: true}
  },
  {
    name: 'Logical OR with variables',
    expression: 'a.b.c || a.b.c || a.b.c || false || false || true',
    context: {a: true, b: false, c: true}
  },
  {
    name: 'Range Check',
    expression: 'age >= 18 && age < 65',
    context: {age: 25}
  },
  {
    name: 'Nested Ternary',
    expression: 'score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : "F"',
    context: {score: 85}
  },
  {
    name: 'Complex Logical',
    expression: 'user.isActive && ("admin" in user.roles || "moderator" in user.roles)',
    context: {
      user: {
        isActive: true,
        roles: ['admin', 'user']
      }
    }
  },
  {
    name: 'Authorization Check',
    expression: `
      (user.role == "admin" || (
        has(user.lastActivity) &&
        user.lastActivity < 3600 &&
        resource.status != "archived"
      )) &&
      has(user.email) &&
      user.email.endsWith('@example.com')
    `,
    context: {
      user: {
        id: 123,
        isActive: true,
        emailVerified: true,
        role: 'editor',
        lastActivity: 1000
      },
      resource: {
        status: 'published'
      }
    }
  }
]

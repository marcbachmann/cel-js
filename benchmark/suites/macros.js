export default [
  {
    name: 'List .filter and .map',
    expression: 'items.filter(x, x > 10).map(x, x > 2)',
    context: {items: [5, 10, 15, 20, 25]}
  },
  {
    name: 'Multiple list .map calls',
    expression:
      'items.map(x, x + 1.0).map(x, x + 1.0).map(x, x + 1.0).map(x, x + 1.0).map(x, x + 1.0)',
    context: {items: [5, 10, 15, 20, 25]}
  },
  {
    name: 'Multiple has calls',
    expression: `
      has(user.premium) &&
      has(user.subscription.plan) &&
      has(user.subscription.expiresAt) &&
      user.subscription.expiresAt > timestamp("2024-01-01T00:00:00Z")
    `,
    context: {
      user: {
        premium: true,
        subscription: {
          plan: 'pro',
          expiresAt: new Date('2025-01-01')
        }
      }
    }
  },
  {
    name: 'Mixed Complex',
    expression: `
      has(user.premium) &&
      user.premium &&
      (user.subscription.plan in ["pro", "enterprise"]) &&
      user.subscription.expiresAt > timestamp("2024-01-01T00:00:00Z")
    `,
    context: {
      user: {
        premium: true,
        subscription: {
          plan: 'pro',
          expiresAt: new Date('2025-01-01')
        }
      }
    }
  }
]

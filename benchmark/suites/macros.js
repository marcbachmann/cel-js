export default [
  {
    name: 'List .map',
    expression: 'items.map(x, x + 1.0)',
    context: {items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
  },
  {
    name: 'List .map with async',
    expression: 'identityAsync(items).map(x, identityAsync(x + 1.0))',
    context: {items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
  },
  {
    name: 'List .map 5 times',
    expression: 'items.map(x, x).map(x, x).map(x, x).map(x, x).map(x, x)',
    context: {items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
  },
  {
    name: 'List .filter',
    expression: 'items.filter(x, x > 5.0)',
    context: {items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
  },
  {
    name: 'List .filter and .map',
    expression: 'items.filter(x, x > 5.0).map(x, x + 1.0)',
    context: {items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
  },
  {
    name: 'List .map with filter',
    expression: 'items.map(x, x > 5.0, x + 1.0)',
    context: {items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
  },
  {
    name: 'cel.bind macro',
    expression: 'cel.bind(i, items, i)',
    context: {items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
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

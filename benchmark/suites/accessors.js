export default [
  {
    name: 'Int access',
    expression: 'intA',
    context: {intA: 1n}
  },
  {
    name: 'String access',
    expression: 'stringA',
    context: {stringA: 'hello world'}
  },
  {
    name: 'Variable Access',
    expression: 'user.name',
    context: {user: {name: 'John Doe'}}
  },
  {
    name: 'Variable Access with static types',
    expression: 'userMap.name',
    context: {userMap: {name: 'John Doe'}}
  },
  {
    name: 'Deep Property Access',
    expression: 'user.profile.settings.theme',
    context: {
      user: {
        profile: {
          settings: {
            theme: 'dark'
          }
        }
      }
    }
  },
  {
    name: 'Deep Property Access (bracket notation)',
    expression: 'user["profile"]["settings"]["theme"]',
    context: {
      user: {
        profile: {
          settings: {
            theme: 'dark'
          }
        }
      }
    }
  },
  {
    name: 'Array Index Access',
    expression: 'items[2]',
    context: {items: ['first', 'second', 'third']}
  },
  {
    name: 'Array Membership',
    expression: '"admin" in roles',
    context: {roles: ['user', 'admin', 'moderator']}
  }
]

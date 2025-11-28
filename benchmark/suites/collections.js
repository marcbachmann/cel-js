export default [
  {
    name: 'List Creation',
    expression: '[1, 2, 3, 4, 5]'
  },
  {
    name: 'Large List Creation',
    expression:
      '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]'
  },
  {
    name: 'Map Creation',
    expression: '{"foo": 1, "bar": 2, "baz": 3, "test": 4}'
  },
  {
    name: 'Nested Map Creation',
    expression: `{
      "users": dyn([
        {"id": dyn(1), "profile": dyn({"roles": ["admin", "editor"]})},
        {"id": dyn(2), "profile": dyn({"roles": ["viewer"]})},
        {"id": dyn(3), "profile": dyn({"roles": ["editor", "viewer"]})}
      ]),
      "metadata": dyn({"count": dyn(3), "generatedAt": dyn(timestamp("2024-05-01T00:00:00Z"))})
    }`
  },
  {
    name: 'List of Maps Access',
    expression: 'pipelines[1].stats.failures[0].code',
    context: {
      pipelines: [
        {
          name: 'daily-etl',
          stats: {failures: []}
        },
        {
          name: 'realtime-sync',
          stats: {
            failures: [
              {code: 'NETWORK_TIMEOUT', retryable: true},
              {code: 'AUTH_ERROR', retryable: false}
            ]
          }
        }
      ]
    }
  },
  {
    name: 'Map Access',
    expression: 'config["timeout"] > 30 && config["retries"] <= 3',
    context: {config: {timeout: 60, retries: 2}}
  }
]

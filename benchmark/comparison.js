#! /usr/bin/env -S node --expose-gc --allow-natives-syntax
import {Environment} from '../lib/index.js'
import {MemoryPlugin, Suite, V8NeverOptimizePlugin} from 'bench-node'
import * as chromeGGCelJs from 'cel-js'

const bench = new Suite({
  minSamples: 10,
  plugins: [new V8NeverOptimizePlugin(), new MemoryPlugin()]
})

const marcbachmannCelJs = new Environment({unlistedVariablesAreDyn: true})
marcbachmannCelJs.registerVariable('metadata', 'map<string, string>')

function createMarcBachmannCelJsRenderer(expression) {
  const parsed = marcbachmannCelJs.parse(expression)
  return {
    parse: marcbachmannCelJs.parse.bind(marcbachmannCelJs, expression),
    evaluate: parsed
  }
}

function createChromeGGCelJsRenderer(expression) {
  const parsed = chromeGGCelJs.parse(expression).cst
  return {
    parse: chromeGGCelJs.parse.bind(null, expression),
    evaluate: chromeGGCelJs.evaluate.bind(null, parsed)
  }
}

const scripts = [
  {
    name: 'check container ports',
    expression: `
      object.spec.template.spec.containers.all(container,
        !has(container.ports) ||
        container.ports.all(port,
          !has(port.hostPort) ||
          port.hostPort == 0
        )
      )
    `,
    data: {
      object: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'nginx'
        },
        spec: {
          template: {
            metadata: {
              name: 'nginx',
              labels: {
                app: 'nginx'
              }
            },
            spec: {
              containers: [
                {
                  name: 'nginx',
                  image: 'nginx',
                  ports: [
                    {
                      containerPort: 80,
                      hostPort: 80
                    }
                  ]
                }
              ]
            }
          },
          selector: {
            matchLabels: {
              app: 'nginx'
            }
          }
        }
      }
    }
  },
  {
    name: 'check jwt claims',
    expression: `
      has(jwt.extra_claims.group)
      && jwt.extra_claims
        .filter(c, c == 'group')
            .all(c, jwt.extra_claims[c]
                .all(g, g == 'analyst@acme.co'))
    `,
    data: {
      jwt: {
        iss: 'auth.acme.com:12350',
        sub: 'serviceAccount:delegate@acme.co',
        aud: 'my-project',
        extra_claims: {
          group: ['admin@acme.co', 'analyst@acme.co'],
          groupN: ['forever@acme.co'],
          labels: ['metadata', 'prod', 'pii']
        }
      }
    }
  },
  {
    name: 'access log filtering',
    expression: `
      response.code >= 400 || (xds.cluster_name == 'BlackHoleCluster' || xds.cluster_name == 'PassthroughCluster')
    `,
    data: {
      response: {
        code: 200,
        code_details: 'via_upstream',
        flags: 0,
        grpc_status: 2,
        headers: {
          'content-type': 'application/json'
        },
        size: 1181,
        total_size: 1377
      },
      xds: {
        cluster_metadata: '',
        cluster_name: 'PassthroughCluster',
        filter_chain_name: '',
        route_metadata: '',
        route_name: 'allow_any',
        upstream_host_metadata: 'NULL'
      }
    }
  }
]

for (const script of scripts) {
  const self = createMarcBachmannCelJsRenderer(script.expression)
  const other = createChromeGGCelJsRenderer(script.expression)

  bench.add(`marcbachmann parse (${script.name})`, () => {
    const v = self.parse()
    if (typeof v === 'string') return
  })

  bench.add(`chromeGG/cel parse (${script.name})`, () => {
    const v = other.parse()
    if (typeof v === 'string') return
  })

  bench.add(`marcbachmann evaluate (${script.name})`, () => {
    const v = self.evaluate(script.data)
    if (typeof v === 'function') return
  })

  bench.add(`chromeGG/cel evaluate (${script.name})`, () => {
    const v = other.evaluate(script.data)
    if (typeof v === 'function') return
  })
}

bench.run()

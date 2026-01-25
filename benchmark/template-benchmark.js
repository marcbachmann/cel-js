#! /usr/bin/env -S node --expose-gc --allow-natives-syntax
import {Environment} from '../lib/index.js'
import {MemoryPlugin, Suite, V8NeverOptimizePlugin} from 'bench-node'

const bench = new Suite({
  minSamples: 10,
  plugins: [new V8NeverOptimizePlugin(), new MemoryPlugin()]
})

const expressionPattern = /({{[^}]*}})/g
const variablePattern = /{{\s*([a-zA-Z0-9][.a-zA-Z0-9_-]+)\s*}}/

const env = new Environment({unlistedVariablesAreDyn: true})
env.registerVariable('metadata', 'map<string, string>')

function parseTemplate(template) {
  const parts = template.split(expressionPattern)

  for (let i = 0; i < parts.length; i++) {
    const match = variablePattern.exec(parts[i])
    if (!match) continue

    const placeholder = match[1]
    parts[i] = env.parse(placeholder)
  }

  const fnString = parts.map((part, idx) => {
    if (typeof part === 'string') return JSON.stringify(part)
    if (typeof part === 'function') return `parts[${idx}](value)`
    return `''`
  })

  // eslint-disable-next-line no-new-func
  return new Function('parts', 'value', `return ${fnString.join(' + ')}`).bind(null, parts)
}

function createCelRenderer(expression) {
  return env.parse(expression)
}

function buildDataset(size) {
  const adjectives = ['quick', 'bright', 'calm', 'eager', 'fancy', 'gentle', 'happy']
  const nouns = ['fox', 'river', 'sky', 'meadow', 'breeze', 'harbor', 'garden']
  const dataset = new Array(size)
  for (let i = 0; i < size; i++) {
    const foo = `${adjectives[i % adjectives.length]}-${nouns[(i + 3) % nouns.length]}-${i}`
    const bar = `${nouns[(i + 5) % nouns.length]}-${adjectives[(i + 2) % adjectives.length]}-${i}`
    dataset[i] = {metadata: {foo, bar}}
  }
  return dataset
}

const dataset = buildDataset(10)

const customRenderer = parseTemplate('{{metadata.foo}} {{metadata.bar}}')

const celRenderer = createCelRenderer('metadata.foo + " " + metadata.bar')

bench.add('custom template', () => {
  for (let j = 0; j < 10000; j++) {
    for (let i = 0; i < dataset.length; i++) {
      const v = customRenderer(dataset[i])
      if (typeof v !== 'string') return
    }
  }
})

bench.add('cel expression', () => {
  for (let j = 0; j < 10000; j++) {
    for (let i = 0; i < dataset.length; i++) {
      const v = celRenderer(dataset[i])
      if (typeof v !== 'string') return
    }
  }
})

bench.run()

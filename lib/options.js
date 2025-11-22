const DEFAULT_LIMITS = Object.freeze({
  maxAstNodes: 100000,
  maxDepth: 250,
  maxListElements: 1000,
  maxMapEntries: 1000,
  maxCallArguments: 32
})

const LIMIT_KEYS = new Set(Object.keys(DEFAULT_LIMITS))
function createLimits(overrides, base = DEFAULT_LIMITS) {
  const keys = overrides ? Object.keys(overrides) : undefined
  if (!keys?.length) return base

  const merged = {...base}
  for (const key of keys) {
    if (!LIMIT_KEYS.has(key)) throw new TypeError(`Unknown limits option: ${key}`)
    const value = overrides[key]
    if (typeof value !== 'number') continue
    merged[key] = value
  }
  return Object.freeze(merged)
}

const DEFAULT_OPTIONS = Object.freeze({
  unlistedVariablesAreDyn: false,
  homogeneousAggregateLiterals: true,
  limits: DEFAULT_LIMITS
})

function bool(a, b, key) {
  const value = a?.[key] ?? b?.[key]
  if (typeof value !== 'boolean') throw new TypeError(`Invalid option: ${key}`)
  return value
}

export function createOptions(opts, base = DEFAULT_OPTIONS) {
  if (!opts) return base
  return Object.freeze({
    unlistedVariablesAreDyn: bool(opts, base, 'unlistedVariablesAreDyn'),
    homogeneousAggregateLiterals: bool(opts, base, 'homogeneousAggregateLiterals'),
    limits: createLimits(opts.limits, base.limits)
  })
}

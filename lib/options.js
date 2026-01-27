import {objFreeze, objKeys} from './globals.js'

const DEFAULT_LIMITS = objFreeze({
  maxAstNodes: 100000,
  maxDepth: 250,
  maxListElements: 1000,
  maxMapEntries: 1000,
  maxCallArguments: 32
})

const LIMIT_KEYS = new Set(objKeys(DEFAULT_LIMITS))
function createLimits(overrides, base = DEFAULT_LIMITS) {
  const keys = overrides ? objKeys(overrides) : undefined
  if (!keys?.length) return base

  const merged = {...base}
  for (const key of keys) {
    if (!LIMIT_KEYS.has(key)) throw new TypeError(`Unknown limits option: ${key}`)
    const value = overrides[key]
    if (typeof value !== 'number') continue
    merged[key] = value
  }
  return objFreeze(merged)
}

const DEFAULT_OPTIONS = objFreeze({
  unlistedVariablesAreDyn: false,
  homogeneousAggregateLiterals: true,
  enableOptionalTypes: false,
  limits: DEFAULT_LIMITS
})

function bool(a, b, key) {
  const value = a?.[key] ?? b?.[key]
  if (typeof value !== 'boolean') throw new TypeError(`Invalid option: ${key}`)
  return value
}

export function createOptions(opts, base = DEFAULT_OPTIONS) {
  if (!opts) return base
  return objFreeze({
    unlistedVariablesAreDyn: bool(opts, base, 'unlistedVariablesAreDyn'),
    homogeneousAggregateLiterals: bool(opts, base, 'homogeneousAggregateLiterals'),
    enableOptionalTypes: bool(opts, base, 'enableOptionalTypes'),
    limits: createLimits(opts.limits, base.limits)
  })
}

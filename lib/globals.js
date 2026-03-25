export const hasOwn = Object.hasOwn
export const objKeys = Object.keys
export const objFreeze = Object.freeze
export const objEntries = Object.entries
export const isArray = Array.isArray
export const arrayFrom = Array.from

export const MIN_UINT = 0n
export const MAX_UINT = 18446744073709551615n

export const MAX_INT = 9223372036854775807n
export const MIN_INT = -9223372036854775808n

export function isAsync(fn, fallback) {
  if (fn?.[Symbol.toStringTag] === 'AsyncFunction') return true
  return typeof fallback === 'boolean' ? fallback : true
}

export const RESERVED = new Set([
  'as',
  'break',
  'const',
  'continue',
  'else',
  'for',
  'function',
  'if',
  'import',
  'let',
  'loop',
  'package',
  'namespace',
  'return',
  'var',
  'void',
  'while',
  '__proto__',
  'prototype'
])

/*
 * Deterministic, tasteful accent for the branded fallback cover.
 *
 * The same record always gets the same colour, drawn from a curated ramp built
 * on the approved palette (copper / bottle-green / gold / two muted analogues)
 * so a grid of fallbacks reads as composed, not random.
 */

const RAMP = [
  '#c6743e', // copper
  '#2f5d50', // bottle green
  '#c9a34e', // gold
  '#8a5a3c', // muted terracotta
  '#4a6b62', // muted teal
  '#9c7b3e', // muted brass
] as const

function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function fallbackSeed(input: string): string {
  return String(hashString(input || 'vinyl-intelligence'))
}

export function fallbackAccent(input: string): string {
  const idx = hashString(input || 'vinyl-intelligence') % RAMP.length
  return RAMP[idx]
}

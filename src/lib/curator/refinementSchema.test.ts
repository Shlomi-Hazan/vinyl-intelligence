import { describe, expect, it } from 'vitest'
import {
  CURATOR_REFINEMENT_JSON_SCHEMA,
  REFINEMENT_SYSTEM_PROMPT,
  parseCuratorRefinement,
} from './refinementSchema.ts'
import { CuratorError, type CuratorIntent } from './types.ts'

function intent(overrides: Partial<CuratorIntent> = {}): CuratorIntent {
  return {
    includeGenres: ['rock'],
    excludeGenres: [],
    decades: [1990],
    minRating: null,
    favoritesOnly: false,
    neverPlayedOnly: false,
    avoidRecentlyPlayed: true,
    recentDays: null,
    preference: 'none',
    energy: 'any',
    mood: null,
    requestedCount: 3,
    ...overrides,
  }
}

function expectReject(raw: unknown) {
  let thrown: unknown
  try {
    parseCuratorRefinement(raw)
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(CuratorError)
  expect((thrown as CuratorError).code).toBe('provider_bad_response')
}

describe('parseCuratorRefinement - valid', () => {
  it('returns the complete validated intent + strict boolean', () => {
    const out = parseCuratorRefinement({
      intent: intent({ favoritesOnly: true }),
      excludePreviousRecommendations: true,
    })
    expect(out.intent.favoritesOnly).toBe(true)
    expect(out.intent.includeGenres).toEqual(['rock'])
    expect(out.intent.decades).toEqual([1990])
    expect(out.excludePreviousRecommendations).toBe(true)
  })

  it('applies the M9 benign normalization (lowercase/dedupe genres, exclusion dominates)', () => {
    const out = parseCuratorRefinement({
      intent: intent({ includeGenres: [' Rock ', 'rock', 'JAZZ'], excludeGenres: ['jazz'] }),
      excludePreviousRecommendations: false,
    })
    expect(out.intent.includeGenres).toEqual(['rock'])
    expect(out.intent.excludeGenres).toEqual(['jazz'])
  })

  it('ignores extra unknown top-level fields', () => {
    const out = parseCuratorRefinement({
      intent: intent(),
      excludePreviousRecommendations: false,
      note: 'ignored',
    })
    expect(out.excludePreviousRecommendations).toBe(false)
  })
})

describe('parseCuratorRefinement - strict rejection', () => {
  it('rejects a non-object', () => {
    expectReject(null)
    expectReject('{}')
  })

  it('rejects a missing intent or missing boolean', () => {
    expectReject({ excludePreviousRecommendations: false })
    expectReject({ intent: intent() })
  })

  it('rejects a non-boolean excludePreviousRecommendations', () => {
    expectReject({ intent: intent(), excludePreviousRecommendations: 'yes' })
    expectReject({ intent: intent(), excludePreviousRecommendations: 1 })
  })

  it('rejects a nested intent that violates the authoritative M9 rules', () => {
    expectReject({ intent: intent({ decades: [1995] as unknown as number[] }), excludePreviousRecommendations: false })
    expectReject({ intent: intent({ minRating: 9 as unknown as number }), excludePreviousRecommendations: false })
    expectReject({ intent: intent({ preference: 'bad' as unknown as CuratorIntent['preference'] }), excludePreviousRecommendations: false })
    const missing = intent() as Record<string, unknown>
    delete missing.favoritesOnly
    expectReject({ intent: missing, excludePreviousRecommendations: false })
  })
})

describe('refinement schema + prompt', () => {
  it('is strict json_schema nesting the M9 intent schema', () => {
    expect(CURATOR_REFINEMENT_JSON_SCHEMA.strict).toBe(true)
    expect(CURATOR_REFINEMENT_JSON_SCHEMA.schema.additionalProperties).toBe(false)
    expect(CURATOR_REFINEMENT_JSON_SCHEMA.schema.required).toEqual([
      'intent',
      'excludePreviousRecommendations',
    ])
    expect(CURATOR_REFINEMENT_JSON_SCHEMA.schema.properties.intent).toHaveProperty(
      'additionalProperties',
      false,
    )
  })

  it('instructs the model to preserve prior fields and frames inputs as untrusted', () => {
    const collapsed = REFINEMENT_SYSTEM_PROMPT.replace(/\s+/g, ' ').toLowerCase()
    expect(collapsed).toContain('start from previous intent')
    expect(collapsed).toContain('keep every prior field')
    expect(collapsed).toContain('untrusted data')
    expect(collapsed).toContain('excludepreviousrecommendations')
    expect(collapsed).toContain('complete new intent')
  })
})

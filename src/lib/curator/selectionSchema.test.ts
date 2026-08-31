import { describe, expect, it } from 'vitest'
import {
  CURATOR_SELECTION_JSON_SCHEMA,
  SELECTION_SYSTEM_PROMPT,
  validateSelection,
} from './selectionSchema.ts'
import { deriveCandidateFacts } from './candidates.ts'
import { CuratorError, type CuratorCandidate } from './types.ts'

function candidatesById(): Map<string, CuratorCandidate> {
  const list = deriveCandidateFacts(
    [
      {
        id: 'a',
        added_at: '2026-08-01T00:00:00.000Z',
        rating: 4,
        is_favorite: true,
        artist: 'A',
        title: 'Album A',
        release_year: 1991,
        genres: ['rock'],
      },
      {
        id: 'b',
        added_at: '2026-08-02T00:00:00.000Z',
        rating: null,
        is_favorite: false,
        artist: 'B',
        title: 'Album B',
        release_year: null,
        genres: [],
      },
    ],
    [{ collection_item_id: 'a', listened_at: '2026-08-20T00:00:00.000Z' }],
  )
  return new Map(list.map((c) => [c.id, c]))
}

function args(requestedCount = 3) {
  const byId = candidatesById()
  return { allowedIds: new Set(byId.keys()), candidatesById: byId, requestedCount }
}

function expectReject(raw: unknown, requestedCount = 3) {
  let thrown: unknown
  try {
    validateSelection(raw, args(requestedCount))
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(CuratorError)
  expect((thrown as CuratorError).code).toBe('provider_bad_response')
}

describe('validateSelection - valid', () => {
  it('builds cards from server facts, marks best match, puts it first', () => {
    const cards = validateSelection(
      {
        recommendations: [
          { collectionItemId: 'b', reason: 'fits the vibe', evidenceKeys: ['genre'] },
          { collectionItemId: 'a', reason: 'a favorite you rated highly', evidenceKeys: ['favorite', 'rating'] },
        ],
        bestMatchId: 'a',
      },
      args(),
    )
    expect(cards.map((c) => c.collectionItemId)).toEqual(['a', 'b'])
    expect(cards[0].isBestMatch).toBe(true)
    expect(cards[1].isBestMatch).toBe(false)
    // facts come from the server candidate, not the model
    expect(cards[0].artist).toBe('A')
    expect(cards[0].rating).toBe(4)
    expect(cards[0].favorite).toBe(true)
  })

  it('drops evidenceKeys whose fact is unavailable, and unknown values', () => {
    const cards = validateSelection(
      {
        recommendations: [
          { collectionItemId: 'b', reason: 'no facts', evidenceKeys: ['rating', 'year', 'never_played', 'bogus'] },
        ],
        bestMatchId: 'b',
      },
      args(),
    )
    // b: rating null -> drop; year null -> drop; neverPlayed true -> keep; bogus -> drop
    expect(cards[0].evidenceKeys).toEqual(['never_played'])
  })

  it('collapses whitespace and caps reason length', () => {
    const cards = validateSelection(
      {
        recommendations: [{ collectionItemId: 'a', reason: `  ${'x'.repeat(400)}  `, evidenceKeys: [] }],
        bestMatchId: 'a',
      },
      args(),
    )
    expect(cards[0].reason.length).toBe(300)
  })

  it('ignores extra unknown fields', () => {
    const cards = validateSelection(
      {
        recommendations: [{ collectionItemId: 'a', reason: 'ok', evidenceKeys: [], extra: 1 }],
        bestMatchId: 'a',
        note: 'ignored',
      },
      args(),
    )
    expect(cards).toHaveLength(1)
  })
})

describe('validateSelection - wholesale rejection', () => {
  it('rejects a non-object / empty recommendations / non-string bestMatchId', () => {
    expectReject(null)
    expectReject({ recommendations: [], bestMatchId: 'a' })
    expectReject({ recommendations: [{ collectionItemId: 'a', reason: 'x', evidenceKeys: [] }], bestMatchId: 3 })
  })

  it('rejects an out-of-set id', () => {
    expectReject({
      recommendations: [{ collectionItemId: 'ZZZ', reason: 'x', evidenceKeys: [] }],
      bestMatchId: 'ZZZ',
    })
  })

  it('rejects a duplicate id', () => {
    expectReject({
      recommendations: [
        { collectionItemId: 'a', reason: 'x', evidenceKeys: [] },
        { collectionItemId: 'a', reason: 'y', evidenceKeys: [] },
      ],
      bestMatchId: 'a',
    })
  })

  it('rejects more recommendations than requestedCount', () => {
    expectReject(
      {
        recommendations: [
          { collectionItemId: 'a', reason: 'x', evidenceKeys: [] },
          { collectionItemId: 'b', reason: 'y', evidenceKeys: [] },
        ],
        bestMatchId: 'a',
      },
      1,
    )
  })

  it('rejects a bestMatchId not among the recommendations', () => {
    expectReject({
      recommendations: [{ collectionItemId: 'a', reason: 'x', evidenceKeys: [] }],
      bestMatchId: 'b',
    })
  })

  it('rejects an empty reason', () => {
    expectReject({
      recommendations: [{ collectionItemId: 'a', reason: '   ', evidenceKeys: [] }],
      bestMatchId: 'a',
    })
  })

  it('rejects a missing required field (reason)', () => {
    expectReject({
      recommendations: [{ collectionItemId: 'a', evidenceKeys: [] }],
      bestMatchId: 'a',
    })
  })

  it('rejects a missing evidenceKeys field', () => {
    expectReject({
      recommendations: [{ collectionItemId: 'a', reason: 'ok' }],
      bestMatchId: 'a',
    })
  })

  it('rejects evidenceKeys that is a string', () => {
    expectReject({
      recommendations: [{ collectionItemId: 'a', reason: 'ok', evidenceKeys: 'rating' }],
      bestMatchId: 'a',
    })
  })

  it('rejects evidenceKeys that is an object or null', () => {
    expectReject({
      recommendations: [{ collectionItemId: 'a', reason: 'ok', evidenceKeys: {} }],
      bestMatchId: 'a',
    })
    expectReject({
      recommendations: [{ collectionItemId: 'a', reason: 'ok', evidenceKeys: null }],
      bestMatchId: 'a',
    })
  })

  it('accepts an empty evidenceKeys array', () => {
    const cards = validateSelection(
      {
        recommendations: [{ collectionItemId: 'a', reason: 'ok', evidenceKeys: [] }],
        bestMatchId: 'a',
      },
      args(),
    )
    expect(cards[0].evidenceKeys).toEqual([])
  })
})

describe('selection schema + prompt', () => {
  it('is strict json_schema with additionalProperties false', () => {
    expect(CURATOR_SELECTION_JSON_SCHEMA.strict).toBe(true)
    expect(CURATOR_SELECTION_JSON_SCHEMA.schema.additionalProperties).toBe(false)
  })

  it('forbids inventing facts and selecting outside the provided ids', () => {
    const collapsed = SELECTION_SYSTEM_PROMPT.replace(/\s+/g, ' ').toLowerCase()
    expect(collapsed).toContain('select only from the provided candidate "id" values')
    expect(collapsed).toContain('untrusted')
    expect(collapsed).toContain('never invent a record')
    expect(collapsed).toContain('do not invent ratings')
  })
})

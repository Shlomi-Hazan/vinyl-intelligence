import { describe, expect, it } from 'vitest'
import { buildCatalogQueryFromRecognition } from './query.ts'
import type { CoverRecognition } from './types.ts'

function recognition(overrides: Partial<CoverRecognition> = {}): CoverRecognition {
  return {
    artist: null,
    albumTitle: null,
    visibleText: [],
    label: null,
    catalogNumber: null,
    releaseYearHint: null,
    confidence: 0.5,
    notes: null,
    identified: true,
    ...overrides,
  }
}

describe('buildCatalogQueryFromRecognition', () => {
  it('combines artist and album title', () => {
    expect(
      buildCatalogQueryFromRecognition(
        recognition({ artist: 'Pink Floyd', albumTitle: 'The Dark Side of the Moon' }),
      ),
    ).toBe('Pink Floyd The Dark Side of the Moon')
  })

  it('falls back to album title only', () => {
    expect(
      buildCatalogQueryFromRecognition(recognition({ albumTitle: 'OK Computer' })),
    ).toBe('OK Computer')
  })

  it('falls back to artist only', () => {
    expect(
      buildCatalogQueryFromRecognition(recognition({ artist: 'Radiohead' })),
    ).toBe('Radiohead')
  })

  it('falls back to the first visible-text lines', () => {
    expect(
      buildCatalogQueryFromRecognition(
        recognition({ visibleText: ['MILES DAVIS', 'KIND OF BLUE', 'COLUMBIA', 'STEREO'] }),
      ),
    ).toBe('MILES DAVIS KIND OF BLUE COLUMBIA')
  })

  it('returns null when there is nothing usable', () => {
    expect(buildCatalogQueryFromRecognition(recognition())).toBeNull()
  })

  it('returns null when the only clue is too short', () => {
    expect(
      buildCatalogQueryFromRecognition(recognition({ albumTitle: 'A' })),
    ).toBeNull()
  })

  it('collapses whitespace and truncates to the catalog query bound', () => {
    const query = buildCatalogQueryFromRecognition(
      recognition({ artist: '  The   National  ', albumTitle: 'X'.repeat(200) }),
    )

    expect(query).not.toBeNull()
    expect(query!.length).toBeLessThanOrEqual(120)
    expect(query!.startsWith('The National ')).toBe(true)
    expect(query).not.toContain('  ')
  })
})

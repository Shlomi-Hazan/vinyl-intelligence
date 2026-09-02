import { describe, expect, it } from 'vitest'
import {
  caaReleaseFrontUrl,
  caaReleaseGroupFrontUrl,
  isMbid,
} from './coverArtUrl.ts'

const MBID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

describe('coverArtUrl', () => {
  it('builds the deterministic CAA release front URL', () => {
    expect(caaReleaseFrontUrl(MBID)).toBe(
      `https://coverartarchive.org/release/${MBID}/front-250`,
    )
    expect(caaReleaseFrontUrl(MBID, 500)).toBe(
      `https://coverartarchive.org/release/${MBID}/front-500`,
    )
    expect(caaReleaseFrontUrl(MBID, 1200)).toBe(
      `https://coverartarchive.org/release/${MBID}/front-1200`,
    )
  })

  it('builds the deterministic CAA release-group front URL', () => {
    expect(caaReleaseGroupFrontUrl(MBID, 500)).toBe(
      `https://coverartarchive.org/release-group/${MBID}/front-500`,
    )
  })

  it('lower-cases the MBID in the URL', () => {
    expect(caaReleaseFrontUrl(MBID.toUpperCase())).toBe(
      `https://coverartarchive.org/release/${MBID}/front-250`,
    )
  })

  it('returns null for a missing or malformed identifier', () => {
    expect(caaReleaseFrontUrl(null)).toBeNull()
    expect(caaReleaseFrontUrl(undefined)).toBeNull()
    expect(caaReleaseFrontUrl('')).toBeNull()
    expect(caaReleaseFrontUrl('12345')).toBeNull()
    expect(caaReleaseFrontUrl('../release/evil')).toBeNull()
    expect(caaReleaseGroupFrontUrl('not-a-uuid')).toBeNull()
  })

  it('isMbid validates a lowercase UUID only', () => {
    expect(isMbid(MBID)).toBe(true)
    expect(isMbid(MBID.toUpperCase())).toBe(true)
    expect(isMbid('nope')).toBe(false)
    expect(isMbid(42)).toBe(false)
    expect(isMbid(null)).toBe(false)
  })
})

/**
 * Session persistence for the MusicBrainz catalog search panel.
 *
 * Persists ONLY the current draft input text plus the last completed search
 * (submitted query and its normalized candidate list, which may be empty for a
 * legitimate zero-result response), scoped to the authenticated user. A refresh
 * or same-tab navigation then restores the typed draft and the previous
 * results without another MusicBrainz request.
 *
 * Never persisted: loading state, transient errors, raw provider responses, or
 * any token.
 */
import {
  buildUserSessionKey,
  removeSessionKey,
  safeReadSessionJson,
  safeWriteSessionJson,
} from '../lib/session/sessionDraft.ts'
import type { CatalogCandidate, SearchMode } from '../lib/catalog/types.ts'

const NAMESPACE = 'catalog-search'
const VALID_MODES: readonly SearchMode[] = ['all', 'artist', 'album']

export type CatalogSearchResult = {
  submittedQuery: string
  /** NEW (spec 0017 §9) - optional on read, defaults to `'all'`. */
  mode: SearchMode
  candidates: CatalogCandidate[]
  /** NEW (spec 0017 §9) - the offset of the LAST successfully loaded page; optional on read, defaults to 0. */
  offset: number
  /** NEW (spec 0017 §9) - whether "Load more" should render on restore; optional on read, defaults to false. */
  hasMore: boolean
}

export type CatalogSearchDraft = {
  draftQuery: string
  /** NEW (spec 0017 §9) - the currently-selected mode, independent of a completed search; optional on read, defaults to `'all'`. */
  mode: SearchMode
  result: CatalogSearchResult | null
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
}

function isSearchMode(value: unknown): value is SearchMode {
  return typeof value === 'string' && (VALID_MODES as readonly string[]).includes(value)
}

/** Absent or malformed on an already-stored draft defaults to `'all'`
 * rather than invalidating the whole draft (spec 0017 §9). */
function parseMode(value: unknown): SearchMode {
  return isSearchMode(value) ? value : 'all'
}

function parseOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function parseHasMore(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false
}

function parseCandidate(value: unknown): CatalogCandidate | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as Record<string, unknown>

  if (
    candidate.provider !== 'musicbrainz'
    || typeof candidate.providerReleaseId !== 'string'
    || !isStringOrNull(candidate.providerReleaseGroupId)
    || !isNumberOrNull(candidate.score)
    || typeof candidate.artist !== 'string'
    || typeof candidate.title !== 'string'
    || !isNumberOrNull(candidate.releaseYear)
    || !isStringOrNull(candidate.label)
    || !isStringOrNull(candidate.catalogNumber)
    || !isStringOrNull(candidate.country)
    || !isStringOrNull(candidate.format)
    || !isStringOrNull(candidate.transientCoverDisplayUrl)
    || typeof candidate.derivedProviderPageUrl !== 'string'
  ) {
    return null
  }

  return {
    provider: 'musicbrainz',
    providerReleaseId: candidate.providerReleaseId,
    providerReleaseGroupId: candidate.providerReleaseGroupId,
    score: candidate.score,
    artist: candidate.artist,
    title: candidate.title,
    releaseYear: candidate.releaseYear,
    label: candidate.label,
    catalogNumber: candidate.catalogNumber,
    country: candidate.country,
    format: candidate.format,
    transientCoverDisplayUrl: candidate.transientCoverDisplayUrl,
    derivedProviderPageUrl: candidate.derivedProviderPageUrl,
  }
}

function parseResult(value: unknown): CatalogSearchResult | null {
  if (value === null) {
    return null
  }

  if (typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>

  if (
    typeof candidate.submittedQuery !== 'string'
    || !Array.isArray(candidate.candidates)
  ) {
    return null
  }

  const candidates: CatalogCandidate[] = []

  for (const entry of candidate.candidates) {
    const parsed = parseCandidate(entry)

    if (!parsed) {
      return null
    }

    candidates.push(parsed)
  }

  return {
    submittedQuery: candidate.submittedQuery,
    mode: parseMode(candidate.mode),
    candidates,
    offset: parseOffset(candidate.offset),
    hasMore: parseHasMore(candidate.hasMore),
  }
}

function parseDraft(value: unknown): CatalogSearchDraft | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as Record<string, unknown>

  if (typeof candidate.draftQuery !== 'string') {
    return null
  }

  const mode = parseMode(candidate.mode)

  // `result` is optional; an invalid result object invalidates the whole draft
  // so a partially corrupt value is dropped rather than half-restored. The
  // new `mode`/`offset`/`hasMore` fields inside a present result are
  // themselves optional-on-read (parseResult above), so an already-stored
  // old-shaped draft restores exactly as it did before this enhancement.
  if (candidate.result !== undefined && candidate.result !== null) {
    const result = parseResult(candidate.result)

    if (!result) {
      return null
    }

    return { draftQuery: candidate.draftQuery, mode, result }
  }

  return { draftQuery: candidate.draftQuery, mode, result: null }
}

export function loadCatalogSearchDraft(userId: string): CatalogSearchDraft | null {
  return safeReadSessionJson(buildUserSessionKey(NAMESPACE, userId), parseDraft)
}

export function saveCatalogSearchDraft(
  userId: string,
  draft: CatalogSearchDraft,
): void {
  safeWriteSessionJson(buildUserSessionKey(NAMESPACE, userId), {
    draftQuery: draft.draftQuery,
    mode: draft.mode,
    result: draft.result
      ? {
          submittedQuery: draft.result.submittedQuery,
          mode: draft.result.mode,
          candidates: draft.result.candidates,
          offset: draft.result.offset,
          hasMore: draft.result.hasMore,
        }
      : null,
  })
}

export function clearCatalogSearchDraft(userId: string): void {
  removeSessionKey(buildUserSessionKey(NAMESPACE, userId))
}

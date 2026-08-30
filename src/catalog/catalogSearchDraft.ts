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
import type { CatalogCandidate } from '../lib/catalog/types.ts'

const NAMESPACE = 'catalog-search'

export type CatalogSearchResult = {
  submittedQuery: string
  candidates: CatalogCandidate[]
}

export type CatalogSearchDraft = {
  draftQuery: string
  result: CatalogSearchResult | null
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === 'number'
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

  return { submittedQuery: candidate.submittedQuery, candidates }
}

function parseDraft(value: unknown): CatalogSearchDraft | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as Record<string, unknown>

  if (typeof candidate.draftQuery !== 'string') {
    return null
  }

  // `result` is optional; an invalid result object invalidates the whole draft
  // so a partially corrupt value is dropped rather than half-restored.
  if (candidate.result !== undefined && candidate.result !== null) {
    const result = parseResult(candidate.result)

    if (!result) {
      return null
    }

    return { draftQuery: candidate.draftQuery, result }
  }

  return { draftQuery: candidate.draftQuery, result: null }
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
    result: draft.result
      ? {
          submittedQuery: draft.result.submittedQuery,
          candidates: draft.result.candidates,
        }
      : null,
  })
}

export function clearCatalogSearchDraft(userId: string): void {
  removeSessionKey(buildUserSessionKey(NAMESPACE, userId))
}

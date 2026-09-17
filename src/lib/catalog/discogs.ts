import { DISCOGS_RELEASE_ID_PATTERN, discogsReleaseUrl } from './discogsIdentity.ts'
import { normalizeGenreName } from './musicbrainz.ts'
import {
  RELEASE_FIELD_LIMITS,
  RELEASE_YEAR_MAX,
  RELEASE_YEAR_MIN,
} from './catalogFieldLimits.ts'
import type { CatalogCandidate, CatalogErrorCode } from './types.ts'

const DISCOGS_API_BASE_URL = 'https://api.discogs.com'
const DISCOGS_PROVIDER = 'discogs'
const DEFAULT_TIMEOUT_MS = 8_000
const MAX_GENRES = 12
// Phase-0-exercised page size (spec 0018 §5.1) - not a provider guarantee.
const DISCOGS_SEARCH_PER_PAGE = 10
// The Vinyl Intelligence product bound on exposed Discogs candidates per
// query (spec 0018 §8) - deliberately much smaller than MusicBrainz's.
const MAX_SEARCH_RESULTS = 5
const VINYL_FORMAT_TOKEN = 'Vinyl'
// Discogs's own literal no-catalog-number sentinel string (spec 0018 §10.1) -
// never persisted verbatim.
const DISCOGS_NONE_SENTINEL = 'none'

export type FetchFunction = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

type DiscogsFetchOptions = {
  fetchImpl?: FetchFunction
  timeoutMs?: number
  /** The server-only Discogs personal access token (`DISCOGS_TOKEN`). */
  token: string
  userAgent: string
}

export class DiscogsError extends Error {
  readonly code: CatalogErrorCode
  readonly status?: number

  constructor(code: CatalogErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'DiscogsError'
    this.code = code
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function cleanText(value: unknown, maxLength: number): string | null {
  const text = getString(value)?.trim()

  if (!text || text.length > maxLength) {
    return null
  }

  return text
}

/**
 * A malformed provider image value is ignored entirely (`null`), never
 * partially trusted (spec 0018 follow-up §7-§9, corrected by PR #42's own
 * finding 3): must be a non-empty string, within the shared length bound,
 * and an **HTTPS-only** absolute URL - never `http:`, `javascript:`,
 * `data:`, or a relative value that could execute in, or be misrendered
 * by, the browser, or be silently downgraded to an insecure fetch.
 */
function cleanImageUrl(value: unknown): string | null {
  const text = cleanText(value, RELEASE_FIELD_LIMITS.providerImageUrl)

  if (!text) {
    return null
  }

  let url: URL

  try {
    url = new URL(text)
  } catch {
    return null
  }

  return url.protocol === 'https:' ? text : null
}

/**
 * Mirrors `fetchMusicBrainzJson`'s exact shape (spec 0018 §2.2): the same
 * five existing `CatalogErrorCode` categories, no new one. Sends the
 * server-only personal access token via the `Authorization: Discogs
 * token=...` header - never forwarded from, or accepted from, the browser.
 */
async function fetchDiscogsJson(
  url: URL,
  { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, token, userAgent }: DiscogsFetchOptions,
): Promise<unknown> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Discogs token=${token}`,
        'User-Agent': userAgent,
      },
      signal: controller.signal,
    })

    if (response.status === 429 || response.status === 503) {
      throw new DiscogsError(
        'provider_rate_limited',
        'Discogs is rate limiting or temporarily unavailable.',
        response.status,
      )
    }

    if (response.status === 404) {
      throw new DiscogsError(
        'not_found',
        'Discogs release was not found.',
        response.status,
      )
    }

    if (!response.ok) {
      throw new DiscogsError(
        'provider_unavailable',
        'Discogs request failed.',
        response.status,
      )
    }

    return await response.json()
  } catch (error) {
    if (error instanceof DiscogsError) {
      throw error
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new DiscogsError('provider_timeout', 'Discogs request timed out.')
    }

    throw new DiscogsError('provider_unavailable', 'Discogs is unavailable.')
  } finally {
    clearTimeout(timeoutId)
  }
}

export function buildDiscogsSearchUrl(query: string): URL {
  const url = new URL(`${DISCOGS_API_BASE_URL}/database/search`)

  url.searchParams.set('q', query)
  url.searchParams.set('type', 'release')
  url.searchParams.set('per_page', DISCOGS_SEARCH_PER_PAGE.toString())

  return url
}

export function buildDiscogsReleaseLookupUrl(providerReleaseId: string): URL {
  return new URL(`${DISCOGS_API_BASE_URL}/releases/${providerReleaseId}`)
}

function parseProviderReleaseId(value: unknown): string | null {
  const text = typeof value === 'number' ? String(value) : getString(value)

  return text && DISCOGS_RELEASE_ID_PATTERN.test(text) ? text : null
}

/** `master_id` when present and non-zero; otherwise `null` (spec 0018 §4.2/§7). */
function parseMasterId(value: unknown): string | null {
  const num = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) {
    return null
  }

  return String(num)
}

function isSentinelCatno(value: string | null): boolean {
  return value === null || value.trim().toLowerCase() === DISCOGS_NONE_SENTINEL
}

// ---------------------------------------------------------------------------
// S3: Discogs Database Search - display-only normalizer. The `title` field
// here is the RAW, often-combined "Artist - Title" search-result string -
// NEVER split into separate artist/title values (spec 0018 §1/§3, this
// correction round's central finding). Never persisted anywhere.
// ---------------------------------------------------------------------------

export type DiscogsSearchResultItem = {
  provider: 'discogs'
  providerReleaseId: string
  providerReleaseGroupId: string | null
  displayTitle: string
  releaseYear: number | null
  country: string | null
  formatSummary: string | null
  label: string | null
  catalogNumber: string | null
  /**
   * A TRANSIENT, display-only image URL for this search result (spec 0018
   * follow-up §8) - the Database Search response's own `cover_image` (full
   * size, preferred) or `thumb` (150x150 fallback), both already full,
   * directly-loadable HTTPS URLs. Result-card display only: never persisted
   * as release artwork, and never confused with `providerImageUrl` (the
   * exact-release field that IS persisted).
   */
  transientCoverDisplayUrl: string | null
  derivedProviderPageUrl: string
}

export type DiscogsSearchResponse = {
  results: DiscogsSearchResultItem[]
}

function isVinylSearchResult(raw: Record<string, unknown>): boolean {
  const formats = Array.isArray(raw.format) ? raw.format : []

  return formats.some((entry) => entry === VINYL_FORMAT_TOKEN)
}

function parseSearchReleaseYear(value: unknown): number | null {
  const year = typeof value === 'number' ? value : Number(value)

  if (!Number.isInteger(year) || year < RELEASE_YEAR_MIN || year > RELEASE_YEAR_MAX) {
    return null
  }

  return year
}

/**
 * Best-effort, sentinel-aware label/catalog-number for a search RESULT's flat
 * `label`/`catno` fields (spec 0018 §1 - a genuinely different shape from the
 * exact-Release response's `labels[]` array of objects, §4.2's authoritative
 * rule). Display-only.
 */
function searchLabelAndCatalogNumber(raw: Record<string, unknown>): {
  label: string | null
  catalogNumber: string | null
} {
  const labels = Array.isArray(raw.label)
    ? raw.label.filter((entry): entry is string => typeof entry === 'string')
    : []
  const rawCatno = getString(raw.catno)
  const catalogNumber = isSentinelCatno(rawCatno)
    ? null
    : cleanText(rawCatno, RELEASE_FIELD_LIMITS.catalogNumber)
  const label = labels.length > 0 ? cleanText(labels[0], RELEASE_FIELD_LIMITS.label) : null

  return { label, catalogNumber }
}

function searchFormatSummary(raw: Record<string, unknown>): string | null {
  const formats = Array.isArray(raw.format)
    ? raw.format.filter((entry): entry is string => typeof entry === 'string')
    : []

  return formats.length > 0
    ? cleanText(formats.join(', '), RELEASE_FIELD_LIMITS.format)
    : null
}

export function normalizeDiscogsSearchResult(
  raw: unknown,
): DiscogsSearchResultItem | null {
  if (!isRecord(raw)) {
    return null
  }

  const providerReleaseId = parseProviderReleaseId(raw.id)

  if (!providerReleaseId) {
    return null
  }

  const displayTitle = cleanText(raw.title, RELEASE_FIELD_LIMITS.title)

  if (!displayTitle) {
    return null
  }

  const derivedProviderPageUrl = discogsReleaseUrl(providerReleaseId)

  if (!derivedProviderPageUrl) {
    return null
  }

  const { label, catalogNumber } = searchLabelAndCatalogNumber(raw)
  // Prefer the full-size `cover_image`; fall back to the 150x150 `thumb`
  // (spec 0018 follow-up §8) - `cleanImageUrl` still independently
  // re-validates each value as an HTTPS URL rather than trusting the field
  // name alone. Both fields, and their public loadability, are confirmed
  // by human live-API verification (spec 0019 §7.1, 2026-09-17).
  const transientCoverDisplayUrl =
    cleanImageUrl(raw.cover_image) ?? cleanImageUrl(raw.thumb)

  return {
    provider: DISCOGS_PROVIDER,
    providerReleaseId,
    providerReleaseGroupId: parseMasterId(raw.master_id),
    displayTitle,
    releaseYear: parseSearchReleaseYear(raw.year),
    country: cleanText(raw.country, RELEASE_FIELD_LIMITS.country),
    formatSummary: searchFormatSummary(raw),
    label,
    catalogNumber,
    transientCoverDisplayUrl,
    derivedProviderPageUrl,
  }
}

export type DiscogsSearchOptions = DiscogsFetchOptions & {
  query: string
}

/**
 * `GET /database/search?q=...&type=release&per_page=10` (spec 0018 §8). A
 * cheap, non-authoritative Vinyl pre-filter runs on the raw flat `format`
 * array before normalization; the authoritative Vinyl gate remains
 * `lookupDiscogsRelease` (below), run again before any persistence. Returns
 * at most 5 surviving results.
 */
export async function searchDiscogsReleases({
  query,
  ...fetchOptions
}: DiscogsSearchOptions): Promise<DiscogsSearchResponse> {
  const payload = await fetchDiscogsJson(buildDiscogsSearchUrl(query), fetchOptions)

  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new DiscogsError(
      'provider_bad_response',
      'Discogs search response was malformed.',
    )
  }

  const results: DiscogsSearchResultItem[] = []

  for (const entry of payload.results) {
    if (!isRecord(entry) || !isVinylSearchResult(entry)) {
      continue
    }

    const normalized = normalizeDiscogsSearchResult(entry)

    if (normalized) {
      results.push(normalized)
    }

    if (results.length >= MAX_SEARCH_RESULTS) {
      break
    }
  }

  return { results }
}

// ---------------------------------------------------------------------------
// S4: Discogs exact Release lookup - the sole `CatalogCandidate` producer.
// ---------------------------------------------------------------------------

export type NormalizedDiscogsRelease = {
  candidate: CatalogCandidate
  genres: string[]
}

/**
 * Sentinel-aware label/catalog-number rule for the exact-Release response's
 * `labels[]` array of `{ name, catno }` objects (spec 0018 §10.1). Prefers
 * the first entry whose `catno` is non-empty and not (case-insensitively)
 * the literal Discogs sentinel `"none"`; otherwise falls back to the first
 * entry's name alone, with `catalogNumber: null`. Never persists `"none"`.
 */
function exactLabelAndCatalogNumber(value: unknown): {
  label: string | null
  catalogNumber: string | null
} {
  const labels = Array.isArray(value) ? value.filter(isRecord) : []

  const usable = labels.find((entry) => {
    const name = getString(entry.name)?.trim()
    const catno = getString(entry.catno)?.trim() ?? null
    return Boolean(name) && !isSentinelCatno(catno)
  })

  if (usable) {
    return {
      label: cleanText(usable.name, RELEASE_FIELD_LIMITS.label),
      catalogNumber: cleanText(usable.catno, RELEASE_FIELD_LIMITS.catalogNumber),
    }
  }

  const first = labels[0]

  return {
    label: first ? cleanText(first.name, RELEASE_FIELD_LIMITS.label) : null,
    catalogNumber: null,
  }
}

/**
 * A deterministic, human-readable summary of the matched Vinyl `formats[]`
 * entry (spec 0018 §10): `name` plus `qty` (only when greater than `"1"`)
 * plus `descriptions`, e.g. "Vinyl, 2×, LP, Album" or "Vinyl, LP, Album".
 */
function vinylFormatSummary(entry: Record<string, unknown>): string | null {
  const parts: string[] = [VINYL_FORMAT_TOKEN]
  const qty = getString(entry.qty)?.trim()

  if (qty && qty !== '1') {
    parts.push(`${qty}×`)
  }

  const descriptions = Array.isArray(entry.descriptions)
    ? entry.descriptions.filter(
        (d): d is string => typeof d === 'string' && d.trim().length > 0,
      )
    : []

  parts.push(...descriptions)

  return cleanText(parts.join(', '), RELEASE_FIELD_LIMITS.format)
}

function findVinylFormat(value: unknown): Record<string, unknown> | null {
  const formats = Array.isArray(value) ? value.filter(isRecord) : []

  return formats.find((entry) => getString(entry.name) === VINYL_FORMAT_TOKEN) ?? null
}

/**
 * One image entry's best URL (spec 0018 follow-up §9, corrected by PR #42's
 * own finding 3): only `uri` (full-size) and `uri150` (a 150x150
 * thumbnail) - `uri` preferred, `uri150` a last resort. Both fields, and
 * their public loadability with no `Authorization` header, are confirmed
 * by human live-API verification (spec 0019 §7.1, 2026-09-17).
 * `resource_url` is deliberately still NOT used as a browser `<img>`
 * source: it is a documented field on the same entry, but that
 * verification did not cover it, and this codebase has not independently
 * confirmed it is always a directly-loadable, unauthenticated image URL
 * (as opposed to, e.g., an API resource reference) - treating an
 * unverified field as safe to render is exactly the kind of assumption
 * this project's own image-licensing/security boundary requires NOT
 * making. Revisit only after `resource_url` itself gets the same
 * verification.
 */
function imageUrlFromEntry(entry: Record<string, unknown>): string | null {
  return cleanImageUrl(entry.uri) ?? cleanImageUrl(entry.uri150)
}

/**
 * Deterministic single-image choice for an exact Discogs release (spec 0018
 * follow-up §9): the first entry whose `type` is exactly `"primary"` when it
 * has a usable URL; otherwise the first entry with any usable URL at all;
 * otherwise `null`. Never infers or fabricates a URL, and never requires an
 * image to be present - a release with no usable image is a normal, valid
 * outcome.
 */
function selectDiscogsProviderImage(value: unknown): string | null {
  const images = Array.isArray(value) ? value.filter(isRecord) : []
  const primary = images.find((entry) => getString(entry.type) === 'primary')
  const primaryUrl = primary ? imageUrlFromEntry(primary) : null

  if (primaryUrl) {
    return primaryUrl
  }

  for (const entry of images) {
    const url = imageUrlFromEntry(entry)

    if (url) {
      return url
    }
  }

  return null
}

/** `year`, falling back to a parsed leading 4-digit year from `released` only if `year` is absent/zero (spec 0018 §10). */
function parseExactReleaseYear(yearValue: unknown, releasedValue: unknown): number | null {
  const year = typeof yearValue === 'number' ? yearValue : Number(yearValue)

  if (Number.isInteger(year) && year >= RELEASE_YEAR_MIN && year <= RELEASE_YEAR_MAX) {
    return year
  }

  const releasedText = getString(releasedValue)
  const match = releasedText?.match(/^\d{4}/)?.[0]

  if (!match) {
    return null
  }

  const fallback = Number(match)

  return Number.isInteger(fallback) && fallback >= RELEASE_YEAR_MIN && fallback <= RELEASE_YEAR_MAX
    ? fallback
    : null
}

/**
 * The Discogs exact-Release `genres: string[]` flat shape (confirmed distinct
 * from MusicBrainz's `[{ name, count }]` release-group tag shape) - reuses
 * `musicbrainz.ts`'s per-string cleaning rule (`normalizeGenreName`), applied
 * to this different container shape (spec 0018 §4.2).
 */
export function normalizeDiscogsGenreList(payload: unknown): string[] {
  if (!Array.isArray(payload)) {
    return []
  }

  const seen = new Set<string>()

  for (const entry of payload) {
    const name = normalizeGenreName(entry)

    if (name) {
      seen.add(name)
    }

    if (seen.size >= MAX_GENRES) {
      break
    }
  }

  return Array.from(seen)
}

/**
 * Unambiguous exact-Release mapping (spec 0018 §4.2) - the sole producer of a
 * real `CatalogCandidate` for Discogs. Returns `null` on any
 * missing-or-invalid required field or when the release has no Vinyl
 * `formats[]` entry (the authoritative Vinyl gate) - never persists a
 * partial/guessed value, mirroring `normalizeMusicBrainzRelease`'s discipline.
 */
export function normalizeDiscogsExactRelease(
  release: unknown,
): NormalizedDiscogsRelease | null {
  if (!isRecord(release)) {
    return null
  }

  const providerReleaseId = parseProviderReleaseId(release.id)

  if (!providerReleaseId) {
    return null
  }

  const artist = cleanText(release.artists_sort, RELEASE_FIELD_LIMITS.artist)
  const title = cleanText(release.title, RELEASE_FIELD_LIMITS.title)

  if (!artist || !title) {
    return null
  }

  const derivedProviderPageUrl = discogsReleaseUrl(providerReleaseId)

  if (!derivedProviderPageUrl) {
    return null
  }

  const vinylEntry = findVinylFormat(release.formats)

  if (!vinylEntry) {
    return null
  }

  const { label, catalogNumber } = exactLabelAndCatalogNumber(release.labels)

  const candidate: CatalogCandidate = {
    provider: DISCOGS_PROVIDER,
    providerReleaseId,
    providerReleaseGroupId: parseMasterId(release.master_id),
    score: null,
    artist,
    title,
    releaseYear: parseExactReleaseYear(release.year, release.released),
    label,
    catalogNumber,
    country: cleanText(release.country, RELEASE_FIELD_LIMITS.country),
    format: vinylFormatSummary(vinylEntry),
    // `transientCoverDisplayUrl` is a search-result-only display hint
    // (spec 0018 follow-up §8) - never populated for an exact-release
    // candidate, which uses `providerImageUrl` instead (§9, persisted).
    transientCoverDisplayUrl: null,
    providerImageUrl: selectDiscogsProviderImage(release.images),
    derivedProviderPageUrl,
  }

  return { candidate, genres: normalizeDiscogsGenreList(release.genres) }
}

export type DiscogsLookupOptions = DiscogsFetchOptions & {
  providerReleaseId: string
}

/**
 * `GET /releases/{id}` (spec 0018 §9). Throws `not_found` when the response
 * is malformed OR the release has no Vinyl `formats[]` entry - the
 * authoritative Vinyl gate; §3's search-stage filter is only a cheap
 * pre-filter, never a substitute for this.
 */
export async function lookupDiscogsRelease({
  providerReleaseId,
  ...fetchOptions
}: DiscogsLookupOptions): Promise<NormalizedDiscogsRelease> {
  const payload = await fetchDiscogsJson(
    buildDiscogsReleaseLookupUrl(providerReleaseId),
    fetchOptions,
  )
  const normalized = normalizeDiscogsExactRelease(payload)

  if (!normalized) {
    throw new DiscogsError(
      'not_found',
      'This Discogs release is not available as Vinyl, or the release could not be verified.',
    )
  }

  return normalized
}

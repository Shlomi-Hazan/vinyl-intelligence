import { musicBrainzReleaseUrl, MUSICBRAINZ_RELEASE_ID_PATTERN } from './musicbrainzIdentity.ts'
import {
  RELEASE_FIELD_LIMITS,
  RELEASE_YEAR_MAX,
  RELEASE_YEAR_MIN,
} from './catalogFieldLimits.ts'
import type { CatalogCandidate, CatalogErrorCode, SearchMode } from './types.ts'

const MUSICBRAINZ_API_BASE_URL = 'https://musicbrainz.org/ws/2'
const MUSICBRAINZ_PROVIDER = 'musicbrainz'
const DEFAULT_TIMEOUT_MS = 8_000
const GENRE_LOOKUP_TIMEOUT_MS = 6_000
const MAX_GENRES = 12
const GENRE_MAX_LENGTH = 40

// Re-exported so every existing import site (`catalog-handlers.mts` and its
// test) keeps working unmodified - `musicbrainzIdentity.ts` is now the one
// canonical definition (spec 0017; that module is browser-safe, this one is
// not, since it also contains provider-fetch/timeout logic).
export { MUSICBRAINZ_RELEASE_ID_PATTERN }

export type FetchFunction = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

type MusicBrainzFetchOptions = {
  fetchImpl?: FetchFunction
  timeoutMs?: number
  userAgent: string
}

export type MusicBrainzSearchOptions = MusicBrainzFetchOptions & {
  limit: number
  mode: SearchMode
  offset: number
  query: string
}

/**
 * The internal MusicBrainz search-page result (spec 0017 §7.2/§8.2) -
 * provider-adapter internal, not exported from `types.ts`: nothing outside
 * this module and `catalog-handlers.mts` needs `rawCount`/`providerCount`/
 * `providerOffset` - the browser only ever sees the final `hasMore` boolean
 * the handler computes from them.
 */
export type MusicBrainzSearchPage = {
  candidates: CatalogCandidate[]
  /** `releases.length`, before `normalizeMusicBrainzRelease` filtering. */
  rawCount: number
  /** The provider's own `count` field - the total matching result count. */
  providerCount: number
  /** The provider's own `offset` field, already verified to equal the requested offset. */
  providerOffset: number
}

export type MusicBrainzLookupOptions = MusicBrainzFetchOptions & {
  providerReleaseId: string
}

export type MusicBrainzGenreLookupOptions = MusicBrainzFetchOptions & {
  releaseGroupId: string
}

export class MusicBrainzError extends Error {
  readonly code: CatalogErrorCode
  readonly status?: number

  constructor(code: CatalogErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'MusicBrainzError'
    this.code = code
    this.status = status
  }
}

type MusicBrainzRelease = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function cleanRequiredText(value: unknown, maxLength: number): string | null {
  const text = getString(value)?.trim()

  if (!text || text.length > maxLength) {
    return null
  }

  return text
}

function cleanOptionalText(value: unknown, maxLength: number): string | null {
  const text = getString(value)?.trim()

  if (!text || text.length > maxLength) {
    return null
  }

  return text
}

function parseReleaseYear(value: unknown): number | null {
  const date = getString(value)
  const yearText = date?.match(/^\d{4}/)?.[0]

  if (!yearText) {
    return null
  }

  const year = Number(yearText)

  if (
    !Number.isInteger(year)
    || year < RELEASE_YEAR_MIN
    || year > RELEASE_YEAR_MAX
  ) {
    return null
  }

  return year
}

function extractArtist(release: MusicBrainzRelease): string | null {
  const artistCredit = release['artist-credit']

  if (!Array.isArray(artistCredit)) {
    return null
  }

  const artistText = artistCredit
    .map((credit) => {
      if (!isRecord(credit)) {
        return ''
      }

      const name = getString(credit.name)?.trim()
      const joinPhrase = getString(credit.joinphrase) ?? ''

      return name ? `${name}${joinPhrase}` : ''
    })
    .join('')
    .trim()

  return cleanRequiredText(artistText, RELEASE_FIELD_LIMITS.artist)
}

function firstLabelInfo(release: MusicBrainzRelease): Record<string, unknown> | null {
  const labelInfo = release['label-info']

  if (!Array.isArray(labelInfo)) {
    return null
  }

  return labelInfo.find((entry): entry is Record<string, unknown> =>
    isRecord(entry),
  ) ?? null
}

function extractLabel(release: MusicBrainzRelease): string | null {
  const labelInfo = firstLabelInfo(release)
  const label = isRecord(labelInfo?.label) ? labelInfo.label : null

  return cleanOptionalText(label?.name, RELEASE_FIELD_LIMITS.label)
}

function extractCatalogNumber(release: MusicBrainzRelease): string | null {
  const labelInfo = firstLabelInfo(release)

  return cleanOptionalText(
    labelInfo?.['catalog-number'],
    RELEASE_FIELD_LIMITS.catalogNumber,
  )
}

function extractFormat(release: MusicBrainzRelease): string | null {
  const media = release.media

  if (!Array.isArray(media)) {
    return null
  }

  const formats = Array.from(
    new Set(
      media
        .map((medium) =>
          isRecord(medium) ? getString(medium.format)?.trim() : null,
        )
        .filter((format): format is string => Boolean(format)),
    ),
  )

  return cleanOptionalText(formats.join(', '), RELEASE_FIELD_LIMITS.format)
}

function extractReleaseGroupId(release: MusicBrainzRelease): string | null {
  const releaseGroup = release['release-group']
  const releaseGroupId = isRecord(releaseGroup) ? getString(releaseGroup.id) : null

  return releaseGroupId && MUSICBRAINZ_RELEASE_ID_PATTERN.test(releaseGroupId)
    ? releaseGroupId
    : null
}

function extractScore(release: MusicBrainzRelease): number | null {
  const score = release.score

  return typeof score === 'number' && Number.isFinite(score) ? score : null
}

export function buildMusicBrainzSearchUrl(
  query: string,
  limit: number,
  offset: number,
): URL {
  const url = new URL(`${MUSICBRAINZ_API_BASE_URL}/release`)

  url.searchParams.set('query', query)
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('limit', limit.toString())
  url.searchParams.set('offset', offset.toString())

  return url
}

// Lucene defines AND/OR/NOT as ALL-CAPS Boolean-operator word tokens
// (https://lucene.apache.org/core/2_9_4/queryparsersyntax.html, "Boolean
// Operators"), distinct from and not covered by the punctuation escape set
// below. A standalone occurrence of one of these words in literal user text
// would otherwise be parsed as a live Boolean operator rather than searched
// for. Matched with a Unicode-aware boundary (native `\p{L}`/`\p{N}`
// property escapes plus lookaround, not JavaScript's ASCII-only `\b`) so a
// keyword embedded directly in non-Latin or accented-Latin text with no
// separating whitespace (e.g. a Hebrew word immediately followed by `AND`)
// is never incorrectly treated as standalone (spec 0017 §6.2).
const BOOLEAN_KEYWORD_PATTERN = /(?<![\p{L}\p{N}_])(AND|OR|NOT)(?![\p{L}\p{N}_])/gu

/**
 * Lowercases every standalone, case-sensitive `AND`/`OR`/`NOT` token in
 * `s`, leaving every other character - and all whitespace - untouched.
 * Lucene only recognizes these as operators when ALL CAPS, so a lowercased
 * token is guaranteed never to be parsed as one; MusicBrainz's underlying
 * full-text index normalizes case during analysis, so this does not change
 * what the user is searching for (spec 0017 §6.2).
 */
export function literalize(s: string): string {
  return s.replace(BOOLEAN_KEYWORD_PATTERN, (match) => match.toLowerCase())
}

// The documented Lucene special characters (spec 0017 §5.1):
// + - && || ! ( ) { } [ ] ^ " ~ * ? : \ /
// (MusicBrainz's own example additionally escapes `/`.) Escaping each
// individual character - rather than only the doubled `&&`/`||` forms -
// already neutralizes the symbolic `&&`/`||`/`!` operator forms too.
const LUCENE_SPECIAL_CHARACTER_PATTERN = /[-+&|!(){}[\]^"~*?:\\/]/g

/**
 * Backslash-escapes every Lucene special character in `s`, in a single pass
 * (so inserted backslashes are never themselves re-escaped).
 */
export function escape(s: string): string {
  return s.replace(LUCENE_SPECIAL_CHARACTER_PATTERN, (char) => `\\${char}`)
}

/**
 * The exact mode -> MusicBrainz `query` value templates (spec 0017 §6.2).
 * `raw` is expected already trimmed (leading/trailing whitespace) with
 * internal whitespace preserved exactly as typed - this function does not
 * re-trim or collapse it. The trusted `OR` joining `all` mode's two field
 * clauses is spliced in here, after `literalize`/`escape` have already run
 * on the user's own text - it is the only `OR` in the resulting query
 * permitted to act as live Boolean syntax.
 */
export function buildMusicBrainzQuery(mode: SearchMode, raw: string): string {
  const term = escape(literalize(raw))

  if (mode === 'artist') {
    return `artist:(${term})`
  }

  if (mode === 'album') {
    return `release:(${term})`
  }

  return `artist:(${term}) OR release:(${term})`
}

export function buildMusicBrainzLookupUrl(providerReleaseId: string): URL {
  const url = new URL(
    `${MUSICBRAINZ_API_BASE_URL}/release/${providerReleaseId}`,
  )

  url.searchParams.set('fmt', 'json')
  url.searchParams.set('inc', 'artist-credits+labels+release-groups+media')

  return url
}

export function buildMusicBrainzReleaseGroupGenresUrl(releaseGroupId: string): URL {
  const url = new URL(
    `${MUSICBRAINZ_API_BASE_URL}/release-group/${releaseGroupId}`,
  )

  url.searchParams.set('fmt', 'json')
  url.searchParams.set('inc', 'genres')

  return url
}

/**
 * Exported for `discogs.ts` (spec 0018 §4.2) - the same per-string cleaning
 * rule (trim, lowercase, 1-40 chars) applies to Discogs's flat `genres:
 * string[]` shape via a separate container-level normalizer
 * (`normalizeDiscogsGenreList`); this one-line export is a zero-behavior-
 * change addition, and every existing test of this function is unaffected.
 */
export function normalizeGenreName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const genre = value.trim().toLowerCase()

  return genre.length >= 1 && genre.length <= GENRE_MAX_LENGTH ? genre : null
}

/**
 * Cleans the MusicBrainz `genres` array from a release-group response into a
 * bounded list of lowercase names. MusicBrainz genres are community-curated
 * tags (subjective), not objective facts.
 */
export function normalizeMusicBrainzGenres(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.genres)) {
    return []
  }

  const seen = new Set<string>()

  for (const entry of payload.genres) {
    if (!isRecord(entry)) {
      continue
    }

    // MusicBrainz supplies a vote `count`; when present, require it to be
    // positive. When absent, keep the genre.
    if (typeof entry.count === 'number' && entry.count <= 0) {
      continue
    }

    const name = normalizeGenreName(entry.name)

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
 * Best-effort optional enrichment: fetches community genre tags for a
 * release-group. Never throws. Any failure (missing id, timeout, 404, 429/503,
 * other non-2xx, malformed body) resolves to an empty list so a confirmed
 * catalog Add is never blocked or failed by it. No retry.
 */
export async function lookupMusicBrainzReleaseGroupGenres({
  releaseGroupId,
  timeoutMs = GENRE_LOOKUP_TIMEOUT_MS,
  ...fetchOptions
}: MusicBrainzGenreLookupOptions): Promise<string[]> {
  if (!releaseGroupId) {
    return []
  }

  try {
    const payload = await fetchMusicBrainzJson(
      buildMusicBrainzReleaseGroupGenresUrl(releaseGroupId),
      { ...fetchOptions, timeoutMs },
    )

    return normalizeMusicBrainzGenres(payload)
  } catch {
    return []
  }
}

export function normalizeMusicBrainzRelease(
  release: unknown,
): CatalogCandidate | null {
  if (!isRecord(release)) {
    return null
  }

  const providerReleaseId = getString(release.id)

  if (
    !providerReleaseId
    || !MUSICBRAINZ_RELEASE_ID_PATTERN.test(providerReleaseId)
  ) {
    return null
  }

  const artist = extractArtist(release)
  const title = cleanRequiredText(release.title, RELEASE_FIELD_LIMITS.title)

  if (!artist || !title) {
    return null
  }

  // The single canonical implementation (spec 0017 §13.3) - `providerReleaseId`
  // is already validated above, so this cannot actually return null, but
  // routing through the shared helper (rather than re-inlining the URL
  // string) is what keeps it the one true implementation.
  const derivedProviderPageUrl = musicBrainzReleaseUrl(providerReleaseId)

  if (!derivedProviderPageUrl) {
    return null
  }

  return {
    provider: MUSICBRAINZ_PROVIDER,
    providerReleaseId,
    providerReleaseGroupId: extractReleaseGroupId(release),
    score: extractScore(release),
    artist,
    title,
    releaseYear: parseReleaseYear(release.date),
    label: extractLabel(release),
    catalogNumber: extractCatalogNumber(release),
    country: cleanOptionalText(release.country, RELEASE_FIELD_LIMITS.country),
    format: extractFormat(release),
    transientCoverDisplayUrl: null,
    derivedProviderPageUrl,
  }
}

async function fetchMusicBrainzJson(
  url: URL,
  { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, userAgent }: MusicBrainzFetchOptions,
): Promise<unknown> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
      signal: controller.signal,
    })

    if (response.status === 429 || response.status === 503) {
      throw new MusicBrainzError(
        'provider_rate_limited',
        'MusicBrainz is rate limiting or temporarily unavailable.',
        response.status,
      )
    }

    if (response.status === 404) {
      throw new MusicBrainzError(
        'not_found',
        'MusicBrainz release was not found.',
        response.status,
      )
    }

    if (!response.ok) {
      throw new MusicBrainzError(
        'provider_unavailable',
        'MusicBrainz request failed.',
        response.status,
      )
    }

    return await response.json()
  } catch (error) {
    if (error instanceof MusicBrainzError) {
      throw error
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new MusicBrainzError(
        'provider_timeout',
        'MusicBrainz request timed out.',
      )
    }

    throw new MusicBrainzError(
      'provider_unavailable',
      'MusicBrainz is unavailable.',
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * A single search request/response, including all of spec 0017 §8.4's
 * malformed-pagination-metadata validation. This is the one place that
 * validates the provider's raw response shape (the existing `releases`-is-
 * an-array check already lived here; the new `count`/`offset`/relational
 * checks join it in the same place, rather than being duplicated in the
 * handler). Any failure throws the existing `provider_bad_response`
 * category - never a silent default, never a fallback derived from
 * `candidates.length`/`rawCount`.
 */
export async function searchMusicBrainzReleases({
  limit,
  mode,
  offset,
  query,
  ...fetchOptions
}: MusicBrainzSearchOptions): Promise<MusicBrainzSearchPage> {
  const builtQuery = buildMusicBrainzQuery(mode, query)
  const payload = await fetchMusicBrainzJson(
    buildMusicBrainzSearchUrl(builtQuery, limit, offset),
    fetchOptions,
  )

  if (!isRecord(payload) || !Array.isArray(payload.releases)) {
    throw new MusicBrainzError(
      'provider_bad_response',
      'MusicBrainz search response was malformed.',
    )
  }

  const providerCount = payload.count
  const providerOffset = payload.offset
  const rawCount = payload.releases.length

  if (!isNonNegativeInteger(providerCount) || !isNonNegativeInteger(providerOffset)) {
    throw new MusicBrainzError(
      'provider_bad_response',
      'MusicBrainz search response was malformed.',
    )
  }

  if (providerOffset !== offset) {
    throw new MusicBrainzError(
      'provider_bad_response',
      'MusicBrainz search response was malformed.',
    )
  }

  if (rawCount > limit) {
    throw new MusicBrainzError(
      'provider_bad_response',
      'MusicBrainz search response was malformed.',
    )
  }

  if (rawCount > 0 && providerCount < offset + rawCount) {
    throw new MusicBrainzError(
      'provider_bad_response',
      'MusicBrainz search response was malformed.',
    )
  }

  const candidates = payload.releases
    .map((release) => normalizeMusicBrainzRelease(release))
    .filter((candidate): candidate is CatalogCandidate => candidate !== null)

  return { candidates, providerCount, providerOffset, rawCount }
}

export async function lookupMusicBrainzRelease({
  providerReleaseId,
  ...fetchOptions
}: MusicBrainzLookupOptions): Promise<CatalogCandidate> {
  const payload = await fetchMusicBrainzJson(
    buildMusicBrainzLookupUrl(providerReleaseId),
    fetchOptions,
  )
  const candidate = normalizeMusicBrainzRelease(payload)

  if (!candidate) {
    throw new MusicBrainzError(
      'provider_bad_response',
      'MusicBrainz release response was malformed.',
    )
  }

  return candidate
}

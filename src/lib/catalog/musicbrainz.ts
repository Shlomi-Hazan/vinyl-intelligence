import type { CatalogCandidate, CatalogErrorCode } from './types.ts'

const MUSICBRAINZ_API_BASE_URL = 'https://musicbrainz.org/ws/2'
const MUSICBRAINZ_PROVIDER = 'musicbrainz'
const DEFAULT_TIMEOUT_MS = 8_000
const GENRE_LOOKUP_TIMEOUT_MS = 6_000
const MAX_GENRES = 12
const GENRE_MAX_LENGTH = 40
const RELEASE_FIELD_LIMITS = {
  artist: 160,
  title: 200,
  label: 160,
  catalogNumber: 120,
  country: 80,
  format: 80,
} as const
const RELEASE_YEAR_MIN = 1900
const RELEASE_YEAR_MAX = 2100

export const MUSICBRAINZ_RELEASE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  query: string
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

export function buildMusicBrainzSearchUrl(query: string, limit: number): URL {
  const url = new URL(`${MUSICBRAINZ_API_BASE_URL}/release`)

  url.searchParams.set('query', query)
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('limit', limit.toString())

  return url
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

function normalizeGenreName(value: unknown): string | null {
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
    derivedProviderPageUrl: `https://musicbrainz.org/release/${providerReleaseId}`,
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

export async function searchMusicBrainzReleases({
  limit,
  query,
  ...fetchOptions
}: MusicBrainzSearchOptions): Promise<CatalogCandidate[]> {
  const payload = await fetchMusicBrainzJson(
    buildMusicBrainzSearchUrl(query, limit),
    fetchOptions,
  )

  if (!isRecord(payload) || !Array.isArray(payload.releases)) {
    throw new MusicBrainzError(
      'provider_bad_response',
      'MusicBrainz search response was malformed.',
    )
  }

  return payload.releases
    .map((release) => normalizeMusicBrainzRelease(release))
    .filter((candidate): candidate is CatalogCandidate => candidate !== null)
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

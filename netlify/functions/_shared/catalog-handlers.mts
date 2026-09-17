import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import {
  lookupMusicBrainzRelease,
  lookupMusicBrainzReleaseGroupGenres,
  MUSICBRAINZ_RELEASE_ID_PATTERN,
  MusicBrainzError,
  searchMusicBrainzReleases,
} from '../../../src/lib/catalog/musicbrainz.ts'
import {
  DiscogsError,
  lookupDiscogsRelease as lookupDiscogsReleaseImpl,
  searchDiscogsReleases as searchDiscogsReleasesImpl,
  type DiscogsSearchResponse,
  type NormalizedDiscogsRelease,
} from '../../../src/lib/catalog/discogs.ts'
import { DISCOGS_RELEASE_ID_PATTERN } from '../../../src/lib/catalog/discogsIdentity.ts'
import {
  CatalogPersistenceError,
  upsertCatalogRelease,
} from './catalogPersistence.mts'
import type {
  CatalogAddResponse,
  CatalogCandidate,
  CatalogErrorCode,
  CatalogProvider,
  CatalogSearchResponse,
  SearchMode,
} from '../../../src/lib/catalog/types.ts'

const DEFAULT_SEARCH_LIMIT = 5
const MAX_SEARCH_LIMIT = 10
const SEARCH_QUERY_MIN_LENGTH = 2
const SEARCH_QUERY_MAX_LENGTH = 120
// The Vinyl Intelligence product bound on total exposed results per query
// (spec 0017 §7.1/§5.2) - well inside MusicBrainz's own 1-100 `limit`
// allowance, not a provider limitation.
const MAX_EXPOSED_RESULTS = 20
const SEARCH_MODES: readonly SearchMode[] = ['all', 'artist', 'album']
const MUSICBRAINZ_PACING_MS = 1_000
const MUSICBRAINZ_RATE_LIMIT_RETRY_DELAY_MS = 1_200
// Discogs pacing is independent from MusicBrainz's (spec 0018 §12/§17) - an
// in-process, best-effort throttle only (serverless instances may run as
// separate warm processes; this cannot enforce a true cross-instance
// ceiling). A deliberately conservative margin below the single, non-
// guaranteed Phase-0 observation (~60/min), not "comfortably under" it.
const DISCOGS_PACING_MS = 1_500
const CATALOG_ITEM_SELECT = `
  id,
  added_at,
  created_at,
  release:releases!inner (
    id,
    artist,
    title,
    release_year,
    label,
    catalog_number,
    country,
    format,
    genres,
    updated_at
  )
`

type Environment = Partial<Record<string, string>>

type SupabaseFactory = typeof createClient

export type CatalogFunctionDependencies = {
  createClient: SupabaseFactory
  delay: (ms: number) => Promise<void>
  lookupRelease: typeof lookupMusicBrainzRelease
  lookupReleaseGroupGenres: typeof lookupMusicBrainzReleaseGroupGenres
  paceProviderRequest: () => Promise<void>
  searchReleases: typeof searchMusicBrainzReleases
  lookupDiscogsRelease: typeof lookupDiscogsReleaseImpl
  paceDiscogsRequest: () => Promise<void>
  searchDiscogsReleases: typeof searchDiscogsReleasesImpl
}

type AuthenticatedUser = Pick<User, 'id'> & { token: string }

type CollectionReleaseRow = CatalogAddResponse['item']['release']

type CollectionItemRow = Omit<CatalogAddResponse['item'], 'release'> & {
  release: CollectionReleaseRow | CollectionReleaseRow[]
}

type CatalogErrorPayload = {
  code: CatalogErrorCode
  message: string
}

/**
 * The read-only-preview-and-persisting-refresh response shape (spec 0018
 * §8.0). `providerFetchedAt` is the exact ISO timestamp the server
 * persisted - the browser must use THIS value, never `Date.now()`, when
 * updating its own freshness clock.
 */
export type DiscogsRefreshResponse = {
  candidate: CatalogCandidate
  genres: string[]
  providerFetchedAt: string
}

let nextMusicBrainzRequestAt = 0
let nextDiscogsRequestAt = 0

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function defaultDependencies(): CatalogFunctionDependencies {
  return {
    createClient,
    delay: defaultDelay,
    lookupRelease: lookupMusicBrainzRelease,
    lookupReleaseGroupGenres: lookupMusicBrainzReleaseGroupGenres,
    paceProviderRequest: paceMusicBrainzRequest,
    searchReleases: searchMusicBrainzReleases,
    lookupDiscogsRelease: lookupDiscogsReleaseImpl,
    paceDiscogsRequest,
    searchDiscogsReleases: searchDiscogsReleasesImpl,
  }
}

function jsonResponse(
  payload:
    | CatalogAddResponse
    | CatalogErrorPayload
    | CatalogSearchResponse
    | DiscogsSearchResponse
    | DiscogsRefreshResponse,
  status = 200,
): Response {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

function errorResponse(code: CatalogErrorCode, message: string): Response {
  const statusByCode: Record<CatalogErrorCode, number> = {
    config_error: 500,
    database_error: 500,
    invalid_query: 400,
    not_found: 404,
    provider_bad_response: 502,
    provider_rate_limited: 503,
    provider_timeout: 504,
    provider_unavailable: 502,
    unauthorized: 401,
    unknown: 500,
  }

  return jsonResponse({ code, message }, statusByCode[code])
}

function requiredEnv(env: Environment, key: string): string {
  const value = env[key]?.trim()

  if (!value) {
    throw new CatalogFunctionError(
      'config_error',
      'Catalog service is not configured.',
    )
  }

  return value
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? ''
  const [scheme, token] = header.split(/\s+/, 2)

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new CatalogFunctionError(
      'unauthorized',
      'Sign in before using catalog search.',
    )
  }

  return token
}

async function authenticateRequest(
  request: Request,
  env: Environment,
  createClientImpl: SupabaseFactory,
): Promise<AuthenticatedUser> {
  const supabaseUrl = requiredEnv(env, 'VITE_SUPABASE_URL')
  const publishableKey = requiredEnv(env, 'VITE_SUPABASE_PUBLISHABLE_KEY')
  const token = bearerToken(request)
  const authClient = createClientImpl(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  const { data, error } = await authClient.auth.getUser(token)

  if (error || !data.user) {
    throw new CatalogFunctionError(
      'unauthorized',
      'Sign in before using catalog search.',
    )
  }

  return { id: data.user.id, token }
}

function parseLimit(value: string | null): number {
  const parsed = value ? Number(value) : DEFAULT_SEARCH_LIMIT

  if (!Number.isFinite(parsed)) {
    return DEFAULT_SEARCH_LIMIT
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_SEARCH_LIMIT)
}

function isSearchMode(value: string): value is SearchMode {
  return (SEARCH_MODES as readonly string[]).includes(value)
}

/** Omitted `mode` defaults to `all`; a present-but-unrecognized value is
 * rejected, never silently coerced (spec 0017 §8.1). */
function parseMode(value: string | null): SearchMode {
  if (value === null) {
    return 'all'
  }

  if (!isSearchMode(value)) {
    throw new CatalogFunctionError('invalid_query', 'Search mode is invalid.')
  }

  return value
}

/** Omitted `offset` defaults to 0; anything else must be a non-negative
 * integer (spec 0017 §8.1). */
function parseOffset(value: string | null): number {
  if (value === null) {
    return 0
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CatalogFunctionError('invalid_query', 'Search offset is invalid.')
  }

  return parsed
}

function isCatalogProvider(value: string): value is CatalogProvider {
  return value === 'musicbrainz' || value === 'discogs'
}

/** Omitted `provider` defaults to `musicbrainz` (100% backward-compatible -
 * no existing client sends this parameter, spec 0018 §5.1). */
function parseProvider(value: string | null): CatalogProvider {
  if (value === null) {
    return 'musicbrainz'
  }

  if (!isCatalogProvider(value)) {
    throw new CatalogFunctionError('invalid_query', 'Catalog provider is invalid.')
  }

  return value
}

function releaseIdPatternFor(provider: CatalogProvider): RegExp {
  return provider === 'discogs' ? DISCOGS_RELEASE_ID_PATTERN : MUSICBRAINZ_RELEASE_ID_PATTERN
}

type SearchPageRequest = {
  kind: 'search'
  limit: number
  mode: SearchMode
  offset: number
  query: string
}

/**
 * The explicit, user-triggered Discogs fallback search (spec 0018 §8) - a
 * genuinely distinct request/response shape from `SearchPageRequest`, never
 * forced into `CatalogSearchResponse`. `mode` (spec 0020 §2) selects which
 * Discogs search field carries `query` - still no pagination.
 */
type DiscogsSearchPageRequest = {
  kind: 'discogs-search'
  mode: SearchMode
  query: string
}

type ExactLookupRequest = {
  kind: 'exact'
  provider: CatalogProvider
  releaseId: string
}

type CatalogSearchRequest = SearchPageRequest | DiscogsSearchPageRequest | ExactLookupRequest

/**
 * `GET /api/catalog/search` accepts either a normal search request
 * (`q` + optional `mode`/`offset`/`limit`, `provider` defaulting to
 * `musicbrainz`) or an exact-lookup request (`releaseId` + optional
 * `provider`) - never both, never neither (spec 0017 §11.1; spec 0018 §5.1,
 * §5.2). This is the one place that branches between them;
 * `handleCatalogSearch` itself just dispatches on `.kind`.
 */
function parseCatalogSearchRequest(request: Request): CatalogSearchRequest {
  const url = new URL(request.url)
  const rawQuery = url.searchParams.get('q')
  const rawMode = url.searchParams.get('mode')
  const rawOffset = url.searchParams.get('offset')
  const rawLimit = url.searchParams.get('limit')
  const releaseId = url.searchParams.get('releaseId')
  const provider = parseProvider(url.searchParams.get('provider'))

  if (releaseId !== null) {
    if (rawQuery !== null || rawMode !== null || rawOffset !== null || rawLimit !== null) {
      throw new CatalogFunctionError(
        'invalid_query',
        'releaseId cannot be combined with q, mode, offset, or limit.',
      )
    }

    if (!releaseIdPatternFor(provider).test(releaseId)) {
      throw new CatalogFunctionError(
        'invalid_query',
        'Catalog release identifier is invalid.',
      )
    }

    return { kind: 'exact', provider, releaseId }
  }

  if (rawQuery === null) {
    throw new CatalogFunctionError(
      'invalid_query',
      'Provide either a search query or an exact release identifier.',
    )
  }

  const query = rawQuery.trim()

  if (
    query.length < SEARCH_QUERY_MIN_LENGTH
    || query.length > SEARCH_QUERY_MAX_LENGTH
  ) {
    throw new CatalogFunctionError(
      'invalid_query',
      `Search query must be ${SEARCH_QUERY_MIN_LENGTH}-${SEARCH_QUERY_MAX_LENGTH} characters.`,
    )
  }

  if (provider === 'discogs') {
    if (rawOffset !== null || rawLimit !== null) {
      throw new CatalogFunctionError(
        'invalid_query',
        'Discogs search does not accept offset or limit.',
      )
    }

    // `mode` (spec 0020 §2) - same validation/default as MusicBrainz's,
    // Discogs still has no pagination so offset/limit remain rejected above.
    const mode = parseMode(rawMode)

    return { kind: 'discogs-search', mode, query }
  }

  const mode = parseMode(rawMode)
  const offset = parseOffset(rawOffset)
  const limit = parseLimit(rawLimit)

  // Defense in depth (spec 0017 §8.1): validating `offset` in isolation is
  // not enough, because `limit` can independently be as large as 10 - an
  // `offset=15&limit=10` request would otherwise extend five rows past the
  // 20-result window even though each parameter is individually valid.
  if (offset + limit > MAX_EXPOSED_RESULTS) {
    throw new CatalogFunctionError(
      'invalid_query',
      `offset + limit must not exceed ${MAX_EXPOSED_RESULTS}.`,
    )
  }

  return { kind: 'search', limit, mode, offset, query }
}

/**
 * Spec 0017 §7.2's exact three-condition `hasMore` formula, exported for
 * direct unit testing against its worked examples. Never inferred from
 * `candidates.length` (normalization can reject entries from a full raw
 * page) and never from raw page size alone (a full raw page can be the
 * entire result set).
 */
export function computeHasMore(page: {
  limit: number
  offset: number
  providerCount: number
  rawCount: number
}): boolean {
  return (
    page.rawCount === page.limit
    && page.offset + page.limit < MAX_EXPOSED_RESULTS
    && page.offset + page.rawCount < page.providerCount
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type AddRequest = {
  kind: 'add'
  provider: CatalogProvider
  providerReleaseId: string
}

/**
 * A Discogs-only revalidation request (spec 0018 §8.2.1/§8.3) - re-fetches
 * and persists the current Discogs metadata for an already-owned release
 * without creating a new collection item. Distinguished from the normal add
 * shape by its extra `action` key.
 */
type RefreshRequest = {
  kind: 'refresh'
  providerReleaseId: string
}

async function parseAddOrRefreshRequest(
  request: Request,
): Promise<AddRequest | RefreshRequest> {
  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    throw new CatalogFunctionError(
      'invalid_query',
      'Catalog add request body must be JSON.',
    )
  }

  if (!isRecord(payload)) {
    throw new CatalogFunctionError(
      'invalid_query',
      'Catalog add request body must contain provider identity.',
    )
  }

  const keys = Object.keys(payload).sort()

  if (
    keys.length === 3
    && keys[0] === 'action'
    && keys[1] === 'provider'
    && keys[2] === 'providerReleaseId'
  ) {
    if (payload.action !== 'refresh') {
      throw new CatalogFunctionError('invalid_query', 'Unsupported catalog action.')
    }

    if (payload.provider !== 'discogs') {
      throw new CatalogFunctionError(
        'invalid_query',
        'Only Discogs catalog releases support a refresh action.',
      )
    }

    if (
      typeof payload.providerReleaseId !== 'string'
      || !DISCOGS_RELEASE_ID_PATTERN.test(payload.providerReleaseId)
    ) {
      throw new CatalogFunctionError(
        'invalid_query',
        'Catalog release identifier is invalid.',
      )
    }

    return { kind: 'refresh', providerReleaseId: payload.providerReleaseId }
  }

  if (
    keys.length !== 2
    || !keys.includes('provider')
    || !keys.includes('providerReleaseId')
  ) {
    throw new CatalogFunctionError(
      'invalid_query',
      'Catalog add accepts only provider identity.',
    )
  }

  if (typeof payload.provider !== 'string' || !isCatalogProvider(payload.provider)) {
    throw new CatalogFunctionError('invalid_query', 'Catalog provider is invalid.')
  }

  if (
    typeof payload.providerReleaseId !== 'string'
    || !releaseIdPatternFor(payload.provider).test(payload.providerReleaseId)
  ) {
    throw new CatalogFunctionError(
      'invalid_query',
      'Catalog release identifier is invalid.',
    )
  }

  return {
    kind: 'add',
    provider: payload.provider,
    providerReleaseId: payload.providerReleaseId,
  }
}

function normalizeCollectionItemRow(value: unknown): CatalogAddResponse['item'] {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.added_at !== 'string'
    || typeof value.created_at !== 'string'
  ) {
    throw new CatalogFunctionError(
      'database_error',
      'Collection item persistence failed.',
    )
  }

  const row = value as CollectionItemRow
  const release = Array.isArray(row.release) ? row.release[0] : row.release

  if (
    !release
    || typeof release.id !== 'string'
    || typeof release.artist !== 'string'
    || typeof release.title !== 'string'
    || typeof release.updated_at !== 'string'
  ) {
    throw new CatalogFunctionError(
      'database_error',
      'Collection item release metadata was missing.',
    )
  }

  return {
    id: row.id,
    added_at: row.added_at,
    created_at: row.created_at,
    release: {
      ...release,
      genres: Array.isArray(release.genres) ? release.genres : [],
    },
  }
}

/**
 * Ownership gate for a Discogs refresh (spec 0018 §8.3, PR #41 finding 1) -
 * verifies, BEFORE any Discogs call or service-role write, that the
 * authenticated caller actually owns a collection item whose release
 * identity is exactly `(provider='discogs', provider_release_id)`. Uses an
 * RLS-scoped client authenticated as the caller (their own bearer token,
 * never the service role and never a browser-supplied user id), so
 * `collection_items` ownership is enforced by the database itself, not by
 * application logic trusting client input.
 *
 * Two narrow, exact-match, indexed queries rather than one embedded-filter
 * query: the first (`releases`, readable to any authenticated user per its
 * existing catalog-select policy) resolves the identity to a release row id
 * with no ownership implication of its own; the second
 * (`collection_items`, RLS-scoped to `auth.uid() = user_id`) checks whether
 * THIS caller owns a copy of it. A miss at either step means "not owned" -
 * rejected identically, so a non-existent release and an existing-but-
 * unowned one are indistinguishable to the caller.
 */
async function verifyOwnsDiscogsRelease(
  env: Environment,
  createClientImpl: SupabaseFactory,
  token: string,
  providerReleaseId: string,
): Promise<void> {
  const supabaseUrl = requiredEnv(env, 'VITE_SUPABASE_URL')
  const publishableKey = requiredEnv(env, 'VITE_SUPABASE_PUBLISHABLE_KEY')
  const userClient = createClientImpl(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const releaseResult = await userClient
    .from('releases')
    .select('id')
    .eq('source', 'catalog')
    .eq('provider', 'discogs')
    .eq('provider_release_id', providerReleaseId)
    .limit(1)
    .maybeSingle()

  if (releaseResult.error) {
    throw new CatalogFunctionError(
      'database_error',
      'Could not verify your collection.',
    )
  }

  if (!releaseResult.data) {
    throw new CatalogFunctionError(
      'not_found',
      'That record is not in your collection.',
    )
  }

  const ownershipResult = await userClient
    .from('collection_items')
    .select('id')
    .eq('release_id', releaseResult.data.id)
    .limit(1)
    .maybeSingle()

  if (ownershipResult.error) {
    throw new CatalogFunctionError(
      'database_error',
      'Could not verify your collection.',
    )
  }

  if (!ownershipResult.data) {
    throw new CatalogFunctionError(
      'not_found',
      'That record is not in your collection.',
    )
  }
}

async function createCatalogCollectionItem(
  env: Environment,
  createClientImpl: SupabaseFactory,
  userId: string,
  releaseId: string,
): Promise<CatalogAddResponse['item']> {
  const supabaseUrl = requiredEnv(env, 'VITE_SUPABASE_URL')
  const serviceRoleKey = requiredEnv(env, 'SUPABASE_SERVICE_ROLE_KEY')
  const serviceClient = createClientImpl(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  const { data, error } = await serviceClient
    .from('collection_items')
    .insert({ release_id: releaseId, user_id: userId })
    .select(CATALOG_ITEM_SELECT)
    .single()

  if (error) {
    throw new CatalogFunctionError(
      'database_error',
      'Catalog record could not be added to your collection.',
    )
  }

  return normalizeCollectionItemRow(data)
}

async function paceMusicBrainzRequest(): Promise<void> {
  const now = Date.now()
  const waitMs = Math.max(0, nextMusicBrainzRequestAt - now)

  nextMusicBrainzRequestAt = Math.max(nextMusicBrainzRequestAt, now)
    + MUSICBRAINZ_PACING_MS

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
}

/**
 * An in-process, best-effort throttle only - not a verified global/
 * cross-instance limiter (spec 0018 §12/§17, the same limitation the
 * existing `paceMusicBrainzRequest` already silently has). Entirely
 * independent from MusicBrainz's own pacer/clock.
 */
export async function paceDiscogsRequest(): Promise<void> {
  const now = Date.now()
  const waitMs = Math.max(0, nextDiscogsRequestAt - now)

  nextDiscogsRequestAt = Math.max(nextDiscogsRequestAt, now) + DISCOGS_PACING_MS

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
}

class CatalogFunctionError extends Error {
  readonly code: CatalogErrorCode

  constructor(code: CatalogErrorCode, message: string) {
    super(message)
    this.name = 'CatalogFunctionError'
    this.code = code
  }
}

async function lookupReleaseWithRateLimitRetry(
  dependencies: CatalogFunctionDependencies,
  providerReleaseId: string,
  userAgent: string,
): Promise<CatalogCandidate> {
  try {
    return await dependencies.lookupRelease({ providerReleaseId, userAgent })
  } catch (error) {
    if (
      error instanceof MusicBrainzError
      && error.code === 'provider_rate_limited'
    ) {
      // The retry is itself a real MusicBrainz request: back off, then update
      // the shared provider pacer so a following request (e.g. the Milestone 6
      // release-group genre lookup) does not fire against a stale slot.
      await dependencies.delay(MUSICBRAINZ_RATE_LIMIT_RETRY_DELAY_MS)
      await dependencies.paceProviderRequest()

      return dependencies.lookupRelease({ providerReleaseId, userAgent })
    }

    throw error
  }
}

/**
 * Fetches and persists the current Discogs metadata for one release
 * (spec 0018 §5.3/§8.2.1/§8.3) - the shared, deliberately re-run exact
 * lookup both the persisting add path and the read-only revalidation path
 * use. No automatic retry on a Discogs rate limit (spec 0018 §17).
 */
async function fetchAndPersistDiscogsRelease(
  env: Environment,
  dependencies: CatalogFunctionDependencies,
  providerReleaseId: string,
): Promise<{
  release: NormalizedDiscogsRelease
  providerFetchedAt: string
  releaseRowId: string
}> {
  const token = requiredEnv(env, 'DISCOGS_TOKEN')
  const userAgent = requiredEnv(env, 'DISCOGS_USER_AGENT')

  await dependencies.paceDiscogsRequest()

  const release = await dependencies.lookupDiscogsRelease({
    providerReleaseId,
    token,
    userAgent,
  })
  const providerFetchedAt = new Date().toISOString()

  const releaseRow = await upsertCatalogRelease(
    env,
    dependencies.createClient,
    release.candidate,
    release.genres,
    providerFetchedAt,
  )

  return { release, providerFetchedAt, releaseRowId: releaseRow.id }
}

function mapThrownError(error: unknown): Response {
  if (error instanceof CatalogFunctionError) {
    return errorResponse(error.code, error.message)
  }

  if (error instanceof MusicBrainzError) {
    return errorResponse(error.code, error.message)
  }

  if (error instanceof DiscogsError) {
    return errorResponse(error.code, error.message)
  }

  if (error instanceof CatalogPersistenceError) {
    return errorResponse(error.code, error.message)
  }

  return errorResponse('unknown', 'Catalog request failed. Please try again.')
}

export async function handleCatalogSearch(
  request: Request,
  env: Environment = process.env,
  dependencies: CatalogFunctionDependencies = defaultDependencies(),
): Promise<Response> {
  try {
    await authenticateRequest(request, env, dependencies.createClient)
    const parsed = parseCatalogSearchRequest(request)

    if (parsed.kind === 'discogs-search') {
      const token = requiredEnv(env, 'DISCOGS_TOKEN')
      const userAgent = requiredEnv(env, 'DISCOGS_USER_AGENT')

      await dependencies.paceDiscogsRequest()

      const response = await dependencies.searchDiscogsReleases({
        mode: parsed.mode,
        query: parsed.query,
        token,
        userAgent,
      })

      return jsonResponse(response)
    }

    if (parsed.kind === 'exact') {
      if (parsed.provider === 'discogs') {
        const token = requiredEnv(env, 'DISCOGS_TOKEN')
        const userAgent = requiredEnv(env, 'DISCOGS_USER_AGENT')

        await dependencies.paceDiscogsRequest()

        // Read-only exact-preview lookup (spec 0018 §5.2): zero database
        // writes, for either provider, today or after this change.
        const { candidate } = await dependencies.lookupDiscogsRelease({
          providerReleaseId: parsed.releaseId,
          token,
          userAgent,
        })

        return jsonResponse({ candidates: [candidate], hasMore: false, offset: 0 })
      }

      // Read-only exact release lookup (spec 0017 §10.3/§11.1): reuses the
      // exact same paced, rate-limit-retried function `handleCatalogAdd`
      // already calls - no genre enrichment, no database write of any
      // kind. Same response shape as a normal search, so the browser needs
      // zero new branches to render it.
      const userAgent = requiredEnv(env, 'MUSICBRAINZ_USER_AGENT')

      await dependencies.paceProviderRequest()

      const candidate = await lookupReleaseWithRateLimitRetry(
        dependencies,
        parsed.releaseId,
        userAgent,
      )

      return jsonResponse({ candidates: [candidate], hasMore: false, offset: 0 })
    }

    const userAgent = requiredEnv(env, 'MUSICBRAINZ_USER_AGENT')

    await dependencies.paceProviderRequest()

    // Pacing is shared with every other MusicBrainz call path (above); this
    // normal search path has no retry policy of its own, unchanged from
    // today, and this enhancement does not add one (spec 0017 §14) - only
    // the exact-lookup branch above reuses the existing bounded retry.
    const page = await dependencies.searchReleases({
      limit: parsed.limit,
      mode: parsed.mode,
      offset: parsed.offset,
      query: parsed.query,
      userAgent,
    })

    const hasMore = computeHasMore({
      limit: parsed.limit,
      offset: parsed.offset,
      providerCount: page.providerCount,
      rawCount: page.rawCount,
    })

    return jsonResponse({ candidates: page.candidates, hasMore, offset: parsed.offset })
  } catch (error) {
    return mapThrownError(error)
  }
}

export async function handleCatalogAdd(
  request: Request,
  env: Environment = process.env,
  dependencies: CatalogFunctionDependencies = defaultDependencies(),
): Promise<Response> {
  try {
    const user = await authenticateRequest(request, env, dependencies.createClient)
    const parsed = await parseAddOrRefreshRequest(request)

    if (parsed.kind === 'refresh') {
      // Ownership gate BEFORE any Discogs call or write (spec 0018 §8.3,
      // PR #41 finding 1) - the browser's own claim of ownership is never
      // trusted; ownership is re-verified against the database, scoped to
      // this authenticated caller's own token.
      await verifyOwnsDiscogsRelease(
        env,
        dependencies.createClient,
        user.token,
        parsed.providerReleaseId,
      )

      const { release, providerFetchedAt } = await fetchAndPersistDiscogsRelease(
        env,
        dependencies,
        parsed.providerReleaseId,
      )

      const response: DiscogsRefreshResponse = {
        candidate: release.candidate,
        genres: release.genres,
        providerFetchedAt,
      }

      return jsonResponse(response)
    }

    if (parsed.provider === 'discogs') {
      // The second, independent, persisting lookup (spec 0018 §9): the
      // browser's preview-step result (§5.2) is never trusted as metadata,
      // only `provider` + `providerReleaseId`.
      const { releaseRowId } = await fetchAndPersistDiscogsRelease(
        env,
        dependencies,
        parsed.providerReleaseId,
      )
      const item = await createCatalogCollectionItem(
        env,
        dependencies.createClient,
        user.id,
        releaseRowId,
      )

      return jsonResponse({ item })
    }

    const userAgent = requiredEnv(env, 'MUSICBRAINZ_USER_AGENT')

    await dependencies.paceProviderRequest()

    const candidate = await lookupReleaseWithRateLimitRetry(
      dependencies,
      parsed.providerReleaseId,
      userAgent,
    )

    // Optional best-effort genre enrichment: a second MusicBrainz GET for the
    // release-group's community genre tags. Paced like every provider request,
    // no retry, and never allowed to fail the confirmed Add.
    let genres: string[] = []

    if (candidate.providerReleaseGroupId) {
      await dependencies.paceProviderRequest()

      try {
        genres = await dependencies.lookupReleaseGroupGenres({
          releaseGroupId: candidate.providerReleaseGroupId,
          userAgent,
        })
      } catch {
        genres = []
      }
    }

    const release = await upsertCatalogRelease(
      env,
      dependencies.createClient,
      candidate,
      genres,
      null,
    )
    const item = await createCatalogCollectionItem(
      env,
      dependencies.createClient,
      user.id,
      release.id,
    )

    return jsonResponse({ item })
  } catch (error) {
    return mapThrownError(error)
  }
}

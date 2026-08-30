import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import {
  lookupMusicBrainzRelease,
  lookupMusicBrainzReleaseGroupGenres,
  MUSICBRAINZ_RELEASE_ID_PATTERN,
  MusicBrainzError,
  searchMusicBrainzReleases,
} from '../../../src/lib/catalog/musicbrainz.ts'
import type {
  CatalogAddResponse,
  CatalogCandidate,
  CatalogErrorCode,
  CatalogProvider,
  CatalogSearchResponse,
} from '../../../src/lib/catalog/types.ts'

const DEFAULT_SEARCH_LIMIT = 5
const MAX_SEARCH_LIMIT = 10
const SEARCH_QUERY_MIN_LENGTH = 2
const SEARCH_QUERY_MAX_LENGTH = 120
const MUSICBRAINZ_PACING_MS = 1_000
const MUSICBRAINZ_RATE_LIMIT_RETRY_DELAY_MS = 1_200
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

type CatalogFunctionDependencies = {
  createClient: SupabaseFactory
  delay: (ms: number) => Promise<void>
  lookupRelease: typeof lookupMusicBrainzRelease
  lookupReleaseGroupGenres: typeof lookupMusicBrainzReleaseGroupGenres
  paceProviderRequest: () => Promise<void>
  searchReleases: typeof searchMusicBrainzReleases
}

type AuthenticatedUser = Pick<User, 'id'>

type CatalogReleaseRow = {
  id: string
}

type CollectionReleaseRow = CatalogAddResponse['item']['release']

type CollectionItemRow = Omit<CatalogAddResponse['item'], 'release'> & {
  release: CollectionReleaseRow | CollectionReleaseRow[]
}

type CatalogErrorPayload = {
  code: CatalogErrorCode
  message: string
}

let nextMusicBrainzRequestAt = 0

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
  }
}

function jsonResponse(
  payload: CatalogAddResponse | CatalogErrorPayload | CatalogSearchResponse,
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

  return { id: data.user.id }
}

function parseLimit(value: string | null): number {
  const parsed = value ? Number(value) : DEFAULT_SEARCH_LIMIT

  if (!Number.isFinite(parsed)) {
    return DEFAULT_SEARCH_LIMIT
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_SEARCH_LIMIT)
}

function parseSearchRequest(request: Request): { limit: number; query: string } {
  const url = new URL(request.url)
  const query = url.searchParams.get('q')?.trim() ?? ''

  if (
    query.length < SEARCH_QUERY_MIN_LENGTH
    || query.length > SEARCH_QUERY_MAX_LENGTH
  ) {
    throw new CatalogFunctionError(
      'invalid_query',
      `Search query must be ${SEARCH_QUERY_MIN_LENGTH}-${SEARCH_QUERY_MAX_LENGTH} characters.`,
    )
  }

  return {
    limit: parseLimit(url.searchParams.get('limit')),
    query,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function parseAddRequest(request: Request): Promise<{
  provider: CatalogProvider
  providerReleaseId: string
}> {
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

  const keys = Object.keys(payload)

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

  if (payload.provider !== 'musicbrainz') {
    throw new CatalogFunctionError(
      'invalid_query',
      'MusicBrainz is the only approved Milestone 4 catalog provider.',
    )
  }

  if (
    typeof payload.providerReleaseId !== 'string'
    || !MUSICBRAINZ_RELEASE_ID_PATTERN.test(payload.providerReleaseId)
  ) {
    throw new CatalogFunctionError(
      'invalid_query',
      'Catalog release identifier is invalid.',
    )
  }

  return {
    provider: payload.provider,
    providerReleaseId: payload.providerReleaseId,
  }
}

function catalogReleasePayload(candidate: CatalogCandidate, genres: string[]) {
  const payload = {
    artist: candidate.artist,
    catalog_number: candidate.catalogNumber,
    country: candidate.country,
    created_by: null,
    format: candidate.format,
    label: candidate.label,
    provider: candidate.provider,
    provider_release_group_id: candidate.providerReleaseGroupId,
    provider_release_id: candidate.providerReleaseId,
    release_year: candidate.releaseYear,
    source: 'catalog',
    title: candidate.title,
  }

  // releases rows are shared across users. Only write `genres` when the
  // optional enrichment actually produced one or more - omitting the key on an
  // on-conflict upsert leaves any existing genres untouched, and a brand-new
  // row falls back to the column default '{}'.
  return genres.length > 0 ? { ...payload, genres } : payload
}

function normalizeCatalogReleaseRow(value: unknown): CatalogReleaseRow {
  if (!isRecord(value) || typeof value.id !== 'string') {
    throw new CatalogFunctionError(
      'database_error',
      'Catalog release persistence failed.',
    )
  }

  return { id: value.id }
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

async function upsertCatalogRelease(
  env: Environment,
  createClientImpl: SupabaseFactory,
  candidate: CatalogCandidate,
  genres: string[],
): Promise<CatalogReleaseRow> {
  const supabaseUrl = requiredEnv(env, 'VITE_SUPABASE_URL')
  const serviceRoleKey = requiredEnv(env, 'SUPABASE_SERVICE_ROLE_KEY')
  const serviceClient = createClientImpl(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data, error } = await serviceClient
    .from('releases')
    .upsert(catalogReleasePayload(candidate, genres), {
      onConflict: 'provider,provider_release_id',
    })
    .select('id')
    .single()

  if (error) {
    throw new CatalogFunctionError(
      'database_error',
      'Catalog release could not be saved.',
    )
  }

  return normalizeCatalogReleaseRow(data)
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
      await dependencies.delay(MUSICBRAINZ_RATE_LIMIT_RETRY_DELAY_MS)

      return dependencies.lookupRelease({ providerReleaseId, userAgent })
    }

    throw error
  }
}

function mapThrownError(error: unknown): Response {
  if (error instanceof CatalogFunctionError) {
    return errorResponse(error.code, error.message)
  }

  if (error instanceof MusicBrainzError) {
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
    const { limit, query } = parseSearchRequest(request)
    const userAgent = requiredEnv(env, 'MUSICBRAINZ_USER_AGENT')

    await dependencies.paceProviderRequest()

    const candidates = await dependencies.searchReleases({
      limit,
      query,
      userAgent,
    })

    return jsonResponse({ candidates })
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
    const { providerReleaseId } = await parseAddRequest(request)
    const userAgent = requiredEnv(env, 'MUSICBRAINZ_USER_AGENT')

    await dependencies.paceProviderRequest()

    const candidate = await lookupReleaseWithRateLimitRetry(
      dependencies,
      providerReleaseId,
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

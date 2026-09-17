import { createClient } from '@supabase/supabase-js'
import type { CatalogCandidate, CatalogErrorCode } from '../../../src/lib/catalog/types.ts'

/**
 * The single, shared release-upsert boundary (spec 0018 §8.3) - extracted
 * out of `catalog-handlers.mts` so both that module's add/refresh paths AND
 * `curator-handlers.mts`'s `loadOwnedCollection` freshness pass import the
 * SAME persistence implementation, rather than two independent ones or an
 * informal cross-module reference to a private symbol.
 */

type Environment = Partial<Record<string, string>>
type SupabaseFactory = typeof createClient

export type CatalogReleaseRow = {
  id: string
}

export class CatalogPersistenceError extends Error {
  readonly code: CatalogErrorCode

  constructor(code: CatalogErrorCode, message: string) {
    super(message)
    this.name = 'CatalogPersistenceError'
    this.code = code
  }
}

function requiredEnv(env: Environment, key: string): string {
  const value = env[key]?.trim()

  if (!value) {
    throw new CatalogPersistenceError(
      'config_error',
      'Catalog service is not configured.',
    )
  }

  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeCatalogReleaseRow(value: unknown): CatalogReleaseRow {
  if (!isRecord(value) || typeof value.id !== 'string') {
    throw new CatalogPersistenceError(
      'database_error',
      'Catalog release persistence failed.',
    )
  }

  return { id: value.id }
}

/**
 * `providerFetchedAt` is always passed explicitly - `null` for MusicBrainz
 * (which carries no freshness concept), the server-generated ISO timestamp
 * for Discogs - so an `upsert` never leaves a stale value on a row that
 * should never have one (spec 0018 §5.3/§8.0).
 */
function catalogReleasePayload(
  candidate: CatalogCandidate,
  genres: string[],
  providerFetchedAt: string | null,
) {
  const payload = {
    artist: candidate.artist,
    catalog_number: candidate.catalogNumber,
    country: candidate.country,
    created_by: null,
    format: candidate.format,
    label: candidate.label,
    provider: candidate.provider,
    provider_fetched_at: providerFetchedAt,
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

export async function upsertCatalogRelease(
  env: Environment,
  createClientImpl: SupabaseFactory,
  candidate: CatalogCandidate,
  genres: string[],
  providerFetchedAt: string | null,
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
    .upsert(catalogReleasePayload(candidate, genres, providerFetchedAt), {
      onConflict: 'provider,provider_release_id',
    })
    .select('id')
    .single()

  if (error) {
    throw new CatalogPersistenceError(
      'database_error',
      'Catalog release could not be saved.',
    )
  }

  return normalizeCatalogReleaseRow(data)
}

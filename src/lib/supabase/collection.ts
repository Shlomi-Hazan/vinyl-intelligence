import type {
  BrowserSupabaseClient,
  CollectionItem,
  Release,
} from './client.ts'

export const RELEASE_FIELD_LIMITS = {
  artist: 160,
  title: 200,
  label: 160,
  catalogNumber: 120,
  country: 80,
  format: 80,
} as const

const RELEASE_YEAR_MIN = 1900
const RELEASE_YEAR_MAX = 2100

export type ManualReleaseInput = {
  artist: string
  title: string
  releaseYear: string
  label: string
  catalogNumber: string
  country: string
  format: string
}

export type NormalizedManualReleaseInput = {
  artist: string
  title: string
  release_year: number | null
  label: string | null
  catalog_number: string | null
  country: string | null
  format: string | null
}

export type CollectionItemWithRelease = Pick<
  CollectionItem,
  'id' | 'added_at' | 'created_at'
> & {
  release: Pick<
    Release,
    | 'id'
    | 'artist'
    | 'title'
    | 'release_year'
    | 'label'
    | 'catalog_number'
    | 'country'
    | 'format'
    | 'updated_at'
  >
}

type CollectionItemRow = CollectionItemWithRelease | {
  id: string
  added_at: string
  created_at: string
  release: CollectionItemWithRelease['release'] | CollectionItemWithRelease['release'][]
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeYear(value: string): number | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? Number(trimmed) : null
}

export function normalizeManualReleaseInput(
  input: ManualReleaseInput,
): NormalizedManualReleaseInput {
  return {
    artist: input.artist.trim(),
    title: input.title.trim(),
    release_year: normalizeYear(input.releaseYear),
    label: nullIfBlank(input.label),
    catalog_number: nullIfBlank(input.catalogNumber),
    country: nullIfBlank(input.country),
    format: nullIfBlank(input.format),
  }
}

function validateRequiredText(
  value: string,
  field: string,
  maxLength: number,
): string | null {
  if (value.length === 0) {
    return `${field} is required.`
  }

  if (value.length > maxLength) {
    return `${field} must be ${maxLength} characters or fewer.`
  }

  return null
}

function validateOptionalText(
  value: string | null,
  field: string,
  maxLength: number,
): string | null {
  if (value === null) {
    return null
  }

  if (value.length > maxLength) {
    return `${field} must be ${maxLength} characters or fewer.`
  }

  return null
}

export function validateManualReleaseInput(
  input: NormalizedManualReleaseInput,
): string[] {
  const errors = [
    validateRequiredText(input.artist, 'Artist', RELEASE_FIELD_LIMITS.artist),
    validateRequiredText(input.title, 'Title', RELEASE_FIELD_LIMITS.title),
    validateOptionalText(input.label, 'Label', RELEASE_FIELD_LIMITS.label),
    validateOptionalText(
      input.catalog_number,
      'Catalog number',
      RELEASE_FIELD_LIMITS.catalogNumber,
    ),
    validateOptionalText(input.country, 'Country', RELEASE_FIELD_LIMITS.country),
    validateOptionalText(input.format, 'Format', RELEASE_FIELD_LIMITS.format),
  ].filter((error): error is string => error !== null)

  if (
    input.release_year !== null
    && (
      !Number.isInteger(input.release_year)
      || input.release_year < RELEASE_YEAR_MIN
      || input.release_year > RELEASE_YEAR_MAX
    )
  ) {
    errors.push(
      `Release year must be a whole number from ${RELEASE_YEAR_MIN} to ${RELEASE_YEAR_MAX}.`,
    )
  }

  return errors
}

function assertValidManualRelease(input: NormalizedManualReleaseInput): void {
  const errors = validateManualReleaseInput(input)

  if (errors.length > 0) {
    throw new Error(errors[0])
  }
}

function normalizeCollectionRow(row: CollectionItemRow): CollectionItemWithRelease {
  const release = Array.isArray(row.release) ? row.release[0] : row.release

  if (!release) {
    throw new Error('Collection item is missing release metadata.')
  }

  return {
    id: row.id,
    added_at: row.added_at,
    created_at: row.created_at,
    release,
  }
}

export async function loadCollection(
  client: BrowserSupabaseClient,
): Promise<CollectionItemWithRelease[]> {
  const { data, error } = await client
    .from('collection_items')
    .select(
      `
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
          updated_at
        )
      `,
    )
    .order('added_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => normalizeCollectionRow(row as CollectionItemRow))
}

export async function addManualCollectionItem(
  client: BrowserSupabaseClient,
  input: ManualReleaseInput,
): Promise<CollectionItemWithRelease> {
  const normalized = normalizeManualReleaseInput(input)
  assertValidManualRelease(normalized)

  const { data: release, error: releaseError } = await client
    .from('releases')
    .insert(normalized)
    .select('id, artist, title, release_year, label, catalog_number, country, format, updated_at')
    .single()

  if (releaseError) {
    throw releaseError
  }

  const { data: item, error: itemError } = await client
    .from('collection_items')
    .insert({ release_id: release.id })
    .select(
      `
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
          updated_at
        )
      `,
    )
    .single()

  if (itemError) {
    throw itemError
  }

  return normalizeCollectionRow(item as CollectionItemRow)
}

export async function updateManualRelease(
  client: BrowserSupabaseClient,
  releaseId: string,
  input: ManualReleaseInput,
): Promise<CollectionItemWithRelease['release']> {
  const normalized = normalizeManualReleaseInput(input)
  assertValidManualRelease(normalized)

  const { data, error } = await client
    .from('releases')
    .update(normalized)
    .eq('id', releaseId)
    .select('id, artist, title, release_year, label, catalog_number, country, format, updated_at')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function deleteCollectionItem(
  client: BrowserSupabaseClient,
  collectionItemId: string,
): Promise<void> {
  const { error } = await client
    .from('collection_items')
    .delete()
    .eq('id', collectionItemId)

  if (error) {
    throw error
  }
}

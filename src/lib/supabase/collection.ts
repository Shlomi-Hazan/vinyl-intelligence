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
  genre: 40,
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
  genre: string
}

export type NormalizedManualReleaseInput = {
  artist: string
  title: string
  release_year: number | null
  label: string | null
  catalog_number: string | null
  country: string | null
  format: string | null
  genres: string[]
}

export type CollectionItemWithRelease = Pick<
  CollectionItem,
  'id' | 'added_at' | 'created_at' | 'rating' | 'is_favorite' | 'notes'
> & {
  /**
   * Custom-cover fields. Always populated by `loadCollection`; declared
   * optional so pre-artwork test fixtures stay valid.
   */
  custom_cover_path?: string | null
  custom_cover_updated_at?: string | null
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
    | 'genres'
    | 'updated_at'
  > & {
    /** MusicBrainz ids for display-time Cover Art Archive artwork (optional). */
    provider_release_id?: string | null
    provider_release_group_id?: string | null
  }
}

/** Milestone 7 personal preference signals; all live at the collection-item level. */
export type CollectionItemPersonalSignals = Pick<
  CollectionItem,
  'rating' | 'is_favorite' | 'notes'
>

/**
 * A partial patch of personal signals. The client update path sends only the
 * key that was mutated, so toggling favorite never persists an unsaved note
 * draft and saving a note never clobbers favorite/rating.
 */
export type CollectionItemPersonalSignalsPatch = {
  rating?: number | null
  is_favorite?: boolean
  notes?: string | null
}

export const NOTE_MAX_LENGTH = 1000

type CollectionItemRow = CollectionItemWithRelease | {
  id: string
  added_at: string
  created_at: string
  rating: number | null
  is_favorite: boolean
  notes: string | null
  custom_cover_path?: string | null
  custom_cover_updated_at?: string | null
  release: CollectionItemWithRelease['release'] | CollectionItemWithRelease['release'][]
}

type DeletedCollectionItemRow = {
  id: string
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeYear(value: string): number | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? Number(trimmed) : null
}

// Milestone 6: a single optional manual genre, stored lowercase/trimmed as a
// 0-or-1-element array so it matches the catalog-sourced `genres text[]` shape
// and the client genre filter.
function normalizeGenre(value: string): string[] {
  const genre = value.trim().toLocaleLowerCase()
  return genre.length > 0 ? [genre] : []
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
    genres: normalizeGenre(input.genre),
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
    validateOptionalText(
      input.genres[0] ?? null,
      'Genre',
      RELEASE_FIELD_LIMITS.genre,
    ),
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
    rating: typeof row.rating === 'number' ? row.rating : null,
    is_favorite: row.is_favorite === true,
    notes: typeof row.notes === 'string' ? row.notes : null,
    custom_cover_path:
      typeof row.custom_cover_path === 'string' ? row.custom_cover_path : null,
    custom_cover_updated_at:
      typeof row.custom_cover_updated_at === 'string'
        ? row.custom_cover_updated_at
        : null,
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
        rating,
        is_favorite,
        notes,
        custom_cover_path,
        custom_cover_updated_at,
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
          provider_release_id,
          provider_release_group_id,
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
    .select('id, artist, title, release_year, label, catalog_number, country, format, genres, updated_at')
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
        rating,
        is_favorite,
        notes,
        custom_cover_path,
        custom_cover_updated_at,
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
          provider_release_id,
          provider_release_group_id,
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
    .select('id, artist, title, release_year, label, catalog_number, country, format, genres, updated_at')
    .single()

  if (error) {
    throw error
  }

  return data
}

const PERSONAL_SIGNAL_KEYS = ['rating', 'is_favorite', 'notes'] as const

type PersonalSignalKey = (typeof PERSONAL_SIGNAL_KEYS)[number]

function normalizeRatingPatch(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }

  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error('Rating must be a whole number from 1 to 5.')
  }

  return value
}

function normalizeNotesPatch(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const trimmed = value.trim()

  if (trimmed.length === 0) {
    return null
  }

  if (trimmed.length > NOTE_MAX_LENGTH) {
    throw new Error(`Note must be ${NOTE_MAX_LENGTH} characters or fewer.`)
  }

  return trimmed
}

/**
 * Ownership-safe partial update of a collection item's personal signals. Only
 * the keys present in `patch` are validated and written; `id`, `user_id`,
 * `release_id`, and the timestamps are never touched. RLS and the column-level
 * grant enforce that a user can only change their own row's signals. Returns
 * the saved values for a safe state merge.
 */
export async function updateCollectionItemPersonalSignals(
  client: BrowserSupabaseClient,
  collectionItemId: string,
  patch: CollectionItemPersonalSignalsPatch,
): Promise<CollectionItemPersonalSignals & { id: string }> {
  const unknownKey = Object.keys(patch).find(
    (key): key is string => !PERSONAL_SIGNAL_KEYS.includes(key as PersonalSignalKey),
  )

  if (unknownKey) {
    throw new Error(`Unsupported personal-signal field: ${unknownKey}.`)
  }

  const payload: CollectionItemPersonalSignalsPatch = {}

  // A key is "present" only when its value is not undefined, so a stray
  // `{ rating: undefined }` can never clobber the stored rating.
  if (patch.rating !== undefined) {
    payload.rating = normalizeRatingPatch(patch.rating)
  }

  if (patch.is_favorite !== undefined) {
    if (typeof patch.is_favorite !== 'boolean') {
      throw new Error('Favorite must be true or false.')
    }

    payload.is_favorite = patch.is_favorite
  }

  if (patch.notes !== undefined) {
    payload.notes = normalizeNotesPatch(patch.notes)
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('No personal-signal changes were provided.')
  }

  const { data, error } = await client
    .from('collection_items')
    .update(payload)
    .eq('id', collectionItemId)
    .select('id, rating, is_favorite, notes')
    .single()

  if (error) {
    throw error
  }

  return {
    id: data.id,
    rating: typeof data.rating === 'number' ? data.rating : null,
    is_favorite: data.is_favorite === true,
    notes: typeof data.notes === 'string' ? data.notes : null,
  }
}

export async function deleteCollectionItem(
  client: BrowserSupabaseClient,
  collectionItemId: string,
): Promise<void> {
  const { data, error } = await client
    .from('collection_items')
    .delete()
    .eq('id', collectionItemId)
    .select('id')
    .single()

  if (error) {
    throw error
  }

  const deletedItem = data as DeletedCollectionItemRow | null

  if (deletedItem?.id !== collectionItemId) {
    throw new Error('Collection item was not deleted.')
  }
}

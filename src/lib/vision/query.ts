import type { CoverRecognition } from './types.ts'

// Mirrors the Milestone 4 catalog search query bounds
// (SEARCH_QUERY_MIN_LENGTH / SEARCH_QUERY_MAX_LENGTH).
const MIN_QUERY_LENGTH = 2
const MAX_QUERY_LENGTH = 120
const MAX_VISIBLE_TEXT_LINES = 3

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Deterministically turns validated recognition clues into a MusicBrainz search
 * query. No model call is involved. Returns null when there is nothing usable to
 * search for; the UI then shows the manual search fallback.
 */
export function buildCatalogQueryFromRecognition(
  recognition: CoverRecognition,
): string | null {
  const artist = recognition.artist ? collapse(recognition.artist) : ''
  const title = recognition.albumTitle ? collapse(recognition.albumTitle) : ''

  const visibleText = recognition.visibleText
    .map(collapse)
    .filter((line) => line.length > 0)
    .slice(0, MAX_VISIBLE_TEXT_LINES)
    .join(' ')

  let source = visibleText

  if (artist && title) {
    source = `${artist} ${title}`
  } else if (title) {
    source = title
  } else if (artist) {
    source = artist
  }

  const query = collapse(source).slice(0, MAX_QUERY_LENGTH).trim()

  return query.length >= MIN_QUERY_LENGTH ? query : null
}

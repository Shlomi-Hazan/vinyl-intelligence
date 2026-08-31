/**
 * Milestone 9 AI curator - shared types and constants.
 *
 * Single-turn workflow: a free-text listening request -> LLM intent extraction
 * -> deterministic hard filter + rank over the user's OWNED collection -> a
 * backend-built allowed candidate set (<= 12) -> LLM selection/explanation ->
 * strict allowed-ID validation -> verified recommendation cards.
 *
 * Core invariant: the LLM may select only from backend-generated allowed owned
 * `collection_item` IDs. Displayed card facts come from the backend, never from
 * model output.
 */

export const OPENROUTER_PROVIDER = 'openrouter' as const

export const CURATOR_INTENT_FEATURE = 'curator_intent' as const
export const CURATOR_SELECTION_FEATURE = 'curator_selection' as const

/** Defaults; overridable per stage via env (see docs/decisions/0004). */
export const DEFAULT_CURATOR_INTENT_MODEL = 'google/gemini-3.1-flash-lite'
export const DEFAULT_CURATOR_SELECTION_MODEL = 'google/gemini-3.5-flash'

export const MAX_REQUEST_LENGTH = 800
export const MAX_CANDIDATES = 12
export const RATE_LIMIT_MAX = 10
export const RATE_LIMIT_WINDOW_MINUTES = 10
export const DEFAULT_RECENT_DAYS = 30
export const RECENT_DAYS_MIN = 1
export const RECENT_DAYS_MAX = 365
export const DECADE_MIN = 1900
/** The decade containing the current year, computed once at module load. */
export const DECADE_MAX = Math.floor(new Date().getUTCFullYear() / 10) * 10
export const GENRE_MAX_LENGTH = 40
export const GENRE_MAX_ITEMS = 6
export const DECADE_MAX_ITEMS = 6
export const MOOD_MAX_LENGTH = 120
export const REASON_MAX_LENGTH = 300

export const CURATOR_PREFERENCES = [
  'none',
  'favorites',
  'highly_rated',
  'rediscovery',
  'surprise',
] as const
export type CuratorPreference = (typeof CURATOR_PREFERENCES)[number]

export const CURATOR_ENERGIES = ['low', 'medium', 'high', 'any'] as const
export type CuratorEnergy = (typeof CURATOR_ENERGIES)[number]

export const EVIDENCE_KEYS = [
  'genre',
  'year',
  'decade',
  'rating',
  'favorite',
  'play_count',
  'last_listened',
  'never_played',
] as const
export type EvidenceKey = (typeof EVIDENCE_KEYS)[number]

export type CuratorErrorCode =
  | 'unauthorized'
  | 'invalid_request'
  | 'request_too_long'
  | 'rate_limited'
  | 'rate_check_failed'
  | 'collection_unavailable'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'provider_bad_response'
  | 'config_error'
  | 'unknown'

export class CuratorError extends Error {
  readonly code: CuratorErrorCode

  constructor(code: CuratorErrorCode, message: string) {
    super(message)
    this.name = 'CuratorError'
    this.code = code
  }
}

/** The validated, normalized intent (also echoed to the UI as `interpretedIntent`). */
export type CuratorIntent = {
  includeGenres: string[]
  excludeGenres: string[]
  decades: number[]
  minRating: number | null
  favoritesOnly: boolean
  neverPlayedOnly: boolean
  avoidRecentlyPlayed: boolean
  recentDays: number | null
  preference: CuratorPreference
  energy: CuratorEnergy
  mood: string | null
  requestedCount: number
}

/** One owned record as loaded for the curator (server-side; note: no `notes`). */
export type CuratorCollectionItem = {
  id: string
  added_at: string
  rating: number | null
  is_favorite: boolean
  artist: string
  title: string
  release_year: number | null
  genres: string[]
}

/** A raw listening event as loaded for the curator. */
export type CuratorListeningEvent = {
  collection_item_id: string
  listened_at: string
}

/** A collection item plus the facts derived from listening events. */
export type CuratorCandidate = CuratorCollectionItem & {
  decade: number | null
  playCount: number
  lastListenedAt: string | null
  neverPlayed: boolean
}

/**
 * The fact object sent to the selection model for one allowed candidate.
 * Deliberately excludes `added_at`, `notes`, user id, provider ids, and exact
 * timestamps (`lastListenedDaysAgo` is an integer day count).
 */
export type CuratorCandidateFact = {
  id: string
  artist: string
  title: string
  year: number | null
  decade: number | null
  genres: string[]
  rating: number | null
  favorite: boolean
  playCount: number
  lastListenedDaysAgo: number | null
  neverPlayed: boolean
}

/** A verified recommendation card returned to the browser. */
export type CuratorRecommendation = {
  collectionItemId: string
  artist: string
  title: string
  year: number | null
  decade: number | null
  genres: string[]
  rating: number | null
  favorite: boolean
  playCount: number
  lastListenedAt: string | null
  neverPlayed: boolean
  reason: string
  evidenceKeys: EvidenceKey[]
  isBestMatch: boolean
}

export type CuratorResult =
  | {
      status: 'ok'
      interpretedIntent: CuratorIntent
      candidateCount: number
      recommendations: CuratorRecommendation[]
    }
  | { status: 'empty_collection' }
  | { status: 'no_match'; interpretedIntent: CuratorIntent }

export type CuratorUsage = {
  promptTokens: number | null
  completionTokens: number | null
  estimatedCostUsd: number | null
}

// ---------------------------------------------------------------------------
// Milestone 10 - conversational refinement
// ---------------------------------------------------------------------------

/** How long a refinement follow-up may be (same bound as an initial request). */
export const MAX_PREVIOUS_RECOMMENDATION_IDS = 3
export const MAX_RECOMMENDATION_ID_LENGTH = 64
export const MAX_REFINEMENTS = 3

/** Untrusted client-supplied context accompanying a refinement request. */
export type CuratorRefinementContext = {
  previousRequest: string
  previousIntent: CuratorIntent
  previousRecommendationIds: string[]
}

/**
 * The refine-specific result. Same three statuses as `CuratorResult`; the `ok`
 * variant additionally carries the count of currently-owned prior recommendation
 * IDs that were actually excluded this turn. `POST /api/curator/recommend`
 * never emits this shape (Decision A).
 */
export type CuratorRefineResult =
  | {
      status: 'ok'
      interpretedIntent: CuratorIntent
      candidateCount: number
      recommendations: CuratorRecommendation[]
      excludedPreviousRecommendations: number
    }
  | { status: 'empty_collection' }
  | { status: 'no_match'; interpretedIntent: CuratorIntent }

/** One entry in the bounded, React-memory-only conversation transcript. */
export type CuratorTurn =
  | { role: 'you'; text: string }
  | { role: 'curator'; kind: 'ok'; titles: string[] }
  | { role: 'curator'; kind: 'no_match'; constraints: string[] }

/** Bounded conversation state; lives only in `CuratorPanel` React state. */
export type CuratorConversation = {
  turns: CuratorTurn[]
  latestIntent: CuratorIntent
  latestRequestText: string
  latestRecommendationIds: string[]
  refinementCount: number
}

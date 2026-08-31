# AI Design

Last updated: 2026-08-17.

AI should add cognition where deterministic software cannot naturally understand the user's intent or a record cover. It must not replace normal application logic.

## Approved AI Uses

- Natural-language mood and listening-intent interpretation
- Conversational refinement of a bounded recommendation request
- Album-cover vision recognition for extracting search clues
- Recommendation explanation grounded in supplied facts
- Optional semantic help when catalog metadata is ambiguous

## Deterministic Responsibilities

Use normal backend/database logic for:

- Authentication and authorization
- CRUD
- Filtering and sorting
- Exact artist/title/year/genre/decade search
- Listening counts and last-listened calculations
- Database writes
- Input validation
- Duplicate checks
- Candidate-set construction

## Curator Workflow

1. User submits a free-text request.
2. Backend calls an LLM for structured intent extraction.
3. Backend validates the structured intent against a schema.
4. Backend selects candidates from the user's owned `collection_items`.
5. Backend applies deterministic filters and initial ranking.
6. Backend sends a small allowed candidate set to the LLM.
7. LLM selects and explains only from allowed candidate IDs.
8. Backend validates selected IDs and rejects any out-of-set value.
9. UI displays a small recommendation set, normally three records with one best match.

## Recommendation Contract

As implemented for Milestone 9 (`docs/specs/0010-milestone-9-ai-curator.md`),
single-turn:

- **Call 1 - intent extraction.** Input: the untrusted free-text request only.
  Output (strict json_schema `curator_intent`): hard constraints
  (`includeGenres`, `excludeGenres`, `decades`, `minRating`, `favoritesOnly`,
  `neverPlayedOnly`, `avoidRecentlyPlayed` + `recentDays`) and soft preferences
  (`preference`, `energy`, `mood`, `requestedCount`). Server strict-validates and
  normalizes; the normalized object is returned to the UI as `interpretedIntent`.
- **Deterministic middle.** Derive play count / last-listened from
  `listening_events`; apply hard constraints (never silently relaxed); rank by a
  small explainable heuristic; cap at 12 allowed candidates.
- **Call 2 - selection + explanation.** Input: the untrusted request plus, for
  each of the <= 12 allowed candidates, an opaque `id` and a small fact object
  (artist, title, year, decade, genres, rating, favorite, playCount,
  lastListenedDaysAgo, neverPlayed). Output (strict json_schema
  `curator_selection`): `recommendations[]` of `{ collectionItemId, reason,
  evidenceKeys }` and `bestMatchId`.

The backend rejects, and never displays: an id outside the allowed candidate
set (rejects the whole response), malformed JSON, a missing/mistyped required
field, more recommendations than `requestedCount`, a duplicate id, a
`bestMatchId` not among the returned recommendations, or an empty `reason`.
Extra unknown fields are ignored, not rejected. Displayed card facts come from
the backend candidate data, never from model output.

**Personal notes (Milestone 7) are never sent to any curator model.** Rating,
favorite, and listening history already provide the personal signal, and
user-authored free text would enlarge the prompt-injection and privacy surface.

## Architecture Boundaries

Do not use RAG or vector databases for the core product.

Do not introduce a multi-agent architecture unless a later milestone explicitly justifies why separate agents are needed.

## Image Recognition Workflow

```text
image upload
-> file validation
-> vision model extracts search clues
-> backend queries catalog API
-> backend normalizes candidate releases
-> user confirms candidate
-> backend persists release and collection item
```

The vision model output is never authoritative metadata. It is only a clue generator for catalog search.

Any model-reported vision confidence is advisory/debug information only. Never treat it as an authoritative probability and never use it as the sole reason to persist a collection record.

## Conversation State

Use bounded state only.

For MVP, do not permanently store full AI curator chat transcripts. A single request may be enough. If persistence becomes necessary, store or carry only bounded structured state with:

- current interpreted intent
- active constraints
- previous rejected recommendation IDs
- expiration timestamp

Do not use uncontrolled long-term memory.

## Cost and Latency Guardrails

- Prefer one structured-output call for intent extraction.
- Prefer deterministic retrieval before any recommendation explanation call.
- Limit candidate set size before sending to the model.
- Set timeouts and hard retry limits.
- Log provider, model, feature, latency, token usage, estimated cost, and non-sensitive error category where practical.
- Keep `model_calls` lightweight. It is audit/telemetry for project reasoning, not a large observability subsystem.
- Show user-visible failure when model/API calls fail.

## Model Strategy

- Cover-image clue extraction (Milestone 5): `google/gemini-3.1-flash-lite` via
  OpenRouter, with `google/gemini-3.5-flash` as a documented manual alternative
  (`docs/decisions/0003-openrouter-vision-provider.md`).
- Curator intent extraction and selection/explanation (Milestone 9): both calls
  default to `google/gemini-3.1-flash-lite` via OpenRouter (`temperature: 0`,
  strict `response_format` json_schema), with `google/gemini-3.5-flash`
  available as a manual override for call 2
  (`docs/decisions/0004-openrouter-curator-text-models.md`). Exactly two provider
  calls per successful curator request; one for a no-match; zero for an empty
  collection. Estimated ~$0.001 per successful request.

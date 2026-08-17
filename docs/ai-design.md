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

The model may receive:

- User request and bounded conversation context
- Allowed candidate IDs
- Artist, title, year, decade, genre/style, rating/favorite, listening count, last-listened facts for candidates
- Explicit instructions not to invent facts

The model must return structured data containing:

- `recommendations`: array of candidate collection item IDs
- `best_match_id`: one ID from the same array
- `reasons`: concise grounded explanation per ID
- `interpreted_intent`: the validated interpretation used
- `missing_or_uncertain_constraints`: optional list

The backend must reject:

- IDs outside the allowed candidate set
- malformed JSON
- unsupported fields
- claims about ownership/history/metadata not present in supplied facts

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

## Initial Model Strategy

Use a cheaper structured-output-capable text model for intent extraction if quality is sufficient.

Use a stronger text or multimodal model for final explanation and cover-image clue extraction when needed.

Do not pick exact models until provider documentation, pricing, latency, and course constraints are verified.

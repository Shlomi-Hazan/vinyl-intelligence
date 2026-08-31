# 010 Milestone 9 AI Curator Implementation Plan

Status: PLANNED - awaiting human approval. No implementation, migration, test,
provider call, or PR until this plan and `docs/specs/0010-milestone-9-ai-curator.md`
are explicitly approved.

Milestone: 9 - AI Curator (single-turn)

Date: 2026-08-31

Branch: `claude/milestone-9-ai-curator`

Baseline: `7657420e56b7ea7ff6a9e499b7dde7ab4c75abb5`

Spec: `docs/specs/0010-milestone-9-ai-curator.md` (authoritative for behaviour).

---

## 1. Current Repository Baseline (as inspected 2026-08-31)

What actually exists on `main` that Milestone 9 builds on:

- **AI provider integration (Milestone 5).**
  `netlify/functions/catalog-recognize.mts` -> `_shared/recognition-handlers.mts`
  -> `src/lib/vision/openrouter.ts`. Established patterns to reuse verbatim:
  - bearer auth via `authClient.auth.getUser(token)` with the publishable key,
    `auth: { autoRefreshToken: false, persistSession: false }`;
  - a **user-token RLS client** for own-row reads:
    `createClient(url, publishableKey, { global: { headers: { Authorization:
    'Bearer ' + token } } })` (`countRecentRecognitionAttemptsWithUserToken`);
  - `service_role` client used **only** for `model_calls` INSERT
    (`recordModelCallWithServiceRole`);
  - `safeRecordModelCall` - telemetry never fails the user request; logs a
    category string only;
  - `enforceRecognitionRateLimit` - counts own recent `model_calls` rows through
    the user token, **fails closed** if the count query throws;
  - injectable `RecognitionFunctionDependencies` for tests (fake provider, fake
    supabase); zero real network in `netlify/functions/recognition-functions.test.ts`;
  - `recognizeCoverWithOpenRouter`: single `POST
    https://openrouter.ai/api/v1/chat/completions`, `temperature: 0`,
    `max_tokens` cap, `response_format: { type: 'json_schema', json_schema: {
    name, strict: true, schema } }`, `AbortController` timeout (~15s), maps
    429/503 -> rate-limited, non-OK -> unavailable, `AbortError` -> timeout;
    strict manual output validation (`assertRecognitionContract` +
    `normalizeRecognition`), unknown fields ignored, missing/mistyped required
    fields rejected; usage read from `payload.usage`, cost via `MODEL_PRICING`
    table or provider-reported `usage.cost`.
  - `RecognitionError(code, message)` + `RecognitionErrorCode` union +
    HTTP-status map + a flat `{ code, message }` JSON error body.
- **`model_calls` table (Milestone 5).**
  `20260829140000_add_model_calls.sql`: columns `id, user_id, feature, provider,
  model, success, latency_ms, prompt_tokens, completion_tokens,
  estimated_cost_usd, error_category, created_at`. Constraint
  `model_calls_feature_allowed check (feature in ('cover_vision'))`. RLS on;
  `revoke all` from anon+authenticated; `grant select` to authenticated; `grant
  insert` to service_role; one policy - authenticated own-row SELECT. Index
  `model_calls_user_created_idx (user_id, created_at desc)`.
  pgTAP `model_calls_rls.test.sql` currently **asserts `curator_intent` is
  rejected `23514`** (line ~239) - this assertion flips in Milestone 9.
- **`collection_items` (Milestones 3, 7).** `id, user_id, release_id, added_at,
  created_at, rating smallint (NULL|1..5), is_favorite boolean not null default
  false, notes text (trimmed <=1000 | NULL)`. RLS: own-row select/insert/delete
  + own-row signal UPDATE (4 policies). Index `collection_items_user_added_idx
  (user_id, added_at desc, id desc)`, `collection_items_user_release_idx`,
  `collection_items_release_idx`.
- **`releases` (Milestones 3, 4, 6).** `id, created_by, source (manual|catalog),
  provider, provider_release_id, provider_release_group_id, artist, title,
  release_year, label, catalog_number, country, format, genres text[] not null
  default '{}', created_at, updated_at`. `genres` validated by
  `release_genres_valid(text[])` + CHECK. Catalog releases readable by any
  authenticated user (`source = 'catalog'` policy); manual releases via the
  collection join.
- **`listening_events` (Milestone 8).** `id, user_id (default auth.uid()),
  collection_item_id, listened_at (default now()), created_at`. Both FKs `ON
  DELETE CASCADE`. RLS: authenticated own-row SELECT + own-item INSERT
  (`collection_item_id` grant only), no UPDATE/DELETE. Index
  `listening_events_user_listened_idx (user_id, listened_at desc, id desc)`,
  `listening_events_collection_item_idx (collection_item_id)`.
  `src/lib/supabase/listeningEvents.ts`: `loadListeningEvents`,
  `addListeningEvent`, `compareListeningEventsNewestFirst`.
  `src/collection/listeningSummary.ts`: pure
  `summarizeListeningForItem(events, id) -> { count, lastListenedAt }`,
  `formatListenedAt`.
- **Collection helpers.** `src/lib/supabase/collection.ts` -
  `CollectionItemWithRelease` = `Pick<CollectionItem, 'id'|'added_at'|
  'created_at'|'rating'|'is_favorite'|'notes'> & { release: Pick<Release, …> }`.
  `loadCollection` selects `notes` - **Milestone 9's function must not reuse it**;
  it does its own server-side select without `notes`.
- **`src/lib/supabase/client.ts`.** `Database.Tables` = `collection_items`,
  `listening_events`, `profiles`, `releases`. **No `model_calls`** - and none
  needed: the functions use the untyped `createClient` factory, not the typed
  `BrowserSupabaseClient`.
- **Frontend shell.** `src/App.tsx` -> `AuthenticatedShell` renders
  `ProfilePanel`, then `CatalogPanel key={`catalog-${user.id}`}` and
  `CollectionPanel key={`collection-${user.id}`}` inside
  `<div className="authenticated-layout">`. `useAuth()` provides `client`,
  `user`. Browser -> function calls: `client.auth.getSession()` for the access
  token, then `fetch('/api/…', { headers: { Authorization: 'Bearer …' } })`
  (`src/lib/vision/client.ts`, `src/lib/catalog/client.ts`).
- **Conventions.** `.mts` Netlify functions with a thin default handler + a
  `_shared/*-handlers.mts` module; `@vitest-environment node` for function
  tests; per-feature `sessionStorage` draft modules
  (`photoRecognitionDraft.ts`, `catalogSearchDraft.ts`,
  `manualCollectionDraft.ts`) keyed
  `vinyl-intelligence:<feature>:v1:<userId>`; strict manual validation of
  untrusted structured output (no schema-validation dependency); `role="alert"`
  recoverable errors; theme-aware CSS in `src/styles.css`.
- **Docs.** `docs/ai-design.md` already sketches the curator workflow (needs the
  field names aligned to this spec). `docs/security.md` "Open Privacy Decisions"
  still asks whether notes are recommendation context (this milestone resolves
  it: no). `docs/decisions/README.md` lists "AI text models for the curator
  milestone" as pending (ADR 0004 resolves it).

Nothing in the historical roadmap snapshot
(`docs/roadmaps/2026-08-18-complete-project-roadmap.md`) is assumed implemented;
the above is the real baseline.

## 2. OpenRouter Research (official docs / model pages, 2026-08-31, no completion calls)

Checked:

- **Structured outputs** (`https://openrouter.ai/docs/features/structured-outputs`):
  request with `response_format: { type: 'json_schema', json_schema: { … } }`;
  `strict: true` enables native strict mode where the provider supports it
  ("enforcement varies by provider … exact compliance is not guaranteed on every
  endpoint"). Supported across OpenAI, **Google Gemini**, Anthropic, Fireworks.
  Support is per-endpoint. Filter models with
  `?supported_parameters=structured_outputs`. -> **Backend structural validation
  must remain authoritative** (already the project's approach).
- **`google/gemini-3.1-flash-lite`** (`https://openrouter.ai/google/gemini-3.1-flash-lite`):
  slug `google/gemini-3.1-flash-lite`; input **$0.25 / 1M**, output **$1.50 /
  1M**, image input $0.25 / 1M, cache read $0.025 / 1M; context 1,048,576, up to
  65,536 completion tokens; **structured outputs via `response_format`: yes**;
  GA / "high stability" (~99.97% availability, dual providers with failover);
  standard params (`temperature`, `max_tokens`) supported. Same pricing as
  ADR 0003.
- **`google/gemini-3.5-flash`** (`https://openrouter.ai/google/gemini-3.5-flash`):
  input **$1.50 / 1M**, output **$9.00 / 1M**; context 1M; structured outputs
  via `response_format`: yes; strong uptime, multi-provider failover. Same
  pricing as ADR 0003.
- Newer Gemini Flash entries exist (`3.5-flash-lite` at $0.30 / $2.50,
  `3.6-flash`, `3.7-flash`, `~google/gemini-flash-latest`). None is cheaper than
  `3.1-flash-lite`, and `3.1-flash-lite` is GA with proven Milestone 5
  integration. AGENTS.md scope control + "prefer existing known-good families"
  -> stay on `3.1-flash-lite`.
- Usage/cost reporting: OpenRouter returns `usage` (prompt/completion tokens)
  and, on many routes, `usage.cost`; the Milestone 5 client already handles both
  (`estimateCostUsd` prefers reported cost, falls back to a per-model rate
  table). Reuse.
- Interactive latency: Flash-Lite is "optimized for low-latency" and Milestone 5
  human runtime confirmed acceptable latency for one call; two small text calls
  are comfortably within an interactive budget and the Netlify 60s sync limit.
  Each call keeps its own ~15s `AbortController` timeout.
- Material limitation for strict structured output: `strict` is a strong hint,
  not a universal guarantee -> the backend validators in §8/§15 of the spec are
  the real contract.

### Model recommendation

| Use | Model | Why |
| --- | --- | --- |
| Call #1 - intent extraction | `google/gemini-3.1-flash-lite` | cheapest GA model with `response_format` json_schema; deterministic at `temperature: 0`; narrow classification task; already integrated |
| Call #2 - selection + explanation | `google/gemini-3.1-flash-lite` (default) | task is "pick <=3 of <=12 supplied ids and write one short grounded sentence each" - well within Flash-Lite; keeps cost ~$0.001/request. Manual override `OPENROUTER_CURATOR_MODEL=google/gemini-3.5-flash` documented if human runtime shows weak explanations (identical request/response contract, ~$0.0045/request). |

Same model for both is the recommended simplicity/cost trade-off. One env seam
(`OPENROUTER_CURATOR_MODEL`, default `google/gemini-3.1-flash-lite`).

Estimated cost of one normal successful curator request: **~$0.001**
(one-tenth of one cent) with the default model; ~$0.0045 with the Flash-3.5
override on call #2. `no_match`: ~$0.0004. Empty collection: $0. Well under the
<= $5/run budget and the "cents per request" target.

This is captured as `docs/decisions/0004-openrouter-curator-text-models.md`
(status: proposed).

## 3. Database Change

**Exactly one** forward migration; no other schema change anywhere in
Milestone 9.

`supabase/migrations/<timestamp>_widen_model_calls_feature.sql`:

```sql
-- Milestone 9: the AI curator adds two model-call features.
alter table public.model_calls
  drop constraint model_calls_feature_allowed,
  add constraint model_calls_feature_allowed
    check (feature in ('cover_vision', 'curator_intent', 'curator_selection'));
```

- No new table (no curator/request/recommendation/conversation/transcript/vector
  table).
- No grant / RLS / policy / index change.
- No denormalized listening aggregate.

If implementation discovers any other DB change is genuinely required, **stop
and bring it back to the human** with justification rather than adding it
silently (spec §20 / AGENTS.md scope control).

## 4. Server Modules

### `src/lib/curator/types.ts`
- `CURATOR_INTENT_FEATURE = 'curator_intent'`, `CURATOR_SELECTION_FEATURE =
  'curator_selection'`, `OPENROUTER_PROVIDER = 'openrouter'`,
  `DEFAULT_CURATOR_MODEL = 'google/gemini-3.1-flash-lite'`.
- `CuratorErrorCode` union (spec §5) + `class CuratorError extends Error { code }`.
- `CuratorIntent` (normalized), `CuratorCandidateFact`, `CuratorRecommendation`
  (server card shape), `CuratorResult` discriminated union
  (`ok` | `empty_collection` | `no_match`).
- `MAX_REQUEST_LENGTH = 800`, `MAX_CANDIDATES = 12`,
  `RATE_LIMIT_MAX = 10`, `RATE_LIMIT_WINDOW_MINUTES = 10`,
  `DEFAULT_RECENT_DAYS = 30`.

### `src/lib/curator/intentSchema.ts`
- `CURATOR_INTENT_JSON_SCHEMA` (spec §8) as a `const`.
- `INTENT_SYSTEM_PROMPT` (untrusted-data framing, output-only-JSON,
  no-invention).
- `parseCuratorIntent(raw: unknown): CuratorIntent` - manual strict validation +
  normalization exactly per spec §8 (throws `CuratorError('provider_bad_response',
  …)` on a missing/mistyped required key; drops/normalizes soft values; applies
  the include/exclude conflict rule). Modeled on
  `openrouter.ts#assertRecognitionContract` + `normalizeRecognition`.

### `src/lib/curator/candidates.ts` (pure, no I/O)
- `deriveCandidateFacts(items, events): CandidateWithFacts[]` - `playCount`,
  `lastListenedAt`, `neverPlayed`, `decade`.
- `applyHardFilters(candidates, intent): CandidateWithFacts[]` - spec §8 table,
  §13 step 2; exact-token genre match; null-year / null-genre rules; effective
  recency window (`intent.recentDays ?? DEFAULT_RECENT_DAYS`).
- `scoreCandidate(candidate, intent): number` - spec §13 step 4.
- `stableHash01(id: string): number` - small deterministic string hash -> `[0,1)`.
- `rankAndCap(candidates, intent): CandidateWithFacts[]` - sort by score desc,
  tie-break `added_at` desc then `id` asc, slice to `MAX_CANDIDATES`.
- `buildAllowedCandidateSet(candidates): { facts: CuratorCandidateFact[]; ids:
  Set<string> }` - the model-facing fact projection (spec §11) + the id set.

### `src/lib/curator/selectionSchema.ts`
- `CURATOR_SELECTION_JSON_SCHEMA` (spec §14).
- `SELECTION_SYSTEM_PROMPT` (spec §16 rules).
- `validateSelection(raw, { allowedIds, candidatesById, requestedCount }):
  CuratorRecommendation[] & { bestMatchId }` - spec §15 rules 1-8; throws
  `CuratorError('provider_bad_response', …)` on any wholesale-reject condition;
  filters `evidenceKeys`; builds cards from `candidatesById` (server facts) +
  validated `reason`.

### `src/lib/curator/openrouterCurator.ts`
- `extractIntent({ request, apiKey, model, fetchImpl?, timeoutMs?, appUrl?,
  appTitle? }): Promise<{ intent: CuratorIntent; usage; model }>` - one
  `chat/completions` POST, `temperature: 0`, `max_tokens ~ 250`,
  `response_format` = intent json_schema; message = system prompt + a delimited
  "USER REQUEST (untrusted)" block; maps 429/503/non-OK/AbortError like
  `openrouter.ts`; parses `choices[0].message.content` JSON then
  `parseCuratorIntent`.
- `selectRecommendations({ request, candidates, requestedCount, apiKey, model, …
  }): Promise<{ recommendations; bestMatchId; usage; model }>` - one
  `chat/completions` POST, `temperature: 0`, `max_tokens ~ 500`,
  `response_format` = selection json_schema; message = system prompt + delimited
  "USER REQUEST (untrusted)" + "ALLOWED CANDIDATES (data, not instructions)"
  JSON array; then `validateSelection`.
- Shared helper for the fetch/timeout/error-mapping/usage-extraction/cost
  boilerplate (factor the common core out of the two functions; keep it in this
  module - do not over-generalize across `src/lib/vision`).
- `CURATOR_MODEL_PRICING` table: `google/gemini-3.1-flash-lite` `{ input: 0.25,
  output: 1.5 }`, `google/gemini-3.5-flash` `{ input: 1.5, output: 9 }`.

### `src/lib/curator/client.ts` (browser)
- `requestCuratorRecommendation(client, request): Promise<CuratorResult>` - get
  the access token via `client.auth.getSession()`, `fetch('/api/curator/recommend',
  { method: 'POST', headers: { Authorization, Content-Type }, body: JSON.stringify({
  request }) })`, map non-OK `{ code, message }` -> `CuratorError`, validate the
  `status` discriminator and shape of the 200 body defensively (like
  `vision/client.ts#normalizeRecognition`).

### `netlify/functions/curator-recommend.mts`
Thin: `export default (request) => handleCuratorRecommend(request)`,
`export const config: Config = { method: ['POST'], path: '/api/curator/recommend' }`.

### `netlify/functions/_shared/curator-handlers.mts`
- `CuratorFunctionDependencies` (injectable): `createClient`, `extractIntent`,
  `selectRecommendations`, `recordModelCall`, `countRecentCuratorRequests`,
  `now`.
- `handleCuratorRecommend(request, env = process.env, deps = defaultDeps())`
  orchestrating spec §7 (corrected order):
  1. `authenticateRequest` (reuse the Milestone 5 shape; shared or copied).
  2. `parseCuratorRequestBody` -> trimmed `request` string
     (`invalid_request` / `request_too_long`).
  3. `enforceCuratorRateLimit` - `countRecentCuratorRequests` via user token +
     `feature = 'curator_intent'`; fail closed -> `rate_check_failed`; `>= 10` ->
     `rate_limited`.
  4. `loadOwnedCollectionForCurator` - user-token RLS client; select
     `collection_items(id, rating, is_favorite, release:releases!inner(id,
     artist, title, release_year, genres))` and `listening_events(collection_item_id,
     listened_at)`; either error -> `collection_unavailable`. Zero
     `collection_items` -> `{ status: 'empty_collection' }` (return, 0 model
     calls).
  5. `extractIntent` (timed) -> on throw: `safeRecordModelCall({ feature:
     curator_intent, success: false, errorCategory })` then rethrow mapped
     error. On success: `safeRecordModelCall({ feature: curator_intent, success:
     true, model, usage })`.
  6. `deriveCandidateFacts` + `applyHardFilters` + (0 -> `{ status: 'no_match',
     interpretedIntent }` return) + `rankAndCap` + `buildAllowedCandidateSet`.
  7. `selectRecommendations` (timed) -> telemetry `curator_selection` (success
     or failed) with the same `safeRecordModelCall` pattern.
  8. `validateSelection` (already inside `selectRecommendations`, or called
     here) - any reject -> `provider_bad_response` + failed `curator_selection`
     row (ensure the telemetry row is written for a validation failure too:
     structure the call so validation runs inside the try that records the
     selection telemetry).
  9. Assemble `{ status: 'ok', interpretedIntent, candidateCount,
     recommendations }` (cards from server facts; `isBestMatch` set; best match
     first).
- `countRecentCuratorRequestsWithUserToken` - either generalize
  `countRecentRecognitionAttemptsWithUserToken` into
  `countRecentModelCallsWithUserToken(env, createClient, { token, userId,
  feature, windowStartIso })` and have both features call it, or add a parallel
  function. **Preference: generalize** (one code path, one test surface). This
  touches `recognition-handlers.mts` - a small, behaviour-preserving refactor;
  its existing tests must stay green.
- `recordCuratorModelCall` - same shape as
  `recordModelCallWithServiceRole` but parameterized by `feature` and `model`.
  Again, **preference: generalize** the Milestone 5 recorder to take `feature` +
  `provider` + `model`.
- Error mapping: `CuratorError` -> `{ code, message }` + HTTP status map;
  anything else -> `unknown` (500).
- Response helper sets `Cache-Control: no-store`.

### Refactor note
Generalizing the two Milestone 5 helpers (`countRecent…`, `recordModelCall…`)
is in scope and low-risk, but must be behaviour-preserving for cover
recognition. The Milestone 5 function tests are the regression guard and must
not change semantics. If the refactor proves noisier than expected, fall back to
parallel curator-specific helpers (duplication is acceptable under deadline
mode) - decide during implementation, note it in the PR.

## 5. Frontend Modules

- `src/curator/CuratorPanel.tsx` - the panel (spec §21). Local state:
  `request`, `status: 'idle'|'loading'|'error'|'done'`, `result`, `errorCode`.
  Calls `requestCuratorRecommendation`. Renders loading / error / empty /
  no-match / ok. Uses existing panel/`field-hint`/`error`/`notice` classes.
- `src/curator/CuratorRecommendationCard.tsx` - one card: `artist — title`,
  `year · decade`, genres, `reason`, factual line (rating stars, "★ Favorite",
  "Never played" / "Last listened N days ago" / "Played N×"), "Best match"
  badge when `isBestMatch`.
- `src/curator/curatorRequestDraft.ts` (+ `.test.ts`) - **if approved**
  (spec §27 Q3). Same shape as `catalogSearchDraft.ts`; key
  `vinyl-intelligence:curator-request:v1:<userId>`; `readDraft` / `writeDraft` /
  `clearDraft`; restore is UI-only, never auto-submits; cleared on a successful
  `ok` response (keep on error / no_match so the user can edit).
- `src/App.tsx` - add
  `<CuratorPanel key={`curator-${user.id}`} client={client} userId={user.id} />`
  in `AuthenticatedShell` after `CollectionPanel` (or before - human's call;
  default: after Catalog, before Collection, since "what should I play" is a
  primary action). Default: **after `CollectionPanel`** to avoid pushing the
  collection down; revisit in the visual-polish milestone.
- `src/styles.css` - `.curator-panel`, `.curator-recommendation`,
  `.curator-best-match`, small rules; theme-aware tokens consistent with
  existing panels.

## 6. Test Plan (implements spec §22)

New test files:

- `src/lib/curator/intentSchema.test.ts`
- `src/lib/curator/candidates.test.ts`
- `src/lib/curator/selectionSchema.test.ts`
- `src/lib/curator/openrouterCurator.test.ts` (fake `fetchImpl`; asserts request
  body shape - `temperature: 0`, `response_format` json_schema, delimited
  blocks, no secret/notes/id leakage into the payload - and error mapping +
  usage/cost extraction)
- `src/lib/curator/client.test.ts` (fake `fetch`; token retrieval, error
  mapping, defensive 200-body validation)
- `netlify/functions/curator-functions.test.ts` (`@vitest-environment node`;
  injected deps; the full auth/input/zero-cost/telemetry/failure matrix)
- `src/curator/CuratorPanel.test.tsx` (RTL)
- `src/curator/curatorRequestDraft.test.ts` (if approved)

Updated test files:

- `supabase/tests/database/model_calls_rls.test.sql` - the `curator_intent`
  assertion flips from `throws_ok … 23514` to `lives_ok`; add `lives_ok` for
  `curator_selection`; add a `throws_ok … 23514` for a still-invalid value
  (e.g. `'curator_explanation'`). Everything else in the file unchanged
  (grants, policy count, RLS behaviour).
- `netlify/functions/recognition-functions.test.ts` - only if the shared-helper
  refactor changes a function signature the tests import; behaviour assertions
  must not change.

No real OpenRouter or MusicBrainz call in any automated test.

## 7. Documentation Changes

Create:

- `docs/specs/0010-milestone-9-ai-curator.md` (done - this planning turn).
- `docs/plans/010-milestone-9-ai-curator.md` (this file).
- `docs/decisions/0004-openrouter-curator-text-models.md` - status **proposed**;
  records the §2 research, the model choice, pricing, the `OPENROUTER_CURATOR_MODEL`
  seam, the ~$0.001/request estimate, and alternatives considered. Needs human
  approval with this milestone.

Update (light, current-status / decision-resolution only):

- `README.md` - Project Status: Milestone 9 in planning on
  `claude/milestone-9-ai-curator`; add a one-line "Planned" entry. No feature is
  claimed implemented.
- `docs/specs/README.md` - add the `0010` entry (status: planned).
- `docs/decisions/README.md` - move "AI text models for the curator milestone"
  from pending to "addressed by proposed decision 0004"; add the 0004 link.
- `docs/ai-design.md` - align the "Curator Workflow" / "Recommendation Contract"
  field names to this spec (`interpretedIntent`, `bestMatchId`, `evidenceKeys`,
  `curator_intent` / `curator_selection`); state notes are excluded from curator
  context; state the two-call budget and the 12-candidate cap. Minimal edit to
  prevent contradiction with the spec.
- `docs/security.md` - resolve the "Are user notes included in recommendation
  context by default?" open question -> **No** (Milestone 9); keep the retention
  and conversation-state questions open.
- `docs/data-model.md` - `model_calls` "Important fields": note the feature
  allow-list as-implemented after Milestone 9 (`cover_vision`, `curator_intent`,
  `curator_selection`) and that `curator_explanation` from the earlier sketch is
  **not** used (renamed `curator_selection`).

Do **not** touch `docs/roadmaps/2026-08-18-complete-project-roadmap.md`
(historical). Do not create duplicate PRD/context artifacts.

## 8. Expected File Change Set (implementation, not this turn)

NEW (~18):

```
supabase/migrations/<ts>_widen_model_calls_feature.sql
netlify/functions/curator-recommend.mts
netlify/functions/_shared/curator-handlers.mts
netlify/functions/curator-functions.test.ts
src/lib/curator/types.ts
src/lib/curator/intentSchema.ts
src/lib/curator/intentSchema.test.ts
src/lib/curator/candidates.ts
src/lib/curator/candidates.test.ts
src/lib/curator/selectionSchema.ts
src/lib/curator/selectionSchema.test.ts
src/lib/curator/openrouterCurator.ts
src/lib/curator/openrouterCurator.test.ts
src/lib/curator/client.ts
src/lib/curator/client.test.ts
src/curator/CuratorPanel.tsx
src/curator/CuratorPanel.test.tsx
src/curator/CuratorRecommendationCard.tsx
docs/decisions/0004-openrouter-curator-text-models.md
(+ src/curator/curatorRequestDraft.ts (+ .test.ts) if approved)
```

MODIFIED (~9):

```
src/App.tsx
src/styles.css
netlify/functions/_shared/recognition-handlers.mts   (generalize the two shared helpers)
supabase/tests/database/model_calls_rls.test.sql
README.md
docs/specs/README.md
docs/decisions/README.md
docs/ai-design.md
docs/security.md
docs/data-model.md
(+ netlify/functions/recognition-functions.test.ts only if a helper signature changes)
```

## 9. Dependencies

**No new runtime or dev dependency.** Strict manual validation of untrusted
structured output (the established `openrouter.ts` approach) is reused. A
schema-validation library (zod/ajv) is explicitly **not** added: the validation
surface is small, must be authoritative regardless of the library, and matches
existing code. If implementation finds a concrete substantial benefit, it is
raised in the PR with justification - not added by reflex.

## 10. Privacy / Security Decisions Resolved Here

- **Notes are not curator model context** (spec §12). Resolves
  `docs/security.md` open question.
- **`service_role` is not used** to read `collection_items` / `listening_events`
  / `profiles`; curator reads go through the user token + RLS (spec §10).
- **No new `service_role` privilege**; `model_calls` stays INSERT-only for
  `service_role`, SELECT-own for `authenticated`.
- **Conversation state**: none persisted in Milestone 9 (single-turn, ephemeral).
  The broader "persist bounded conversation state?" question stays open for
  Milestone 10.
- **`model_calls` retention**: unchanged / still open; not touched here.

## 11. Sequenced Implementation Steps (after approval)

1. Migration + `model_calls_rls.test.sql` update; `supabase db reset` +
   `supabase test db` green.
2. `src/lib/curator/types.ts` + `intentSchema.ts` + tests.
3. `src/lib/curator/candidates.ts` + tests (pure; heaviest logic).
4. `src/lib/curator/selectionSchema.ts` + tests.
5. `src/lib/curator/openrouterCurator.ts` + tests (fake fetch).
6. Generalize the Milestone 5 shared helpers; keep recognition tests green.
7. `netlify/functions/_shared/curator-handlers.mts` + `curator-recommend.mts` +
   `curator-functions.test.ts` (full matrix).
8. `src/lib/curator/client.ts` + tests.
9. `src/curator/CuratorPanel.tsx` + `CuratorRecommendationCard.tsx`
   (+ `curatorRequestDraft.ts` if approved) + tests; wire into `src/App.tsx`;
   `src/styles.css`.
10. Doc updates (§7); ADR 0004.
11. Full local verification: `git diff --check`, `npm run typecheck`,
    `npm run lint`, `npm run test:run`, `npm run build`, `npx supabase db reset`,
    `npx supabase test db`, `npx supabase db lint`, `npm audit --omit=dev`.
12. One `/ultrareview` (spec §24). Fix BLOCKER + meaningful MEDIUM only. Stop at
    0/0.
13. Commit(s); push; open PR. **Stop before human runtime.**
14. Human runtime prep (fixture §23) and the 5 human tests - separate turns,
    on explicit instruction, one prompt at a time, with real OpenRouter calls.

## 12. Human Decisions Required

1. Call #2 model default (spec §27 Q1) - recommendation: same model
   (`google/gemini-3.1-flash-lite`) for both, `OPENROUTER_CURATOR_MODEL`
   override to Flash 3.5 available.
2. Approve `docs/decisions/0004-openrouter-curator-text-models.md` (proposed).
3. Curator request `sessionStorage` draft - include (recommended) or omit.
4. Panel placement in `AuthenticatedShell` - recommendation: after
   `CollectionPanel`.
5. Fixture + 5 human prompts (spec §23) - acceptable as written?

No other blocking ambiguity. Everything else in the spec is a concrete
recommendation ready to implement on approval.

---

> This plan is PLANNED. Do not begin Milestone 9 implementation until it and the
> specification are explicitly approved by the human.

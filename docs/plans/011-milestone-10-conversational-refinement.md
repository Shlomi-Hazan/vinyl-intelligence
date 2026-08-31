# 011 Milestone 10 Conversational Refinement Implementation Plan

Status: EXECUTED 2026-08-31. Implemented on
`74490282b504d445753308434380747c23d7a72c` (planning HEAD
`19dd75c7951d84231454d9dedd64d0723025da81`, approval
`bb93bb7b7559c5c1170392647b3c95b87c06e53f`). Automated verification passed;
focused self-review 0/0 (1 NOTE fixed in `cf3b0c1`); independent GitHub review
found 1 MEDIUM (`no_match` did not advance `latestIntent`) fixed in `74490282`;
final gate 0 BLOCKER / 0 MEDIUM; human runtime **PASS 4/4**. No migration, no
new dependency, no `/ultrareview`. **Merged to `main` in PR #11** (merge commit
`bfddeb5109e61eac65b184ff4ff5d58092b3984f`). See `docs/verification.md`
"Milestone 10 Evidence". (Approved 2026-09-01 with the
mandatory corrections in the spec's "Approved Corrections" block; deadline mode:
fix BLOCKER + meaningful MEDIUM, no LOW/NOTE loop.)

Applied corrections vs the draft plan:

- **Decision A:** `excludedPreviousRecommendations: number` lives on a
  **refine-specific** `CuratorRefineResult` type (its `ok` variant). The M9
  `CuratorResult` and `POST /api/curator/recommend` are byte-unchanged.
  `runSelectionPipeline` returns a plain result object; the refine handler adds
  the field, the recommend handler does not.
- **Decision B:** the refinement selection call (#2) `request` = the **current
  follow-up text only**. `previousRequest` reaches **only** refinement call #1.
  No combined string. A test asserts `previousRequest` is absent from the
  call-#2 body.
- **Decision C:** suggestion chips included (fill-only).
- **Decision D:** human Test 3 follow-up = "Actually, no jazz and make it 70s."
  (`decades -> [1970]`); acceptance is Rumours under 1970s + rock + not-recent +
  favourite.

Milestone: 10 - Conversational Refinement

Date: 2026-09-01

Branch: `claude/milestone-10-conversational-refinement`

Baseline: `1ad61c0c537dbed0f71f102071bda7dd5d66a444`

Spec: `docs/specs/0011-milestone-10-conversational-refinement.md` (authoritative
for behaviour).

---

## 1. Current Repository Baseline (as inspected 2026-09-01)

Milestone 9 is merged (PR #10, merge commit
`1ad61c0c537dbed0f71f102071bda7dd5d66a444`). What Milestone 10 builds on:

### Server

- **`netlify/functions/curator-recommend.mts`** - thin: `default (request) =>
  handleCuratorRecommend(request)`, `config = { method: ['POST'], path:
  '/api/curator/recommend' }`.
- **`netlify/functions/_shared/curator-handlers.mts`** - `handleCuratorRecommend`
  orchestrates: `authenticateRequest` (bearer -> `auth.getUser`) ->
  `parseCuratorRequestBody` (exactly `{request:string}`, trim, `<= 800`) ->
  `enforceRateLimit` (`countRecentIntentCalls` with `feature = curator_intent`,
  10 / 10 min, fail-closed) -> `loadOwnedCollection` (a **user-token** client:
  `createClient(url, publishableKey, { global.headers.Authorization })`, selects
  `collection_items(id, added_at, rating, is_favorite,
  release:releases!inner(artist, title, release_year, genres))` **without
  `notes`** and `listening_events(collection_item_id, listened_at)`, both
  `.order(...).limit(1000)`; zero items -> `{status:'empty_collection'}`) ->
  `deps.extractIntent` (+ `safeRecordModelCall` `curator_intent`, success or
  failed) -> `deriveCandidateFacts` + `applyHardFilters` (0 -> `{status:
  'no_match', interpretedIntent}`) + `rankAndCap` + `buildAllowedCandidateSet`
  -> `deps.selectRecommendations` (+ `safeRecordModelCall` `curator_selection`)
  -> `{status:'ok', interpretedIntent, candidateCount, recommendations}`.
  Injectable `CuratorFunctionDependencies` = `{ createClient, extractIntent,
  selectRecommendations, recordModelCall, countRecentIntentCalls, now }`.
  `STATUS_BY_CODE` maps the 12 `CuratorErrorCode`s. `Cache-Control: no-store`.
- **`netlify/functions/_shared/model-calls.mts`** -
  `countRecentModelCallsWithUserToken(createClient, { supabaseUrl,
  publishableKey, token, userId, feature, windowStartIso })` and
  `recordModelCallWithServiceRole(createClient, { supabaseUrl, serviceRoleKey },
  record)`. Both take resolved credential strings; each caller keeps its own
  env-validation + error type.
- **`model_calls`** - CHECK `feature in ('cover_vision', 'curator_intent',
  'curator_selection')` (migration `20260902120000`). `authenticated` own-row
  SELECT; `service_role` INSERT only; `anon` none. Index `(user_id, created_at
  desc)`.

### Model modules (`src/lib/curator/`)

- **`types.ts`** - `CuratorIntent` (12 fields), `CuratorCollectionItem`,
  `CuratorListeningEvent`, `CuratorCandidate`, `CuratorCandidateFact`,
  `CuratorRecommendation`, `CuratorResult` (`ok` | `empty_collection` |
  `no_match`), `CuratorUsage`, `CuratorError` + `CuratorErrorCode`, and the
  constants (`MAX_REQUEST_LENGTH = 800`, `MAX_CANDIDATES = 12`, `RATE_LIMIT_MAX
  = 10`, `RATE_LIMIT_WINDOW_MINUTES = 10`, `DEFAULT_RECENT_DAYS = 30`,
  `CURATOR_INTENT_FEATURE`, `CURATOR_SELECTION_FEATURE`,
  `DEFAULT_CURATOR_INTENT_MODEL = 'google/gemini-3.1-flash-lite'`,
  `DEFAULT_CURATOR_SELECTION_MODEL = 'google/gemini-3.5-flash'`, the enums, the
  bounds).
- **`intentSchema.ts`** - `CURATOR_INTENT_JSON_SCHEMA` (strict, 12 required,
  `additionalProperties:false`), `INTENT_SYSTEM_PROMPT`, `parseCuratorIntent(raw)
  : CuratorIntent` - strict validation + benign normalization; throws
  `CuratorError('provider_bad_response', 'The curator returned an intent in an
  unexpected shape (…)')` on any schema violation; conflict rule (a genre in
  both include + exclude is removed from include).
- **`candidates.ts`** - `deriveCandidateFacts`, `applyHardFilters`,
  `scoreCandidate`, `stableHash01`, `rankAndCap` (score desc, `added_at` desc /
  `id` asc tie-break, cap 12), `buildAllowedCandidateSet` (-> `{ facts, ids:
  Set, byId: Map }`), `selectCandidates`. All pure.
- **`selectionSchema.ts`** - `CURATOR_SELECTION_JSON_SCHEMA`,
  `SELECTION_SYSTEM_PROMPT`, `validateSelection(raw, { allowedIds,
  candidatesById, requestedCount })` - wholesale-rejects out-of-set / duplicate
  / over-count / bad-best-match / empty-reason / non-array-`evidenceKeys`;
  builds cards from server facts; best match first.
- **`openrouterCurator.ts`** - `extractIntent(options)` (call #1:
  `chat/completions`, `temperature:0`, `max_tokens 250`, `response_format`
  `curator_intent`, `provider.require_parameters`, per-request `makeNonce()` +
  `userBlock(label, body, nonce)` + `untrustedFramingNote(nonce)`, no
  `reasoning`); `selectRecommendations(options)` (call #2: `max_tokens 1200`,
  `reasoning: { effort: 'minimal' }`, `INTERPRETED PREFERENCES` block,
  `validateSelection`). Shared `callOpenRouter` handles fetch / ~15s
  `AbortController` timeout / 429-503 -> `provider_rate_limited` / non-OK ->
  `provider_unavailable` / `AbortError` -> `provider_timeout` / bad JSON ->
  `provider_bad_response`, and usage/cost extraction (`MODEL_PRICING` table for
  `google/gemini-3.1-flash-lite` and `google/gemini-3.5-flash`).

### Client / UI

- **`src/lib/curator/client.ts`** - `requestCuratorRecommendation(client,
  request): Promise<CuratorResult>` - `client.auth.getSession()` -> `fetch('/api/
  curator/recommend', { headers: { Authorization }, body: JSON.stringify({
  request }) })` -> maps non-OK `{code,message}` -> `CuratorError`; defensive
  `normalizeResult` / `normalizeRecommendation`.
- **`src/curator/CuratorPanel.tsx`** - a single-turn panel: `request` textarea,
  Recommend button, `status: idle|loading|error|done`, `result`,
  `describeConstraints(intent)` for the no-match state,
  `CuratorRecommendationCard` list. Rendered in `App.tsx` after `ProfilePanel`,
  before `CatalogPanel`, `key={`curator-${user.id}`}`.
- **`src/curator/CuratorRecommendationCard.tsx`** - one card (artist/title,
  year·decade, genres, reason, factual line, "Best match" badge).
- **`src/styles.css`** - `.curator-panel`, `.curator-request`, `.curator-state`,
  `.curator-constraints`, `.curator-list`, `.curator-recommendation`,
  `.curator-best-match`, `.curator-reason`, `.curator-facts`.

### Tests

`src/lib/curator/{intentSchema,candidates,selectionSchema,openrouterCurator,
client}.test.ts`, `src/curator/CuratorPanel.test.tsx`,
`netlify/functions/curator-functions.test.ts` (injected deps, full matrix),
`supabase/tests/database/model_calls_rls.test.sql`. 351 Vitest tests, 374 pgTAP.

Nothing in the historical roadmap snapshot is assumed implemented; the above is
the real baseline.

## 2. Design Deltas vs Milestone 9

Milestone 10 adds a **second entry point** and **one new model call type**; it
does **not** re-implement the pipeline.

1. **New endpoint `POST /api/curator/refine`** (thin `.mts` + a
   `handleCuratorRefine` in the shared handlers module).
2. **Refactor `curator-handlers.mts`** to expose a reusable
   `runSelectionPipeline({ ctx, deps, env, intent, effectiveRequest, items,
   events, excludeSet })` that does: deterministic middle (+ optional
   `applyPreviousExclusion`) -> `no_match` short-circuit -> call #2 + telemetry
   -> `{status:'ok', …}`. `handleCuratorRecommend` calls it after its own
   `extractIntent`; `handleCuratorRefine` calls it after `extractRefinement`.
3. **New `src/lib/curator/refinementSchema.ts`** -
   `CURATOR_REFINEMENT_JSON_SCHEMA` (nests the M9 intent schema),
   `REFINEMENT_SYSTEM_PROMPT`, `parseCuratorRefinement(raw): { intent:
   CuratorIntent; excludePreviousRecommendations: boolean }`.
4. **Refactor `intentSchema.ts`** - extract the strict core into
   `normalizeCuratorIntent(raw, onInvalid: (detail: string) => never):
   CuratorIntent`; `parseCuratorIntent` becomes
   `normalizeCuratorIntent(raw, detail => { throw new
   CuratorError('provider_bad_response', …) })`. The refine handler's client-side
   `previousIntent` check uses `normalizeCuratorIntent(raw, detail => { throw
   new CuratorError('invalid_request', …) })`; `parseCuratorRefinement` uses the
   `provider_bad_response` variant for the model's nested `intent`.
5. **New `openrouterCurator.ts#extractRefinement(options)`** - mirrors
   `extractIntent`; `curator_refinement` schema; `REFINEMENT_MAX_TOKENS = 400`;
   no `reasoning`; three untrusted blocks (`PREVIOUS INTENT`, `PREVIOUS
   REQUEST`, `FOLLOW-UP`).
6. **New `candidates.ts#applyPreviousExclusion(candidates, excludeSet: Set<string>)`**
   - order-preserving `candidates.filter(c => !excludeSet.has(c.id))`.
7. **New client `refineCuratorRecommendation(client, request, context):
   Promise<CuratorResult>`** in `client.ts`.
8. **`CuratorPanel.tsx` gains `CuratorConversation` state**; renders
   `CuratorRefinePanel` after an `ok` result; "Start over".
9. **New `src/curator/CuratorRefinePanel.tsx`** (+ transcript, folded in or a
   small `CuratorTranscript.tsx`).
10. **`types.ts`** gains `CuratorRefinementContext`, `CuratorRefinement`,
    `CuratorRefineResult` (the refine-specific result; its `ok` variant adds the
    **required** `excludedPreviousRecommendations: number`),
    `CuratorConversation`, `CuratorTurn`, `REFINEMENT_MAX_TOKENS`. `CuratorResult`
    is unchanged.

## 3. Database Change

**None.** `curator_intent` and `curator_selection` are already allowed
`model_calls` features. No table, migration, grant, RLS policy, index, or
`service_role` privilege. If implementation discovers a genuine need for one,
**stop and bring it to the human** (spec §16 / AGENTS.md scope control).

## 4. Server Modules

### `src/lib/curator/refinementSchema.ts` (new)
- `CURATOR_REFINEMENT_JSON_SCHEMA` - `{ type: 'object', additionalProperties:
  false, required: ['intent', 'excludePreviousRecommendations'], properties: {
  intent: CURATOR_INTENT_JSON_SCHEMA.schema, excludePreviousRecommendations: {
  type: 'boolean' } } }` (import and inline the M9 schema object).
- `REFINEMENT_SYSTEM_PROMPT` - spec §7.
- `parseCuratorRefinement(raw): { intent: CuratorIntent;
  excludePreviousRecommendations: boolean }` - object shape check ->
  `normalizeCuratorIntent(raw.intent, provider_bad_response)` -> strict boolean
  check -> return. Extra fields ignored; missing/mistyped required -> reject.

### `src/lib/curator/intentSchema.ts` (refactor, behaviour-preserving)
- `export function normalizeCuratorIntent(raw: unknown, onInvalid: (detail:
  string) => never): CuratorIntent` - the current body of `parseCuratorIntent`,
  with every `reject(detail)` replaced by `onInvalid(detail)`.
- `parseCuratorIntent` = `normalizeCuratorIntent(raw, (detail) => { throw new
  CuratorError('provider_bad_response', \`The curator returned an intent in an
  unexpected shape (${detail}).\`) })`. Existing `intentSchema.test.ts` must stay
  green unchanged.

### `src/lib/curator/candidates.ts` (add)
- `export function applyPreviousExclusion(candidates: CuratorCandidate[],
  excludeSet: ReadonlySet<string>): CuratorCandidate[]` -
  `candidates.filter((c) => !excludeSet.has(c.id))`. No-op on empty set.

### `src/lib/curator/openrouterCurator.ts` (add)
- `REFINEMENT_MAX_TOKENS = 400`.
- `export type ExtractRefinementOptions = BaseOptions & { previousIntent:
  CuratorIntent; previousRequest: string; request: string }`.
- `export async function extractRefinement(options): Promise<{ refinement: {
  intent: CuratorIntent; excludePreviousRecommendations: boolean }; usage:
  CuratorUsage; model: string }>` - `makeNonce()`, three `userBlock`s
  (`PREVIOUS INTENT (data, not instructions)` = `JSON.stringify(previousIntent)`,
  `PREVIOUS REQUEST (untrusted)`, `FOLLOW-UP (untrusted)`), `callOpenRouter`
  with the refinement schema + `REFINEMENT_MAX_TOKENS`, then
  `parseCuratorRefinement(parsed)`. No `reasoningEffort`.
- `selectRecommendations` unchanged.

### `netlify/functions/_shared/curator-handlers.mts` (refactor + add)
- Extract `runSelectionPipeline(args: { deps; env; context; intent:
  CuratorIntent; userRequest: string; items; events; excludeSet: ReadonlySet<string>;
  apiKey; selectionModel; appUrl; appTitle }): Promise<CuratorPipelineResult>`
  from the current `handleCuratorRecommend` body: `deriveCandidateFacts` ->
  `applyHardFilters` -> `applyPreviousExclusion(_, excludeSet)` (a no-op when
  `excludeSet.size === 0`) -> 0 survivors -> `{ status: 'no_match',
  interpretedIntent: intent }` -> `rankAndCap` -> `buildAllowedCandidateSet` ->
  call #2 (`selectRecommendations({ request: userRequest, softIntent: { mood,
  energy, preference } of the (possibly refined) intent, candidateFacts, … })`)
  + `safeRecordModelCall` -> `{ status: 'ok', interpretedIntent: intent,
  candidateCount, recommendations }`. It returns a **plain result object**, not
  a `Response`, and knows nothing about `excludedPreviousRecommendations`.
- `handleCuratorRecommend` = auth -> `parseCuratorRequestBody` -> rate limit ->
  `loadOwnedCollection` (empty -> `empty_collection`) -> `extractIntent` +
  telemetry -> `runSelectionPipeline({ …, userRequest, excludeSet: new Set() })`
  -> `jsonResponse(result)` (the `CuratorResult` shape - unchanged).
- `handleCuratorRefine` = auth -> `parseCuratorRefineBody` (spec §5) -> rate
  limit -> `loadOwnedCollection` (empty -> `empty_collection`) ->
  `extractRefinement` + `curator_intent` telemetry (success or failed) ->
  `ownedIdSet = new Set(items.map(i => i.id))`;
  `excludeSet = refinement.excludePreviousRecommendations ? new
  Set(previousRecommendationIds.filter(id => ownedIdSet.has(id))) : new Set()`
  -> `runSelectionPipeline({ …, intent: refinement.intent, userRequest:
  request /* the CURRENT follow-up only - Decision B; previousRequest is NOT
  passed here */, excludeSet })` -> if `status === 'ok'`, attach
  `excludedPreviousRecommendations: excludeSet.size` (the count of
  currently-owned prior IDs actually excluded) -> `jsonResponse` (the
  `CuratorRefineResult` shape). `no_match` / `empty_collection` are returned
  as-is.
- `parseCuratorRefineBody(request): { request: string; previousRequest: string;
  previousIntent: CuratorIntent; previousRecommendationIds: string[] }` - spec
  §5 validation; `normalizeCuratorIntent(_, invalid_request)` for
  `previousIntent`.
- `CuratorFunctionDependencies` gains `extractRefinement: typeof
  extractRefinementImpl`. `defaultDependencies()` wires it.
- Reuse `enforceRateLimit`, `loadOwnedCollection`, `safeRecordModelCall`,
  `authenticateRequest`, `STATUS_BY_CODE`, `mapThrownError` unchanged.

### `netlify/functions/curator-refine.mts` (new)
Thin: `default (request) => handleCuratorRefine(request)`, `config = { method:
['POST'], path: '/api/curator/refine' }`.

## 5. Client / UI Modules

### `src/lib/curator/client.ts` (add)
- `export async function refineCuratorRecommendation(client, request: string,
  context: { previousRequest: string; previousIntent: CuratorIntent;
  previousRecommendationIds: string[] }): Promise<CuratorResult>` - token ->
  `fetch('/api/curator/refine', { body: JSON.stringify({ request, context }) })`
  -> the same non-OK mapping + `normalizeResult` as
  `requestCuratorRecommendation`. `normalizeResult` handles the optional
  `excludedPreviousRecommendations` on `ok`.

### `src/curator/CuratorPanel.tsx` (modify)
- Add `conversation: CuratorConversation | null` state (null = plain M9
  single-turn).
- On a successful initial `ok`: set `conversation = { turns: [{role:'you',
  text}, {role:'curator', kind:'ok', titles}], latestIntent, latestRequestText:
  text, latestRecommendationIds: recs.map(r => r.collectionItemId).slice(0,3),
  refinementCount: 0 }`.
- Render `<CuratorRefinePanel conversation={conversation} client={client}
  onRefined={…} onStartOver={() => setConversation(null) /* + reset result */}
  />` after an `ok` result.
- The initial single-turn path is otherwise unchanged (existing tests pass).

### `src/curator/CuratorRefinePanel.tsx` (new)
- Props: `{ client, conversation, currentResult, onRefined(result, turnText),
  onStartOver }`.
- Renders: the transcript (`conversation.turns`, max shown 8), a textarea
  (`maxLength 800`) + char count + Refine button + optional chips, and (at
  `refinementCount === 3`) the "Start over to begin a new conversation" line.
- Refine submit: `refineCuratorRecommendation(client, text, { previousRequest:
  conversation.latestRequestText, previousIntent: conversation.latestIntent,
  previousRecommendationIds: conversation.latestRecommendationIds })`.
  - `ok` / `no_match` -> `onRefined(result, text)` (parent appends turns,
    increments count, updates latest*).
  - error -> local retryable banner; **no** `onRefined`; count unchanged.
- Chips fill the textarea via `setText(chipText)`; never submit.

### `src/curator/CuratorTranscript.tsx` (new, small) - renders `CuratorTurn[]`.

### `src/App.tsx` - no change (CuratorPanel already wired).

### `src/styles.css` - `.curator-refine`, `.curator-transcript`,
`.curator-chip`, `.curator-turn-you`, `.curator-turn-curator` rules.

## 6. Test Plan (implements spec §21)

New test files:
- `src/lib/curator/refinementSchema.test.ts` - schema/prompt + `parseCuratorRefinement`
  (preserve / modify / clear / combine, `excludePreviousRecommendations`
  true/false, malformed -> `provider_bad_response`, nested intent uses the
  authoritative rules).
- `src/lib/curator/openrouterCurator.test.ts` - extend with `extractRefinement`
  (fake fetch: `max_tokens 400`, no `reasoning`, 3 delimited nonce blocks, no
  `previousRecommendationIds` / notes / secret in the body, error mapping).
- `src/lib/curator/candidates.test.ts` - extend with `applyPreviousExclusion`
  (order-preserving, empty-set no-op, only-intersection removed).
- `src/lib/curator/client.test.ts` - extend with `refineCuratorRecommendation`
  (body shape, error mapping, optional `excludedPreviousRecommendations`).
- `netlify/functions/curator-functions.test.ts` - extend (or a sibling
  `curator-refine-functions.test.ts`) with the full refine matrix: request
  validation, refinement-intent parse/failure, stale/tampered/deleted prior IDs
  never entering the allowed set, `excludePreviousRecommendations` intersection,
  no-match after exclusion, call counts, telemetry features, rate-limit reuse,
  privacy (no prior IDs / notes / reasons in the payload).
- `src/curator/CuratorRefinePanel.test.tsx` - Refine area appears only after
  `ok`; successful refine replaces cards + appends turns + increments;
  `no_match` keeps previous cards + consumes a turn; error keeps previous cards
  + no turn; chips fill not submit; Start over resets; disabled at count 3; no
  `sessionStorage`.

Updated test files:
- `src/lib/curator/intentSchema.test.ts` - unchanged assertions must still pass
  after the `normalizeCuratorIntent` extraction (behaviour-preserving).
- `src/curator/CuratorPanel.test.tsx` - the initial single-turn assertions
  unchanged; add "Refine area appears after an ok result" / "Start over".

No real OpenRouter or MusicBrainz call. **No new pgTAP** (no migration).

## 7. Documentation Changes

Create:
- `docs/specs/0011-milestone-10-conversational-refinement.md` (done - this turn).
- `docs/plans/011-milestone-10-conversational-refinement.md` (this file).

Update (current-status / decision-record only):
- `README.md` - M9 -> merged in PR #10; add M10-in-planning line; M9 moved to
  the Implemented list (done - this turn).
- `docs/specs/README.md` - M9 -> merged; add the `0011` entry (done - this turn).
- `docs/verification.md`, `docs/specs/0010-…`, `docs/plans/010-…` - M9 status
  -> merged in PR #10 (done - this turn).
- `docs/ai-design.md` - "Conversation State" / "Recommendation Contract": one
  paragraph on the refinement contract (complete revised intent +
  `excludePreviousRecommendations`; React-memory-only bounded state; reuse of
  `curator_intent` / `curator_selection` telemetry; 3-refinement UX cap). Only
  if it prevents contradiction with the spec.
- `docs/security.md` - "Resolved Privacy Decisions": note that refinement sends
  only the prior validated intent + the two request texts (no prior IDs, no
  reasons, no transcript, no notes) and that conversation state is never
  persisted. Only if it records a genuine current decision.
- `docs/data-model.md` - `model_calls`: note a refinement's intent call reuses
  `curator_intent`; no new feature or table.

Do **not** touch `docs/roadmaps/2026-08-18-complete-project-roadmap.md`.

## 8. Expected File Change Set (implementation, not this turn)

NEW (~10):
```
netlify/functions/curator-refine.mts
src/lib/curator/refinementSchema.ts
src/lib/curator/refinementSchema.test.ts
src/curator/CuratorRefinePanel.tsx
src/curator/CuratorRefinePanel.test.tsx
src/curator/CuratorTranscript.tsx
docs/specs/0011-milestone-10-conversational-refinement.md   (done)
docs/plans/011-milestone-10-conversational-refinement.md    (done)
(+ netlify/functions/curator-refine-functions.test.ts if kept separate)
```

MODIFIED (~11):
```
netlify/functions/_shared/curator-handlers.mts   (extract runSelectionPipeline; add handleCuratorRefine + parseCuratorRefineBody)
src/lib/curator/types.ts                          (refinement + conversation types; REFINEMENT_MAX_TOKENS; optional ok field)
src/lib/curator/intentSchema.ts                   (extract normalizeCuratorIntent; parseCuratorIntent = thin wrapper)
src/lib/curator/candidates.ts                     (applyPreviousExclusion)
src/lib/curator/openrouterCurator.ts              (extractRefinement)
src/lib/curator/client.ts                         (refineCuratorRecommendation)
src/curator/CuratorPanel.tsx                      (conversation state; render CuratorRefinePanel; Start over)
src/styles.css
src/lib/curator/{intentSchema,candidates,openrouterCurator,client}.test.ts   (extend)
src/curator/CuratorPanel.test.tsx                 (extend)
netlify/functions/curator-functions.test.ts       (extend)
README.md / docs/specs/README.md / docs/verification.md / docs/specs/0010 / docs/plans/010   (status; done this turn)
docs/ai-design.md / docs/security.md / docs/data-model.md   (light, if needed)
```

## 9. Dependencies

**No new runtime or dev dependency.** Strict manual validation is reused. No
schema library. Conversation state is plain React `useState`.

## 10. Privacy / Security Decisions Resolved Here

- **Refinement model context** = the prior **validated** intent (12-field object)
  + `previousRequest` + the follow-up text. **Not** sent: prior recommendation
  IDs, prior AI reason text, the transcript, Milestone 7 notes, user / auth /
  provider ids, secrets.
- **Conversation state is never persisted** - React memory only; no DB /
  `sessionStorage` / `localStorage`. Refresh / logout / "Start over" clears it.
- **Client context is never an authorization boundary** - prior IDs are
  intersected against a fresh RLS-owned read; `service_role` is not used to read
  collection / history / profile.
- **`model_calls` retention** - unchanged / still open; not touched.

## 11. Sequenced Implementation Steps (after approval)

1. This planning commit (spec + plan + the M9 status corrections + index docs).
2. `intentSchema.ts` refactor (`normalizeCuratorIntent`) + keep
   `intentSchema.test.ts` green.
3. `refinementSchema.ts` + `parseCuratorRefinement` + tests.
4. `candidates.ts#applyPreviousExclusion` + tests.
5. `openrouterCurator.ts#extractRefinement` + tests (fake fetch).
6. `curator-handlers.mts` - extract `runSelectionPipeline`; add
   `handleCuratorRefine` + `parseCuratorRefineBody`; wire deps. Keep the M9
   function tests green.
7. `curator-refine.mts` + the refine function-test matrix.
8. `client.ts#refineCuratorRecommendation` + tests.
9. `types.ts` conversation types; `CuratorRefinePanel` + `CuratorTranscript` +
   `CuratorPanel` wiring + `styles.css` + tests.
10. Light doc alignment (`ai-design` / `security` / `data-model`).
11. Full local verification: `git diff --check`, `npm run typecheck`,
    `npm run lint`, `npm run test:run`, `npm run build`, `npx supabase db reset`,
    `npx supabase test db`, `npx supabase db lint`, `npm audit --omit=dev`.
12. **One focused review** (spec §23). Fix BLOCKER + meaningful MEDIUM only.
    Stop at 0/0.
13. Small coherent commits; push; **STOP** for independent inspection.
14. (later, separate turns) Human runtime prep (fixture §22) + the 4 human
    tests, one at a time, with real OpenRouter calls; evidence gate; PR; human
    merge.

## 12. Human Decisions - RESOLVED 2026-09-01

1. `excludedPreviousRecommendations` on the refine `ok` response - **included**,
   on a refine-specific `CuratorRefineResult` type; `/recommend` unchanged.
2. Selection call `request` for a refinement - **current follow-up text only**;
   `previousRequest` never reaches call #2.
3. Suggestion chips - **included** (fill-only).
4. Fixture + 4 human tests - **approved**; Test 3 -> "Actually, no jazz and make
   it 70s."

---

> This plan is APPROVED. Implementation follows the sequence in §11; no PR until
> after the focused review, independent inspection, and human runtime.

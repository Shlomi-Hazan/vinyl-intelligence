# 0006 Milestone 5 Photo Recognition Specification

Status: implemented and verified; ready for milestone pull request

Milestone: 5 - Photo Recognition + Candidate Confirmation

Date: 2026-08-29

Approved: 2026-08-29 (spec, plan, and ADR 0003 approved; human-directed
implementation on this branch)

Implemented: 2026-08-29 through 2026-08-30

Human runtime verification: 2026-08-30 (PASS; real recognition E2E 2026-08-29,
session-persistence + controlled no-extra-OpenRouter-call refresh 2026-08-30)

Branch: `claude/milestone-5-photo-recognition`

Baseline: `0f5ee08632e485b951cab225ed617e27d5232d0f` (Milestone 4 merge on `main`)

Final pre-PR review: `/code-review ultra` verdict PASS WITH NOTES; the promoted
findings were closed in `bf35eac` (see `docs/plans/006-...` "Implementation
Outcome" and `docs/verification.md`).

## Intent

An authenticated user can take or choose a photo of a vinyl record cover, submit
it for AI recognition, receive structured clues inferred from the image, use
those clues to locate plausible MusicBrainz release candidates, review them,
explicitly confirm one, and add the confirmed release to their collection
through the trusted Milestone 4 catalog persistence path.

The AI never persists a guessed release. Human confirmation is mandatory before
any collection write.

This milestone is the project's first runtime AI/model call. It also adds the
smallest useful model-call telemetry (`model_calls`).

## User Outcome

1. Open the authenticated app shell.
2. In the catalog area, choose "Recognize from photo".
3. Select an image file, or capture one with the device camera on mobile.
4. The browser validates and downscales the image locally.
5. Submit. The app calls one authenticated server function that runs a single
   vision-model call and returns structured cover clues.
6. The app turns those clues into a MusicBrainz query and runs the existing
   Milestone 4 catalog search, showing normalized candidates.
7. The user reviews candidates and clicks "Add to collection" on exactly one.
8. The existing Milestone 4 `POST /api/catalog/add` revalidates that release
   server-side and persists it plus a `collection_item` for the user.
9. The collection list refreshes and a success notice is shown.

If recognition fails, is low confidence, or returns no usable clues, the user
gets a recoverable error and a manual fallback: the normal Milestone 4 search
box, pre-filled where any clue is available.

## In Scope

- Photo/file selection, and camera capture through a normal
  `<input type="file" accept="image/*" capture="environment">`.
- Client-side image validation (MIME allow-list, byte-size limit) and
  downscale/re-encode to a bounded payload.
- One authenticated recognition Netlify Function:
  `POST /api/catalog/recognize`.
- Exactly one vision-model call per submit (OpenRouter, server-side key).
- Strict server-side validation of the model's structured JSON output.
- Deterministic conversion of clues into a MusicBrainz search query.
- Candidate lookup through the existing Milestone 4 catalog search
  (`GET /api/catalog/search`) and the existing candidate UI.
- Explicit user confirmation, then persistence through the existing Milestone 4
  `POST /api/catalog/add`.
- Minimal `model_calls` telemetry: one row per recognition attempt.
- A minimal per-user rate limit on the costed recognition endpoint
  (10 recognitions / 10 minutes), enforced from `model_calls`.
- Recoverable error states for every failure listed below.
- Tests for the vision adapter, the recognition function, the rate limit, the
  clue->query builder, the image helper, the telemetry write, and the UI.
- Human runtime verification.

### Post-approval scope additions (human-directed)

Two items were added after this spec was approved, both surfaced by human
runtime testing and explicitly requested by the human. They stay inside the
approved architecture (no new dependency, no schema change, no `localStorage`,
no database auto-save):

- **Per-tab session persistence (`sessionStorage`), scoped per authenticated
  user, versioned keys.** Preserves, across a page refresh or same-tab
  navigation: the normalized recognition clues + editable derived query; the
  catalog search draft text + last successful candidate results (or a
  legitimate zero-result state); and the manual add-form field draft. Restore
  is UI-state only - it makes no OpenRouter, MusicBrainz, or database call, and
  never auto-submits. Selecting a new image clears the stored recognition; a
  successful manual Add clears the stored draft. Malformed stored JSON is
  ignored and removed.
- **Minimal per-user rate limit** (see "Rate limiting"). Added in the final
  pre-PR review pass as the `intent.txt` §15 minimum.

## Out of Scope

- Permanent photo storage, a photo gallery, Supabase Storage, or any image
  retention. Images exist only for the lifetime of one request.
- Image editing/cropping UI.
- Multiple vision agents, an OCR microservice, a custom CV model, or model
  training.
- Embeddings, RAG, vector database, or fuzzy AI database search.
- AI curator, conversational recommendation, ratings, favorites, notes,
  listening history, browse/filter redesign.
- `image_identification_attempts` persistence (deferred; see "Deferred").
- Multi-record / shelf recognition.
- Production deployment, hosted verification, and any visual redesign.
- Any automatic retry of the vision call (a failed recognition is recoverable
  by re-submitting).

## User Flow

```text
browser
  -> pick/capture image (file input)
  -> client validate MIME + size
  -> client downscale to <= ~1024px longest edge, re-encode JPEG
  -> POST /api/catalog/recognize  { imageBase64 }  + Supabase bearer token
       -> server: validate token -> derive user id
       -> server: per-user rate check (see "Rate limiting")
       -> server: validate decoded image (magic bytes, size)
       -> server: one OpenRouter vision call, response_format = JSON schema
       -> server: validate + normalize structured clues
       -> server: record one model_calls row before responding
       -> server: return { recognition }
  -> browser: build MusicBrainz query from clues
  -> browser: GET /api/catalog/search?q=<query>   (existing M4)
  -> browser: render existing candidate list
  -> user: confirm exactly one candidate
  -> browser: POST /api/catalog/add { provider, providerReleaseId }  (existing M4)
  -> browser: refresh collection, show success
```

Ambiguous or low-confidence recognition never auto-persists. The user always
performs the explicit "Add to collection" click, which is the same trusted
Milestone 4 path used by manual catalog search.

## Backend Behavior

### `POST /api/catalog/recognize`

- Netlify Function `netlify/functions/catalog-recognize.mts` delegating to
  `netlify/functions/_shared/recognition-handlers.mts`, mirroring the Milestone
  4 handler/adapter split and dependency-injection test seam.
- Requires a valid Supabase user session/JWT (reuses the Milestone 4
  `authenticateRequest` pattern: validate the bearer token, derive the user id
  server-side, never trust a body-supplied user id).
- Enforces a per-user rate limit before any OpenRouter call (see
  "Rate limiting").
- Accepts only `{ imageBase64: string }` where `imageBase64` is a
  `data:image/(jpeg|png|webp);base64,...` data URL.
- Rejects: missing/oversized body, wrong shape, disallowed MIME, decoded bytes
  over the limit, bytes whose magic number does not match a supported image.
- Reads `OPENROUTER_API_KEY` (server-only) and an optional
  `OPENROUTER_VISION_MODEL` (defaults to `google/gemini-3.1-flash-lite`).
- Makes exactly one `POST https://openrouter.ai/api/v1/chat/completions` call:
  one user message with a short instruction text part and one `image_url`
  content part carrying the data URL; `response_format` a JSON schema for the
  recognition contract; `max_tokens` capped (~300); an `AbortController`
  timeout (~15s).
- Validates the model response: must be JSON matching the contract; unknown
  fields dropped; strings trimmed and length-capped; `visibleText` capped in
  count and per-item length; `releaseYearHint` accepted only in
  `1900..(currentYear + 1)`, else null; `confidence` clamped to `0..1`.
- Records one `model_calls` row per provider attempt before responding (see
  "Database" and "Telemetry Decision"). A telemetry failure is caught, logged
  as a category only, and never changes the user-visible outcome. A request
  rejected earlier by auth, image validation, or the rate limit writes no row.
- Returns `{ recognition }` on success, or a sanitized error payload
  `{ code, message }` matching the error contract.
- Never returns the raw provider payload, the API key, or the image.

The recognition function does NOT call MusicBrainz. Candidate lookup stays in
the existing Milestone 4 search function so its validation, pacing, and
sanitized errors are reused unchanged.

### Rate limiting

`intent.txt` §15 requires "reasonable abuse/rate protection for costly AI/API
endpoints." Milestone 5 adds the smallest durable guard appropriate for a
course/demo app - not production-scale anti-abuse infrastructure.

- Scope: per authenticated user, enforced server-side, before the OpenRouter
  call.
- Source of truth: the existing `model_calls` telemetry. The check counts the
  caller's own `cover_vision` rows (each row is one provider attempt, success
  **or** failure) with `created_at` within the trailing window. No in-memory or
  per-instance counter is used, because serverless instances are not durable.
- Limits: `MAX_RECOGNITIONS_PER_WINDOW = 10`, `WINDOW_MINUTES = 10`. If the
  user already has `>= 10` `cover_vision` rows in the last 10 minutes, the
  request is rejected with HTTP `429` and the sanitized message
  "Too many recognition attempts. Try again in a few minutes."
  (application error code `rate_limited`, distinct from the OpenRouter-owned
  `provider_rate_limited`).
- A request rejected by this local guard makes **no** OpenRouter call and
  writes **no** `model_calls` row (no provider/model call occurred).
- The count query runs through an `authenticated`, user-scoped Supabase client
  built from the already-validated bearer token, using the existing
  `authenticated` `SELECT` + own-row RLS policy. It does not use, and does not
  require, any `service_role` read privilege.
- Fail closed: if the rate-check query itself errors, the request fails with a
  sanitized error and does **not** fall through to the provider call.
- The existing duplicate-submit UI guard and "one model call per submit; no
  automatic retry" rule are unchanged; this adds a server-authoritative bound
  on top of them.

### Clue -> query (browser, deterministic)

- If `artist` and `albumTitle`: query = `"{artist} {albumTitle}"`.
- Else if `albumTitle`: query = `albumTitle`.
- Else if `artist`: query = `artist`.
- Else if `visibleText` non-empty: query = the joined first few visible-text
  lines, truncated to the Milestone 4 max query length.
- Else: no automatic search; show the manual fallback with the search box
  focused.
- The derived query is always shown and editable before the search runs, so the
  user can correct a bad guess without a second model call.

### Persistence

- No new persistence for the release/collection path. Confirmation calls the
  existing `POST /api/catalog/add`, which already: re-fetches the MusicBrainz
  release by MBID, upserts the shared canonical `catalog` release with the
  service role, and inserts a `collection_item` for the verified user.
- `releases.source` stays `catalog`. No new `source` value is introduced;
  Milestone 5 reuses the catalog path rather than inventing an
  `image_recognition` source. (The data-model note about an
  `image_recognition` source is deferred with `image_identification_attempts`.)

## Database Implications

One new forward migration. No historical migration is edited.

### `public.model_calls`

```sql
create table public.model_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null check (feature in ('cover_vision')),
  provider text not null,
  model text not null,
  success boolean not null,
  latency_ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  estimated_cost_usd numeric(12, 6),
  error_category text,
  created_at timestamptz not null default now(),
  constraint model_calls_provider_clean check (
    provider = btrim(provider) and char_length(provider) between 1 and 40
  ),
  constraint model_calls_model_clean check (
    model = btrim(model) and char_length(model) between 1 and 120
  ),
  constraint model_calls_error_category_clean check (
    error_category is null
    or (error_category = btrim(error_category)
        and char_length(error_category) between 1 and 60)
  ),
  constraint model_calls_token_counts_nonneg check (
    (prompt_tokens is null or prompt_tokens >= 0)
    and (completion_tokens is null or completion_tokens >= 0)
    and (latency_ms is null or latency_ms >= 0)
  )
);

create index model_calls_user_created_idx
  on public.model_calls (user_id, created_at desc);

alter table public.model_calls enable row level security;

revoke all on table public.model_calls from anon;
revoke all on table public.model_calls from authenticated;

grant select on table public.model_calls to authenticated;
grant insert on table public.model_calls to service_role;

create policy "Users can select their own model calls"
  on public.model_calls
  for select
  to authenticated
  using (user_id = (select auth.uid()));
```

Notes:

- `feature` is constrained to `cover_vision` for Milestone 5 and widened by a
  later migration when the curator milestone adds its features.
- Privilege model (least privilege), as implemented in
  `20260829140000_add_model_calls.sql`:
  - `anon`: no access.
  - `authenticated`: `SELECT` own rows only, through the RLS policy. No
    `INSERT`/`UPDATE`/`DELETE`.
  - `service_role`: `INSERT` only. It does **not** need `SELECT`, `UPDATE`, or
    `DELETE` for Milestone 5 - the recognition function only appends a
    telemetry row. `service_role` is granted the privilege explicitly because
    Milestone 4 proved that `BYPASSRLS` does not substitute for ordinary table
    privileges.
- The per-user rate check (below) reads `model_calls` through the
  `authenticated` `SELECT` policy using the caller's own bearer token, so it
  does not require any `service_role` read privilege.
- Never stored: the image, the prompt text, the raw provider payload, the API
  key, any provider request id, or free-text model output.

## External API Implications

See `docs/decisions/0003-openrouter-vision-provider.md` for the full research
and the model choice. Summary:

- Provider: OpenRouter, server-side, `Authorization: Bearer OPENROUTER_API_KEY`.
- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`.
- Image transport: base64 `data:` URL inside an `image_url` content part.
  Supported input formats: PNG, JPEG, WebP (GIF also supported by OpenRouter;
  Milestone 5 allow-list is JPEG/PNG/WebP).
- Structured output: `response_format` with a JSON schema; supported by the
  chosen Gemini Flash-tier models.
- Primary model: `google/gemini-3.1-flash-lite` (GA / stable; listed pricing
  input $0.25 / output $1.50 / image input $0.25 per 1M tokens).
- Manually selectable alternative: `google/gemini-3.5-flash` (GA / stable;
  listed pricing input $1.50 / output $9.00 / image input $1.50 per 1M tokens).
  Same request/response contract, so switching is a model-id change only, via
  `OPENROUTER_VISION_MODEL`. There is no automatic cross-model fallback.
- Estimated per-recognition cost (estimate only, not guaranteed): roughly
  $0.0006 (primary) to $0.003 (alternative) with a downscaled cover image, a
  short prompt, and capped output.
- Netlify Functions limits: synchronous execution limit 60 seconds; buffered
  request/response payload 6 MB; base64 overhead makes the effective binary
  request payload about 4.5 MB. The downscaled base64 image is comfortably
  inside all of these, so no background function is needed for Milestone 5. The
  application uses its own bounded OpenRouter request timeout (~15 s) for
  recoverable UX; that is an application timeout, not the platform limit.

## AI / Model Behavior

- The model extracts clues; it does not produce authoritative metadata.
- Model output is untrusted input and is fully validated server-side.
- `confidence` is advisory/debug only and is never the sole reason to do
  anything; it is not persisted as a probability and is not shown as a
  precise percentage.
- Model-inferred `releaseYearHint`, `label`, and `catalogNumber` are treated as
  search hints only. They are never written to the database as facts.
- The factual catalog metadata always comes from the confirmed MusicBrainz
  release via the Milestone 4 Add path.
- The user resolves all ambiguity by choosing a candidate (or by editing the
  query, or by falling back to manual search).

### Recognition contract

```ts
type CoverRecognition = {
  artist: string | null
  albumTitle: string | null
  visibleText: string[]          // <= 12 items, each <= 120 chars, server-trimmed
  label: string | null
  catalogNumber: string | null
  releaseYearHint: number | null // integer in 1900..(currentYear + 1) or null
  confidence: number             // 0..1, advisory only
  notes: string | null           // <= 240 chars, optional
  identified: boolean            // model asserts it could read a record cover
}
```

`identified === false`, or `identified === true` with `artist`, `albumTitle`,
and `visibleText` all empty, is treated as "could not identify" - a recoverable
state with the manual fallback.

## Error States

Every case is recoverable and stays local to the recognition panel; none forces
the fatal app shell unless the auth/session boundary itself fails.

| Case | Handling |
| --- | --- |
| Not authenticated | `unauthorized`, prompt to sign in |
| Over the per-user rate limit (>= 10 recognitions / 10 min) | `rate_limited` (HTTP 429); no provider call, no telemetry row |
| Rate-check lookup itself fails | sanitized error, fail closed; no provider call |
| No/invalid image in request | `invalid_query` |
| Disallowed MIME | `unsupported_media_type` |
| Decoded image over the size limit | `image_too_large` |
| Corrupt image / magic-number mismatch | `unsupported_media_type` |
| Request body over transport limit | `image_too_large` (client blocks first) |
| `OPENROUTER_API_KEY` missing | `config_error` |
| Model timeout | `provider_timeout` |
| OpenRouter 429 / 503 | `provider_rate_limited` |
| Other OpenRouter 5xx / network error | `provider_unavailable` |
| Model returned non-JSON or schema mismatch | `provider_bad_response` |
| Model could not identify a cover | `not_identified` (manual fallback) |
| Low confidence but clues present | not an error: candidates shown with a caution note; user still confirms |
| Clues present but no MusicBrainz candidates | existing M4 no-results state + manual fallback |
| Ambiguous candidates | existing M4 candidate list; user confirms one |
| MusicBrainz 429 / 503 during candidate search | existing M4 `provider_rate_limited` recoverable error |
| User cancels before confirming | nothing persisted |
| Telemetry insert fails | logged as a category only; user request still succeeds |

## Security / Privacy

- `OPENROUTER_API_KEY` is server-only, never `VITE_`-prefixed, never logged,
  never returned to the browser, never written to a row.
- The recognition function requires a valid Supabase user token and derives the
  user id server-side.
- Client-side image validation is a UX convenience; the server re-validates
  MIME, decoded size, and magic bytes and is authoritative.
- The image is held only in function memory for the duration of one request and
  is never written to Supabase Storage, a database column, a log line, or
  `model_calls`.
- `model_calls` rows contain no image, no prompt, no raw payload, no secret.
- Browser cannot insert/update/delete `model_calls`; it can read only its own
  rows.
- Request size is bounded client-side and server-side; one model call per
  submit; timeout enforced; no automatic retry.
- A per-user rate limit (10 recognitions / 10 minutes, counted from
  `model_calls`) is enforced server-side before the provider call; over-limit
  requests get HTTP 429 and cost nothing.
- `.env.example` gains placeholder-only `OPENROUTER_API_KEY` and
  `OPENROUTER_VISION_MODEL` entries.

## Telemetry Decision

Milestone 5 adds `model_calls` now rather than deferring it, because:

- This is the first runtime model call, and `intent.txt`, `docs/ai-design.md`,
  and `docs/data-model.md` all already call for lightweight model-call audit.
- The cost is one small table, one RLS policy, one server-side insert.
- The course success criteria explicitly include cost/latency awareness and an
  audit trail; recording the first model call is exactly that evidence.
- Every later AI milestone (curator, explanation) reuses the same table.

It stays minimal: a subset of the `docs/data-model.md` design, no `trace_id`,
no `request_kind`/schema-version columns, no free text.

Telemetry is recorded before the function responds. In a serverless function a
true fire-and-forget write can be lost when the container freezes after the
response, so the insert is awaited. A telemetry failure is caught, sanitized to
a category-only log line, and never turns a successful recognition into a
failed user request (and never fails an already-failed one differently).

## Deferred (documented, not implemented)

- `image_identification_attempts` persistence and an `image_recognition`
  `releases.source` value. Milestone 5's flow is stateless per request (the
  browser carries clues and candidates between steps), so an attempt-audit
  table is not required for the user outcome. Add it in a later milestone if
  recovery history or analytics need it. LOW.
- `model_calls` retention policy. Rows are small and few for a single-tenant
  course demo; a retention/cleanup job is post-submission. NOTE.
- Raising any Netlify function timeout. Not needed: the synchronous execution
  limit is 60 s and a single Flash-tier vision call plus the application's ~15 s
  request timeout are well within it. NOTE.
- Provider generation/trace id in telemetry. Useful for support; not needed for
  the demo. NOTE.

## Acceptance Criteria

- Human-approved spec and implementation plan (and ADR 0003) exist before code
  begins.
- Recognition requires a valid authenticated Supabase user session/JWT.
- The `OPENROUTER_API_KEY` is used only server-side and never reaches the
  browser or the database.
- Exactly one vision-model call is made per submit; no automatic retry.
- A per-user server-side rate limit (10 recognitions per 10 minutes, counted
  from `model_calls` via the caller's own token) rejects over-limit requests
  with HTTP 429 (`rate_limited`) before any OpenRouter call, and writes no
  telemetry row for the rejected request. The check fails closed if its own
  lookup errors. It needs no `service_role` read privilege.
- Client and server both validate image MIME and size; the server also checks
  magic bytes.
- The vision model output is validated against the recognition contract before
  use; malformed output yields `provider_bad_response` and never reaches the
  UI as data.
- Model-inferred year/label/catalog number are never written to the database.
- Candidate lookup uses the existing Milestone 4 catalog search; candidates use
  the existing normalized `CatalogCandidate` contract and UI.
- No release or collection item is persisted without an explicit user
  confirmation click, which routes through the existing Milestone 4
  `POST /api/catalog/add`.
- A "could not identify" result offers a manual search fallback.
- One `model_calls` row is written per recognition attempt (success or
  failure), containing user id, feature, provider, model, success, and the
  available latency/token/cost fields, and no sensitive content.
- A user can read only their own `model_calls` rows; browsers cannot write
  them.
- All listed error states are recoverable and do not force the fatal app shell.
- Existing Milestone 1-4 automated tests and the manual catalog flow still
  pass.
- No Supabase Storage, image retention, embeddings/RAG/vector DB, AI curator,
  ratings/favorites/notes, listening history, browse/filter redesign,
  production deployment, or Milestone 6+ scope is introduced.

## Verification Steps

Automated (agent-run / local; fake provider only, zero paid calls):

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
npx supabase db reset
npx supabase test db
npx supabase db lint
npm audit --omit=dev
```

Plus a branch-diff secret/scope scan.

Manual runtime test plan (human):

1. Sign in.
2. Open "Recognize from photo", choose a clear cover photo of a known album.
3. Submit; confirm a spinner, then structured clues and an editable derived
   query appear.
4. Confirm real MusicBrainz candidates load from the derived query.
5. Confirm one candidate; confirm it is added and appears in the collection.
6. Refresh; confirm the added release persists.
7. Submit a non-cover photo (e.g. a landscape); confirm a recoverable
   "could not identify" state with a manual search fallback, and nothing is
   persisted.
8. Submit an oversized or non-image file; confirm a recoverable client-side
   rejection with no request sent.
9. Confirm manual Milestone 4 catalog search and manual collection CRUD still
   work.
10. Confirm `/api/health` still returns `{"status":"ok"}`.
11. In Supabase Studio, confirm `model_calls` gained rows for the attempts
    above with no image/prompt/secret content, and that a second signed-in
    user cannot read the first user's rows.

Do not claim human runtime verification before it happens. Automated evidence
(fake provider) and human evidence (one real paid call funded by the human)
must be distinguished in `docs/verification.md`.

## Stop Point

Historical pre-implementation gate, satisfied. It read:

> This specification is proposed. Do not begin Milestone 5 implementation until
> the human approves this spec, the implementation plan
> (`docs/plans/006-milestone-5-photo-recognition.md`), and
> `docs/decisions/0003-openrouter-vision-provider.md`, including the OpenRouter
> model choice, the new `OPENROUTER_API_KEY` server secret, the `model_calls`
> schema, the no-Storage image transport, and acceptance that human runtime
> verification will make one small paid vision call.

The human approved all three documents and the listed decisions, and directed
implementation on this branch. Implementation completed, the final
`/code-review ultra` returned PASS WITH NOTES, the promoted findings were
closed, and human runtime verification passed. Current status is at the top of
this document and in "Milestone 5 Evidence - Photo Recognition + Candidate
Confirmation" in `docs/verification.md`.

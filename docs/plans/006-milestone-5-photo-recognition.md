# 006 Milestone 5 Photo Recognition Implementation Plan

Status: proposed; awaiting human approval before implementation

Milestone: 5 - Photo Recognition + Candidate Confirmation

Date: 2026-08-29

Branch: `claude/milestone-5-photo-recognition`

Baseline: `0f5ee08632e485b951cab225ed617e27d5232d0f` (Milestone 4 merge on `main`)

Specification: `docs/specs/0006-milestone-5-photo-recognition.md`

Decision record: `docs/decisions/0003-openrouter-vision-provider.md`

## Current Repository Baseline

Milestone 4 is merged. The catalog stack in place and reused by Milestone 5:

- `netlify/functions/_shared/catalog-handlers.mts` -
  `handleCatalogSearch` / `handleCatalogAdd`, `authenticateRequest`,
  `requiredEnv`, error mapping, `CatalogFunctionDependencies` DI seam.
- `netlify/functions/catalog-search.mts` (`GET /api/catalog/search`) and
  `netlify/functions/catalog-add.mts` (`POST /api/catalog/add`).
- `src/lib/catalog/musicbrainz.ts` - `searchMusicBrainzReleases`,
  `MusicBrainzError`, `FetchFunction`.
- `src/lib/catalog/types.ts` - `CatalogCandidate`, `CatalogSearchResponse`,
  `CatalogAddResponse`, `CatalogErrorCode`, `CatalogClientError`.
- `src/lib/catalog/client.ts` - `searchCatalog`,
  `addCatalogReleaseToCollection`.
- `src/catalog/CatalogPanel.tsx`, `CatalogSearchForm.tsx`,
  `CatalogCandidateList.tsx`, `CatalogCandidateCard.tsx`.
- Migrations `20260818134203`, `20260819000100`, `20260826000100`,
  `20260829120000`; pgTAP suites; the service-role grant lesson from the
  Milestone 4 blocker.
- `src/lib/supabase/client.ts` browser client.

No model-call code, vision provider, `OPENROUTER_*` env, `model_calls` table,
image handling, or Supabase Storage usage exists yet.

## Approved Constraints Inherited From Prior Milestones

- Read `intent.txt` before substantial product changes.
- No implementation until the spec and plan are explicitly approved.
- No private keys or service-role keys in the browser; server-only via Netlify
  Functions.
- Deterministic software for auth, validation, persistence, and exact search;
  the model only interprets the image.
- Treat model output as untrusted; validate every field server-side.
- Never persist an uncertain AI guess; explicit user confirmation before any
  collection write.
- No permanent photo storage; delete the image after the request.
- No RAG, vector DB, extra agents, or scope expansion without approval.
- Preserve the Pre-PR Repository Evidence Gate before opening the milestone PR.

## Requirements Extracted For Milestone 5

Required now:

- Authenticated single-vision-call recognition endpoint.
- Client + server image validation and a bounded payload.
- Strict structured-output validation of the model result.
- Deterministic clues -> MusicBrainz query mapping.
- Candidate review via the existing Milestone 4 search + candidate UI.
- Explicit confirmation, then persistence via the existing Milestone 4 Add.
- Minimal `model_calls` telemetry.
- Recoverable handling for every failure in the spec.
- Fake-provider tests; one human paid call at runtime verification.

Explicitly deferred: `image_identification_attempts`, Storage, retries,
retention jobs, timeout config, trace ids, any Milestone 6+ feature.

## Proposed Files

New:

```text
supabase/migrations/<timestamp>_add_model_calls.sql
supabase/tests/database/model_calls_rls.test.sql

netlify/functions/catalog-recognize.mts
netlify/functions/_shared/recognition-handlers.mts
netlify/functions/recognition-functions.test.ts

src/lib/vision/types.ts            # CoverRecognition, RecognitionErrorCode
src/lib/vision/openrouter.ts       # vision adapter (fetch-injectable)
src/lib/vision/openrouter.test.ts
src/lib/vision/query.ts            # clues -> MusicBrainz query (deterministic)
src/lib/vision/query.test.ts
src/lib/vision/image.ts            # browser: validate + downscale + data URL
src/lib/vision/image.test.ts
src/lib/vision/client.ts           # browser: recognizeCover(client, dataUrl)
src/lib/vision/client.test.ts

src/catalog/CatalogPhotoPanel.tsx  # image input + submit + clue/query review
src/catalog/CatalogPhotoPanel.test.tsx

docs/decisions/0003-openrouter-vision-provider.md   # created in this planning step
```

Changed:

```text
.env.example                       # + OPENROUTER_API_KEY, OPENROUTER_VISION_MODEL
src/catalog/CatalogPanel.tsx       # host the photo sub-panel; share the search/candidate flow
src/lib/catalog/types.ts           # extend the error-code union (see below)
README.md                          # status line + Implemented list, at verification time
docs/verification.md               # Milestone 5 evidence, at verification time
docs/specs/0006-... , docs/plans/006-...  # status flips at approval / completion
```

Names may shift slightly during implementation but the boundary stays
equivalent: one recognition function, one vision adapter, one telemetry table,
and reuse of the Milestone 4 search/add path.

## Design Details

### Migration: `public.model_calls`

Exactly the DDL block in the specification. One table, one index, RLS on,
`revoke all` from `anon`/`authenticated`, `grant select` to `authenticated`,
`grant select, insert` to `service_role`, one own-row `SELECT` policy. `feature`
check constrained to `cover_vision` for now.

### Recognition function

`netlify/functions/catalog-recognize.mts`:

```ts
export const config: Config = { method: ['POST'], path: '/api/catalog/recognize' }
```

`_shared/recognition-handlers.mts` mirrors the Milestone 4 handler:

- `handleCatalogRecognize(request, env = process.env, deps = defaultDeps())`.
- `deps`: `{ createClient, recognizeCover, recordModelCall, now }` so tests
  inject a fake vision call and a fake clock and assert the telemetry write.
- Steps: authenticate (reuse the Milestone 4 pattern; consider lifting the
  shared auth helper into a tiny `_shared/auth.mts` so both handlers import it
  rather than duplicating - only if it stays a pure move, otherwise duplicate
  the ~15 lines); parse/validate the data URL; decode and check bytes and magic
  number; `requiredEnv('OPENROUTER_API_KEY')`; resolve the model id from
  `OPENROUTER_VISION_MODEL` or the ADR default; one `recognizeCover(...)` call
  with an `AbortController` timeout; validate/normalize the structured result;
  best-effort `recordModelCall(...)` insert with the service role; return
  `{ recognition }`.
- Error mapping mirrors `mapThrownError` in the catalog handler: a
  `VisionError` carries a `RecognitionErrorCode` and maps to a status; unknown
  errors become `unknown` / 500. Telemetry records `success=false` and the
  sanitized `error_category` on every failure that reached the provider call.

### Vision adapter `src/lib/vision/openrouter.ts`

- `recognizeCoverWithOpenRouter({ imageDataUrl, apiKey, model, fetchImpl?, timeoutMs? }) -> CoverRecognition`.
- Builds one `chat/completions` request: system/user instruction to return only
  the JSON contract and to set `identified=false` when it cannot read a cover;
  one `image_url` part with the data URL; `response_format` JSON schema for
  `CoverRecognition`; `max_tokens` ~300; `temperature` 0.
- Headers: `Authorization: Bearer <key>`, `Content-Type: application/json`,
  optional `HTTP-Referer` / `X-Title` from optional env.
- Response handling mirrors `fetchMusicBrainzJson`: `429`/`503` ->
  `provider_rate_limited`; other non-2xx -> `provider_unavailable`;
  `AbortError` -> `provider_timeout`; body not JSON or not matching the schema
  -> `provider_bad_response`.
- Returns the parsed `CoverRecognition` plus usage
  (`prompt_tokens`, `completion_tokens`) and a computed `estimated_cost_usd`
  from ADR 0003 per-token rates for the resolved model, for telemetry.
- No secret, no raw payload, no image is logged or returned upward beyond the
  normalized result + usage.

### Clue -> query `src/lib/vision/query.ts`

Pure function `buildCatalogQueryFromRecognition(recognition) -> string | null`
implementing the deterministic rules in the spec, truncating to the Milestone 4
max query length. Unit-tested for each branch.

### Browser image helper `src/lib/vision/image.ts`

- `validateImageFile(file) -> { ok } | { error: RecognitionErrorCode }`
  (MIME allow-list JPEG/PNG/WebP, pre-resize byte cap).
- `downscaleToDataUrl(file, { maxEdge = 1024, quality = 0.8 }) -> Promise<string>`
  via an offscreen `<canvas>`; always re-encodes to JPEG; enforces a
  post-encode byte cap and returns `data:image/jpeg;base64,...`.
- jsdom cannot exercise real canvas encoding; tests cover the validation branch
  and the data-URL shape with a stubbed canvas, and the happy path is covered
  by the human runtime test.

### Browser client `src/lib/vision/client.ts`

- `recognizeCover(client, imageDataUrl) -> CoverRecognition` - gets the Supabase
  access token (reuse the Milestone 4 `getAccessToken` approach), POSTs to
  `/api/catalog/recognize`, parses `{ recognition }` or throws
  `CatalogClientError` with the sanitized code (reuse the Milestone 4 client
  error type; extend the code union).

### UI `src/catalog/CatalogPhotoPanel.tsx`

- File input (`accept="image/*" capture="environment"`), a "Recognize" button
  disabled while a request is in flight (duplicate-submit guard, same pattern as
  the Milestone 4 search).
- On success: show the clue summary and the editable derived query; a
  "Search candidates" button runs the existing `searchCatalog(client, query)`
  and renders the existing `CatalogCandidateList`; "Add to collection" calls the
  existing `addCatalogReleaseToCollection` and then `onCatalogItemAdded()`.
- On `not_identified` / no query: show the manual fallback (focus the existing
  Milestone 4 search box, pre-filled with any single available clue).
- All errors render inline and recoverable.
- `CatalogPanel.tsx` hosts `CatalogPhotoPanel` above the existing manual search
  form and shares the candidate list / add handler so there is one candidate UI
  and one add path.

### Error-code union

Extend `CatalogErrorCode` (or add `RecognitionErrorCode = CatalogErrorCode | ...`)
with `unsupported_media_type`, `image_too_large`, `not_identified`. Reuse
`unauthorized`, `invalid_query`, `provider_rate_limited`,
`provider_unavailable`, `provider_timeout`, `provider_bad_response`,
`config_error`, `unknown`.

## Secret And Config Handling

New server-only env:

- `OPENROUTER_API_KEY` - required; server-only; never `VITE_`; never logged or
  stored.
- `OPENROUTER_VISION_MODEL` - optional; defaults to the ADR 0003 primary model
  id; not a secret.
- `OPENROUTER_APP_URL` / `OPENROUTER_APP_TITLE` - optional attribution headers;
  not secrets.

`.env.example` gains placeholder-only lines. Real `.env` is never committed.
Local human runtime verification requires the human to set a real
`OPENROUTER_API_KEY` with a small credit; automated tests never read it (fake
provider).

## Testing Plan

Vision adapter (`openrouter.test.ts`): builds the correct request (one image
part, JSON-schema `response_format`, capped `max_tokens`); parses a valid
structured response and usage; `429`/`503` -> `provider_rate_limited`; other
5xx -> `provider_unavailable`; abort -> `provider_timeout`; non-JSON / schema
mismatch -> `provider_bad_response`; never surfaces the key.

Query builder (`query.test.ts`): artist+title, title-only, artist-only,
visible-text fallback, empty -> null, truncation to max length.

Image helper (`image.test.ts`): MIME allow-list accept/reject; oversized
reject; data-URL prefix shape with a stubbed canvas.

Recognition function (`recognition-functions.test.ts`, node env, fake deps):
rejects unauthenticated before any provider call; rejects bad data URL,
disallowed MIME, oversized decoded bytes, magic-number mismatch; `config_error`
when `OPENROUTER_API_KEY` missing; happy path returns `{ recognition }` and
writes exactly one `model_calls` row with `success=true` and the usage fields;
provider failure returns the sanitized code and writes one row with
`success=false` and `error_category`; a telemetry insert error does not fail the
user response; no automatic retry (the fake vision call is invoked exactly
once); never returns the key or raw payload; route config is
`{ method: ['POST'], path: '/api/catalog/recognize' }`.

Database (`model_calls_rls.test.sql`, pgTAP): table/columns/constraints/index
exist; RLS enabled; exactly the one `SELECT` policy; `anon` has no access;
`authenticated` has `SELECT` and no `INSERT`/`UPDATE`/`DELETE`; `service_role`
has `SELECT`+`INSERT` and not `UPDATE`/`DELETE` (both via `has_table_privilege`
and a behavioral `SET LOCAL ROLE` check, matching the Milestone 4 pattern);
user A cannot read user B's rows; check constraints reject blank/overlong
`provider`/`model` and negative token counts. Follow
`service_role_catalog_privileges.test.sql` conventions, including
self-isolating inserts so the file passes without a clean reset.

UI (`CatalogPhotoPanel.test.tsx`): renders the input; submit calls
`recognizeCover` once and shows clues + editable query; duplicate submit while
in flight is ignored; "Search candidates" calls `searchCatalog` with the
derived query and renders candidates; "Add to collection" calls
`addCatalogReleaseToCollection` and triggers refresh; `not_identified` shows the
manual fallback; recognition and search errors render recoverably; existing
manual catalog and collection tests still pass.

Verification commands (agent-run, fake provider, zero paid calls):

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
npx supabase db reset
npx supabase test db
npx supabase db lint
npm audit --omit=dev
git diff --check
```

Plus a branch-diff secret/scope scan (no real keys; no `VITE_OPENROUTER*`; no
Storage; no embeddings/RAG/vector DB; no Milestone 6+ scope).

## Human Runtime Verification Plan

The manual test plan in the specification. It includes exactly one real paid
vision call per recognition (about $0.0006 with the primary model). The human
provisions `OPENROUTER_API_KEY`. Automated evidence (fake provider) and human
evidence (real call) are recorded separately in `docs/verification.md`. Do not
claim human runtime verification before it happens.

## Independent Review Before The PR

- Security/RLS review of the `model_calls` migration and the recognition
  function's auth + service-role boundary.
- Provider-boundary review of the OpenRouter adapter (key handling, timeout,
  error mapping, no payload leakage).
- Confirm the model never writes inferred metadata to the database and that
  persistence only happens through the existing Milestone 4 Add.
- Pre-PR Repository Evidence Gate from `AGENTS.md`.

## Proposed Implementation Commits

After approval only:

1. `feat: add model-call telemetry table`
   - migration `..._add_model_calls.sql`, `model_calls_rls.test.sql`,
     `.env.example` OpenRouter placeholders.
2. `feat: add authenticated cover recognition function`
   - `src/lib/vision/{types,openrouter,query}.ts` + tests,
     `netlify/functions/catalog-recognize.mts`,
     `netlify/functions/_shared/recognition-handlers.mts`
     (+ optional `_shared/auth.mts` pure move), `recognition-functions.test.ts`,
     error-code union extension. Fake provider only.
3. `feat: add photo recognition UI`
   - `src/lib/vision/{image,client}.ts` + tests,
     `src/catalog/CatalogPhotoPanel.tsx` + test, `CatalogPanel.tsx` wiring.
4. `docs: record milestone 5 verification`
   - `docs/verification.md` Milestone 5 section, README status/Implemented,
     spec/plan/ADR status flip, ADR -> accepted. After human runtime
     verification.

Four coherent commits. Commit 1 can fold into commit 2 if review prefers, but
keeping the schema change isolated is cleaner for audit.

## Rollback And Recovery

- If the primary model is deprecated or its recognition quality is inadequate,
  switch `OPENROUTER_VISION_MODEL` to the ADR fallback - no code change.
- If OpenRouter is unavailable at implementation time, stop and revise ADR 0003
  before changing provider.
- If the `model_calls` design is rejected in review, the recognition flow still
  works without it; drop the telemetry write and the migration and re-plan
  telemetry separately.
- If review rejects direct base64 transport, fall back to a short-lived signed
  Supabase Storage upload with a delete-after-use step - larger scope, needs a
  new decision.

## Known Risks

- `google/gemini-3.1-flash-lite-preview` is a preview model and may change or be
  withdrawn. Mitigation: model id is env-configurable and a stable fallback
  (`google/gemini-3.5-flash`) uses the identical contract.
- Vision recognition of worn/awkwardly lit covers can be poor. Mitigation: the
  derived query is always user-editable and the manual Milestone 4 search is
  always available; nothing persists without confirmation.
- jsdom cannot fully exercise canvas image encoding; the downscale happy path
  relies on the human runtime test.
- Hosted Netlify Flash latency could approach the default 10 s timeout.
  Mitigation: documented; raise `[functions]` timeout later if hosted testing
  shows it is needed.
- OpenRouter cost is developer-funded at runtime for this project (unlike a
  BYOK design); mitigated by the sub-cent per-call cost, one call per action,
  capped output, and no retry.

## Human Decisions Required Before Implementation

Listed in "Open Questions Requiring Human Approval" below and in the spec Stop
Point. Implementation does not start until they are answered.

## Pre-PR Repository Evidence Gate

Before opening the Milestone 5 PR, verify: spec/plan/ADR status reflect actual
approvals; README current status is accurate; `docs/verification.md` records
only checks that actually happened and distinguishes fake-provider automated
evidence from the one human paid call; known limitations are visible; no future
feature is represented as implemented; no Milestone 6+ work started; historical
planning language stays historical; no secret or real `.env` is staged; the
branch contains only Milestone 5 scope.

## Stop Point

Stop here. Implementation begins only after the human approves this plan, the
specification, and `docs/decisions/0003-openrouter-vision-provider.md`.

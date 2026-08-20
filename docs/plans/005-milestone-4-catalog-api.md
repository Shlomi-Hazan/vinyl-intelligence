# 005 Milestone 4 Catalog API Implementation Plan

Status: proposed for human approval

Milestone: 4 - Catalog API

Date: 2026-08-20

Branch: `codex/milestone-4-catalog-api`

Baseline: `e5909e729106483d156a462b1e575479e7ef008a`

## Current Repository Baseline

Milestone 3 is merged into `main` at
`e5909e729106483d156a462b1e575479e7ef008a`.

Current implemented foundation:

- Vite + React + TypeScript.
- Netlify Functions runtime with `/api/health`.
- Supabase Auth with local email confirmation.
- `public.profiles` with RLS and explicit grants.
- Manual collection CRUD.
- `public.releases` with creator-owned manual rows.
- `public.collection_items` with user-owned collection rows.
- pgTAP database tests and React/Vitest tests.

No catalog provider code, provider fields, Netlify catalog function, provider
credentials, image recognition, AI, listening history, ratings, favorites, notes,
or browse/search/filter milestone exists yet.

## Approved Constraints Inherited From Prior Milestones

- Read `intent.txt` before substantial product changes.
- No implementation starts until spec and plan are explicitly approved.
- Browser must not contain private API keys, service-role keys, or privileged
  provider credentials.
- Use deterministic software for CRUD, validation, filtering, persistence, and
  exact provider normalization.
- Use Netlify Functions for privileged backend work.
- Use Supabase RLS for user-owned data.
- Keep release-level identifiers while preserving album-first UI.
- Do not introduce RAG, vector databases, unnecessary agents, marketplace
  features, streaming, AI curator, or photo recognition in M4.
- Preserve the Pre-PR Repository Evidence Gate before opening any PR.

## Requirements Extracted For M4

Required now:

- External catalog search/add flow.
- Candidate list from a provider.
- User confirmation before persistence.
- Normalized provider metadata.
- Release-level provider identifier storage.
- Safe browser/server trust boundary.
- Provider API error/rate-limit handling.
- Database/RLS evolution for provider-backed releases.

Future-compatible concerns:

- Photo recognition should reuse catalog search/candidate confirmation later.
- Browse/search/filter should benefit from normalized metadata later.
- Canonical provider rows should support multiple users referencing the same
  release.
- Discogs may become a future provider if official developer docs and terms are
  verified.

Explicitly deferred:

- User-uploaded photo recognition.
- AI/model calls.
- Recommendations.
- Ratings/favorites/notes.
- Listening history.
- Full browse/search/filter UI.
- Production deployment.

## Official API Research Summary

MusicBrainz official docs checked:

- <https://musicbrainz.org/doc/MusicBrainz_API>
- <https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting>
- <https://musicbrainz.org/doc/MusicBrainz_API/Search>
- <https://musicbrainz.org/doc/MusicBrainz_API/Authentication>

Findings:

- Root: `https://musicbrainz.org/ws/2/`.
- JSON supported with `fmt=json` or `Accept: application/json`.
- Read-only non-commercial API access is free and currently does not require an
  API key.
- Meaningful User-Agent is required.
- Default public rate expectation is one request per second per source IP.
- Search, lookup, and browse are supported.
- `release` and `release-group` fit the M4 release-level/canonical model.
- `inc=` supports related metadata such as labels, recordings, release groups,
  media, tags, and genres, though M4 should only store the fields it actually
  needs.

Cover Art Archive official docs checked:

- <https://musicbrainz.org/doc/Cover_Art_Archive/API>

Findings:

- `/release/{mbid}/` returns JSON cover metadata.
- `/release/{mbid}/front` can redirect to a front image.
- Missing art and rate-limit cases have normal HTTP failure responses.
- M4 may store optional provider cover references without implementing user
  image upload or recognition.

Discogs official docs checked:

- <https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use>
- Attempted <https://www.discogs.com/developers>, but automated lookup could
  not retrieve the current developer reference in this session.

Findings:

- Discogs API data includes CC0 and restricted categories.
- Release metadata such as titles, notes, dates, formats, track listings,
  identifiers, artist names, and labels is listed as CC0 data.
- Images, user data, and marketplace data are restricted.
- Discogs may apply rate limits and data-field restrictions per application.
- Current endpoint/auth/rate-limit details must be manually verified before a
  Discogs implementation is approved.

## Proposed Provider Strategy

Use a staged provider design:

1. M4 primary provider: MusicBrainz.
2. M4 optional cover metadata: Cover Art Archive for MusicBrainz releases.
3. Discogs: deferred pending manual official developer-doc verification and
   explicit human approval.

This avoids adding multiple providers for show, avoids storing Discogs tokens in
M4, and still demonstrates a real catalog API integration.

## Proposed Files And Directories For Implementation

Do not create these during planning. Proposed implementation files:

```text
netlify/functions/catalog-search.mts
netlify/functions/catalog-add.mts
src/catalog/CatalogPanel.tsx
src/catalog/CatalogSearchForm.tsx
src/catalog/CatalogCandidateList.tsx
src/catalog/CatalogCandidateCard.tsx
src/catalog/CatalogPanel.test.tsx
src/lib/catalog/types.ts
src/lib/catalog/client.ts
src/lib/catalog/normalization.ts
src/lib/catalog/musicbrainz.ts
src/lib/catalog/musicbrainz.test.ts
src/lib/catalog/function-handlers.test.ts
src/lib/supabase/client.ts
supabase/migrations/<timestamp>_add_catalog_releases.sql
supabase/tests/database/catalog_releases_rls.test.sql
```

Names may be adjusted during implementation if the final plan is cleaner, but
the boundary should remain equivalent.

## Provider Adapter And Server Design

### `GET /api/catalog/search`

Implementation shape:

- Netlify Function file: `netlify/functions/catalog-search.mts`.
- Public path configured through Netlify function config, similar to
  `/api/health`.
- Accept query input such as `q`, optional `artist`, optional `title`, and
  optional `limit`.
- Validate query length and limit.
- Require authenticated user if search should be limited to signed-in users.
- Call MusicBrainz with a configured User-Agent.
- Limit outgoing provider calls and enforce timeout.
- Normalize provider response into `CatalogCandidate[]`.
- Optionally enrich candidate with Cover Art Archive thumbnail metadata.
- Return sanitized errors and structured failure categories.

### `POST /api/catalog/add`

Implementation shape:

- Netlify Function file: `netlify/functions/catalog-add.mts`.
- Require authenticated Supabase user.
- Accept only `{ provider: 'musicbrainz', providerReleaseId: string }`.
- Do not accept browser-supplied metadata for persistence.
- Re-fetch MusicBrainz release details by MBID.
- Validate and normalize provider details.
- Upsert provider-backed release by `(provider, provider_release_id)`.
- Create a `collection_item` for the authenticated user.
- Return the created collection item with release metadata in the existing UI
  shape where practical.

### Rate Limit And Timeout

- Start with a simple in-process throttle/queue suitable for local/university
  demo traffic.
- Keep result limits small.
- Treat MusicBrainz `503` as a rate-limit/unavailable condition.
- Do not add background polling.

## Schema Migration Proposal

Create one reviewed migration after implementation approval.

### `public.releases`

Proposed changes:

- Expand `source` constraint from `manual` to `manual` or `catalog`.
- Add `provider text`.
- Add `provider_release_id text`.
- Add `provider_release_group_id text`.
- Add `external_url text`.
- Add `cover_image_url text` nullable if cover art is approved.
- Add `cover_thumbnail_url text` nullable if cover art is approved.
- Keep existing `artist`, `title`, `release_year`, `label`,
  `catalog_number`, `country`, and `format`.
- Keep `created_by` for manual provenance; provider-backed rows may have
  `created_by = null`.

Constraints:

- Manual rows: `source = 'manual'`, `created_by is not null`, provider fields
  are null.
- Catalog rows: `source = 'catalog'`, provider and provider release ID are not
  null, normalized metadata constraints still hold.
- `provider` initially constrained to `musicbrainz` if MusicBrainz is the only
  M4 provider.
- Unique partial index on `(provider, provider_release_id)` where provider is
  not null and provider_release_id is not null.
- No persisted `decade`.
- No genres/styles/tracklist/raw JSON unless the human expands M4 scope.

### `public.collection_items`

No new ownership columns are proposed for M4.

M4 may continue allowing duplicate collection items for the same release unless
the human approves a duplicate warning UX. Do not add a uniqueness constraint.

## RLS And Grant Implications

Recommended behavior:

- Anonymous users cannot read or write collection items.
- Anonymous users may not need direct table access to releases; search happens
  through functions.
- Authenticated users can select:
  - their own manual releases
  - catalog/provider-backed releases referenced by their own collection items
    or globally readable catalog rows if human approves global release read.
- Authenticated users cannot insert/update/delete provider-backed release rows
  directly.
- Existing authenticated update grants should remain limited to manual metadata
  columns and RLS should prevent updates to catalog rows.
- Catalog release writes happen through Netlify Functions with server-side
  validation.

Decision needed:

- Whether provider-backed catalog releases are globally selectable to all
  authenticated users or only visible through owned collection joins.

Recommended for simplicity:

- Allow authenticated users to select catalog releases. These rows contain
  public provider metadata only.
- Deny browser insert/update/delete for catalog rows.
- Keep `collection_items` select/delete own-only.
- Create catalog collection items through the server function rather than
  granting browser insert to arbitrary catalog releases.

## Frontend / Service Flow

Update the authenticated screen without adding a router:

- Keep profile/sign-out controls.
- Keep manual collection panel.
- Add a minimal catalog add panel.

Proposed UX:

1. User enters search terms.
2. UI shows loading state.
3. UI displays normalized candidates.
4. User chooses `Add to collection`.
5. UI shows success and refreshes/updates the existing collection list.
6. Recoverable errors remain local to the catalog panel.

Do not implement full collection browse/filter in M4.

## Normalized Candidate Contract

Use the contract from the specification:

```ts
type CatalogProvider = 'musicbrainz'

type CatalogCandidate = {
  provider: CatalogProvider
  providerReleaseId: string
  providerReleaseGroupId: string | null
  score: number | null
  artist: string
  title: string
  releaseYear: number | null
  label: string | null
  catalogNumber: string | null
  country: string | null
  format: string | null
  coverImageUrl: string | null
  coverThumbnailUrl: string | null
  externalUrl: string
}
```

Do not expose raw provider payloads to React components.

## Error Handling

Plan explicit categories:

- `invalid_query`
- `unauthorized`
- `provider_rate_limited`
- `provider_unavailable`
- `provider_timeout`
- `provider_bad_response`
- `not_found`
- `config_error`
- `database_error`
- `unknown`

The UI should present short recoverable messages. Internal logs should avoid
recording raw provider payloads or secrets.

## Dependency Policy

No new dependency is expected for the first implementation pass.

Use built-in `fetch`, TypeScript types, and existing Vitest tooling where
possible.

If implementation needs a dependency for request throttling, schema validation,
or test utilities, stop and request human approval with:

- package name
- version
- reason
- alternatives
- security/audit impact

Do not run `npm audit fix --force`.

## Secret And Config Handling

Expected browser-safe variables:

- Existing `VITE_SUPABASE_URL`
- Existing `VITE_SUPABASE_PUBLISHABLE_KEY`

Expected server-only variables if implementation uses service-role persistence:

- `SUPABASE_SERVICE_ROLE_KEY`
- `MUSICBRAINZ_USER_AGENT`

Discogs variables should not be added unless Discogs is approved:

- `DISCOGS_TOKEN`
- `DISCOGS_CONSUMER_KEY`
- `DISCOGS_CONSUMER_SECRET`

Rules:

- Never use `VITE_` for service-role or provider secret values.
- Never commit real `.env`.
- Update `.env.example` only with placeholders after implementation approval.

## Testing Plan

### Provider Adapter Tests

- Builds valid MusicBrainz search URLs.
- Sets `fmt=json`.
- Sends a meaningful User-Agent.
- Normalizes release candidates.
- Handles missing optional metadata.
- Rejects malformed provider responses.
- Handles no results.
- Handles `503`/rate-limit-like responses.
- Handles timeout.

### Netlify Function Tests

- Rejects unauthenticated add requests.
- Validates search query length and limit.
- Returns normalized candidates.
- Sanitizes provider errors.
- Re-fetches selected release before persistence.
- Does not trust browser candidate metadata.
- Does not expose server secrets.

### Database / RLS Tests

- Provider columns and constraints exist.
- Manual rows still satisfy old behavior.
- Catalog rows require provider identifiers.
- Unique `(provider, provider_release_id)` behavior works.
- Browser roles cannot insert/update/delete catalog rows.
- Browser roles cannot mutate provider/source/timestamp columns.
- Authenticated users can read only the release metadata policy approved by the
  human.
- User-owned `collection_items` remain own-only.
- Manual CRUD database tests still pass.

### Frontend / Component Tests

- Catalog search form.
- Loading state.
- No-result state.
- Candidate rendering.
- Add selected candidate success.
- Recoverable search error.
- Recoverable add error.
- Missing cover art display.
- Existing manual collection/profile flows still render.

### Verification Commands

Run after implementation:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
npx supabase db reset
npx supabase test db
npx supabase db lint
npm audit --omit=dev
npm audit --json
git diff --check
```

Also run secret/scope scans for:

- no real credentials
- no service-role key in browser code
- no Discogs credentials unless approved
- no AI/photo/listening/rating/favorite/note/search-filter milestone scope

## Human Runtime Verification Plan

After implementation and automated verification, the human should verify:

- Sign in.
- Search for a known album.
- See normalized catalog candidates.
- Add a confirmed candidate.
- Confirm it appears in the collection.
- Refresh and confirm persistence.
- Add a second catalog release.
- Remove one collection item.
- Confirm provider release metadata remains stable.
- Confirm manual add/edit/remove still works.
- Confirm `/api/health` still returns `{"status":"ok"}`.

Do not claim human runtime verification before it happens.

## Independent Review Plan

Before opening the M4 PR:

- Independent security/RLS review of the migration and server functions.
- Independent provider-boundary review of MusicBrainz/CAA adapters.
- Independent test-quality review against this specification.
- Pre-PR Repository Evidence Gate from `AGENTS.md`.

## Likely Commits

After approval only:

1. `docs: approve milestone 4 implementation`
2. `db: add catalog release schema and RLS`
3. `feat: add catalog provider functions`
4. `feat: add catalog search and add workflow`
5. `docs: record milestone 4 verification`

Commit boundaries can change if review corrections are needed, but do not squash
the audit trail.

## Rollback And Recovery

- If schema review rejects shared catalog rows before merge, create a corrective
  migration on the branch rather than dashboard changes.
- If provider policy prevents use of MusicBrainz at implementation time, stop
  and revise spec/plan before changing provider.
- If server-side service-role persistence is rejected, revise the RLS design
  before implementation.
- If rate-limit behavior is inadequate, stop and add a reviewed throttling
  strategy rather than increasing request volume.

## Known Risks

- MusicBrainz may have less vinyl-specific release detail than Discogs.
- Cover Art Archive art may be missing for some releases.
- Netlify Function/server-side service-role code must be careful because
  service-role bypasses RLS.
- Shared provider-backed rows require clean grants/RLS so browser users cannot
  mutate metadata seen by others.
- In-process throttling is enough for a demo but not a robust distributed
  production rate limiter.
- Discogs may become necessary if MusicBrainz search quality is poor for vinyl
  editions, but Discogs requires current developer-doc and terms verification.

## Human Decisions Required Before Implementation

- Primary M4 provider: approve MusicBrainz or choose another path.
- Cover Art Archive: approve optional cover reference storage or defer it.
- Discogs: approve deferral or require Discogs-first verification before M4.
- Trust boundary: approve Netlify Functions for all catalog provider calls.
- Persistence boundary: approve server-side provider revalidation before add.
- Service-role: approve server-only Supabase service-role use for catalog upsert
  and collection item creation.
- Sharing model: approve shared canonical provider-backed releases.
- Schema: approve exact columns and constraints.
- RLS: approve catalog release read visibility.
- Dependency policy: approve no new dependencies unless implementation proves a
  need.
- Config: approve server-only variables such as `MUSICBRAINZ_USER_AGENT` and,
  if service-role is approved, `SUPABASE_SERVICE_ROLE_KEY`.

## Pre-PR Repository Evidence Gate

Before opening the M4 PR, verify:

- Spec, plan, and any ADR status reflect actual human approvals.
- README current status is accurate.
- `docs/verification.md` records actual commands and human checks only after
  they happen.
- Known gaps and provider limitations are visible.
- No future feature is represented as implemented.
- No M5 work has started.
- Any historical planning language remains clearly historical.

## Stop Point

Stop here. Do not implement Milestone 4 until the human explicitly approves this
plan, the M4 specification, and the listed human decisions.

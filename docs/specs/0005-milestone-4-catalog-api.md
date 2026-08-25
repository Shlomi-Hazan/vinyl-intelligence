# 0005 Milestone 4 Catalog API Specification

Status: approved

Milestone: 4 - Catalog API

Date: 2026-08-20

Approved: 2026-08-25

Branch: `codex/milestone-4-catalog-api`

Baseline: `e5909e729106483d156a462b1e575479e7ef008a`

## Intent

Milestone 4 should add the first external music catalog integration so an
authenticated user can search a music metadata provider, review normalized
candidate releases, choose one, and add the confirmed release to their personal
collection.

This milestone should demonstrate deterministic API integration, provider
normalization, server-side trust boundaries, and safe persistence. It must not
become photo recognition, AI recommendation, full browse/search/filter, ratings,
favorites, notes, listening history, production deployment, or a multi-provider
showcase.

## Repository Context

`intent.txt` requires external music metadata APIs for record search/add and
states that catalog/API work belongs behind server-side boundaries when secrets,
rate limiting, validation, or privileged writes are involved.

Milestone 3 created:

- `public.releases`
- `public.collection_items`
- creator-owned manual release rows
- browser-authoritative RLS for manual CRUD

Milestone 3 explicitly deferred provider columns, canonical/provider-backed
release sharing, genres/styles, cover references, and catalog normalization to a
reviewed later milestone.

## Current Official API Research

### MusicBrainz

Official documentation checked:

- <https://musicbrainz.org/doc/MusicBrainz_API>
- <https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting>
- <https://musicbrainz.org/doc/MusicBrainz_API/Search>
- <https://musicbrainz.org/doc/MusicBrainz_API/Authentication>

Current findings:

- API root is `https://musicbrainz.org/ws/2/`.
- Read-only API use is free for non-commercial use.
- No API key is currently required for normal metadata reads.
- A meaningful `User-Agent` is required.
- Intended M4 User-Agent format:
  `VinylIntelligence/<version> (<contact URL or contact email>)`.
- The User-Agent is application identification, not a sensitive credential.
- MusicBrainz asks applications to stay at or below one request per second per
  source IP unless otherwise agreed.
- Excessive requests can receive HTTP `503`.
- Responses can be JSON by using `fmt=json` or an `Accept: application/json`
  header.
- Search, lookup, and browse operations are supported.
- `release` and `release-group` are core entities.
- Release lookups can include related data such as artist credits, labels,
  recordings, release groups, media, tags, and genres through `inc=`.
- Some user-specific requests and submissions require authentication, but M4
  should not submit data to MusicBrainz or access MusicBrainz user data.

Design inference:

- MusicBrainz is suitable as the primary M4 provider because it supports
  release-level MBIDs, release-group IDs, labels, media formats, release dates,
  countries, and open read-only access without a provider secret.
- M4 should still call MusicBrainz through Netlify Functions so the app can
  consistently set a meaningful User-Agent, apply bounded per-instance request
  pacing, validate provider responses, normalize output, avoid an
  unauthenticated public proxy, and preserve the approved backend boundary for
  catalog APIs.

### Cover Art Archive

Official documentation checked:

- <https://musicbrainz.org/doc/Cover_Art_Archive/API>

Current findings:

- Cover Art Archive is the MusicBrainz-linked cover-art service.
- `/release/{mbid}/` returns JSON metadata for cover art associated with a
  MusicBrainz release.
- `/release/{mbid}/front` can redirect to a selected front image when available.
- JSON metadata includes image URLs, thumbnail URLs, front/back flags, approval
  status, image IDs, and a linked MusicBrainz release.
- Missing cover art is represented with normal HTTP error states such as `404`.
- Cover art is legally distinct from MusicBrainz metadata. Official MusicBrainz
  copyright/DMCA guidance treats cover images as copyrighted media hosted via
  the Internet Archive/Cover Art Archive and advises care around rights; cover
  images are copyrighted by their respective copyright owners.

Design inference:

- M4 may derive a transient display cover from a MusicBrainz release MBID.
- This is provider album artwork, not user-uploaded photo recognition. It does
  not create Supabase Storage objects and does not start the Milestone 5 image
  recognition/upload pipeline.
- Cover art should be optional. Missing artwork must not block adding a catalog
  release.
- Default M4 should not persist full/direct Cover Art Archive image or thumbnail
  URLs in the database. If the human later wants persisted cover URLs, record
  that as a separate decision.

### Discogs

Official documentation checked:

- <https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use>
- <https://www.discogs.com/developers> was attempted but was not retrievable by
  automated documentation lookup in this session.

Current findings from official Terms of Use, last updated May 27 2025:

- Discogs API content includes a mix of CC0 data and restricted data.
- CC0 data includes release titles, notes, dates, formats, track listings,
  barcodes and identifiers, credits, versions, external URL links, artist names,
  and label-related metadata.
- Restricted data includes user data, marketplace data, and images.
- Discogs may apply rate limits and restrictions to data fields per application
  or service.
- API users must not circumvent rate limits or technical limitations.
- API content may not be displayed if it is more than six hours older than the
  information on Discogs.
- API content should not be cached or stored longer than necessary for the
  service.
- Public-facing API use carries attribution obligations, including "Data
  provided by Discogs" next to Discogs API data with an appropriate link.

Design inference:

- Discogs remains a strong vinyl/release-oriented candidate, but M4 should not
  implement Discogs until the official developer reference can be manually
  verified for current authentication, endpoint behavior, rate-limit headers,
  image usage, and token requirements.
- Discogs persistence is not just an endpoint question: its freshness, caching,
  restricted-data, and attribution terms need a reviewed design before storing
  shared canonical Discogs-backed releases.
- Do not add Discogs credentials or Discogs-specific schema in M4 unless the
  human explicitly approves a Discogs-first or dual-provider design after that
  verification.

## Approved Provider Strategy

Human-approved M4 provider strategy:

1. Use MusicBrainz as the primary catalog metadata provider.
2. Use Cover Art Archive only for optional transient cover display associated
   with selected MusicBrainz releases.
3. Defer Discogs implementation until its current official developer reference
   and token/terms constraints are manually verified.

This is the smallest justified design because it satisfies the first catalog
search/add flow without provider secrets, while keeping the architecture open
for Discogs if vinyl-specific coverage is later necessary.

API spike 0001 was dispositioned on 2026-08-25: MusicBrainz-first is accepted
for M4 without completing the remaining Discogs empirical comparison now.
Discogs is deferred, not rejected.

## In Scope

- Authenticated catalog search screen or panel inside the existing authenticated
  app shell.
- Search by artist/title/free-text query.
- Server-side catalog search through Netlify Functions.
- Normalized candidate list from the provider response.
- User confirmation before persistence.
- Server-side selected-release lookup/revalidation before persistence.
- Persist confirmed provider-backed release metadata.
- Create a `collection_item` for the authenticated user.
- Show recoverable error states for provider/API/persistence failures.
- Store release-level provider identifiers.
- Optional transient provider cover display from Cover Art Archive if available.
- Database/RLS/grant updates needed for provider-backed releases.
- Tests for provider adapters, function behavior, normalization, database
  security, and UI/service behavior.

## Out Of Scope

- Discogs implementation unless separately approved after current developer-doc
  verification.
- Photo/image recognition.
- User image upload or Supabase Storage workflow.
- AI curator or model calls.
- Recommendations.
- Conversational refinement.
- Listening history.
- Ratings.
- Favorites.
- Notes.
- Full browse/search/filter milestone.
- Production deployment.
- RAG.
- Vector database.
- Multi-agent runtime.
- Final visual redesign.

## User Flow

1. Authenticated user opens the existing authenticated app shell.
2. User enters a catalog search query such as artist and album title.
3. Browser calls an authenticated Netlify Function, not the provider directly.
4. Function validates input, applies provider throttling rules, calls
   MusicBrainz, optionally checks Cover Art Archive for cover metadata, and
   returns normalized candidates.
5. UI displays candidates with enough metadata to choose a release.
6. User selects one exact candidate.
7. Browser sends the selected provider/release identifier to a Netlify Function.
8. Function re-fetches or verifies the selected release from the provider,
   normalizes the trusted response, upserts the provider-backed release, and
   creates a `collection_item` for the authenticated user.
9. UI updates the collection list and shows a success notice.

Ambiguous candidates must not be persisted without user confirmation.

## Provider Boundary

Recommended trust boundary:

- Browser: renders UI, holds the Supabase session, sends the Authorization
  bearer token, collects search input, displays candidates, and sends only the
  selected provider/release ID after confirmation.
- Netlify Functions: require a valid Supabase user session/JWT for both
  `/api/catalog/search` and `/api/catalog/add`; perform provider HTTP calls,
  User-Agent, request pacing, timeout, response validation, normalization,
  sanitized errors, and privileged provider-backed persistence if approved.
- Supabase: stores normalized releases and user-owned collection items; RLS
  continues to protect user-owned rows.

Even though MusicBrainz read-only calls do not require a provider secret, server
functions are recommended because M4 is an authenticated collection workflow and
should avoid becoming an unauthenticated public proxy to MusicBrainz. The server
boundary also protects the application request budget, normalizes provider
responses, and supports trusted writes for shared provider-backed release rows.

## Normalized Catalog Candidate Contract

Provider responses should be normalized before reaching React components. The
browser-facing response may include transient display fields that are not
durable database fields.

Proposed transient candidate shape:

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
  transientCoverDisplayUrl: string | null
  derivedProviderPageUrl: string
}
```

The browser should not depend on raw MusicBrainz or Cover Art Archive payloads.

Proposed durable database fields are narrower:

- `provider`
- `provider_release_id`
- `provider_release_group_id`
- existing normalized factual metadata from M3

Do not persist `transientCoverDisplayUrl` or `derivedProviderPageUrl` merely
because they are useful in the search response.

## Persistence Behavior

Recommended M4 persistence model:

- Provider-backed releases are canonical/shared reference rows.
- Manual releases remain creator-owned rows from Milestone 3.
- Normal authenticated browser users should not directly insert or update
  provider-backed releases.
- A Netlify Function should revalidate the selected provider release before
  persistence.
- The function should upsert by `(provider, provider_release_id)`.
- The function should create a `collection_item` for the authenticated user.
- Duplicate owned copies remain allowed unless a later reviewed UX adds an
  intentional duplicate warning.

Proposed `releases` evolution:

- Expand `source` from `manual` only to at least `manual` and `catalog`.
- Add nullable `provider`.
- Add nullable `provider_release_id`.
- Add nullable `provider_release_group_id`.
- Keep existing artist/title/year/label/catalog_number/country/format columns.
- Do not add `genres`, `styles`, `tracklist`, raw provider JSON, embeddings, or
  persisted `decade` in M4 unless human review expands scope.
- Do not add `cover_image_url`, `cover_thumbnail_url`, or `external_url` by
  default. Cover and provider page URLs can be derived transiently from provider
  IDs unless a concrete persistence need is approved.

Manual/catalog row distinction:

- Manual rows: `source = 'manual'`, provider fields are null, and `created_by`
  is set for normal newly created manual rows through existing defaults/RLS.
  `created_by` may be null after profile/account deletion, preserving the
  Milestone 3 `ON DELETE SET NULL` behavior.
- Catalog rows: `source = 'catalog'`, provider and provider release ID are not
  null, normalized metadata constraints still hold, and browser users cannot
  directly mutate provider-backed metadata.

Recommended uniqueness:

- A unique partial index on `(provider, provider_release_id)` where both are
  present.

## Provider-Backed Release Sharing Model

Recommended model: shared canonical provider-backed releases.

Rationale:

- Provider identifiers make the row stable enough to share.
- Shared rows reduce duplicate imported metadata across users.
- Future photo recognition can map candidates to the same canonical release.
- Future browse/search/filter can query normalized provider-backed metadata.
- Writes can stay behind Netlify Functions so one browser user cannot modify
  shared metadata seen by another user.

Alternative: creator-owned provider copies.

- Simpler RLS, but duplicates provider metadata per user and delays the
  canonical release architecture already anticipated by M3.

Human approval is required before implementation.

## Security And Credential Rules

- Do not expose provider tokens, Supabase service-role keys, or any privileged
  credentials to the browser.
- MusicBrainz M4 does not require a provider API key.
- If server-side Supabase service-role access is used for canonical release
  upsert, it must exist only as a Netlify/server environment variable.
- Both catalog search and catalog add functions must authenticate the user via
  Supabase Auth/JWT.
- If service-role access is used, it must follow this boundary:
  1. Receive the Authorization bearer token from the browser.
  2. Validate the Supabase user token server-side.
  3. Derive the authenticated user ID from the verified token.
  4. Never accept `user_id` from the request body as authority.
  5. Only after authentication may privileged/service-role DB operations occur.
  6. Keep the service-role key server-only.
  7. Normalize/revalidate provider-backed release writes server-side.
  8. Assign the collection item to the verified authenticated user.
- Service-role bypasses RLS, so function authorization is part of the security
  boundary, not optional application logic.
- Never trust candidate metadata echoed from the browser for persistence.
- Re-fetch or verify the selected provider release server-side by provider ID.
- Validate provider response shape and normalize only allowed fields.
- Sanitize provider errors before returning them to the browser.
- Enforce request size limits and minimum/maximum query lengths.
- Respect MusicBrainz User-Agent and rate-limit guidance.
- Keep raw provider payloads out of database storage unless a later reviewed
  decision justifies them.

## Failure States

The UI and server API must handle:

- Empty or too-short query.
- No results.
- MusicBrainz unavailable.
- Cover Art Archive unavailable or no cover art.
- Rate limit or `503`.
- Timeout.
- Malformed or incomplete provider response.
- Missing optional metadata.
- Server configuration error.
- Unauthorized user.
- Selected provider release no longer resolves.
- Database upsert failure.
- Collection item creation failure.

Failures should be recoverable and should not push the whole authenticated app
into a fatal shell unless the authentication/session boundary itself fails.

## Rate-Limit Behavior

M4 should plan for:

- Authenticated catalog search only.
- Client-side debounce before search requests.
- Small result limits for interactive search.
- Per-instance server request pacing.
- Timeout handling.
- Explicit handling of MusicBrainz `503`.
- No retry storm.
- No background polling.
- Clear user messaging when rate limited.

Known limitation:

- A Netlify serverless function can run in multiple instances, so an in-memory
  throttle/queue is not a hard distributed/global one-request-per-second
  guarantee. For M4's university/demo scope, the proposed controls are
  authenticated search, client debounce, small result limits, per-instance
  pacing, no background polling, `503` handling, and a low-concurrency demo
  assumption. If hard global enforcement becomes a requirement, stop and propose
  shared coordination options for human review.

## Testable Acceptance Criteria

- Human-approved spec and implementation plan exist before code begins.
- Provider strategy and trust boundary are approved before code begins.
- Search uses a Netlify Function and not direct browser calls to providers.
- Search and add require a valid authenticated Supabase user session/JWT.
- Function sets a meaningful MusicBrainz User-Agent.
- Function enforces query validation, timeout, per-instance request pacing, and
  sanitized errors.
- Search returns normalized candidates, not raw provider payloads.
- Candidate persistence requires user confirmation.
- Add flow revalidates selected provider release server-side before persistence.
- Provider-backed release is upserted by provider identifier.
- User-owned `collection_item` is created for the authenticated user.
- Browser cannot mutate provider-backed shared release metadata.
- Anonymous users cannot add catalog records.
- Existing manual CRUD remains working.
- Missing cover art does not block catalog add.
- No direct Cover Art Archive image URL persistence is added by default.
- Existing M3 profile deletion behavior remains valid: deleting a profile sets
  manual `releases.created_by` to null, and null-owner manual releases remain
  inaccessible to normal authenticated users.
- No Discogs, AI, image recognition, ratings, favorites, notes, listening
  history, RAG, vector database, or M5 scope is introduced unless explicitly
  approved.

## Compatibility With Later Milestones

Milestone 5 photo recognition:

- Vision output can later produce search clues and call the same catalog search
  boundary.
- Candidate confirmation can reuse provider-backed release persistence.

Milestone 6 browse/search/filter:

- Provider-backed releases provide normalized artist/title/year/label/country/
  format fields for deterministic browsing.
- Decade should still be derived from `release_year`.

Milestones 7-10:

- Ratings, favorites, notes, and listening history remain user-owned data on or
  near `collection_items`.
- AI curator candidate sets remain limited to user-owned collection items.

## Tool / Skill / MCP Assessment

Existing capabilities are sufficient for M4 planning and likely implementation:

- Git/GitHub for version control and PR workflow.
- Node/npm, Vite, React, TypeScript, Vitest, and React Testing Library.
- Netlify Functions for the server boundary.
- Supabase CLI, Postgres/RLS, and pgTAP for database verification.
- Browser/manual runtime verification.
- Standard HTTP clients and official provider documentation.

No MCP is justified for M4 at this time. A MusicBrainz or Discogs MCP would add
permissions, context cost, and maintenance without a concrete missing capability
because M4 only needs a narrow provider HTTP integration behind explicit service
boundaries.

Reassess tooling only if implementation reveals a concrete gap such as needing
repeatable provider fixture capture, hosted secret management automation, or
large-scale catalog reconciliation.

## Human Decisions Resolved Before Implementation

Resolved by human approval on 2026-08-25:

- MusicBrainz is the primary M4 catalog metadata provider.
- Cover Art Archive may be used only for optional transient cover display tied
  to MusicBrainz release MBIDs.
- Discogs implementation is deferred, not rejected.
- API spike 0001 is dispositioned for M4; MusicBrainz-first is accepted without
  completing the remaining Discogs empirical comparison now.
- Both `GET /api/catalog/search` and `POST /api/catalog/add` require an
  authenticated Supabase user session/JWT.
- Provider calls go through Netlify Functions.
- Server-side service-role access is approved in principle only where necessary
  for provider-backed canonical release persistence, under the mandatory
  verified-token boundary described above.
- Provider-backed catalog releases are shared canonical reference rows.
- Manual Milestone 3 releases remain creator-owned and preserve existing account
  deletion semantics.
- The default durable schema additions are limited to `source` supporting
  `manual | catalog`, nullable `provider`, nullable `provider_release_id`, and
  nullable `provider_release_group_id`, plus the existing normalized factual
  metadata.
- Do not add `external_url`, `cover_image_url`, `cover_thumbnail_url`, raw
  provider JSON, genres, styles, tracklists, embeddings, or persisted decade by
  default.
- Transient response fields such as score, cover display URL, and derived
  provider page URL do not automatically justify durable database columns.
- The university/demo rate-limit model is authenticated search, client debounce,
  small result limits, per-instance server pacing, no background polling,
  explicit MusicBrainz `503` handling, no retry storms, and a low-concurrency
  assumption.
- The MusicBrainz User-Agent is application identification, not a secret.
- No new runtime dependency, MCP, or tool is approved in advance.

Remaining implementation-level details:

- Exact SQL, RLS policy names, function file structure, and tests must still be
  reviewed during implementation.
- If implementation proves a concrete need for a new dependency, tool, or
  stronger distributed rate-limit mechanism, stop and request human approval
  before adding it.

## Stop Point

This specification is approved. Do not begin Milestone 4 implementation until
the approval-recording commit is independently reviewed against GitHub, as
required by the approved implementation plan.

# 0002 Catalog Provider Boundary

Status: accepted

Date: 2026-08-20

Accepted: 2026-08-25

## Context

Milestone 4 introduces external catalog search/add after Milestone 3 established
manual collection CRUD. The project needs release-level provider identifiers,
candidate confirmation, and a safe path for shared provider-backed release
metadata.

Official documentation reviewed during planning indicates:

- MusicBrainz read-only API access currently requires no API key, but does
  require a meaningful User-Agent and respect for rate limiting. The intended
  User-Agent shape is
  `VinylIntelligence/<version> (<contact URL or contact email>)`; this is
  application identification, not a secret.
- Cover Art Archive can provide MusicBrainz-linked cover-art metadata, but cover
  images are legally distinct from MusicBrainz metadata and should not be
  persisted as direct image URLs by default. Cover images are copyrighted by
  their respective copyright owners.
- Discogs terms distinguish CC0 metadata from restricted data such as images,
  marketplace data, and user data. The terms checked were last updated May 27
  2025 and also impose freshness/caching and attribution obligations for API
  content. The official Discogs developer reference returned HTTP `403` to
  automated lookup in this planning session, so endpoint, auth, rate-limit, and
  response-shape details still need manual verification before any Discogs
  implementation.

## Decision

Accepted for Milestone 4 after corrected planning, official provider/terms
review, MusicBrainz empirical spike evidence, and explicit human disposition of
the incomplete Discogs empirical comparison:

- Use MusicBrainz as the primary catalog metadata provider.
- Use Cover Art Archive only for optional transient cover display associated
  with MusicBrainz releases.
- Defer Discogs implementation. Discogs is deferred, not rejected, and may be
  reopened in a later reviewed milestone if MusicBrainz coverage proves
  insufficient for physical/vinyl editions.
- Route catalog search and add through authenticated Netlify Functions.
- Revalidate selected provider releases server-side before persistence.
- Store provider-backed releases as shared canonical reference rows.
- Keep browser users from directly inserting, updating, or deleting
  provider-backed release metadata.
- Use server-only credentials only where justified; no provider or service-role
  secret may be exposed through `VITE_` variables or browser code.
- If service-role is used, validate the browser's Supabase bearer token
  server-side, derive the user ID from that verified token, never accept
  `user_id` from the request body as authority, and only then perform privileged
  persistence for the verified user.
- Preserve Milestone 3 manual-release account-deletion semantics:
  `created_by` may become null after profile deletion, and null-owner manual
  releases remain inaccessible to normal authenticated users.

## Consequences

- The first catalog milestone remains small and achievable.
- The app demonstrates external API integration without requiring provider
  secrets for MusicBrainz reads.
- Server functions centralize User-Agent, authenticated access, per-instance
  request pacing, timeout, response validation, normalization, and privileged
  persistence.
- Shared provider-backed releases support later photo recognition,
  deduplication, and browse/filter behavior.
- Discogs vinyl-specific coverage remains available as a future option but is
  not added before current official developer details are verified.
- Service-role usage, if approved for implementation, raises the importance of
  function-level authentication and explicit tests because service-role bypasses
  RLS.
- A Netlify serverless in-memory throttle is not a hard distributed/global
  rate-limit guarantee. M4 should rely on authenticated search, client debounce,
  small result limits, per-instance pacing, no background polling, `503`
  handling, and the low-concurrency university/demo assumption unless a stronger
  reviewed rate-limit design is approved.

## Alternatives Considered

### Browser Directly Calls MusicBrainz

- Pros: no provider secret and less backend code.
- Cons: User-Agent/contact, throttling, provider error handling, response
  validation, abuse prevention for an unauthenticated public proxy, and future
  Discogs secrets become harder to govern consistently.

### Discogs First

- Pros: strong vinyl/release orientation.
- Cons: current official developer reference could not be verified through
  automated docs; terms include restricted data categories; likely credential
  and image-use questions remain.

### Implement Both MusicBrainz And Discogs In M4

- Pros: better coverage comparison.
- Cons: violates scope control by adding provider complexity before the first
  catalog flow is proven.

### Creator-Owned Provider Release Copies

- Pros: simpler RLS.
- Cons: duplicates canonical provider metadata per user and delays the shared
  release model already anticipated by Milestone 3.

## Acceptance Record

The human accepted this ADR on 2026-08-25.

Acceptance basis:

- Corrected Milestone 4 specification and implementation plan.
- Official MusicBrainz, Cover Art Archive, and Discogs Terms review.
- MusicBrainz empirical spike evidence for the four planned sample searches.
- Explicit human disposition of the incomplete Discogs empirical comparison.
- Human approval that M4 should prove one safe deterministic catalog integration
  rather than maximize provider count.

Implementation may begin only after the approval-recording commit containing
this accepted ADR is independently reviewed against GitHub.

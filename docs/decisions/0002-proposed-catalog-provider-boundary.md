# 0002 Proposed Catalog Provider Boundary

Status: proposed

Date: 2026-08-20

## Context

Milestone 4 introduces external catalog search/add after Milestone 3 established
manual collection CRUD. The project needs release-level provider identifiers,
candidate confirmation, and a safe path for shared provider-backed release
metadata.

Official documentation reviewed during planning indicates:

- MusicBrainz read-only API access currently requires no API key, but does
  require a meaningful User-Agent and respect for rate limiting.
- Cover Art Archive can provide MusicBrainz-linked cover-art metadata.
- Discogs terms distinguish CC0 metadata from restricted data such as images,
  marketplace data, and user data. The official Discogs developer reference was
  not retrievable by automated lookup in this planning session, so endpoint,
  auth, and rate-limit details still need manual verification before any Discogs
  implementation.

## Proposed Decision

If approved for Milestone 4:

- Use MusicBrainz as the primary catalog metadata provider.
- Use Cover Art Archive only for optional cover-art references associated with
  MusicBrainz releases.
- Defer Discogs implementation until current official developer documentation
  and token requirements are manually verified.
- Route catalog search and add through Netlify Functions.
- Revalidate selected provider releases server-side before persistence.
- Store provider-backed releases as shared canonical reference rows.
- Keep browser users from directly inserting, updating, or deleting
  provider-backed release metadata.
- Use server-only credentials only where justified; no provider or service-role
  secret may be exposed through `VITE_` variables or browser code.

## Consequences

- The first catalog milestone remains small and achievable.
- The app demonstrates external API integration without requiring provider
  secrets for MusicBrainz reads.
- Server functions centralize User-Agent, throttling, timeout, response
  validation, normalization, and privileged persistence.
- Shared provider-backed releases support later photo recognition,
  deduplication, and browse/filter behavior.
- Discogs vinyl-specific coverage remains available as a future option but is
  not added before current official developer details are verified.
- Service-role usage, if approved for implementation, raises the importance of
  function-level authentication and explicit tests because service-role bypasses
  RLS.

## Alternatives Considered

### Browser Directly Calls MusicBrainz

- Pros: no provider secret and less backend code.
- Cons: User-Agent/contact, throttling, provider error handling, response
  validation, and future Discogs secrets become harder to govern consistently.

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

## Approval Required

This ADR is not accepted yet. It exists to make the provider, trust-boundary, and
provider-backed sharing decisions reviewable before Milestone 4 implementation.

# 0008 Discogs Secondary Catalog Provider

Status: **proposed** — not yet implemented. Specification approval pending
human review. This decision, if approved, will be executed via
`docs/specs/0018-discogs-secondary-catalog-provider.md` and a companion
implementation plan (`docs/plans/018-discogs-secondary-catalog-provider.md`,
not yet written).

Baseline `main` at decision-drafting time:
`750d3e1bb492dff4d9f3ef1013be6a02e6193b86` (the merged Discover &
MusicBrainz Navigation Enhancement closeout, tagged
`ase26-final-submission-2026-09-16`).

Date: 2026-09-16

## Relationship to ADR 0002

**This decision extends and reopens the deferred Discogs question recorded
in `docs/decisions/0002-proposed-catalog-provider-boundary.md`. It does not
rewrite, contradict, or invalidate ADR 0002.** ADR 0002 remains unchanged and
correct as a record of what was decided at Milestone 4 planning time, and
why: MusicBrainz was accepted as the sole catalog provider, and ADR 0002
itself stated explicitly —

> Defer Discogs implementation. Discogs is deferred, not rejected, and may
> be reopened in a later reviewed milestone if MusicBrainz coverage proves
> insufficient for physical/vinyl editions.

ADR 0002 also already flagged, at that time, that the official Discogs
developer reference returned HTTP 403 to automated lookup, and that
"endpoint, auth, rate-limit, and response-shape details still need manual
verification before any Discogs implementation." This decision records that
manual verification now having occurred (Context, below), and reopens
exactly the question ADR 0002 left open — nothing more.

## Context

- Milestone 4's MusicBrainz integration (spec 0005) succeeded and has been
  in production use since, including through the Hebrew & Multilingual
  Record Support enhancement (spec 0015 / ADR 0007) and the Discover &
  MusicBrainz Navigation Enhancement (spec 0017).
- Real hands-on final-submission product use exposed a genuine MusicBrainz
  coverage gap for at least one physical, Israeli/Hebrew-language vinyl
  release (Artist כהן, Title מה שאפשר עם מה שנשאר, 2023, Shigola
  Records/Hasivuv, catalog number `HSV005`) that MusicBrainz did not surface
  but Discogs did — exactly the risk ADR 0002 anticipated.
- ADR 0002 deferred implementing Discogs specifically because the official
  Discogs API documentation was inaccessible to automated tooling during
  Milestone 4 planning, leaving endpoint/auth/rate-limit/response-shape
  facts unverified.
- A human-run Phase-0 empirical verification was completed on 2026-09-16
  directly against the live Discogs API (not through automated tooling,
  which independently hit the same access block again during this
  decision's own research — a persistent, known constraint of this
  project's tooling environment, not a new problem): the public API root,
  a public exact release lookup, and an authenticated Database Search all
  returned HTTP 200; header-based personal-access-token authentication
  worked correctly once a clean (uncontaminated) token was supplied; a real
  Hebrew-language query returned correct, well-structured Vinyl release
  candidates, including three related releases (two vinyl, one digital)
  sharing a single Discogs Master ID — concrete evidence that Discogs
  Release identity, not Master identity, must be the unit of ownership.
- The current official Discogs API Terms of Use, reviewed for
  `docs/specs/0018-discogs-secondary-catalog-provider.md`, confirm the
  manual-verification gap ADR 0002 left open is now resolved sufficiently
  to proceed to specification, subject to two material, first-class
  constraints this decision explicitly accepts and designs around: a
  six-hour content-freshness/caching rule, and a mandatory
  per-item attribution requirement.

## Decision

Pending human approval of `docs/specs/0018-discogs-secondary-catalog-provider.md`:

- **MusicBrainz remains the sole primary catalog provider** for every
  existing surface (Discover, Scan, VIN). This decision does not change
  that.
- **Discogs is approved as an explicit, user-triggered secondary/fallback
  provider only** — never queried automatically, never merged or ranked
  together with MusicBrainz results, never used for automatic
  cross-provider equivalence matching.
- **Discogs Release ID is the exact owned-record identity**
  (`provider = 'discogs'`, `provider_release_id` = the Discogs Release ID).
  **Discogs Master ID is grouping metadata only**
  (`provider_release_group_id`) and must never be treated as ownership
  identity — mirroring the existing MusicBrainz release/release-group
  pattern exactly, and directly evidenced as necessary by the Phase-0
  three-releases-one-master observation.
- **Authentication uses a server-only Discogs personal access token**
  (`DISCOGS_TOKEN`), sent via the `Authorization: Discogs token=...` header
  from server code only. No OAuth end-user login flow and no Consumer
  Key/Secret application-registration flow is required or introduced for
  this enhancement's scope.
- **Only CC0-classified catalog metadata is used** — release titles, dates,
  formats, artist names, label names, and catalog numbers. Discogs
  Restricted Data (images, Marketplace data, user data) is explicitly
  excluded, in full, from this decision's scope.
- **No Discogs images, Marketplace data, pricing, sales history, account
  sync, or OAuth access of any kind.**
- **A six-hour content-freshness invariant is required**: Discogs-sourced
  catalog metadata already persisted by Vinyl Intelligence must never be
  displayed as current once more than six hours have passed since it was
  last successfully revalidated against the live Discogs API; a failed
  revalidation must degrade to an honest unavailable/retry state, never a
  silent display of stale data as current.
- **Ownership/duplicate-copy detection becomes provider-qualified**
  (`(provider, provider_release_id)`), not `provider_release_id` alone.
- **No automatic cross-provider equivalence matching** — a record added
  once through MusicBrainz and once through Discogs for what a human would
  recognize as the same physical pressing is intentionally treated as two
  distinct catalog identities in v1; this limitation must be disclosed
  honestly in the product UI, not hidden.

## Consequences

- One additional provider-specific integration boundary (a new Discogs
  adapter module, mirroring `musicbrainz.ts`'s existing shape) is added to
  the codebase, alongside its own pacing/rate-limit/error-handling logic
  independent of MusicBrainz's.
- A forward-only database migration is required to widen the existing
  catalog-identity check constraint from accepting only `provider =
  'musicbrainz'` to accepting `'musicbrainz'` or `'discogs'`, plus a new
  nullable `provider_fetched_at` freshness-marker column. No existing row,
  policy, or grant is weakened or rewritten.
- Every UI surface that reads or displays catalog-provider identity
  (Record Detail's provenance link, `AlbumArtwork`'s cover-art source
  selection, the owned-release/duplicate-copy check) must become
  provider-aware — several of these currently make an unstated
  MusicBrainz-only assumption that this enhancement corrects as a
  necessary, in-scope side effect, not scope creep.
- A first-class freshness-handling mechanism (§12 of spec 0018) is required
  wherever Discogs-derived metadata is displayed — a genuinely new kind of
  runtime behavior this codebase has not needed for MusicBrainz (which
  carries no equivalent contractual freshness restriction), adding real,
  bounded complexity that must be sized carefully in Plan 018 to fit the
  project's remaining timeline.
- A mandatory, per-item Discogs attribution/link requirement adds a small
  but real, non-optional UI element to every Discogs-sourced surface.
- VIN's **existing** server-side owned-collection read path
  (`loadOwnedCollection`) already reads release metadata directly from the
  same shared `releases` rows this decision extends to Discogs, with no
  provider or freshness awareness today — confirmed by inspection, not a
  hypothetical. This decision therefore requires that path (and
  `loadCollection`'s equivalent client-side read) to become freshness-safe
  plumbing, without any change to VIN's model, prompt, or ranking logic.
- Materially better catalog coverage for physical vinyl releases,
  including verified real-world Israeli/Hebrew examples MusicBrainz did not
  surface — the concrete product benefit motivating this decision.
- Slightly higher overall runtime/provider complexity and one additional
  server-only secret (`DISCOGS_TOKEN`) to provision and govern, consistent
  with the existing `MUSICBRAINZ_USER_AGENT`/OpenRouter secret-management
  pattern already in place.

## Alternatives Considered

- **MusicBrainz only, indefinitely** — rejected: the demonstrated coverage
  gap is real, reproducible, and exactly what ADR 0002 anticipated
  revisiting; declining to reopen it after empirical evidence exists would
  leave a known, documented product limitation unaddressed for no new
  reason.
- **Discogs replacing MusicBrainz as primary** — rejected: MusicBrainz's
  existing integration (search modes, pacing, exact-URL lookup, Cover Art
  Archive artwork, no-API-key access) is mature, already deployed, and
  performs well for the large majority of releases; there is no evidence
  MusicBrainz coverage is broadly insufficient, only that specific
  physical/regional pressings are sometimes missing. Replacing the primary
  provider would be a materially larger, riskier change than the actual
  problem warrants.
- **A combined MusicBrainz+Discogs search with unified ranking** — rejected:
  this is explicitly the kind of automatic cross-provider equivalence
  inference this decision declines to build (no reliable way to know two
  differently-shaped provider records represent the same physical pressing
  without human judgment), and it would silently violate the "MusicBrainz
  remains primary, Discogs is an explicit fallback" product framing this
  decision is built around.
- **Discogs used only as a transient, never-persisted discovery aid**
  (identify, then require the user to re-enter data manually) — rejected on
  product-design grounds, not a compliance conclusion: it would discard
  exactly the structured, already-verified metadata (§9/§10 of spec 0018) a
  server-side exact lookup already produces, forcing the user to retype
  facts the app already has confirmed correctly, for materially worse UX
  than the chosen persistent-provider design, without spec 0018's own §12
  freshness-invariant approach requiring that sacrifice.
- **Automatic cross-provider fuzzy dedupe** (attempting to detect that a
  Discogs candidate and an already-owned MusicBrainz release are "probably"
  the same physical record) — rejected: no reliable identity signal exists
  across providers without risking false-positive merges of genuinely
  different pressings/editions, which would corrupt collection accuracy;
  explicitly deferred, not solved, in this decision (spec 0018 §7).
- **Using Discogs images** — rejected: images are explicitly classified as
  Discogs Restricted Data (not CC0) under the current official API Terms of
  Use, and this codebase has no existing image-proxy or cache
  infrastructure for any provider to build this safely and compliantly
  within this enhancement's timeline. (Whether the image endpoint carries
  its own separate, tighter rate limit was not independently confirmed
  against the current official Terms during this decision's own research —
  this rejection rests on the confirmed Restricted-Data classification and
  the lack of existing infrastructure, not on an unverified numeric limit.)
  The existing branded fallback and already-shipped custom-cover-upload
  feature already cover this need with zero new code.

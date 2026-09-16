# 0018 Discogs Secondary Catalog Provider (Specification)

Status: **SPECIFICATION PROPOSED — NOT IMPLEMENTED.** No runtime, schema,
migration, dependency, or environment change has been made. This document is
the primary behavioral contract; a companion implementation plan
(`docs/plans/018-...`) is required and must be human-approved before any
implementation begins, following the same discipline as every prior
milestone/enhancement (`AGENTS.md` "Development Workflow"). This is a
deliberate, human-requested, post-freeze product enhancement — not Milestone
13, not a course-required gate, and not a replacement for Milestone 4
(`docs/specs/0005-milestone-4-catalog-api.md`) or ADR 0002
(`docs/decisions/0002-proposed-catalog-provider-boundary.md`); it extends
both, and explicitly reopens the deferred decision in ADR 0002 rather than
rewriting it (see `docs/decisions/0008-discogs-secondary-catalog-provider.md`).

Baseline `main` when this spec was written: `750d3e1bb492dff4d9f3ef1013be6a02e6193b86`
(the merged Discover & MusicBrainz Navigation Enhancement closeout, tagged
`ase26-final-submission-2026-09-16`). Accepted production runtime remains
`abff1e86cbc36c754e8645179fa5bbee9ec27afe`, deploy `6aaa63fe2829c87037fd2cd0`.
This spec does not change either. The historical freeze tags
`ase26-final-submission-2026-09-15` and `ase26-final-submission-2026-09-16`
remain permanent, unmoved evidence of what shipped before this enhancement
began. A new tag is created only after this enhancement's own full closeout
(§24, §25), and only by explicit separate human action.

## 0. What this is, and what it is not

This is a **deliberate, human-requested, post-freeze product enhancement**,
motivated by a real coverage gap discovered during final hands-on product use
(§1) and confirmed by manual, human-run Phase-0 empirical verification on
2026-09-16 (§5.1). It is not:

- a replacement for MusicBrainz — MusicBrainz remains the sole primary
  catalog provider for the whole product;
- an automatic multi-provider search — Discogs is never queried unless the
  user explicitly triggers it after a MusicBrainz search has already run;
- a rewrite of Discover, Scan, VIN, or the catalog-add pipeline — every
  existing MusicBrainz-backed behavior is contractually unchanged;
- a reopening of ADR 0002's primary-provider choice — ADR 0002 remains
  unchanged and correct; this spec extends it with a narrowly-scoped
  secondary-provider decision (ADR 0008);
- an AI feature — no OpenRouter, Vision, or VIN involvement of any kind.

It follows the same discipline as every prior post-freeze enhancement in this
project (Hebrew & Multilingual Record Support, Final Submission Alignment,
Discover & MusicBrainz Navigation Enhancement): spec → human-approved plan →
implementation → independent review → merge → deploy → human production
acceptance → documentation closeout, each a separately reviewed PR.

## 1. Product Problem

Milestone 4 (`docs/specs/0005-milestone-4-catalog-api.md`) selected
MusicBrainz as the sole catalog provider after a documented spike (ADR 0002),
which explicitly noted MusicBrainz's coverage of physical/vinyl pressing
detail was an open risk and that **"Discogs is deferred, not rejected, and
may be reopened in a later reviewed milestone if MusicBrainz coverage proves
insufficient for physical/vinyl editions."**

During real hands-on final-submission product use, that risk materialized: a
real Hebrew-language physical vinyl release —

- Artist: כהן
- Title: מה שאפשר עם מה שנשאר
- Year: 2023, Israel
- Labels: Shigola Records, Hasivuv (catalog number `HSV005`)
- Format: Vinyl (LP, Album)

— was not discoverable through Discover's MusicBrainz search (spec 0017),
despite being present in Discogs with a complete, well-structured catalog
entry (§5.1). This is exactly the coverage gap ADR 0002 anticipated and
deliberately left open for later reopening, not a new or unrelated problem.

Discogs is well known for materially deeper coverage of vinyl-specific
pressing detail, small/independent/regional labels, and older or
niche-market physical releases than MusicBrainz — this is the entire reason
ADR 0002 flagged it as a live risk rather than a closed question.

## 2. Goals

A. Close the demonstrated MusicBrainz coverage gap for physical vinyl
   releases, without weakening MusicBrainz's role as primary provider (§6).
B. Provide a deliberate, clearly-labeled, user-triggered fallback search
   path — never an automatic second query (§6, §8, §17).
C. Reuse the existing catalog-add trust boundary and security posture
   exactly, extended to a second provider identity (§9, §16).
D. Establish a correct, provider-qualified release identity contract so
   Discogs and MusicBrainz releases can never collide or be silently
   conflated (§7).
E. Comply with the current official Discogs API Terms of Use, treated as a
   first-class architectural constraint, not an afterthought — in
   particular the six-hour content-freshness rule (§12) and the mandatory
   attribution requirements (§13).
F. Keep the enhancement small and bounded, matching the project's demonstrated
   post-freeze delivery pace (spec 0017 as the most recent precedent) —
   explicit, extensive non-goals (§3) protect this.

## 3. Non-Goals

Explicitly out of scope for this enhancement:

- replacing MusicBrainz as the primary catalog provider;
- automatic Discogs fallback — Discogs is never queried until the user
  explicitly triggers a Discogs search after their own MusicBrainz search;
- merging MusicBrainz and Discogs results into one combined/ranked list;
- automatic cross-provider equivalence/fuzzy matching — a Discogs release
  and a MusicBrainz release are never claimed to represent the same physical
  pressing merely because artist/title/year look similar (§7);
- using Discogs Master identity as owned-record identity — Release identity
  only (§6, §7);
- Discogs pagination / "Load more" — v1 returns at most 5 bounded candidates
  from a single search action (§8);
- Discogs Artist/Album search modes (spec 0017's three-mode design is a
  MusicBrainz-specific investment, not duplicated here);
- an exact Discogs release **URL** paste/import mode (spec 0017 §10's
  MusicBrainz-specific feature; not extended to Discogs in this enhancement);
- Discogs Master/release-group search or import;
- Discogs images of any kind — not persisted, not proxied, not displayed
  (§11, §14);
- Discogs Marketplace, pricing, sales history, or inventory data;
- Discogs user-account data, Collection/Wantlist synchronization, or any
  OAuth end-user login flow — a server-only personal access token is
  sufficient for this enhancement's read-only Database Search / Release
  lookup use (§5.2, §16);
- any change to Scan's vision model, prompt, schema, recognition flow, or
  candidate source — Scan continues to search MusicBrainz only, unchanged;
- any change to VIN (model, prompt, schema, rate limits, candidate
  contract, or provider awareness);
- database schema redesign or removal of existing provider validation — only
  a forward, additive widening of the existing catalog-identity constraint
  (§20);
- a new runtime dependency;
- RAG, embeddings, or any new AI/model call of any kind;
- a general UI redesign — the existing Discover design and layout are
  preserved; the Discogs fallback is one small, clearly-labeled addition
  (§17);
- bulk import or background/scheduled provider crawling of any kind.

## 4. Current Implementation — Findings That Inform This Spec

Verified by direct source inspection at the baseline commit above (§0), not
assumed from memory or from ADR 0002's original 2026-08-20 research.

| Area | File | Current behavior |
| --- | --- | --- |
| Provider type | `src/lib/catalog/types.ts` | `CatalogProvider = 'musicbrainz'` — a single string-literal type; no second provider is representable today. |
| Catalog-identity DB constraint | `supabase/migrations/20260826000100_add_catalog_releases.sql` | `releases_manual_catalog_identity` requires, for `source = 'catalog'`: `created_by is null and provider is not null and provider = 'musicbrainz' and provider_release_id is not null` — hardcoded to the single literal `'musicbrainz'`. A forward migration is required to admit `'discogs'`. |
| Provider identity uniqueness | same migration | `releases_provider_release_identity_unique` is **already** `unique (provider, provider_release_id)` — a composite key, not `provider_release_id` alone. This is already the correct shape for a second provider; no change needed here. |
| Provider/id column bounds | same migration | `provider` 1–40 chars, `provider_release_id`/`provider_release_group_id` 1–120 chars, all trimmed. A Discogs numeric release id (e.g. `26770295`, 8 digits) and Discogs master id (e.g. `3058367`) both fit comfortably; no column-length change needed. |
| Catalog-add server validation | `netlify/functions/_shared/catalog-handlers.mts::parseAddRequest` | Hardcodes `if (payload.provider !== 'musicbrainz') throw new CatalogFunctionError('invalid_query', 'MusicBrainz is the only approved Milestone 4 catalog provider.')`, then validates `providerReleaseId` against `MUSICBRAINZ_RELEASE_ID_PATTERN` (a UUID regex) unconditionally. This is the actual server-side gate that must change — not just a type-level change. |
| Catalog-add server runtime path | same file, `handleCatalogAdd` | After validation, the function is single-threaded through MusicBrainz-only dependencies: `dependencies.lookupRelease` (typed `typeof lookupMusicBrainzRelease`), the `MUSICBRAINZ_USER_AGENT` env var, and MusicBrainz-only release-group genre enrichment. A second provider requires branching this function by `provider`, not a config change. |
| Dependency-injection seam | same file, `CatalogFunctionDependencies` | 100% MusicBrainz-shaped (`lookupRelease`, `lookupReleaseGroupGenres`, `searchReleases`, `paceProviderRequest` all typed against `musicbrainz.ts` functions). No seam exists yet for a second provider's adapter. |
| Search request parsing | same file, `parseCatalogSearchRequest` | No `provider` parameter exists at all; the normal-search branch always calls the single `dependencies.searchReleases` (MusicBrainz). The exact-lookup branch (`releaseId` param) validates against `MUSICBRAINZ_RELEASE_ID_PATTERN` and is explicitly **not** extended to Discogs by this spec (§3). |
| Provider rate limiting | same file | `MUSICBRAINZ_PACING_MS = 1000`, a single module-scoped `nextMusicBrainzRequestAt` clock, and one bounded rate-limit retry (`lookupReleaseWithRateLimitRetry`) — all MusicBrainz-specific. A second provider must not share this clock (its own limits differ, §5.2/§17). |
| Release-ID validation | `src/lib/catalog/musicbrainzIdentity.ts::MUSICBRAINZ_RELEASE_ID_PATTERN` | A strict UUID-shaped regex. Reused today (correctly) for MusicBrainz in both the add path and the exact-lookup path. Must **not** be reused, even loosely, as a generic catalog-id validator for a numeric Discogs release id (§14). |
| Owned-release detection | `src/lib/catalog/ownedRelease.ts::isExactCatalogReleaseOwned` | Compares `provider_release_id` alone against the owned collection — not provider-qualified. Must become a `(provider, provider_release_id)` comparison (§7). |
| Collection data loading | `src/lib/supabase/collection.ts::loadCollection`, `CollectionItemWithRelease` | The Supabase `select` and the TypeScript type both omit the `provider` column entirely — only `provider_release_id`, `provider_release_group_id`, and `source` are fetched/typed. `provider` must be added to both before any UI can branch on it. |
| Record Detail provenance | `src/pages/AlbumDetailPage.tsx` | Unconditionally calls `musicBrainzReleaseUrl(release.provider_release_id)` and renders "MusicBrainz" / "View on MusicBrainz" / "Catalog details come from MusicBrainz" for **any** non-editable catalog release, with no check on `provider` (which isn't loaded — row above). A Discogs-backed release would show no link (the MBID regex safely returns `null`) but would still show the wrong "…from MusicBrainz" copy — a real, confirmed defect this spec must close. |
| Cover artwork | `src/media/AlbumArtwork.tsx`, `src/media/coverArtUrl.ts` | `AlbumArtwork` itself is safe by construction: `isMbid()` rejects any non-UUID string before building a Cover Art Archive URL, so a Discogs numeric id passed in today fails harmlessly to the branded fallback. Its **callers** (`DiscoverPanel.renderCandidate`, `ScanPanel`, `AlbumDetailPage`) wire `provider_release_id`/`provider_release_group_id` into `releaseMbid`/`releaseGroupMbid` unconditionally, regardless of provider — correct today only by accident of the regex guard, not by explicit design. This spec requires explicit provider gating instead (§14). |
| Discover UI copy | `src/catalog/DiscoverPanel.tsx` | Every visible string ("Search on MusicBrainz", the per-candidate "MusicBrainz" link, the exact-URL placeholder `https://musicbrainz.org/release/...`) is MusicBrainz-specific and not designed to host a second provider inline — confirms a Discogs fallback needs its own clearly-separate surface (§17), not a blend into the existing mode selector. |
| Scan | `src/catalog/ScanPanel.tsx` | Calls `searchCatalog(client, query)` (the pre-0017 MusicBrainz-only wrapper, spec 0017's own compatibility contract) — Scan candidates can never carry `provider: 'discogs'` under this spec, so Scan requires **no** code change for this enhancement to be correct (confirmed structurally, not merely declared out of scope). |
| Test fixtures | `supabase/tests/database/catalog_releases_rls.test.sql` | Hardcodes `'musicbrainz'` as the only tested `provider` value in its fixtures and constraint assertions. A Discogs-provider fixture and constraint-acceptance/-rejection assertion are required additions (§21). |

## 5. Discogs Facts vs. Vinyl Intelligence Decisions

This section separates three distinct kinds of claim: **(A)** repository
facts (§4, above), **(B)** empirically verified Phase-0 provider facts
obtained by the human on 2026-09-16, and **(C)** the current official Discogs
API Terms of Use as reviewed for this spec — from **(D)** the product
decisions Vinyl Intelligence is making on top of them. No claim in (B) or (C)
is treated as an eternal guarantee; §16/§17 require the runtime to remain
correct even if these facts drift.

### 5.1 Empirically verified Phase-0 facts (human-run, 2026-09-16)

Obtained by the human directly against the live Discogs API. Not repeated by
this spec, and not to be repeated as a live provider call during
specification or planning (`AGENTS.md` — no real provider calls without
explicit human authorization).

- `GET https://api.discogs.com/` — public API root responded HTTP 200.
- `GET https://api.discogs.com/releases/249504` — public exact release
  lookup responded HTTP 200 with no authentication required for a public
  release read.
- `GET https://api.discogs.com/database/search` — authenticated Database
  Search responded HTTP 200.
- Working authentication: header `Authorization: Discogs token=<PERSONAL_ACCESS_TOKEN>`.
  The clean personal access token observed was 40 alphanumeric characters.
  **No token value is recorded anywhere in this document or this
  repository.** The earlier authentication failures during Phase-0 were
  caused by terminal control characters accidentally contaminating a copied
  credential, not by any flaw in the token/header mechanism itself — once a
  clean token was supplied, both search and header authentication returned
  HTTP 200.
- Observed authenticated-search rate-limit response headers on that request:
  `x-discogs-ratelimit: 60`, `x-discogs-ratelimit-remaining: 60`,
  `x-discogs-ratelimit-used: 0`. This is a **single observation**, not an
  eternal guarantee (§5.3) — the implementation must still handle a lower
  effective limit, a 429/rate-limited response, or a changed header shape
  gracefully (§16, §17).
- Database Search confirmed, empirically: the `q` free-text parameter
  performs search; `type=release` scopes results to releases; pagination
  exists (not used in v1, §8); a release search result exposes both a
  release `id` and a `master_id`; Hebrew query text is accepted and returns
  correct results (the real query below).
- A real Hebrew-language Database Search query —

  ```
  q = "כהן מה שאפשר עם מה שנשאר"
  type = release
  ```

  — returned, among other results, three related Discogs releases sharing
  one master:

  | Discogs Release ID | Format | Notes |
  | --- | --- | --- |
  | `26770295` | Vinyl — LP, Album, qty 2 | Title מה שאפשר עם מה שנשאר, artist כהן, year 2023, country Israel, labels Shigola Records / Hasivuv, catalog number `HSV005`, genre Hip Hop, 15 tracks |
  | `26770436` | Vinyl | A second, distinct vinyl release of the same work |
  | `20370835` | File / AAC / Album, 2021 | A digital release — not vinyl, and therefore not eligible for Discogs catalog add under this spec (§8) |

  All three share Discogs **Master ID `3058367`**. This is the concrete,
  empirical evidence for why **Release** identity — not Master identity — is
  required as owned-record identity (§7): three genuinely different
  physical/digital editions, only some of them vinyl, share one Master.
- Exact Release lookup (`GET /releases/{id}`) was confirmed, empirically, to
  expose at least the following useful fields: `id`, `title`,
  `artists_sort`, `year`, `released`, `country`, `master_id`, `genres`,
  `styles`, `formats`, `labels` (with catalog numbers), `identifiers`,
  `tracklist`, `date_added`, `date_changed`.

### 5.2 Current official Discogs API Terms of Use (reviewed for this spec)

Source: `https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use`
(the current official terms; ADR 0002 already noted this exact document
returned HTTP 403 to automated fetch tooling during the original Milestone 4
spike, and the same block was independently re-confirmed during this spec's
own research — a persistent, known access constraint from this project's
tooling environment, not a new problem). The clauses below are the ones
material to this spec's design; they must be independently re-verified by a
human directly opening the live page before implementation begins (§26).

- **Authentication:** a personal access token (`discogs.com/settings/developers`)
  sent as `Authorization: Discogs token=<token>` is sufficient for read-only
  Database Search and Release lookup — confirmed both by the terms and by
  Phase-0 empirical evidence (§5.1). No OAuth end-user login and no
  Consumer Key/Secret flow is required for this enhancement's scope.
- **Rate limits:** authenticated requests are limited to 60/minute (a moving
  60-second window); unauthenticated requests to 25/minute. Response headers
  `X-Discogs-Ratelimit`, `X-Discogs-Ratelimit-Used`,
  `X-Discogs-Ratelimit-Remaining` report the current state. Image requests
  are separately, much more tightly limited: 1/second and 1,000/day, **per
  application ID** (i.e. a shared budget across every Vinyl Intelligence
  production user, not per-user) — one of the reasons Discogs images are out
  of scope (§3, §11, §14).
- **Data classification — CC0 vs. Restricted Data:** the terms distinguish
  CC0-licensed catalog metadata (release titles, dates, formats, track
  listings, barcodes/identifiers, credits, versions, artist names,
  label/producer/manufacturer/distributor names) from **Restricted Data**,
  which explicitly includes Discogs user data, Marketplace data, and
  **images**. This spec uses **only** the CC0 catalog-metadata fields listed
  in §9/§11; Restricted Data of every kind is out of scope.
- **Six-hour freshness / caching rule (first-class, §12):** *"you may not
  display... the Content if it is more than six (6) hours older than the
  information on Discogs' online properties... and you may not cache or
  store the Content longer than is necessary to provide a service to your
  application's users."* This is the single most architecturally significant
  constraint this spec must satisfy, and is treated as such throughout (§12).
- **Attribution (first-class, §13):** a prominent, one-time, app-level
  notice — *"This application uses Discogs' API but is not affiliated with,
  sponsored or endorsed by Discogs. 'Discogs' is a trademark of Zink Media,
  LLC."* — plus, directly adjacent to **every** piece of Discogs-sourced data
  displayed to a user, the text *"Data provided by Discogs."* with a normal
  (non-`nofollow`) hyperlink to the corresponding Discogs page for that
  exact data.
- **Commercial use:** charging users a fee for functionality Discogs
  provides free of charge requires Discogs's express written permission.
  Vinyl Intelligence is a free, non-commercial course project with no fees,
  ads, or paid tiers of any kind related to this feature — this spec
  proceeds on that basis, but this determination is recorded here as an
  explicit decision (§5.4), not silently assumed, and should be reconfirmed
  by the human before implementation.

### 5.3 What this spec does **not** assume

- A single rate-limit observation (§5.1) is not extrapolated into a
  permanent guarantee of any specific limit, header shape, or response
  latency. §16/§17 require bounded, defensive handling regardless.
- The exact literal Database Search query-parameter names beyond `q` and
  `type` (e.g. whether a dedicated `release_title`/`artist` parameter
  exists and is named exactly that) were **not** independently re-verified
  against the live documentation page during this spec's own research
  (blocked, §5.2) — v1's search scope (§8) deliberately uses only the `q`
  and `type=release` parameters Phase-0 already empirically exercised, and
  does not invent or assume any additional parameter name.
- `date_changed` in a Discogs Release response is **not** treated as this
  application's freshness clock (§12) — it describes Discogs-side edit
  history, not when Vinyl Intelligence itself last fetched the data.
- The three specific Discogs release IDs observed during Phase-0 (§5.1) are
  not assumed to remain valid, unchanged, or even present forever — human
  acceptance testing (§22) must phrase any assertion about them as
  conditional on their still being the current state of a third-party
  catalog, not as a permanent fact this spec locks in.

### 5.4 Vinyl Intelligence product decisions built on those facts

- **Provider boundary (§6):** MusicBrainz remains primary and unconditional;
  Discogs is reached only via an explicit, separately-labeled user action.
- **Identity contract (§7):** `(provider, provider_release_id)` is the
  owned-record identity; Discogs Master ID is stored only as grouping
  metadata (`provider_release_group_id`), exactly mirroring the existing
  MusicBrainz release-group pattern, never as ownership identity.
- **Freshness (§12):** rather than either ignoring the six-hour clause
  (rejected — a real compliance risk) or building a full scheduled-refresh
  subsystem this project has no precedent for (rejected as disproportionate
  for this timeline — see the companion plan for the sizing discussion),
  this spec requires an explicit `provider_fetched_at` freshness marker and
  a **display-time revalidate-or-refuse** invariant: stale Discogs metadata
  is never presented as current: it is either successfully revalidated
  first, or the UI honestly shows an unavailable/retry state. The exact
  mechanism (which surfaces call the freshness check, how revalidation is
  triggered) is a Plan 018 decision, not fixed here (§12).
- **Images (§14):** given the CC0/Restricted-Data split (§5.2) explicitly
  places images outside CC0, the separate and much tighter image rate
  limit, and this project's complete lack of existing image-proxy/cache
  infrastructure for any provider, Discogs images are excluded from v1
  entirely — the existing branded fallback and custom-cover-upload feature
  already handle "facts but no usable image" gracefully, with zero new code.
- **Non-commercial-use basis (§5.2):** recorded here as the explicit basis
  for proceeding without seeking Discogs's separate written permission;
  this record itself is the human-facing decision point (§26).

## 6. Architecture Decision — Provider Boundary

MusicBrainz remains the **sole primary** catalog provider for every existing
surface (Discover's three-mode search, Scan, the exact-URL lookup, VIN).
Discogs is an **explicit, user-triggered fallback**, reached only after the
user has already searched MusicBrainz and indicates they could not find the
release. There is **no** automatic Discogs request on every, or any,
MusicBrainz search.

Intended flow:

```text
Search MusicBrainz (existing Discover, unchanged)
        |
        | user cannot find the desired record
        v
"Can't find it? Search Discogs"      (explicit, separately-labeled action)
        |
        v
Explicit Discogs search (bounded, at most 5 Vinyl candidates, §8)
        |
        v
User selects one exact candidate
        |
        v
Server performs a fresh exact Discogs Release lookup (§9)
        |
        v
Server validates the release is Vinyl, normalizes metadata (§10)
        |
        v
Explicit human confirmation (existing Add pattern, unchanged in spirit)
        |
        v
Add to collection
```

MusicBrainz and Discogs results are **never** interleaved, merged, or
ranked together (§17). No automatic cross-provider equivalence matching is
performed, ever (§7) — the application never claims that a Discogs release
and a MusicBrainz release represent the same physical pressing merely
because artist/title/year appear similar.

## 7. Provider Identity, Ownership, and Duplicates

Persistent provider identity is **provider-qualified**:

- `provider = 'discogs'`
- `provider_release_id` = the exact Discogs **Release** ID (e.g. `26770295`)
  — the exact physical/digital edition, matching what a collector actually
  owns.
- `provider_release_group_id` = the Discogs **Master** ID when the release
  has one (e.g. `3058367`) — grouping metadata only, exactly mirroring how
  MusicBrainz's release-group id is already used today. **Master ID must
  never be used as, or substituted for, owned-record identity** — §5.1's
  empirical evidence (three distinct releases, including one non-vinyl
  digital release, sharing one master) is the concrete reason this matters,
  not a theoretical concern.

The existing DB-level identity constraint (`unique (provider,
provider_release_id)`, §4) is already correctly shaped for this — no schema
change is needed to the identity contract itself, only to the set of
`provider` values the catalog-row check constraint accepts (§20).

**Ownership / duplicate-copy detection must become provider-qualified.**
`isExactCatalogReleaseOwned` (§4) compares `provider_release_id` alone today;
this spec requires it to compare `(provider, provider_release_id)` together.
A numeric Discogs release id and a MusicBrainz UUID must never be treated as
comparable or colliding values (in practice their formats never overlap, but
the comparison must be provider-scoped by construction, not by accident of
differing string shapes).

**Cross-provider duplicates are intentionally not solved in v1.** If the same
physical pressing is separately added once through MusicBrainz and once
through Discogs, Vinyl Intelligence creates and treats them as two distinct
catalog identities and two distinct collection items. This is a deliberate,
documented limitation, not a defect: the existing duplicate-copy contract
(spec 0016 Finding B) only ever detected same-provider exact matches, and
this spec does not extend it to cross-provider fuzzy equivalence (§3). The
UI/user-facing copy near the Discogs search entry point must say so plainly
(§17) — this must never be silently hidden from the user.

## 8. Discogs Search Scope (v1)

Deliberately much smaller than the enhanced MusicBrainz Discover feature
(spec 0017):

- one free-text query field (the existing typed search term may be reused
  as the Discogs query's starting point, or the user may type a fresh one —
  Plan 018 decides the exact UX detail; either way it is one plain-text
  Discogs `q` parameter, §5.3);
- an explicit, separate user-triggered action — never automatic;
- `type=release` only (no artist/label/master search);
- returns **at most 5** usable candidates to the UI;
- **no** Discogs pagination / "Load more";
- **no** Artist/Album-style Discogs search modes;
- **no** exact Discogs release URL paste/import mode;
- **no** Master search or import;
- **no** combined-provider ranking of any kind.

**Vinyl-only eligibility:** because Vinyl Intelligence is a vinyl collection
product, only candidates whose Discogs format metadata identifies a physical
Vinyl release are eligible for Discogs catalog add. The implementation may
request a somewhat larger bounded provider result set and filter it down to
Vinyl-format candidates before applying the 5-candidate UI cap (Plan 018's
concern) — this spec does **not** invent an unverified Discogs query
parameter (such as a hypothetical `format=Vinyl` search filter) to enforce
this server-side filter, because that parameter's existence was not
independently confirmed during this spec's research (§5.3); filtering the
already-fetched, already-verified response shape is the only mechanism this
spec relies on. A non-Vinyl candidate (e.g. the digital `20370835` release
observed in §5.1) must never be offered as a Discogs add candidate.

## 9. Exact Lookup / Trust Boundary

Browser-supplied candidate data is never persistence authority — the exact
same security philosophy the MusicBrainz add path already enforces (ADR
0002, spec 0005) is reused, not reimplemented, for Discogs:

1. The authenticated app user selects a candidate from the bounded Discogs
   search results.
2. The browser sends only `provider` and the provider's release identity
   (`providerReleaseId`) to the server — never trusted metadata.
3. The server verifies the Supabase bearer token (existing
   `authenticateRequest`, unchanged).
4. The server performs a **fresh** exact Discogs lookup:
   `GET /releases/{releaseId}` — never trusting whatever metadata the
   browser displayed during search.
5. The server validates and normalizes the provider response (§10).
6. The server verifies the exact release is Vinyl (§8) — a non-Vinyl
   release must be rejected with a clear, honest error, never silently
   coerced or added anyway.
7. The server persists/upserts the canonical catalog metadata (§10, §20).
8. The server creates the authenticated user's collection item (existing
   `createCatalogCollectionItem` pattern, unchanged in shape).
9. Every service-role database operation remains server-only, exactly as
   today — no browser code path ever holds or uses the service-role key.

Artist, title, year, and every other metadata field the browser may have
displayed during search is never accepted as authoritative — only the
server's own fresh, revalidated lookup response is ever persisted.

## 10. Normalized Metadata Mapping

Uses the existing shared `releases` table — no parallel Discogs-specific
table is introduced; nothing found during repository inspection (§4) makes
sharing the table impossible or unsafe, and the existing
`(provider, provider_release_id)` identity contract (§7) already generalizes
cleanly.

Deterministic mapping from a verified Discogs Release response (§5.1's
confirmed field set) into the existing `CatalogCandidate`/`releases` shape,
mirroring `normalizeMusicBrainzRelease`'s existing pattern (`musicbrainz.ts`)
of returning `null`/rejecting on any missing-or-invalid required field
rather than persisting a partial or guessed value:

| Vinyl Intelligence field | Discogs source | Rule |
| --- | --- | --- |
| `artist` | `artists_sort` | Required. Cleaned/length-bounded exactly like the existing `RELEASE_FIELD_LIMITS.artist` (160 chars, `src/lib/supabase/collection.ts`) — a response exceeding this or empty after cleaning is rejected, not truncated silently into a misleading value. |
| `title` | `title` | Required. Same treatment against `RELEASE_FIELD_LIMITS.title` (200 chars). |
| `release_year` | `year` (falling back to a parsed `released` date only if `year` is absent, never inventing one) | Validated against the same existing application year bounds already enforced for every other release (`RELEASE_YEAR_MIN`/`RELEASE_YEAR_MAX`, `src/lib/supabase/collection.ts`). An out-of-bounds or unparseable value stores `null`, exactly like the existing MusicBrainz path's handling of an unparseable date — never a fabricated year. |
| `country` | `country` | Optional; same length bound as the existing `country` field (80 chars). |
| `label` / `catalog_number` | `labels[]` | Deterministic choice: the **first** entry in the Discogs `labels[]` array supplies both `label` (its name) and `catalog_number` (its `catno`), mirroring how a physical sleeve typically shows one primary label/catalog-number pair most prominently. Additional labels in a multi-label release are **not** persisted in v1 (no new column is introduced for a label list) — this is a deliberate, bounded simplification, not an oversight. |
| `format` | `formats[]` | A deterministic, human-readable summary string derived from the matched Vinyl format entry (e.g. combining `name`, `qty`, and `descriptions` such as "Vinyl, LP, Album"), bounded to the existing `format` field's length limit (80 chars) — never the raw, unbounded `formats[]` array. |
| `genres` | `genres` (Discogs) | Passed through the existing genre canonicalization/validation path (`release_genres_valid`, the existing `genres text[]` column and its existing constraints) — no new genre taxonomy is introduced; Discogs genre strings are treated exactly like MusicBrainz genre strings are today (community-curated tags, not model-inferred facts). |
| `provider` | (fixed) | `'discogs'`. |
| `provider_release_id` | `id` | Required. The exact Discogs Release ID, stored as a trimmed numeric string. |
| `provider_release_group_id` | `master_id` | Optional/nullable — a Discogs release genuinely may have no master (§20). Never required, never fabricated when absent. |
| `provider_fetched_at` | (application-generated) | Set to the current server timestamp at the moment of a successful revalidation (§12) — not derived from any Discogs response field. |

**Explicitly not persisted in v1:** `tracklist`, `identifiers` (barcodes
etc.), `styles` (as distinct from `genres`), `date_added`/`date_changed`
(Discogs-side timestamps — §5.3), credits, or any Marketplace/Restricted
Data field (§5.2, §11). The product does not need these fields today for any
existing feature, and this spec does not expand the data model merely
because Discogs happens to return more than the app currently uses.

## 11. Discogs Terms / Data Classification

Per §5.2's CC0/Restricted-Data distinction, this enhancement uses **only**
the following CC0 catalog-metadata categories, and no others: release
titles, dates/years, formats, artist names, label/manufacturer names, and
catalog numbers/identifiers already covered by §10's mapping table. It
explicitly does not use, store, proxy, or display: Discogs images (§14),
Marketplace/pricing/sales-history data, Discogs user data of any kind, or
any data requiring Discogs OAuth/end-user account access. Tracklists and
detailed identifiers, while themselves CC0-classified per the terms, are
simply not needed by this product today and are excluded from v1 persistence
by product decision (§10), not by a terms restriction.

## 12. Six-Hour Freshness Requirement (first-class)

This is a first-class architectural requirement, not an afterthought (§5.2,
§5.4).

**Required invariant:** Discogs-sourced catalog metadata must never be
displayed to a user as current when it is stale. Concretely:

- Every Discogs-backed `releases` row carries `provider_fetched_at
  timestamptz` — the last time Vinyl Intelligence's own server successfully
  revalidated that exact Discogs Release against the live API (§9 step 4,
  or a later revalidation). This is an application-generated timestamp, set
  by the server at the moment of a successful fetch — never derived from
  Discogs's own `date_changed` field, which describes Discogs-side edit
  history, not when this application last checked (§5.3).
- **Discogs provider metadata MUST NOT be displayed as fresh when
  `provider_fetched_at` is older than 6 hours.**
- When a Discogs-backed record's metadata is found to be stale at display
  time, the application must revalidate the exact Discogs Release
  server-side (the same `GET /releases/{id}` call already used at add-time,
  §9) before displaying that metadata as current.
- A **successful** revalidation updates the canonical metadata (via the same
  normalization path, §10) and refreshes `provider_fetched_at`.
- A **failed** revalidation (provider unavailable, rate-limited, timeout,
  bad response) must **never** silently fall back to displaying the stale
  cached metadata as if it were current. The UI must instead show a bounded,
  honest "catalog details temporarily unavailable" / retry state for that
  record's Discogs-sourced fields — exactly the same "user-visible failure
  is preferable to fake success" discipline (`intent.txt` §16) already
  applied everywhere else in this product.
- This is a **display-time** invariant, not merely an Album-Detail-page
  concern: **any** surface that reads and presents Discogs-derived release
  metadata as current information — Collection browse/grid/list, the
  Dashboard, VIN (if it is ever extended to reference Discogs-backed
  records — not proposed by this spec, §3), or any future consumer — must
  not bypass this contract. This spec does not prescribe exactly which
  shared code path enforces the check (a single shared "is this Discogs row
  fresh enough to display, and if not, revalidate or degrade" helper is the
  likely shape, analogous to the existing shared `isExactCatalogReleaseOwned`
  helper's role) — **Plan 018 must determine the smallest centralized
  implementation mechanism that satisfies this invariant across every
  consuming view**, not each view independently reinventing the check.
- This spec deliberately does **not** prescribe a scheduled/background
  refresh subsystem (rejected in §5.4 as disproportionate for this
  timeline) — staleness is detected and resolved at display time, on the
  narrow set of views that actually render Discogs-backed metadata, not via
  a cron job or queue this project has no existing infrastructure for.

If, during planning, repository inspection reveals that a correct six-hour
contract genuinely cannot be implemented within a bounded, timeline-fitting
change, **Plan 018 must stop and report that finding rather than silently
weakening this requirement.**

## 13. Attribution / Provider Navigation

Per §5.2's confirmed attribution requirements:

- A one-time, prominent, app-level notice — *"This application uses
  Discogs' API but is not affiliated with, sponsored or endorsed by
  Discogs. 'Discogs' is a trademark of Zink Media, LLC."* — placed
  somewhere reasonable and durable (e.g. an About/Terms area or the
  application's existing footer-equivalent surface; the exact placement is
  a Plan 018 UI decision, not fixed here).
- **"Data provided by Discogs."**, with a normal (never `nofollow`)
  hyperlink to the corresponding Discogs page, displayed directly adjacent
  to Discogs-sourced data at, at minimum:
  - every candidate card in the Discogs search results area (§8, §17);
  - a Discogs-backed owned record's Record Detail page (the Discogs analog
    of the existing "View on MusicBrainz" provenance link, §4);
  - anywhere else Plan 018 identifies where Discogs-sourced data is
    directly presented to the user.
- The exact-release Discogs page URL is deterministically derived from the
  validated, server-confirmed Discogs Release ID (mirroring
  `musicBrainzReleaseUrl`'s existing pattern in
  `musicbrainzIdentity.ts` — a small, pure, browser-safe helper, not a new
  provider-fetching module import into browser code).

## 14. Artwork

Discogs images are entirely out of scope (§3, §5.2, §5.4, §11) — not
persisted, not proxied, not cached, not displayed, under any circumstance.

This requires `AlbumArtwork`'s **callers** to become explicitly
provider-aware (§4's confirmed finding) — this is a deliberate requirement
of this spec, not an incidental consequence of the existing MBID regex guard
happening to reject non-UUID values:

- For a MusicBrainz-backed release: existing Cover Art Archive behavior is
  completely unchanged.
- For a Discogs-backed release: `AlbumArtwork` must **never** receive a
  Discogs numeric id as `releaseMbid`/`releaseGroupMbid` — callers
  (`DiscoverPanel`'s future Discogs-results rendering, `AlbumDetailPage`)
  must gate these props on the release's `provider` being `'musicbrainz'`
  explicitly, so the branded fallback renders by design. The user's
  existing custom-cover-upload feature continues to work identically for a
  Discogs-backed record, exactly as it already does for a manual record
  today — no new code is needed for that path.

## 15. Search / Add API Contract

Extends the existing catalog API boundary — no parallel application
architecture, no seventh Netlify Function, matching the precedent spec 0017
already established for extending `/api/catalog/search` rather than adding a
new endpoint.

**Search:** `GET /api/catalog/search` gains a `provider` concept alongside
its existing `q`/`mode`/`offset`/`limit`/`releaseId` parameters —
`provider=musicbrainz` (the default; every existing client's behavior is
unchanged and remains fully backward-compatible) or `provider=discogs`
(the new explicit fallback path, §8). A Discogs search request is
authenticated identically to a MusicBrainz one (existing bearer-token
check), uses a free-text query, returns bounded results (≤5 after Vinyl
filtering, §8), never paginates, and uses its own server-only
`DISCOGS_TOKEN` sent via the `Authorization: Discogs token=...` header — the
Netlify Function never accepts or forwards a Discogs token from the browser.

**Add:** `POST /api/catalog/add` gains `provider: 'discogs'` as a second
accepted value alongside the existing `'musicbrainz'` (§4's confirmed
`parseAddRequest` gate is the exact place this changes). A Discogs add
request validates its numeric `providerReleaseId` against a **Discogs-specific**
pattern — **never** `MUSICBRAINZ_RELEASE_ID_PATTERN**, which is a UUID regex
that would incorrectly reject every Discogs id (§4, §9's exact-lookup step,
§10's Vinyl-verification step, then the same upsert/collection-item creation
pattern as MusicBrainz, unchanged in shape).

Provider-specific validation, pacing, and error-handling remain
provider-specific throughout — this spec explicitly rejects reusing any
MusicBrainz-named constant (`MUSICBRAINZ_RELEASE_ID_PATTERN`,
`MUSICBRAINZ_PACING_MS`, the shared `nextMusicBrainzRequestAt` clock, or
`MUSICBRAINZ_USER_AGENT`) as a disguised "generic provider" value for
Discogs (§4, §17).

## 16. Security

Every existing security boundary is preserved, extended (not weakened) to a
second provider:

- Every catalog Function remains authenticated; the server independently
  verifies the Supabase bearer token exactly as today.
- The browser never chooses or supplies an authoritative `user_id` — the
  server derives it from the verified token, unchanged.
- The Supabase service-role key remains server-only, used only inside the
  existing `upsertCatalogRelease`/`createCatalogCollectionItem`-shaped
  functions.
- `DISCOGS_TOKEN` is a new, server-only environment variable: **no
  `VITE_`-prefixed name, never sent to the browser, never placed in a URL or
  query string, never logged, never included in an error message**, sent to
  Discogs only via the `Authorization` request header from server code.
- No browser code path ever calls Discogs directly, authenticated or not.
- No new, broader RLS policy or grant is introduced — catalog `releases`
  rows remain browser-read-only exactly as today (the existing "authenticated
  users can select catalog releases where source = 'catalog'" policy already
  covers a Discogs-sourced row without any change); the forward migration
  widens a check constraint's accepted values, never removes provider
  validation or weakens ownership/RLS in any way (§20).
- The forward migration preserves every existing MusicBrainz and manual row
  unchanged, with no backfill that alters their behavior (§20).

## 17. Rate Limit / Resilience

Discogs pacing and error-handling are **independent** from MusicBrainz's —
the existing `paceMusicBrainzRequest`/`MUSICBRAINZ_PACING_MS`/
`nextMusicBrainzRequestAt` clock is not renamed or reused as a shared,
misleadingly-generic mechanism; Discogs gets its own analogous pacer sized to
its own observed/documented limits (§5.1/§5.2), not MusicBrainz's 1/second
budget.

Required:

- a bounded request timeout on every Discogs call, matching the existing
  MusicBrainz timeout discipline;
- independent, provider-specific pacing;
- bounded response sizes (the existing candidate-count/field-length bounds
  already applied to MusicBrainz responses, §10, extended to Discogs);
- graceful, honest handling of a 429/provider-unavailable/timeout response —
  reusing the existing `CatalogErrorCode` categories
  (`provider_rate_limited`, `provider_unavailable`, `provider_timeout`,
  `provider_bad_response`) rather than inventing new ones;
- **no** background polling of Discogs, ever;
- **no** automatic Discogs call merely because the user searched
  MusicBrainz, or for any reason other than the user's own explicit Discogs
  search action or a §12 freshness revalidation triggered by actually
  viewing a Discogs-backed record;
- **no** unbounded retry — if any retry policy is introduced for Discogs
  (mirroring MusicBrainz's existing single bounded rate-limit retry), it
  must be explicit and bounded, specified in Plan 018, not open-ended.

## 18. UI / UX

The existing Discover design is preserved — **no redesign.** The Discogs
fallback reads as a deliberate, secondary, clearly-labeled affordance:

> Can't find your record?
> **Search Discogs**

Discogs results are visibly and unambiguously labeled as Discogs results —
never interleaved with MusicBrainz candidates, and never presented in a way
that could suggest the two providers' results have been deduplicated or
cross-matched against each other (§7). Each Discogs candidate exposes enough
release-specific detail to distinguish the correct pressing, bounded to
existing/comparable metadata fields already shown for a MusicBrainz
candidate: artist/title, year, country, format, and label/catalog number
where available (§10) — plus the required Discogs attribution/link (§13).

The existing explicit confirm-before-add pattern is unchanged. "Already
owned" / duplicate-copy detection becomes provider-aware (§7) for a Discogs
candidate exactly as it already is for a MusicBrainz one.

## 19. Multilingual / Hebrew

This enhancement preserves every existing multilingual-record guarantee
(spec 0015). Discogs-sourced metadata such as כהן / מה שאפשר עם מה שנשאר
must remain Unicode-safe end-to-end: no transliteration, no translation, no
ASCII-only validation on artist/title/label/catalog-number fields (§10's
length bounds are character-length bounds, exactly like the existing
MusicBrainz/manual-entry validation — never a script restriction). Dynamic
Discogs-sourced Hebrew content renders through the application's existing
BiDi-safe components exactly like MusicBrainz-sourced or manually-entered
Hebrew content does today — no new script-handling logic is introduced. The
application chrome and navigation remain English/left-to-right, unchanged —
this is not a localization project. The verified real Hebrew Discogs search
(§5.1) is a **mandatory** acceptance scenario (§22).

## 20. Database / Migration Specification (described, not implemented)

This spec describes the required forward migration; it does not create or
apply one (§26 — that is Plan 018/PR B's responsibility, after this spec and
its plan are both human-approved).

At minimum, the migration must:

- widen the `releases_manual_catalog_identity` check constraint's catalog
  branch so that, for `source = 'catalog'`, `provider` may be exactly
  `'musicbrainz'` **or** `'discogs'` — not an unbounded free-text value, and
  not a removal of provider validation;
- preserve `unique (provider, provider_release_id)` unchanged (§7 — already
  correctly shaped, no change needed to the constraint itself);
- preserve every existing manual-release rule unchanged (`source = 'manual'`
  rows remain untouched by this migration);
- introduce the minimal freshness marker required by §12 —
  `provider_fetched_at timestamptz`, nullable (a MusicBrainz or manual row
  has no meaningful "provider fetched at" concept and must not be forced to
  carry one; only Discogs-backed rows populate it);
- guarantee every existing MusicBrainz row remains valid under the new
  constraint with **no backfill that changes its behavior** — an existing
  MusicBrainz row's `provider_fetched_at` is simply absent/null, and no
  freshness check ever applies to a non-Discogs row (§12);
- guarantee every existing manual row remains valid, unchanged;
- require a Discogs catalog row to have a non-null, valid
  `provider_release_id` (mirroring the existing MusicBrainz requirement)
  while allowing `provider_release_group_id` to be nullable (a Discogs
  release genuinely may have no master, §5.1's own evidence includes
  releases that do have one, but this must not be assumed universal);
- introduce **no** RLS policy change and **no** new grant — the existing
  browser-read-only, service-role-write catalog posture already generalizes
  correctly to a second provider value (§16);
- be strictly forward-only — no destructive rewrite of any historical
  migration, matching this project's established discipline throughout
  every prior enhancement.

## 21. Test / Verification Contract

Specification quality is this document's deliverable; the following are the
mechanically checkable acceptance criteria a future implementation (Plan
018 / PR B) must satisfy. Automated-test items are distinguished from
human-production-acceptance items, exactly as spec 0017 §22/§23 already
established the pattern for this project.

**Automated test coverage must include at least:**

- existing MusicBrainz search behavior is completely unchanged (regression);
- an explicit Discogs search succeeds and returns bounded, Vinyl-only
  candidates;
- no Discogs network call occurs before the user's explicit fallback action
  (verified via the existing mocked-provider test convention — no real
  Discogs call in any automated test, ever);
- Hebrew/Unicode query text survives a Discogs search request unmangled;
- the candidate bound (≤5) is enforced;
- a non-Vinyl Discogs release (e.g. a `File`/digital format, mirroring
  Phase-0's own `20370835` observation) is excluded from add-eligible
  candidates;
- provider-qualified duplicate/ownership detection: a MusicBrainz-owned
  release and a same-numbered-looking (hypothetical) Discogs id are never
  conflated;
- MusicBrainz's UUID pattern and Discogs's numeric-id pattern are validated
  by genuinely separate validators, each rejecting the other provider's
  shape;
- the server performs a fresh exact Discogs Release lookup before any
  persistence — forged/stale browser-supplied metadata never becomes
  canonical;
- `DISCOGS_TOKEN` is read only server-side, is never present in any response
  body, log line, or URL the tests can observe;
- `AlbumArtwork`'s callers pass MusicBrainz ids only for
  `provider === 'musicbrainz'` releases; a Discogs-backed release always
  renders the branded fallback path, never attempts a Cover Art Archive
  request;
- custom-cover-upload continues to work unmodified for a Discogs-backed
  collection item;
- the required attribution text/link renders adjacent to Discogs-sourced
  data in both the search-results and Record-Detail surfaces;
- the widened database constraint accepts a valid Discogs catalog row and
  still rejects an invalid/unapproved provider value;
- existing manual-release semantics are unaffected (regression);
- existing RLS/grants are unaffected (regression, pgTAP);
- a fresh (`provider_fetched_at` within 6 hours) Discogs row displays its
  stored metadata directly, with no revalidation call;
- a stale (`provider_fetched_at` older than 6 hours) Discogs row triggers a
  revalidation attempt before display;
- a **failed** revalidation attempt never displays the stale metadata as
  current — the UI shows the bounded unavailable/retry state instead (§12);
- a successful revalidation updates both the metadata and
  `provider_fetched_at`;
- cross-provider equivalence is never inferred — two records added
  separately through MusicBrainz and Discogs for what a human would
  recognize as "the same album" remain two distinct collection items with no
  merge/dedupe behavior of any kind (§7).

**Human production acceptance must include, at minimum, the real verified
scenario:**

Query: `כהן מה שאפשר עם מה שנשאר`

- the explicit Discogs fallback finds at least one physical Vinyl candidate
  for this query (phrased as: *if* Discogs release `26770295`, or another
  currently-valid Discogs Vinyl release of the same work, is still present
  at acceptance time, it is selectable — this spec does not assert a
  specific third-party catalog entry will exist forever, §5.3);
- the Hebrew artist/title render correctly, unmangled, throughout the
  search-results and confirmation flow;
- the exact Discogs release provenance (id, page link, attribution) is
  visible before and after add;
- explicit human confirmation is required before the record is added — no
  automatic persistence;
- the added record appears correctly in the collection, with correct
  Hebrew metadata;
- the user's custom-cover-upload works normally for this record;
- no Discogs cover image is fetched, displayed, or stored at any point;
- the required attribution text and link are present and correct;
- duplicate-copy behavior for this record is provider-aware (§7).

## 22. Documentation Closeout (deferred)

Per this project's established discipline (spec 0017 §24 as the immediate
precedent), a documentation/screenshot closeout is required **after**
implementation, independent review, merge, deployment, and human production
acceptance — not part of this specification PR, and not part of Plan 018's
own scope until that plan reaches its own closeout phase. This section is a
placeholder acknowledging that requirement, not a description of work
performed now: README, root `SPEC.md`, `docs/USER_GUIDE.md`,
`docs/api-integrations.md`, `docs/architecture.md`, `docs/verification.md`,
and the current roadmap will all need evaluation once real implementation
exists to document — exactly the same set of documents spec 0017's own PR C
touched, plus a new Discogs-specific attribution/terms note in
`docs/api-integrations.md` and `docs/security.md`.

## 23. Final Submission Tag Rule

The existing historical tags `ase26-final-submission-2026-09-15` (annotated
object `821676801084ddccb40e7f61821e945abe07b77a`, peeling to
`9ee871bf352564d3271181558d26498685afa98e`) and
`ase26-final-submission-2026-09-16` (peeling to
`750d3e1bb492dff4d9f3ef1013be6a02e6193b86`) remain **permanent, unmoved
evidence** of the states accepted before and through this enhancement's
predecessor. Neither is ever moved, deleted, or recreated by this
enhancement's work. A **new** annotated final-submission tag may be created
**only after** this enhancement has been: implemented, independently
reviewed, merged, deployed, human production accepted, and had its
documentation closeout (§22) completed and independently re-audited — not
before, and not automatically, and only by explicit separate human action.

## 24. Definition of Done

This enhancement is **done** only when **all** of the following are true —
this specification document alone is not completion:

1. This spec is human-approved.
2. A companion implementation plan (Plan 018) exists and is human-approved.
3. Implementation matches this spec's observable-behavior contracts.
4. The automated tests in §21 exist and pass, alongside the full existing
   automated gate (typecheck, lint, `test:run`, build, pgTAP, db lint,
   `npm audit --omit=dev`) with no regression.
5. No unintended dependency or AI/model change occurred — or, if one was
   found genuinely necessary, it was stopped and explicitly human-approved
   first (§3).
6. An independent code audit passes (0 BLOCKER / 0 HIGH / 0 MEDIUM, matching
   this project's established bar throughout every enhancement to date).
7. Human local/runtime verification passes.
8. Merged through a reviewed PR (normal merge commit, matching this
   project's established Git discipline).
9. Deployed from merged `main` (the project's existing manual deploy
   workflow — no new deployment mechanism).
10. Human production acceptance (§21) passes, including the mandatory
    verified-Hebrew-query scenario.
11. Current documentation is updated (§22).
12. Verification evidence is recorded in `docs/verification.md`.
13. A final independent submission audit passes.
14. **Only after all of the above**, a new final submission tag is created
    (§23).

## 25. Open Questions

1. **Exact UI placement of the Discogs fallback entry point** (adjacent to
   Discover's existing "Can't find it? Add it manually" line, vs. a
   separate section) — a Plan 018 UI decision, not fixed here; either
   placement satisfies this spec's contract.
2. **Exact shared mechanism enforcing the §12 freshness invariant across
   every consuming view** — deliberately left to Plan 018 (§12), since the
   correct minimal shape depends on which views are found, during planning,
   to actually render Discogs-derived metadata today (currently: Record
   Detail and Collection browse; VIN/Dashboard involvement, if any, is out
   of scope per §3 unless planning finds an unavoidable dependency, in which
   case Plan 018 must stop and ask rather than silently extend scope).
3. **Whether a bounded Discogs rate-limit retry (mirroring MusicBrainz's
   existing single bounded retry) is warranted, and its exact backoff** —
   left to Plan 018, bounded by §17's "no unbounded retry" requirement.

No item above affects the identity contract, the freshness invariant, the
attribution requirement, the security boundary, or the provider-boundary
decision — all of those are fully resolved in §6, §7, §12, §13, §16.

## References

`intent.txt` §6.2, §6.3, §15, §16, §17, §19; `AGENTS.md` (Scope Control,
Verification, Git/PR discipline); `SPEC.md` §7, §13, §15, §16;
`docs/decisions/0002-proposed-catalog-provider-boundary.md`;
`docs/decisions/0008-discogs-secondary-catalog-provider.md`;
`docs/specs/0005-milestone-4-catalog-api.md`;
`docs/specs/0015-hebrew-multilingual-record-support.md`;
`docs/specs/0016-final-submission-alignment.md`;
`docs/specs/0017-discover-musicbrainz-navigation-enhancement.md`;
`docs/verification.md`; official Discogs documentation —
`https://www.discogs.com/developers`,
`https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use`
(both returned HTTP 403 to this spec's own automated fetch tooling, exactly
as ADR 0002 encountered during the original Milestone 4 spike — required
independent human re-verification before implementation, §5.2, §26).

# 017 Discover & MusicBrainz Navigation Enhancement (Implementation Plan)

Status: **RUNTIME COMPLETE, MERGED, DEPLOYED; §23 HUMAN PRODUCTION
ACCEPTANCE COMPLETE; PR C (this document's own documentation closeout,
PR #37) MERGED (merge commit `f347be94daa0e7e4e20e849d8dbcf8b0962840f6`);
FINAL INDEPENDENT PRE-TAG AUDIT COMPLETE / PASS (0 BLOCKER / 0 HIGH /
0 MEDIUM).** The spec (PR #34) is merged; it precedes
this plan's own PR A/B/C execution sequence. PR A (this plan, PR #35) is
merged. PR B (runtime implementation, PR #36) is complete: implemented,
independently reviewed (one correction round — 0 BLOCKER / 0 HIGH /
2 MEDIUM found and fixed in the same PR before merge — see
`docs/verification.md` → "Discover & MusicBrainz Navigation Enhancement
Evidence" for the full chronology), merged
(`abff1e86cbc36c754e8645179fa5bbee9ec27afe`), and deployed
(`6aaa63fe2829c87037fd2cd0`). An 8-step human production smoke passed
2026-09-16, and the remaining §23 checks were completed in a second round
(also 2026-09-16) — **all 22 of spec §23's human production acceptance
items now have sufficient evidence; §23 acceptance is COMPLETE**, per the
full record in the same verification section. All of spec §27's Definition
of Done is now satisfied except its final step: the merged repository
commit represented by this closeout is the intended target for a new
annotated final-submission tag, `ase26-final-submission-2026-09-16` (§26)
— tag creation is a separate, external Git-ref action performed only after
PR #38 (the status reconciliation carrying this text) merges. Verify the
tag's existence and target directly from Git refs, not from this prose,
which is written to remain accurate both before and after that tag exists.
The original PR A/B/C
operational plan below is preserved unchanged as the plan that was
executed; two minimal files outside its original file list
(`src/catalog/CatalogPanel.tsx`, `src/pages/ScanPage.tsx`) needed a
type-compliance-only fix during PR B — disclosed in PR #36's own
"Deviations from Plan 017" section and in `docs/verification.md`, not
retroactively folded into this plan's file list below.

Spec: `docs/specs/0017-discover-musicbrainz-navigation-enhancement.md` (the
primary behavioral contract; this plan does not restate its rationale, only
how to execute it).

Baseline `main` when this plan was written: `1b7c4ef3dfbfd519463a246b1ab006c0bbb973a1`
(PR #34 merge — spec 0017, independently corrected across three audit rounds,
merged 2026-09-15). Accepted production runtime remains
`81812c1f52d56bea84e142d828dd1e1427a0ec4b`, deploy `6aa8783d1835a5e433449dd4`
— this plan does not change either. Historical freeze tag
`ase26-final-submission-2026-09-15` (annotated object
`821676801084ddccb40e7f61821e945abe07b77a`, peeling to
`9ee871bf352564d3271181558d26498685afa98e`) remains untouched.

This plan is operational: another agent should be able to execute PR B or
PR C from this document plus the spec, without re-deriving product intent or
re-inspecting the whole codebase from scratch. Implementation starts only
after this plan is independently reviewed, human-approved, and merged.

**Three PRs. Do not create one giant branch.**

- **PR A** — this planning PR (`docs/plan-017-discover-musicbrainz-navigation`).
- **PR B** — one coherent runtime + automated-test implementation PR.
- **PR C** — documentation / screenshot closeout PR, opened only after PR B
  is independently reviewed, merged, deployed from merged `main`, and
  human-accepted.

## Why one runtime PR, not two

Evaluated per the spec's own coupling and confirmed by direct source
inspection (below): query construction (§6), pagination metadata (§7–§8),
the server response contract (§8.2), the browser client contract, the
search-draft shape (§9), Discover's Load More/exact-lookup UI, and the
Record Detail link all sit on **one** additive-but-interlocking change to
`CatalogSearchResponse` and one Netlify Function's request parsing. Splitting
server and UI into separately deployed runtime versions would require the
UI half to run against an old server response shape (missing `offset`/
`hasMore`) or the server half to accept `mode`/`offset`/`releaseId`
parameters no deployed client yet sends — either way, an intermediate
production state that either silently misrepresents what was searched (the
exact failure mode §8.1 is designed to prevent) or ships dead server code
with no caller. There is no independently-deployable boundary here that
does not misrepresent a spec contract mid-rollout. One runtime PR, several
coherent commits inside it (§"Expected implementation commits" below),
avoids that.

## Global constraints (from the spec + `AGENTS.md`)

- No dependency add/upgrade. No new environment variable/secret.
- No database migration. No Supabase config change. No Netlify config
  change. No new Netlify Function (six endpoints stay six; the existing
  `GET /api/catalog/search` gains parameters, not siblings).
- No AI/model/prompt change of any kind — zero OpenRouter/Vision/VIN
  touch-points anywhere in this enhancement.
- No change to Scan's vision recognition flow, schema, or state machine.
- No change to the duplicate-copy contract's *decision rule* (exact
  `provider_release_id` equality, gated on `collectionStatus === 'ready'`) —
  only its reuse across more entry points.
- No change to manual-add semantics.
- Every automated gate green from a clean checkout before PR B opens; an
  independent review before merge; a human production acceptance before
  PR C starts.
- Any finding that would require a migration, a dependency, a schema/model
  change, a new Function, or a security-contract change → **STOP and return
  to the human** (§"Stop conditions" below expands this).

Automated gate (run for PR B, from a clean checkout):

```
npm ci
git diff --check
npm run typecheck
npm run lint
npm run test:run
npm run build
npx supabase start
npx supabase test db     # pgTAP
npx supabase db lint
npm audit --omit=dev
```

No real MusicBrainz API call and no OpenRouter/model call anywhere in this
gate — every provider interaction in automated tests is mocked/fixture-based
(existing project convention, confirmed in `netlify/tests/catalog-functions.test.ts`,
`src/catalog/DiscoverPanel.test.tsx`, `src/catalog/ScanPanel.test.tsx`).

Deploy step (only after human-approved merge): the project's existing manual
`netlify deploy --prod` workflow from merged `main` — no new deployment
mechanism — then a non-provider smoke (`/`, `/api/health`, one SPA deep
link), then STOP for human production acceptance.

---

## PR A — this planning PR

**Scope:** `docs/plans/017-discover-musicbrainz-navigation-enhancement.md`
only. No other file.

**Done when:** independently reviewed and merged to `main`. PR B may begin
once PR A is merged.

---

## PR B — Runtime implementation

**Depends on:** PR A merged.

### Current-source findings that shaped this plan

Verified by direct inspection at baseline `1b7c4ef`, not assumed from the
spec alone:

| Finding | Evidence | Consequence for this plan |
| --- | --- | --- |
| `searchMusicBrainzReleases` returns `CatalogCandidate[]` only — no raw/provider count | `src/lib/catalog/musicbrainz.ts:405-425` | Its return type must change to expose `rawCount`/`providerCount`/`providerOffset`; it has exactly one production caller (`handleCatalogSearch`), so this is a contained, safe signature change. |
| `fetchMusicBrainzJson` already throws `MusicBrainzError('provider_bad_response', …)` for a non-array `payload.releases`, inside `searchMusicBrainzReleases` itself | `musicbrainz.ts:415-420` | The natural, already-established location for §8.4's new count/offset/relational validation is the **same function, same layer** — not a second validation pass in the handler. |
| `MUSICBRAINZ_RELEASE_ID_PATTERN`, `buildMusicBrainzLookupUrl`, and the inline `derivedProviderPageUrl` construction all live in `musicbrainz.ts`, which also contains `fetch`/`AbortController`/timeout provider-calling code | `musicbrainz.ts:20-21, 207-216, 339` | `musicbrainz.ts` today is imported **only** server-side (`catalog-handlers.mts` and its test — grep-confirmed, zero `src/` importers). Spec 0017 is the first thing that needs MBID-pattern/release-URL logic **in the browser** (the pasted-URL parser, the Record Detail link). Importing the whole provider-fetching module into browser bundles would work but blurs the browser/server boundary this project has otherwise kept clean (`ownedRelease.ts` is the existing precedent for exactly this kind of extraction). |
| `Boolean`-keyword literalization / Lucene escaping / mode→template mapping are query-string-construction concerns; the browser never needs to build a Lucene query string itself — it only ever sends `q`/`mode`/`offset`/`limit` over HTTP, exactly as today | `client.ts:111-132`, spec §8.1 | These stay server-only, inside `musicbrainz.ts` — no browser-safety concern, no extraction needed. |
| `searchCatalog(client, query, limit?)` returns `CatalogCandidate[]`, discarding everything else in `CatalogSearchResponse` | `client.ts:111-132` | The exact seam a backward-compatible wrapper needs. |
| `ScanPanel.tsx` calls `searchCatalog(client, query)` with **no mode/offset argument** and only ever reads the returned array | `ScanPanel.tsx:17, 218` (import), `:218` (call) | Scan's call site can stay **byte-identical** — see "Scan compatibility" below. |
| `CollectionItemWithRelease['release']` selects `provider_release_id?`, `provider_release_group_id?`, `source?: 'manual'\|'catalog'\|null` — **no `provider` field** | `src/lib/supabase/collection.ts:55-77` (already the basis of spec §13.2's corrected visibility rule) | Confirmed, no further correction needed; the plan below just implements the already-corrected rule. |
| `isEditableRelease` is exported, already-tested, and already used by `AlbumDetailPage.tsx` | `collection.ts:86-96`, `AlbumDetailPage.tsx:30,104` | Reuse directly — `!isEditableRelease(release)` is the spec's own condition 1. |
| `AlbumDetailPage.tsx`'s metadata block is a `<dl className="vi-album__meta">` built from a `meta` array of `{k, v}` pairs, immediately followed by `FavouriteAndRating`/`PersonalGenresEditor` inside `.vi-album__ident` (not the `.vi-album__art` cover-art column) | `AlbumDetailPage.tsx:107-179` | The provenance link is one more row inside the **same** `<dl>` (a `dt`/`dd` pair whose `dd` is an anchor, not `BidiText`), appended after the `meta.map(...)` loop — literally "the last item in the existing metadata block," §28 item 2. |
| The candidate-card MusicBrainz link today is plain text, no icon (`<a className="vi-btn vi-btn--ghost vi-btn--sm">MusicBrainz</a>`) | `DiscoverPanel.tsx:343-350`, `ScanPanel.tsx:567-574` | The existing idiom already satisfies §13.1's "icon/label" requirement with label alone — no icon is required for consistency; the already-defined `external` `Icon` glyph (`src/ui/Icon.tsx:35`) is available if implementation-time visual polish wants one, but is not required by this plan. |
| `SegmentedControl` (`src/ui/primitives.tsx:177-204`) is generic (`options`/`value`/`onChange`/`label`) but hardcodes `role="group"` + `aria-pressed` — exactly the toggle-button semantics spec §19 forbids for a 3-way mutually-exclusive selector | `primitives.tsx:177-204` | Do not modify `SegmentedControl` (other surfaces — Collection Grid/List — depend on its current semantics). Add a new sibling primitive with correct radiogroup semantics (below). |
| `.vi-visually-hidden` is real, defined once, already used in 8 files | `src/styles/base.css:130-138` (already verified during spec correction) | Reuse directly, zero new CSS. |
| No standalone `catalogSearchDraft.test.ts` exists — draft persistence is exercised only indirectly through `DiscoverPanel.test.tsx` mounted tests | grep found no such file; `DiscoverPanel.test.tsx:273-302` | The plan's test list below targets `DiscoverPanel.test.tsx`, not a nonexistent dedicated draft-test file. |
| `.vi-discover`/`.vi-candidate`/`.vi-segmented` styles live in `src/styles/components.css` and `src/styles/pages.css`; no dedicated Discover stylesheet exists | grep confirmed | New CSS, if any, goes into these two existing files — no new stylesheet. |
| The six-endpoint count and `GET /api/catalog/search`'s thin entrypoint (`netlify/functions/catalog-search.mts`) delegate everything to `handleCatalogSearch` | `netlify/functions/catalog-search.mts` | This enhancement changes zero lines in the thin entrypoint file — every change is inside `_shared/catalog-handlers.mts` and its imports. |

### Scan compatibility decision (resolved, not left open)

**No Scan search/state/recognition/add/duplicate-copy logic change.**
**Exactly one intended Scan presentation/accessibility change:** the
existing per-candidate MusicBrainz link (`ScanPanel.tsx:567-574`) gains the
approved visually-hidden "(opens in a new tab)" text, identically to every
other external link this spec touches (§19). The `searchCatalog` call site
itself (`ScanPanel.tsx:218`) is unchanged.

- Scan's user-visible workflow/state machine (photo → recognition → catalog
  candidates → human confirmation, the `ScanState` union in `ScanPanel.tsx:36-56`)
  is untouched — not because the plan avoids looking at it, but because
  nothing in it depends on search modes, pagination, or the exact-URL
  lookup.
- **`searchCatalog(client, query, limit?)` keeps its exact current signature
  and return type (`Promise<CatalogCandidate[]>`)**, becoming a thin,
  backward-compatible wrapper implemented as
  `searchCatalogPage(client, { query, mode: 'all', limit }).then((r) => r.candidates)`.
  Scan's import and call site (`client.ts:16`, `ScanPanel.tsx:218`) do not
  change.
- **Decision: Scan's request explicitly sends `mode: 'all'`** (via the
  wrapper), rather than omitting `mode` and relying on the server's
  documented omitted-defaults-to-`all` behavior. The omitted-mode default
  exists in the spec specifically as a deploy-transition safety net for
  **already-deployed, not-yet-updated** client code (§8.1) — new code this
  plan writes should never rely on an implicit default for its own
  intentional request, the same "the server does not trust the client
  alone, and the client should not lean on a fallback it doesn't have to"
  posture already used elsewhere in this codebase (e.g. `boundedLimit` in
  `client.ts` never omits `limit` and hopes for a server default either).
- **Consequence Scan does inherit, without any search/state-machine code
  change of its own:** every Scan catalog search now runs under the
  corrected `All`-mode semantics (`artist:(...) OR release:(...)` instead of
  today's release-title-only unqualified query) — this is the intended,
  spec-approved behavior change to the shared search boundary (spec §5.2),
  not something this plan reinterprets or should avoid. Scan intentionally
  inherits the approved corrected All-mode shared-search semantics; its
  state machine and persistence behavior must be regression tested (below),
  not assumed unaffected.
- **What proves this didn't regress:** `ScanPanel.test.tsx`'s existing mocks
  patch `searchCatalog` (or the underlying `client.ts` module) directly, not
  the raw provider — those tests continue to assert Scan's own behavior
  (searching → candidates/no-match/provider-error → confirm/duplicate-copy)
  unchanged and unmodified. A **new** `client.test.ts` case asserts that
  `searchCatalog` internally requests with `mode=all` and returns exactly
  `.candidates` from the richer response, proving the compatibility
  boundary itself, once, at the layer where it actually lives — not
  duplicated into Scan's own test file.
- No other Scan-specific UI change beyond the one accessible-name addition
  above. No new Scan state. No Scan CSS change.

### Chosen designs (resolved — no open behavior-defining implementation choice)

**1. MusicBrainz identity/URL helpers — new sibling module,
`src/lib/catalog/musicbrainzIdentity.ts`.**

A small, dependency-free, **browser-safe** pure module (no `fetch`, no
`AbortController`, no timeout logic — the property that actually
distinguishes it from the rest of `musicbrainz.ts`), containing:

- `MUSICBRAINZ_RELEASE_ID_PATTERN` — **moved here as the single canonical
  definition.** `musicbrainz.ts` re-exports it
  (`export { MUSICBRAINZ_RELEASE_ID_PATTERN } from './musicbrainzIdentity.ts'`)
  so every existing import site (`catalog-handlers.mts`,
  `netlify/tests/catalog-functions.test.ts`, `musicbrainz.test.ts`) continues
  to import it from `musicbrainz.ts` **unchanged** — zero import-site drift,
  zero duplicate regex.
- `musicBrainzReleaseUrl(providerReleaseId: string): string | null` — the
  §13.3-recommended shared builder, returning `null` for an ID that fails
  the pattern (never a malformed string). `musicbrainz.ts`'s
  `normalizeMusicBrainzRelease` is refactored to call this instead of its
  current inline string-concatenation (`musicbrainz.ts:339`), so there is
  truly one implementation, not three.
- `parseMusicBrainzReleaseUrl(input: string): { providerReleaseId: string } | null` —
  the §10.2 pasted-URL parser: hostname-exact-match (`musicbrainz.org`,
  case-insensitive), `http`→`https` normalization, `/release/<mbid>` path
  only (rejecting every other entity path and any extra segment beyond one
  optional trailing slash), tolerant-and-stripped query/fragment, rejects
  userinfo/credentials, non-`http(s)` schemes, and an explicit non-default
  port (spec §10.2 itself lists this exact rejection case —
  `musicbrainz.org:8080` — verified against the approved spec text during
  this correction round, not invented here), validates the extracted ID
  against `MUSICBRAINZ_RELEASE_ID_PATTERN`, and
  lowercases it. An empty/whitespace-only input returns `null` and is
  treated by the caller as "untouched," not an error (§10.2's own
  distinction — this function does not need to encode that distinction
  itself, the caller does).
- `musicBrainzWebSearchUrl(term: string | null): string` — the §12 outbound
  "Search on MusicBrainz" URL builder (`type=release&method=indexed`, `query`
  omitted entirely when `term` is `null`/empty rather than sent empty).

Why a new module and not adding these to `musicbrainz.ts` directly: this is
the **first** browser-side consumer `musicbrainz.ts`'s contents ever need
(confirmed above — today it has zero `src/` importers). Importing a module
that also contains provider-fetch/timeout/`AbortController` logic into
`DiscoverPanel.tsx` and `AlbumDetailPage.tsx` would work at the bundler
level but blurs the "browser never talks to the provider directly" boundary
(spec §15) that this project has otherwise kept clean with exactly this
kind of extraction (`ownedRelease.ts` precedent, spec 0016 Finding B).
`musicbrainzIdentity.ts` has zero network code, so it is safe by
construction to import from anywhere, including the browser.

**2. Provider search internal result shape — exported from `musicbrainz.ts`,
not added to `types.ts`.**

```ts
// musicbrainz.ts
export type MusicBrainzSearchPage = {
  candidates: CatalogCandidate[]
  rawCount: number        // releases.length, pre-normalization
  providerCount: number   // payload.count
  providerOffset: number  // payload.offset
}
```

`searchMusicBrainzReleases` changes from
`(options: MusicBrainzSearchOptions) => Promise<CatalogCandidate[]>` to
`(options: MusicBrainzSearchOptions & { offset: number; mode: SearchMode }) => Promise<MusicBrainzSearchPage>`.
It builds the query string via the new mode-aware template (below), passes
`offset` through to `buildMusicBrainzSearchUrl` (which gains an `offset`
parameter), and — **in this same function, the same place the existing
`releases`-is-an-array check already lives** — validates, before returning:

- `Array.isArray(payload.releases)` (existing check, unchanged);
- `payload.count` is a finite non-negative integer;
- `payload.offset` is a finite non-negative integer, **and** equals the
  `offset` this call actually requested;
- `rawCount` (the validated `releases.length`) never exceeds the effective
  `limit` requested;
- when `rawCount > 0`, `payload.count >= offset + rawCount`.

Any failure throws the existing `MusicBrainzError('provider_bad_response', …)`
— **one category, reused, not a new one** — exactly like today's malformed-array
case. `MusicBrainzSearchPage` is **not** added to `src/lib/catalog/types.ts`:
nothing outside `musicbrainz.ts` and `catalog-handlers.mts` needs
`rawCount`/`providerCount` — the browser only ever sees the final `hasMore`
boolean the handler computes from them. This keeps `types.ts` a pure
browser/server wire-contract file and `musicbrainz.ts` the
provider-adapter-internals file, matching the project's existing separation.

`hasMore` itself is computed by a small, independently unit-testable pure
function in `catalog-handlers.mts` (a request/response-contract concern, not
a provider-adapter concern):

```ts
// catalog-handlers.mts (exported for direct unit testing alongside the
// existing handler-level tests)
export function computeHasMore(page: {
  rawCount: number
  limit: number
  offset: number
  providerCount: number
}): boolean {
  return (
    page.rawCount === page.limit
    && page.offset + page.limit < MAX_EXPOSED_RESULTS
    && page.offset + page.rawCount < page.providerCount
  )
}
```

This is spec §7.2's exact three-condition formula, verified against its
three worked examples (below, "Pagination math verification").

**3. Browser client contract — `src/lib/catalog/client.ts` gains two new
exports; `searchCatalog` becomes a thin wrapper (above); nothing else
changes shape.**

```ts
export type SearchCatalogPageOptions = {
  query: string
  mode: SearchMode        // 'all' | 'artist' | 'album'
  offset?: number         // default 0
  limit?: number          // default DEFAULT_CATALOG_LIMIT
}

export async function searchCatalogPage(
  client: BrowserSupabaseClient,
  options: SearchCatalogPageOptions,
): Promise<CatalogSearchResponse>   // { candidates, offset, hasMore }

export async function lookupCatalogRelease(
  client: BrowserSupabaseClient,
  releaseId: string,
): Promise<CatalogSearchResponse>   // { candidates: [one], offset: 0, hasMore: false }

export async function searchCatalog(          // UNCHANGED signature/return
  client: BrowserSupabaseClient,
  query: string,
  limit = DEFAULT_CATALOG_LIMIT,
): Promise<CatalogCandidate[]>
```

`searchCatalogPage` builds `?q=&mode=&offset=&limit=`; `lookupCatalogRelease`
builds `?releaseId=` alone (never alongside `q`/`mode`/`offset`/`limit`,
mirroring the server's own mutual-exclusivity contract so a client bug
cannot even construct the rejected shape). Both share the existing
`requestCatalog`/auth/error-parsing plumbing — no new HTTP/auth code.

**4. `SearchMode` type — `src/lib/catalog/types.ts`.**

```ts
export type SearchMode = 'all' | 'artist' | 'album'
```

Alongside the existing `CatalogProvider`/`CatalogCandidate` types (this is a
shared browser+server wire-contract value, not a provider internal).
`CatalogSearchResponse` gains `offset: number` and `hasMore: boolean`,
exactly per spec §8.2 — additive, so any code reading only `.candidates`
(there is none left, after `searchCatalog`'s own internal update, but the
type itself stays structurally compatible) continues to compile.

**5. Search-mode selector accessibility — new sibling primitive,
`src/ui/primitives.tsx`.**

`SegmentedControl` is untouched (Collection Grid/List keeps its current
`aria-pressed` toggle semantics — that surface is a true two-state toggle,
not a three-way mutually-exclusive choice, so it is not being "fixed," it
was never wrong). A new, narrowly-scoped export, `SegmentedRadioGroup`,
mirrors `SegmentedControl`'s prop shape (`options`/`value`/`onChange`/`label`)
for CSS/visual consistency (same `.vi-segmented`/`.vi-segmented__opt` classes,
so **no new CSS class is needed** — only the ARIA attributes differ) but
renders `role="radiogroup"` on the wrapper and `role="radio"`/`aria-checked`
on each option button instead of `role="group"`/`aria-pressed"`. Discover's
mode selector is the first (and, per spec §19, only required) consumer.

**6. Discover state shape and concurrency guard.**

`DiscoverPanel.tsx`'s existing `phase` (`'initial'|'loading'|'results'|'no-results'|'error'`)
keeps its exact current meaning — it describes the **first-page search**
lifecycle only, unchanged. Added, orthogonal state:

```ts
const [mode, setMode] = useState<SearchMode>(restored?.mode ?? 'all')
const [offset, setOffset] = useState(restored?.result?.offset ?? 0)
const [hasMore, setHasMore] = useState(restored?.result?.hasMore ?? false)
const [loadingMore, setLoadingMore] = useState(false)
const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

// Exact-URL lookup: fully independent lifecycle, never touches the above.
const [exactUrlInput, setExactUrlInput] = useState('')
const [exactUrlPhase, setExactUrlPhase] =
  useState<'idle' | 'invalid' | 'loading' | 'result' | 'error'>('idle')
const [exactUrlError, setExactUrlError] = useState<string | null>(null)
const [exactCandidate, setExactCandidate] = useState<CatalogCandidate | null>(null)
```

**Stale-response guard (resolved — a monotonic request-generation counter,
not `AbortController`):** today's `runSearch` has an `inProgress` ref that
blocks a *second concurrent submit*, but nothing stops a response from an
**older** request landing after the user has since changed the mode or
started a fresh search — a real, currently-unguarded race the spec's
concurrency requirements (its "stale response" edge case, and this plan's
own re-derivation of it) expose once mode-switching and Load More both
exist. Add:

```ts
const requestSeq = useRef(0)
```

Incremented on: a new search submission, a mode change, and "New search."
Every async operation (first-page search, Load More, and — separately, its
own tiny in-flight boolean is enough since it is single-shot — not
required for the exact-URL lookup) captures `const seq = ++requestSeq.current`
(or reads the freshly-incremented value) before awaiting, and every
`setState` call after the `await` is guarded by `seq === requestSeq.current`;
a mismatch means a newer action has already superseded this one, so the
stale response is silently discarded (not shown as an error — it was
correctly superseded, not a failure). This is the minimal mechanism that
satisfies the spec's ordering requirements without introducing
`AbortController`/cancellation complexity the task explicitly says not to
add unless materially necessary — nothing here needs to actually cancel the
in-flight `fetch`, only to ignore its result if it arrives late.

**Candidate accumulation:** `candidates` becomes append-only across Load
More; a `Set<string>` of already-present `providerReleaseId`s (derived from
`candidates`, not a separate stored field) is checked before appending each
new page's entries, dropping duplicates per §7.4. A mode change or new
search **replaces** (empties) `candidates`, exactly as today.

**Candidate card de-duplication (not a new component):** the existing
per-candidate `<li>`/`<article className="vi-candidate">` JSX block
(`DiscoverPanel.tsx:283-359`) is extracted into a small **local** render
function (e.g. `renderCandidate(c: CatalogCandidate)`), not exported, not a
new design — reused identically by the results list, by Load More's
appended entries, and by the exact-lookup's single result. This satisfies
spec §10.3 point 5 ("no new candidate-rendering component") literally: the
component doesn't change, only where its markup is invoked from.

**Duplicate-copy dialog:** the existing `confirmingCandidate`/`Dialog` state
is reused verbatim for a candidate reached via Load More or the exact-lookup
— no new dialog state, matching spec §16 exactly.

**Draft persistence:** `lastResult.current`/`saveCatalogSearchDraft` calls
extend to carry `mode`, `offset`, `hasMore` alongside the existing
`submittedQuery`/`candidates`, per spec §9's additive shape. The
`catalogSearchDraft.ts` parser (`parseDraft`/`parseResult`) is extended to
treat these three fields as **optional on read**, defaulting
`mode = 'all'`, `offset = 0`, `hasMore = false` when absent, so an
already-stored old-shaped draft restores exactly as it does today rather
than being invalidated.

### Exact likely files

**New:**

- `src/lib/catalog/musicbrainzIdentity.ts` — MBID pattern (canonical),
  `musicBrainzReleaseUrl`, `parseMusicBrainzReleaseUrl`,
  `musicBrainzWebSearchUrl`.
- `src/lib/catalog/musicbrainzIdentity.test.ts` — unit tests for all four.

**Modified (provider/API):**

- `src/lib/catalog/types.ts` — add `SearchMode`; extend
  `CatalogSearchResponse` with `offset`/`hasMore`.
- `src/lib/catalog/musicbrainz.ts` — re-export `MUSICBRAINZ_RELEASE_ID_PATTERN`
  from the new identity module; `normalizeMusicBrainzRelease` calls
  `musicBrainzReleaseUrl` instead of its inline string; add `literalize(s)`
  (Unicode-aware Boolean-keyword neutralization, spec §6.2's exact
  `/(?<![\p{L}\p{N}_])(AND|OR|NOT)(?![\p{L}\p{N}_])/gu`), extend `escape(s)`
  usage into a `buildMusicBrainzQuery(mode, raw)` mode→template function (the
  three templates in spec §6.2's table); `buildMusicBrainzSearchUrl` gains an
  `offset` parameter; `searchMusicBrainzReleases` changes shape (above,
  "Chosen designs" §2) and gains the §8.4 validation.
- `src/lib/catalog/musicbrainz.test.ts` — extend for all of the above (see
  "Test plan" below).
- `src/lib/catalog/client.ts` — add `searchCatalogPage`, `lookupCatalogRelease`;
  `searchCatalog` becomes the thin wrapper.
- `src/lib/catalog/client.test.ts` — extend for the new exports and the
  `searchCatalog`-sends-`mode=all` compatibility assertion.
- `netlify/functions/_shared/catalog-handlers.mts` — `parseSearchRequest`
  replaced/extended by a request-shape branch (`{ kind: 'search', … } |
  { kind: 'exact', releaseId }`); `mode` validation (invalid → rejected,
  omitted → `all`); `offset` validation; the combined
  `offset + limit <= MAX_EXPOSED_RESULTS` check; `releaseId` mutual
  exclusivity against `q`/`mode`/`offset`/`limit`; `handleCatalogSearch`
  branches into the existing paced-search path (now also computing
  `hasMore` via the new `computeHasMore`) or a paced
  `lookupReleaseWithRateLimitRetry` call (reusing the exact function
  `handleCatalogAdd` already uses) for the exact-lookup branch, with no
  genre enrichment and no database write on that branch.
- `netlify/tests/catalog-functions.test.ts` — extend for all of the above
  (see "Test plan" below). **No change to `netlify/functions/catalog-search.mts`**
  (the thin entrypoint delegates unchanged).

**Modified (Discover):**

- `src/catalog/DiscoverPanel.tsx` — mode selector (`SegmentedRadioGroup`),
  Load More button + scoped error/retry, exact-URL input + validation +
  result, "Search on MusicBrainz" outbound link, the state/concurrency
  changes above, the extracted `renderCandidate` helper, external-link
  accessible-name enhancement on the existing per-candidate link.
- `src/catalog/DiscoverPanel.test.tsx` — extend substantially (see "Test
  plan" below).
- `src/catalog/catalogSearchDraft.ts` — additive `mode`/`offset`/`hasMore`
  fields in both `CatalogSearchDraft` and `CatalogSearchResult`, with
  optional-on-read backward compatibility in `parseDraft`/`parseResult`.
  (Draft-restoration assertions live in `DiscoverPanel.test.tsx` — see
  finding above; no separate draft test file exists to extend.)

**Modified (Scan — accessibility enhancement only, confirmed no state/logic
change):**

- `src/catalog/ScanPanel.tsx` — the existing per-candidate MusicBrainz link's
  accessible name gains the "(opens in a new tab)" `.vi-visually-hidden`
  note (the one enhancement spec §19/§28 requires here); **no other line in
  this file changes.**
- `src/catalog/ScanPanel.test.tsx` — one new assertion for the accessible-name
  addition; every existing test unmodified.

**Modified (Record Detail):**

- `src/pages/AlbumDetailPage.tsx` — one new `dt`/`dd` row appended inside the
  existing `<dl className="vi-album__meta">`, shown iff
  `!isEditableRelease(release) && musicBrainzReleaseUrl(release.provider_release_id) !== null`,
  linking to that URL, `target="_blank" rel="noreferrer"`, with the same
  "(opens in a new tab)" accessible-name note.
- `src/pages/AlbumDetailPage.test.tsx` — new cases (see "Test plan" below).

**Modified (shared primitives):**

- `src/ui/primitives.tsx` — add `SegmentedRadioGroup` (new export,
  `SegmentedControl` untouched).
- `src/ui/primitives.test.tsx` if one exists, or a new small test alongside
  the existing primitives coverage — grep confirmed no dedicated
  `primitives.test.tsx` exists today; add `SegmentedRadioGroup` coverage
  inside `DiscoverPanel.test.tsx`'s mounted assertions instead (it is
  exercised there as a real consumer) rather than inventing a new
  primitives test file for one component.

**CSS (existing files only, no new stylesheet):**

- `src/styles/components.css` — the exact-URL input row, Load More button
  state, `SegmentedRadioGroup`'s radio-specific visual states if they
  diverge from `SegmentedControl`'s (ideally they don't — same classes).
- `src/styles/pages.css` — Discover page layout adjustments for the new
  controls, mobile no-overflow (spec §20).

No `supabase/*`, no `package.json`/`package-lock.json`, no Netlify/Vite
config file, no new dependency.

### Implementation order

1. `musicbrainzIdentity.ts` + its own unit tests, fully in isolation (no
   other file imports it yet).
2. `musicbrainz.ts`: re-export the pattern from the new module (confirm
   `musicbrainz.test.ts` and `catalog-functions.test.ts` still pass
   unmodified — proves zero import-site drift); refactor
   `normalizeMusicBrainzRelease` to call `musicBrainzReleaseUrl`; add
   `literalize`/`buildMusicBrainzQuery`; extend `buildMusicBrainzSearchUrl`
   with `offset`; change `searchMusicBrainzReleases`'s shape and add the
   §8.4 validation. Get `musicbrainz.test.ts` green before touching the
   handler.
3. `types.ts`: add `SearchMode`, extend `CatalogSearchResponse`.
4. `catalog-handlers.mts`: request-shape branching, `mode`/`offset`
   validation, `computeHasMore`, the exact-lookup branch. Get
   `catalog-functions.test.ts` green.
5. `client.ts`: `searchCatalogPage`, `lookupCatalogRelease`, the
   `searchCatalog` wrapper. Get `client.test.ts` green (including the new
   Scan-compatibility assertion).
6. `catalogSearchDraft.ts`: additive fields + backward-compatible parsing.
7. `primitives.tsx`: `SegmentedRadioGroup`.
8. `DiscoverPanel.tsx`: mode selector → Load More → exact-URL lookup →
   "Search on MusicBrainz" link → external-link accessible-name pass →
   candidate-card extraction, in that order, running
   `DiscoverPanel.test.tsx` after each sub-step rather than only at the end.
9. `ScanPanel.tsx`: the one accessible-name addition.
10. `AlbumDetailPage.tsx`: the provenance link.
11. CSS pass (`components.css`, `pages.css`), verified at the existing
    mobile breakpoint.
12. Full automated gate from a clean checkout.
13. Manual local smoke (§"Local manual smoke" below) — no deploy yet.

### Edge cases to cover explicitly

Directly from spec §12 (task brief) plus this plan's own concurrency design,
mapped to where each is actually exercised:

- Same query re-submitted → resets to offset 0, fresh `candidates` (existing
  `runSearch` behavior, unchanged in spirit).
- Mode switch clears displayed results/pagination but preserves the
  typed-but-unsubmitted input text (§6.6) — test both halves separately.
- **"New search" — fixed behavior:** spec §6.6 only says mode-*change*
  resets pagination; "New search" is today's existing `resetSearch`. Fixed
  decision: "New search" clears query/results/pagination state exactly as
  today and **preserves the currently-selected search mode** (the user
  picked a mode; "New search" means "let me search for something else in
  the mode I'm already using," not "start over entirely"). Test both halves:
  mode value unchanged after "New search," and query/candidates/pagination
  actually cleared.
- Old sessionStorage draft (pre-enhancement shape) restores today's
  behavior + implied `mode: 'all'`, `offset: 0`, `hasMore: false` — explicit
  test with a hand-built old-shaped stored value.
- Load More double-click → `loadingMore` guard + `requestSeq` both prevent a
  second concurrent request; only one page is fetched.
- Load More error → `loadMoreError` shown near the list bottom, existing
  candidates untouched, Retry re-issues the **same** offset (not
  `offset + PAGE_SIZE` again).
- Query changed (new submit) while a Load More request is in flight → the
  Load More response's `seq` no longer matches `requestSeq.current` when it
  resolves → silently discarded; the new search's own response (a later,
  higher `seq`) applies normally.
- Mode changed while a first-page search is in flight → same guard;
  additionally the mode-change handler itself bumps `requestSeq` so the
  in-flight request's eventual resolution is provably stale even if it
  otherwise would have "looked" current.
- Stale response arriving after a newer search → discarded by the `seq`
  check, not rendered as an error and not silently merged into current
  results.
- Exact URL submitted twice rapidly → the exact-URL "Find exact release"
  button disables while `exactUrlPhase === 'loading'`, exactly like the
  spec's own §10.4 table — single-flight by construction, no generation
  counter needed here.
- **Normal search vs. exact lookup — fixed behavior:** fully independent
  surfaces, fully independent state slices (above) — never cross-contaminate.
  Starting a normal search does **not** automatically clear a successful
  exact-lookup result, and vice versa; the exact-lookup result remains on
  screen until the exact-lookup surface itself is changed (a new URL
  submitted) or explicitly reset. Test: submit a normal search after a
  successful exact-lookup result is showing, and confirm the exact-lookup
  result is still rendered unchanged.
- Exact lookup ownership data still loading → the exact-lookup's rendered
  card reuses the identical `collectionStatus !== 'ready'` disabled-action
  branch the results list already has (same `renderCandidate` helper — this
  falls out of "no new candidate-rendering component" for free).
- Manual add still reachable at every step — untouched code path, verified
  by the existing regression tests continuing to pass.
- Duplicate `providerReleaseId` across two Load More pages → deduped on
  append, order preserved (§7.4).
- A full raw page with one or more normalization rejects → `rawCount` counts
  the raw array length **before** normalization filtering, so `hasMore`'s
  first condition (`rawCount === limit`) stays `true` even when
  `candidates.length` (post-normalization) is smaller — the exact
  regression case §7.2/§8.2 call out.
- 20-result window reached → `computeHasMore`'s second condition
  (`offset + limit < MAX_EXPOSED_RESULTS`) returns `false` regardless of
  `providerCount`.
- `providerCount` exactly equal to rows already returned →
  `computeHasMore`'s third condition (`offset + rawCount < providerCount`)
  is `false` — the exact regression the corrected formula exists to
  prevent (worked example 1 in spec §7.2, re-verified below).
- Provider malformed pagination metadata (10 cases, §8.4/§22) → all mapped
  to `provider_bad_response` inside `searchMusicBrainzReleases`, never
  reaching `computeHasMore`.
- Hebrew/non-Latin terms → pass through `literalize`/`escape` unchanged in
  content, verified against the exact matrix spec §6.2/§22 already define
  (including the Unicode-boundary regression cases:
  `שלוםANDעולם`/`éANDé`/`CANDY`/`NOTHING BUT THIEVES`).
- Literal `AND`/`OR`/`NOT` and mixed-script embedded keyword → `literalize`
  per the exact regex above.
- Invalid MusicBrainz entity URL, lookalike domain, query/fragment
  stripping, malformed MBID → `parseMusicBrainzReleaseUrl`'s own table,
  tested in isolation with zero network mock needed.
- Manual Record Detail (no provider id) → link hidden.
- Malformed stored `provider_release_id` (synthetic, defensive-only case —
  should be unreachable in practice) → `musicBrainzReleaseUrl` returns
  `null` → link hidden, never a malformed `href`.

### Test plan

Organized by file, each item traceable to a spec §22 category:

**`src/lib/catalog/musicbrainzIdentity.test.ts` (new):**
`musicBrainzReleaseUrl` valid/invalid MBID; `parseMusicBrainzReleaseUrl` —
canonical URL, `http://`→`https://`, one optional trailing slash, tolerated
query/fragment stripped, wrong hostname, lookalike hostname
(`musicbrainz.org.evil.example`, `evil-musicbrainz.org`),
`/release-group/<id>`, `/artist/<id>`, `/recording/<id>`, `/work/<id>`,
`/label/<id>`, malformed MBID, missing ID, extra path segment, userinfo
credentials, non-`http(s)` scheme (`javascript:`, `data:`, `file:`),
non-default port, empty string (→ `null`, caller treats as untouched);
`musicBrainzWebSearchUrl` with and without a term.

**`src/lib/catalog/musicbrainz.test.ts` (extended):** `literalize` — every
must/must-not case from spec §22 (`AND`/`OR`/`NOT` alone, `LOVE AND WAR`,
`ROCK OR ROLL`, `שלום AND עולם`, `(AND)`, `AND/OR`, lowercase pass-through,
idempotence; `NOTHING BUT THIEVES`, `CANDY`, `שלוםANDעולם`, `éANDé`
untouched). `buildMusicBrainzQuery`/query templates — All/Artist/Album
construction including the corrected two-field `OR`; every Lucene
special-character escape (`+ - && || ! ( ) { } [ ] ^ " ~ * ? : \ /`,
including the documented `/` case); a literal `AND`/`OR`/`NOT` composed with
punctuation (`AND/OR`, `(AND)`) proving `literalize` then `escape` compose
correctly; a test asserting the trusted `All`-mode `OR` join is uppercase
and unescaped even when the user's own input independently contains a
literalized `or`; leading/trailing whitespace trimmed, internal whitespace
runs preserved exactly (not collapsed); min/max length identical across
modes (existing behavior, re-verified not regressed). `buildMusicBrainzSearchUrl`
with `offset`. `searchMusicBrainzReleases` — the 10 malformed-metadata cases
(`count` missing/string/negative/fractional; `offset`
missing/string/negative/fractional; provider `offset` ≠ requested; `releases`
missing/not-array — existing case, re-verified alongside the new ones);
`rawCount` exceeding the requested limit; `rawCount > 0` with
`providerCount < offset + rawCount`; a synthetic full-raw-page-with-rejected-entries
case proving `rawCount` (not `candidates.length`) is what's returned.

**`netlify/tests/catalog-functions.test.ts` (extended):** `computeHasMore`
unit-tested directly against the three worked examples (below); an
unrecognized `mode` → `invalid_query` (omitted → `all`, re-verified);
invalid/negative/non-integer `offset` → `invalid_query`; the combined
`offset + limit > 20` rejection (`offset=15&limit=10` rejected,
`offset=15&limit=5` accepted); `releaseId` + any of `q`/`mode`/`offset`/`limit`
→ `invalid_query`; neither `q` nor `releaseId` → `invalid_query`; **pacing and
retry are separate contracts, per spec §14 — do not conflate them:** the
existing shared `paceProviderRequest()` pacing is reused **unmodified by
every new call path** (search, Load More, and the exact lookup all call it);
the existing single bounded rate-limit retry (`lookupReleaseWithRateLimitRetry`,
1200ms backoff) is reused **only by the exact-lookup branch**, because that
branch is the one that already calls `lookupReleaseWithRateLimitRetry` today
(via `handleCatalogAdd`'s existing lookup). Normal search and Load More get
**no retry policy** — search has none today, and spec §14 explicitly does not
add one, to avoid a burst of retried requests defeating the 1/second pacing
intent under a sustained provider outage. Test both halves separately:
pacing called before every one of the three request types; the bounded retry
exercised only on the exact-lookup path, never on a plain search/Load More
429/503; existing add-path tests unmodified.

**Exact-lookup zero-write test, using the existing dependency seam (correction
from an earlier draft, which assumed a mock seam that does not exist):**
`upsertCatalogRelease` and `createCatalogCollectionItem` are private,
module-local functions in `catalog-handlers.mts` — **not** members of
`CatalogFunctionDependencies` — confirmed by direct inspection of the current
file. There is no `dependencies.upsertRelease`/`dependencies.createCollectionItem`
to mock directly, and this plan does **not** introduce one merely for this
test. Instead, reuse the exact harness `catalog-functions.test.ts` already
builds for the add-path tests (`createClient: vi.fn((_url, key) => key ===
'service-key' ? serviceClient : authClient)`, with `serviceClient.from` itself
a `vi.fn`): for the exact-lookup request, assert

- `dependencies.lookupRelease` is called once with the expected
  `providerReleaseId` (the exact lookup happened);
- `dependencies.lookupReleaseGroupGenres` is **not** called (no genre
  enrichment on this branch);
- `createClient` is **never called with the service-role key** for this
  request — the harness's `serviceClient` mock object is constructed
  up-front regardless (it exists to serve the add-path tests in the same
  file), so the precise, correct assertion is that it is never **selected/
  returned** through the service-role `createClient` path for an
  exact-lookup request, not that it fails to exist; consequently
  `serviceClient.from` is never invoked, so neither a `.from('releases')`
  nor a `.from('collection_items')` call occurs;
- the response is the expected single-candidate `CatalogSearchResponse`
  shape (`{ candidates: [one], offset: 0, hasMore: false }`).

This proves the same fact ("zero database write from this branch") the
original draft intended, using the dependency seam that actually exists
today. **If implementation later discovers this seam cannot provide robust
evidence** (e.g. because `upsertCatalogRelease`/`createCatalogCollectionItem`
are refactored in a way that changes this), **STOP and report** rather than
silently adding a new injectable persistence dependency to
`CatalogFunctionDependencies` to work around it.

**`src/lib/catalog/client.test.ts` (extended):** `searchCatalogPage` sends
`q`/`mode`/`offset`/`limit` correctly and returns the full response;
`lookupCatalogRelease` sends `releaseId` alone; `searchCatalog` (unchanged
signature) internally requests `mode=all` and returns exactly `.candidates`
— the Scan-compatibility proof; existing auth/error-handling tests
unmodified.

**`src/catalog/DiscoverPanel.test.tsx` (extended):** mode selector renders
with `role="radiogroup"`/`role="radio"`/`aria-checked` (not `aria-pressed`);
selecting a mode resets pagination and clears results but keeps typed text;
first page at offset 0; "Load more" appends without replacing; rapid
double-click on "Load more" issues exactly one request; a mocked later-page
failure preserves all prior candidates and offers Retry at the same offset;
exhaustion (mocked partial page, and separately the 20-result window)
removes "Load more"; duplicate `providerReleaseId` across two mocked pages
is deduped on append; exact-URL local validation rejects an invalid URL
with zero network calls; a valid exact-URL performs the lookup and renders
one candidate via the same card markup as a normal result; the exact
lookup makes no `addCatalogReleaseToCollection` call by itself; an
already-owned exact-lookup result shows the existing duplicate-copy
dialog/Cancel/Confirm flow (reusing the existing spec-0016 mounted-test
pattern, not a new parallel suite); a `collectionStatus !== 'ready'` render
never classifies any candidate (search, Load More, or exact-lookup) as
owned/not-owned; "Search on MusicBrainz" renders the correct `href` for a
typed term and the generic form when untyped; the existing per-candidate
link's accessible name includes "(opens in a new tab)"; a stale earlier
response (mocked, resolved after a later one) does not overwrite the
later, correct results; mode-change-mid-flight discards the stale response;
old-shaped draft (hand-built fixture) restores with `mode: 'all'`,
`offset: 0`, `hasMore: false` implied and does not invalidate the whole
draft; existing Hebrew/multilingual and duplicate-copy-confirmation tests
(spec 0015/0016) pass unmodified.

**`src/catalog/ScanPanel.test.tsx` (extended, one new case):** the existing
per-candidate MusicBrainz link's accessible name includes "(opens in a new
tab)"; every existing test (recognition flow, candidates/no-match/provider-error,
duplicate-copy Cancel/Confirm) passes unmodified — this is the Scan
regression proof.

**`src/pages/AlbumDetailPage.test.tsx` (extended):** a catalog-backed
release with a valid `provider_release_id` renders "View on MusicBrainz"
pointing at the exact release URL (not the release-group URL), with
`target="_blank" rel="noreferrer"` and the accessible-name note; a
manually-created release renders no such link; a synthetic
malformed-`provider_release_id` fixture renders no link (defensive
regression guard); existing metadata/favourite/rating/notes/custom-cover
tests pass unmodified.

**Regression suite (must stay green, unmodified in intent, per spec §22):**
manual add; ordinary first-page catalog add; existing duplicate-copy
Cancel/Confirm tests (spec 0016); Scan's own duplicate-copy/candidate tests;
existing Hebrew/multilingual Discover and Scan tests (spec 0015); existing
collection-ownership readiness-gating tests (spec 0016 Finding B
correction).

### Pagination math verification (done at planning time, not deferred)

`computeHasMore` against spec §7.2's three worked examples:

| `providerCount` | `offset` | `limit` | `rawCount` | `rawCount===limit` | `offset+limit<20` | `offset+rawCount<providerCount` | `hasMore` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | 0 | 5 | 5 | true | true (5<20) | false (5<5 is false) | **false** ✓ |
| 6 | 0 | 5 | 5 | true | true (5<20) | true (5<6) | **true** ✓ |
| 100 | 15 | 5 | 5 | true | false (20<20 is false) | — (short-circuits) | **false** ✓ |

All three match the spec exactly; no discrepancy found. The combined
window-validation bound (`offset + limit > 20 ⇒ invalid_query`) is verified
separately: `offset=15,limit=5` → `20 > 20` false → accepted (this is
exactly the third worked example's request); `offset=15,limit=10` → `25>20`
true → rejected; `offset=20,limit=1` → `21>20` true → rejected.

### Automated gates

The global gate (top of this document). Additionally for PR B specifically:
`npm run test:run` file/test counts recorded against the pre-PR-B baseline
in the PR description; `npm audit --omit=dev` stays 0; no real MusicBrainz
call and no OpenRouter/model call anywhere in the suite (confirmed by
grepping the new/changed test files for any non-mocked `fetch`).

### Local manual smoke (before opening the PR, no deploy)

`npm run dev`, no production account required (a local/dev Supabase session
is enough since this only exercises Discover/Scan/Record Detail, not
auth/deploy-specific behavior). Split into two tiers:

**Tier 1 — non-provider UI smoke, runs without permission (no real
MusicBrainz call):** mode selector renders and switches; New Search;
mode-switch-clears-results-but-keeps-typed-text; exact-URL **local**
validation error cases (invalid host/path/scheme — zero network requests by
construction, §10.2); "Search on MusicBrainz" link's `href` is correct for
a typed term and for the generic untyped form (this is just reading the
link's `href` attribute — activating it is optional and, if done, opens an
external MusicBrainz page rather than calling any Vinyl Intelligence
endpoint); manual fallback still reachable; Record Detail
provider-link/manual-record-no-link rendering with fixture/existing data;
desktop and one mobile viewport (390–430px) layout. **Zero OpenRouter/
Vision/VIN calls at any point** — Scan is verified via its existing mocked
test suite, not a live smoke pass; this tier does not touch Scan's live
recognition flow at all.

**Tier 2 — real-MusicBrainz local smoke, OPTIONAL and permission-gated:**
mocked automated coverage (the "Test plan" above) is the pre-PR evidence on
its own; Tier 2 is not required to open PR B. **Before making any real
local MusicBrainz API request, STOP and obtain explicit human permission.**
If granted, predeclare a bounded maximum of **at most 6 MusicBrainz API
requests** for that local-smoke round — every actual provider request,
including retries, counts toward that cap; stop and ask again before
request 7. Within that budget: All/Artist/Album search (first page); one
Load More page; one real exact-release lookup. If permission is not given,
skip Tier 2 entirely — mocked automated coverage remains the evidence PR B
opens with, and real-provider verification waits for the bounded human
production-acceptance round after merge and deploy (below). This
correction round itself makes **zero** provider calls of either kind.

### Independent review gate

A reviewer confirms: every item in "Chosen designs" was actually
implemented as decided here (not silently reinterpreted); `computeHasMore`
matches the three worked examples above byte-for-byte; the §8.4 malformed-metadata
validation lives in exactly one place (`searchMusicBrainzReleases`) and is
not duplicated in the handler; `literalize`'s regex is the exact
Unicode-property-escape/lookaround form from spec §6.2 (not a plain `\b`,
regression-guarded by the Hebrew/accented-Latin embedded-keyword tests);
Scan's source file is byte-identical to baseline except for the one
accessible-name line; the mode selector uses `role="radio"`/`aria-checked`,
never `aria-pressed`; the SSRF analysis holds (the pasted URL string itself
never reaches a `fetch()` call anywhere — grep for it); the exact-lookup
branch makes zero database writes and zero genre-enrichment calls; the
duplicate-copy contract is the same shared helper and the same local
per-panel dialog pattern for every entry point (search, Load More,
exact-lookup); no file outside the "Exact likely files" list changed; no
migration/dependency/AI change; test adequacy against the "Test plan"
section above.

**Required bar: 0 BLOCKER / 0 HIGH / 0 MEDIUM** — matching this project's
established bar throughout (do not merge with a MEDIUM finding open).

### Human production acceptance (spec §23, operationalized)

Performed only after independent review passes, PR B merges, and deploy
from merged `main`. **Absolute hard cap: a maximum of 10 total real
MusicBrainz API requests for this entire acceptance round, retries
included.** Requests 1 through 10 are within the approved cap; **stop
before making request 11** and ask the human, rather than silently
exceeding it or manufacturing an unnecessary Add/delete mutation merely to
consume the remaining budget. **Zero OpenRouter/Vision/VIN/curator calls,
absolute, no conditional exception** (item 22 below). Prefer read-only
verification wherever an already-accepted path can be checked without a
new write (an already-owned record's duplicate-copy Cancel path, not a
fresh Confirm, unless a genuinely new copy is explicitly authorized and
later removed).

**Restored alignment with spec §23 (correction from an earlier draft, which
weakened the approved human-acceptance criterion into a non-comparative
check the plan is not authorized to substitute):** spec §23 items 2–3
require a **comparative, human-observed** ranking result for a deliberately
ambiguous real-world case — not merely "the right mode parameter was sent."
This plan does not weaken that; it only adds, as a supplement (not a
replacement), that the exact Lucene query template each mode builds is
already proven deterministically by the automated query-builder tests
(`musicbrainz.test.ts`) — the production comparison below is a
human-observed check of live provider *ranking behavior*, a different kind
of evidence than the automated tests provide, and spec §23 requires both.

**Non-Latin coverage folded into the same comparison terms (correction from
an earlier draft, which allocated non-Latin coverage to only one mode via a
separate request, satisfying neither the checklist's "in every mode"
wording nor spec §23 item 4 as written):** Term A and Term B (below) are
themselves chosen as deliberately ambiguous **non-Latin** real-world cases
(Hebrew or another non-Latin script — spec §23 permits either; this is not
narrowed to Hebrew specifically, and if no suitable non-Latin comparative
case can be found for one of the two terms within the approved budget,
**STOP and ask the human** rather than silently dropping "every mode" or
exceeding the cap). This makes the same four comparison requests do double
duty: they prove the Artist/Album comparative criteria **and**, in the same
act, that non-Latin text survives end-to-end in All mode (Term A/B's `All`
requests), Artist mode (Term A's `Artist` request), and Album mode (Term
B's `Album` request) — every mode spec §23 item 4 requires, with no
additional request.

**Concrete reuse scenario, staying inside the 10-request hard cap (retries
included):**

1. Term A — a deliberately ambiguous **non-Latin** artist-name term —
   searched in **All** mode. [request 1 — satisfies item 1's artist-only-query
   check, and is the first of item 4's three required non-Latin
   observations (All mode).]
2. The same Term A searched in **Artist** mode, compared directly against
   request 1's result — satisfies item 2's approved comparative criterion
   (the expected release visibly ranks better under Artist mode for this
   term than it did under All), and is item 4's second required
   observation (Artist mode, same non-Latin term). [request 2]
3. One "Load more" page on request 2's result set (chosen so Term A's
   Artist-mode result has more than 5 matches) — satisfies items 5 (initial
   page, already shown by request 2), 6 (append), and 7 (the rapid-click
   guard is a UI-level assertion that a second click makes no second
   request — verified without any additional provider call). [request 3]
4. Term B — a deliberately ambiguous **non-Latin** release-title term —
   searched in **All** mode — comparison baseline for item 3. [request 4]
5. The same Term B searched in **Album** mode, compared against request 4 —
   satisfies item 3's approved comparative criterion, and is item 4's third
   required observation (Album mode, same non-Latin term). [request 5]
6. One deliberately narrow query that returns a genuine partial raw page —
   satisfies item 9 via its approved partial-page branch (§23 item 9 is an
   **OR**: raw partial page, or the 20-result window — reaching the
   20-result window would itself cost 3 additional Load More requests for
   one query and is not required when the cheaper partial-page branch
   already satisfies the item; the 20-result-window path remains proven by
   the automated `computeHasMore`/pagination tests, which already cover it
   exhaustively). [request 6]
7. One exact-URL lookup on a real, not-yet-owned MusicBrainz release —
   satisfies items 10 (resolves correctly), 11 (a **local-only** rejection
   case costs zero network requests by construction), and 12 (no database
   write). [request 7]
8. One exact-URL lookup on a real, already-owned release — satisfies items
   13 (duplicate-copy affordance) and 14 (Cancel writes nothing). [request 8]

**Planned total: 8 real MusicBrainz requests**, leaving up to 2 in reserve
under the 10-request absolute hard cap for unplanned retries — do not spend
that headroom on additional provider calls merely because it exists. Items
15–21 and item 22 (below) add zero further MusicBrainz requests (a passive
`href`, existing already-catalogued data, UI-only viewport checks, and
Scan's own scope, respectively). **If the specific real-world non-Latin
Artist/Album comparative cases chosen during execution cannot be satisfied
within this budget, STOP before making request 11 and ask the human** — do
not silently drop non-Latin coverage from a mode, and do not substitute
more searches for a case that isn't cooperating.

1. All-mode search finds a release by title (as before) **and** now also by
   artist name alone (Term A in All mode, request 1 above) — confirming it
   returns that artist's releases (a case that previously returned poor/no
   results).
2. **Artist mode (spec §23 item 2 — approved comparative criterion,
   restored):** for Term A, a deliberately ambiguous non-Latin real-world
   case, the selected/expected release ranks visibly better under Artist
   mode (request 2) than it did under All mode (request 1) for the same
   term. The exact Lucene template (`artist:(...)`) is separately,
   deterministically proven by the automated query-builder tests
   (`musicbrainz.test.ts`) — this human check is the live-provider-ranking
   evidence spec §23 additionally requires, not a substitute for those
   tests, and not replaced by them.
3. **Album mode (spec §23 item 3 — the same approved comparative criterion,
   restored):** for Term B, a deliberately ambiguous non-Latin
   release-title-focused case, Album mode (request 5) produces
   title/release-focused results comparably improved over All mode
   (request 4) for the same term.
4. **A Hebrew (or other non-Latin) query stays intact end-to-end in every
   mode** — satisfied without a separate request: Term A/B's non-Latin
   script is observed intact in All mode (requests 1 and 4), Artist mode
   (request 2), and Album mode (request 5) — all three modes, using the
   same requests items 1–3 above already make.
5. Initial page renders correctly (5 results, or fewer with no error).
6. "Load more" appends without replacing/losing prior results.
7. Rapid repeated "Load more" clicks produce no parallel/duplicate
   requests or candidates.
8. (Load-More-failure-preserves-results is automated-test evidence per spec
   §23 item 8 — not re-attempted here as a forced production failure.)
9. **Result exhaustion (spec §23 item 9 — approved OR restored):** raw
   partial page, **or** the 20-result window — either is sufficient, not
   both. This round demonstrates the partial-page branch (request 6); the
   20-result-window branch is proven by automated tests and is not
   separately re-demonstrated in production, since the spec's own wording
   is disjunctive.
10. A real, valid MusicBrainz release URL resolves to the exact expected
    release.
11. An invalid release-group/artist/wrong-domain URL fails locally with no
    network request (verify via browser dev tools).
12. The exact lookup itself makes no database write (collection count
    unchanged with no Add clicked).
13. An already-owned exact-lookup result shows the duplicate-copy affordance
    and exact approved dialog copy.
14. Cancel on that dialog writes nothing.
15. "Search on MusicBrainz" opens the correct external destination in a new
    tab.
16. Existing per-candidate MusicBrainz links still work exactly as before
    (now with the accessible-name addition, verified via a screen reader or
    the accessible-name inspector, not required to change visible behavior).
17. A MusicBrainz-backed owned record's Record Detail page shows "View on
    MusicBrainz."
18. That link opens the exact release page, not the release-group page.
19. A manually-created record's Record Detail page shows no MusicBrainz
    link.
20. Mobile Discover (modes, Load More, exact-URL input) has no horizontal
    overflow.
21. Existing manual-add path still works, unchanged.
22. Existing Scan flow (recognition → candidates → confirm, including its
    own duplicate-copy handling) remains fully intact. **This item performs
    zero OpenRouter/Vision/VIN calls — none, under any circumstance.** Scan's
    regression is proven by: (a) the automated mocked regression suite
    (`ScanPanel.test.tsx`, unmodified in intent, per the "Test plan" above)
    for its state machine, add, and duplicate-copy behavior; (b) the
    `client.test.ts` compatibility assertion for the shared catalog-search
    contract Scan depends on; (c) already-existing, previously-accepted
    production Scan evidence (spec 0006/0016's own acceptance record) cited
    as historical evidence that Scan's recognition→candidate→confirm flow
    works in production. This enhancement does not trigger a new Vision
    recognition merely to re-prove Scan — spec 0017 is a non-AI enhancement,
    and its acceptance round performs **zero** OpenRouter calls, **zero**
    Vision calls, and **zero** VIN/curator calls, with no conditional
    exception.

### Stop conditions

Any of the spec's own §3/§18 non-goals turning out to be necessary in
practice, plus, specific to implementation:

- `searchMusicBrainzReleases`'s new §8.4 validation cannot be expressed
  without touching more than that one function → STOP, report exactly what
  spread and why.
- The Unicode-property-escape/lookaround regex (`\p{L}`/`\p{N}` with the `u`
  flag) is unsupported in the project's actual test/build/runtime target →
  STOP, report (do not silently fall back to plain `\b` — that reintroduces
  the exact defect spec 0017's Unicode-boundary correction round fixed).
- `musicbrainzIdentity.ts` cannot stay dependency-free/browser-safe without
  pulling in provider-fetch code after all → STOP, report the actual
  coupling found.
- Extending `catalogSearchDraft.ts`'s parser breaks backward compatibility
  with an old-shaped stored draft in a way this plan did not anticipate →
  STOP, report the specific incompatibility rather than silently widening
  what counts as "invalid."
- `SegmentedControl` cannot be left untouched without also duplicating
  significant CSS beyond what "same classes, different ARIA" implies →
  STOP, report the actual CSS coupling found.
- Any implementation path would require a migration, a new environment
  variable, a new dependency, a seventh Netlify Function, an RLS/grant
  change, a change to the duplicate-copy *decision rule*, a change to
  manual-add semantics, or any AI/model/prompt touch → STOP, return to the
  human before proceeding (spec §3/§18, restated here for this plan's own
  execution).
- Current source is found to contradict a specific spec 0017 clause in a
  way that cannot be resolved by implementing the spec as written → STOP,
  do not silently "resolve" the contradiction in code; report the exact
  clause and the exact contradicting source evidence.

**PR B is not "done" until human production acceptance (above) passes —
PR C does not start before that.**

### Expected implementation commits

Coherent, not one giant commit:

1. `feat: add musicbrainz identity helpers and boolean-keyword literalization`
   — `musicbrainzIdentity.ts` (+tests), `musicbrainz.ts`'s `literalize`/query
   templates/`offset`-aware URL builder/`MusicBrainzSearchPage` (+tests).
2. `feat: add catalog search pagination and exact-lookup contract` —
   `types.ts`, `catalog-handlers.mts` (+tests), `client.ts` (+tests).
3. `feat: add search-draft pagination compatibility` — `catalogSearchDraft.ts`.
4. `feat: add Discover search modes, load more, and exact MusicBrainz lookup` —
   `primitives.tsx` (`SegmentedRadioGroup`), `DiscoverPanel.tsx` (+tests),
   CSS.
5. `feat: add Record Detail MusicBrainz provenance link and external-link accessibility` —
   `AlbumDetailPage.tsx` (+tests), `ScanPanel.tsx` (+test), remaining CSS.

A sixth, small follow-up commit is acceptable only if local verification
(step 13 of the implementation order) surfaces something the above five
missed — not a planned default.

### Merge / deploy sequence

Open PR B → independent review → automated gate + review both green →
human-approved merge (normal merge commit) → `git pull --ff-only` → deploy
merged `main` (existing manual workflow) → non-provider smoke → STOP for
human production acceptance (above). Only after acceptance does PR C begin,
from the then-current `main`.

---

## PR C — Documentation / screenshot closeout

**Depends on:** PR B independently reviewed, merged, deployed, and
human-accepted.

**Documentation only.** No runtime, test, CSS, config, or dependency file.

### Exact documentation categories to evaluate (spec §24)

1. `README.md` — Discover feature description; architecture diagram's
   endpoint list **only if** the API surface description changed (spec's
   own framing: this enhancement changes an existing endpoint's parameters,
   not the topology or endpoint count — evaluate, don't assume a change is
   needed).
2. Root `SPEC.md` — its Discover/catalog sections, §13/§15/§16 as
   applicable.
3. `docs/USER_GUIDE.md` — Discover section: search modes, Load More, exact
   URL lookup, the new Record Detail link.
4. `docs/INSPECT.md` — only if a reviewer-path stop's evidence became stale
   or a new stop is genuinely warranted (not a mandatory new stop).
5. `docs/api-integrations.md` — the MusicBrainz section: new query modes,
   pagination, exact lookup.
6. `docs/architecture.md` — only if the topology or endpoint count/shape
   wording changed (likely no change needed — evaluate, don't assume).
7. `docs/verification.md` — a new evidence section following the exact
   precedent of spec 0016's "Final Submission Alignment Evidence" section:
   automated evidence distinguished from human-observed production
   evidence, the real PR B merge/deploy SHAs, the human-acceptance checklist
   results, the bounded real-provider call count actually used.
8. `docs/roadmaps/2026-09-02-complete-project-roadmap.md` — a new
   "post-freeze enhancement" entry, following the exact precedent already
   established for the Hebrew enhancement and Final Submission Alignment
   sections. **Never** edit `docs/roadmaps/2026-08-18-complete-project-roadmap.md`.
9. `docs/specs/README.md` — spec 0017's index line updated from "PLANNING
   ONLY" to its actual final state (implemented/merged/deployed/accepted,
   with the real PR/SHA references), following the exact convention already
   used for specs 0013–0016 there.
10. This plan (`docs/plans/017-...md`) and spec 0017 themselves — status
    lines updated to reflect completion, with real SHAs; historical
    "Correction from an earlier draft" language inside spec 0017 is
    **never** rewritten or removed — it remains permanent evidence of the
    audit process, exactly like every other spec/plan in this repository.

### Screenshot closeout (spec §25)

Refresh only what became genuinely stale, using real production screenshots
(no fabricated UI), redacted of personal information, following the exact
discipline already established in `docs/USER_GUIDE.md`/`docs/INSPECT.md`'s
existing closeout:

- `docs/assets/screenshots/09-discover.png` — now shows the mode selector.
- `docs/assets/screenshots/10-discover-results.png` — now potentially shows
  "Load more."
- A new Load-More-expanded state screenshot, if judged worth it.
- The exact-URL lookup UI/result — new screenshot.
- `docs/assets/screenshots/11-discover-duplicate-dialog.png` — only if its
  surrounding presentation visibly changed (the dialog's own approved copy
  is unchanged — likely no recapture needed; evaluate, don't assume).
- `docs/assets/screenshots/07-record-detail.png`,
  `08-hebrew-record.png` — now show "View on MusicBrainz" for a
  MusicBrainz-backed record.

**Explicitly not recaptured without reason:** Dashboard, VIN/Ask VIN,
History, Settings, mobile Collection — none of this enhancement's scope
touches those screens. Annotated `docs/assets/inspect/` images updated only
for the specific stop(s) whose represented evidence became stale.

### Rules against retrospective history rewriting

- Never edit `docs/roadmaps/2026-08-18-complete-project-roadmap.md`.
- Never alter an existing spec/plan Rev-log entry, closeout section, or
  recorded human-acceptance result — add new entries, don't rewrite old
  ones. Spec 0017's own "Correction from an earlier draft" passages stay
  exactly as written (they are the audit-trail evidence, not a draft to
  clean up after the fact).
- Never state that this enhancement was part of the original project plan —
  it is documented as a later, deliberate, human-requested post-freeze
  enhancement, exactly like the Hebrew enhancement and Final Submission
  Alignment were each documented as deliberate later evolution in their own
  time.
- Record only SHAs/deploy IDs/dates that actually exist at the time PR C is
  written — never predicted or placeholder values.

### Gate

`git diff --check`; `git diff --name-only` limited to the categories above
plus the screenshot/inspect asset paths; no `src/`, `netlify/`, `supabase/`,
CSS, test, package, env, or config path; historical 2026-08-18 roadmap hash
unchanged; no provider call required for documentation text (screenshot
capture is real-application, read-only, per the existing established
discipline — no new database mutation merely for a screenshot).

### Independent review gate

A reviewer confirms every current-state claim in the touched documents is
true as of PR C's own head, every historical claim (including spec 0017's
own internal correction history) is preserved, the 2026-08-18 roadmap is
untouched, and no scope beyond the categories above was touched.

**Done when:** independently reviewed and merged. Per spec §26/§27, a new
final-submission tag may be created **only after** this PR C closeout is
also independently re-audited at the rigor of the original "FINAL PROFESSOR
ATTACK" audit — that re-audit and any resulting tag are explicitly **not**
part of this plan's scope; they are a separately authorized follow-up task.

---

## Traceability matrix (spec section → implementation → test → acceptance)

| Spec § | Implementation surface | Test surface | Acceptance/evidence surface |
| --- | --- | --- | --- |
| §6 Search modes | `musicbrainz.ts` (`literalize`, query templates), `types.ts` (`SearchMode`), `DiscoverPanel.tsx` (`SegmentedRadioGroup`) | `musicbrainz.test.ts`, `DiscoverPanel.test.tsx` | Acceptance items 1–4 |
| §7 Pagination | `musicbrainz.ts` (`MusicBrainzSearchPage`), `catalog-handlers.mts` (`computeHasMore`), `DiscoverPanel.tsx` (Load More state) | `musicbrainz.test.ts`, `catalog-functions.test.ts`, `DiscoverPanel.test.tsx` | Acceptance items 5–9 |
| §8 API contract | `types.ts`, `catalog-handlers.mts`, `client.ts` | `catalog-functions.test.ts`, `client.test.ts` | Covered by §7/§10/§11 acceptance items |
| §9 Draft compatibility | `catalogSearchDraft.ts` | `DiscoverPanel.test.tsx` (old-shaped-draft case) | No dedicated production acceptance item — automated only |
| §10 Exact URL | `musicbrainzIdentity.ts` (`parseMusicBrainzReleaseUrl`), `DiscoverPanel.tsx` | `musicbrainzIdentity.test.ts`, `DiscoverPanel.test.tsx` | Acceptance items 10–14 |
| §11 Exact lookup API | `catalog-handlers.mts`, `client.ts` (`lookupCatalogRelease`) | `catalog-functions.test.ts`, `client.test.ts` | Acceptance items 10, 12 |
| §12 Search on MusicBrainz | `musicbrainzIdentity.ts` (`musicBrainzWebSearchUrl`), `DiscoverPanel.tsx` | `musicbrainzIdentity.test.ts`, `DiscoverPanel.test.tsx` | Acceptance item 15 |
| §13 Record Detail | `AlbumDetailPage.tsx`, `musicbrainzIdentity.ts` (`musicBrainzReleaseUrl`) | `AlbumDetailPage.test.tsx` | Acceptance items 17–19 |
| §14 Provider pacing | `catalog-handlers.mts` (unmodified, reused) | `catalog-functions.test.ts` (regression) | Implicit in all real-provider acceptance items |
| §15 Security | `musicbrainzIdentity.ts` (SSRF-safe parser), `catalog-handlers.mts` (server re-validation) | `musicbrainzIdentity.test.ts`, `catalog-functions.test.ts` | Acceptance item 11; independent-review SSRF check |
| §16 Duplicate copy | `ownedRelease.ts` (unmodified, reused), `DiscoverPanel.tsx` (shared dialog reused) | `DiscoverPanel.test.tsx` (exact-lookup + Load More owned cases) | Acceptance items 13–14 |
| §17 Manual fallback | Unmodified — `CollectionForm` reused | Existing regression tests | Acceptance item 21 |
| §19 Accessibility | `primitives.tsx` (`SegmentedRadioGroup`), `DiscoverPanel.tsx`/`ScanPanel.tsx`/`AlbumDetailPage.tsx` (accessible-name note) | `DiscoverPanel.test.tsx`, `ScanPanel.test.tsx`, `AlbumDetailPage.test.tsx` | Acceptance item 16; independent-review ARIA check |
| §20 Mobile | CSS (`components.css`, `pages.css`) | Manual smoke (no automated viewport test in this project's existing convention) | Acceptance item 20 |
| §21 UI states | `DiscoverPanel.tsx` (all phases) | `DiscoverPanel.test.tsx` | Acceptance items throughout |
| §22 Tests | This plan's entire "Test plan" section | — | — |
| §23 Human acceptance | — | — | This plan's "Human production acceptance" section (operationalized) |
| §24–25 Docs/screenshots | PR C | — | PR C independent review |
| §26 Tag | Explicitly deferred — not this plan's scope | — | — |
| §27 Definition of Done | This entire plan, end to end | — | PR C closeout confirms all 15 items |

---

## Unresolved behavior-defining questions

**NONE.** Every implementation choice this plan needed to make — MusicBrainz
identity/URL module location, browser client contract shape, provider
search internal result shape and its validation layer, the exact-lookup
zero-write test strategy against the real dependency seam, Scan's
compatibility mechanism, Discover's state/concurrency design, the
accessible search-mode control's implementation, "New search"'s effect on
the selected mode, the coexistence of a normal search and an exact-lookup
result, CSS file targets, test file targets, and PR decomposition — is
resolved above, with rationale grounded in direct source inspection, and is
now a fixed Plan 017 decision, not left as "could use X or Y."

## References

`docs/specs/0017-discover-musicbrainz-navigation-enhancement.md` (primary
contract); `docs/plans/015-hebrew-multilingual-record-support.md` and
`docs/plans/016-final-submission-alignment.md` (operational-rigor
precedent); `docs/plans/005-milestone-4-catalog-api.md` (original catalog
module structure); `docs/decisions/0002-proposed-catalog-provider-boundary.md`;
`AGENTS.md` (Development Workflow, Scope Control, Verification, Git/PR
discipline); `intent.txt` §6.2, §6.3, §15–§17, §19.

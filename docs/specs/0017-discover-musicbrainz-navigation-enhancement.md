# 0017 Discover & MusicBrainz Navigation Enhancement (Specification)

Status: **PLANNING ONLY — implementation not started.** No runtime, test, schema,
dependency, or migration change has been made. This document is the primary
specification; a companion implementation plan (`docs/plans/017-...`) is
expected before implementation begins, following the same human-approval
discipline as every prior milestone/enhancement (`AGENTS.md` "Development
Workflow").

Baseline `main` when this spec was written: `cc8570a9d5c0a3e587b8ebb3facc1233f397a576`
(PR #33 — final presentation documentation, merged). Accepted production
runtime remains `81812c1f52d56bea84e142d828dd1e1427a0ec4b`, deploy
`6aa8783d1835a5e433449dd4`, human production acceptance PASS 2026-09-15
(`docs/specs/0016-final-submission-alignment.md`). This spec does not change
either.

## 0. What this is, and what it is not

This is a **deliberate, human-requested, post-freeze product usability
enhancement**, discovered during real hands-on final-submission product use —
not a defect found by audit, not a security finding, and not a course
milestone. It is not:

- Milestone 13, or a renumbering of any milestone;
- a replacement for Milestone 4 (`docs/specs/0005-milestone-4-catalog-api.md`)
  or ADR 0002 (`docs/decisions/0002-proposed-catalog-provider-boundary.md`) —
  it extends both;
- a rewrite of Discover, Scan, or the catalog-add pipeline;
- an AI feature — no OpenRouter, Vision, or VIN involvement of any kind.

It follows the same discipline as the Hebrew & Multilingual enhancement
(`docs/specs/0015-hebrew-multilingual-record-support.md`) and the Final
Submission Alignment remediation (`docs/specs/0016-final-submission-alignment.md`):
spec → human-approved plan → implementation → independent review → merge →
deploy → human production acceptance → documentation closeout, each a
separately reviewed PR. The existing historical freeze tag
`ase26-final-submission-2026-09-15` (annotated tag object
`821676801084ddccb40e7f61821e945abe07b77a`, peeling to
`9ee871bf352564d3271181558d26498685afa98e`) remains **permanent, unmoved
evidence of what shipped before this enhancement began**. A **new** tag is
created only after this enhancement's own full closeout (§21).

## 1. Product Problem

Discover's current implementation (`src/catalog/DiscoverPanel.tsx`,
`src/lib/catalog/client.ts`, `netlify/functions/_shared/catalog-handlers.mts`)
offers exactly one free-text field. The browser sends the raw trimmed text as
a single unqualified MusicBrainz Lucene `query` parameter
(`src/lib/catalog/musicbrainz.ts::buildMusicBrainzSearchUrl`); the server
returns at most `MAX_SEARCH_LIMIT = 10` normalized candidates (default `5`);
there is no `offset`/pagination; re-running the same query returns the same
first page every time — there is no way to see more results. Observed
real-usage friction:

- MusicBrainz's default cross-field ranking for an unqualified query can rank
  an unwanted edition/compilation ahead of the specific pressing the user
  wants, with no way to tell MusicBrainz "this term is the artist" or "this
  term is the release title."
- The visible result window (≤ 10, typically 5) is too small when the wanted
  release is not near the top of MusicBrainz's default ranking.
- When Vinyl Intelligence's own bounded search genuinely cannot surface the
  desired exact release, there is no first-class recovery path back into the
  app other than re-typing different search terms — no way to bring a
  specific, already-identified MusicBrainz release in by exact identity.
- A MusicBrainz-backed owned record's Album Detail page has no outbound link
  to its own MusicBrainz release page (confirmed by inspection:
  `src/pages/AlbumDetailPage.tsx` uses `release.provider_release_id` only for
  artwork lookup, never as a link).

This enhancement solves these problems **without** replacing MusicBrainz,
without adding AI, and without weakening catalog-metadata trust — it adds
precision, depth, and two deterministic escape hatches on top of the exact
same server-mediated, human-confirmed catalog-add pipeline that already
exists.

## 2. Goals

A. More precise catalog searching through three explicit, mutually-exclusive
   search modes (§6).
B. More discoverable results through deterministic, bounded pagination /
   "Load more results" (§7–§8).
C. A deterministic exact-release escape hatch: paste a MusicBrainz release
   URL, get that exact release back, with the same confirm-before-add
   contract as any other candidate (§9–§11).
D. Easy outbound navigation from Vinyl Intelligence to MusicBrainz's own
   search UI when the bounded in-app result set is not enough (§12).
E. Easy outbound provenance navigation from a MusicBrainz-backed owned
   record's Album Detail page to its exact MusicBrainz release page (§13).
F. Reuse — not parallel-implement — the existing confirmation, ownership,
   catalog-add, duplicate-copy, and security boundaries (§14–§16).
G. Preserve manual add as the final, always-available fallback (§17).

## 3. Non-Goals

Explicitly out of scope for this enhancement:

- replacing MusicBrainz or adding a second catalog provider (Discogs remains
  deferred per ADR 0002, not reopened here);
- AI-powered catalog search, embeddings, RAG, fuzzy AI interpretation, or any
  multi-agent behavior;
- automatic collection mutation of any kind — every add still requires the
  existing explicit human confirmation;
- importing by MusicBrainz artist page, release-group page, recording page,
  or label page — release identity only;
- bulk/shelf recognition of multiple records from one input;
- any change to Scan's vision model, prompt, schema, or recognition flow;
- any change to VIN (model, prompt, schema, rate limits, candidate contract);
- database schema redesign, a new table, a migration, a new Storage bucket,
  or an RLS/grant change — this enhancement is designed to need **none** of
  these (§18); if implementation later discovers one is genuinely necessary,
  **stop and obtain explicit human approval before proceeding** rather than
  silently expanding scope;
- a new runtime dependency — if implementation later discovers one is
  genuinely necessary, **stop and ask** rather than silently adding it;
- a general Discover visual redesign unrelated to this enhancement's own
  controls.

## 4. Current Implementation — Findings That Inform This Spec

Verified by direct source inspection at the baseline commit above.

| Area | File | Current behavior |
| --- | --- | --- |
| Browser search call | `src/lib/catalog/client.ts` | `searchCatalog(client, query, limit = 5)`; sends `GET /api/catalog/search?q=<query>&limit=<1..10>`; no offset param exists |
| Search response type | `src/lib/catalog/types.ts` | `CatalogSearchResponse = { candidates: CatalogCandidate[] }` — no pagination metadata |
| Search handler | `netlify/functions/_shared/catalog-handlers.mts::handleCatalogSearch` | auth → `parseSearchRequest` (query 2–120 chars, limit 1–10, default 5) → `paceProviderRequest()` → `searchReleases({ limit, query, userAgent })` → `{ candidates }` |
| Add handler | `netlify/functions/_shared/catalog-handlers.mts::handleCatalogAdd` | auth → validates `provider === 'musicbrainz'` and `providerReleaseId` against `MUSICBRAINZ_RELEASE_ID_PATTERN` → paces → **`lookupReleaseWithRateLimitRetry` → `lookupMusicBrainzRelease({ providerReleaseId, userAgent })`** (a full server-side exact-release-by-MBID lookup **already exists and already runs on every add**, as the existing server-side revalidation step) → optional best-effort release-group genre enrichment → `upsertCatalogRelease` (service-role) → `createCatalogCollectionItem` (service-role) |
| MusicBrainz query builder | `src/lib/catalog/musicbrainz.ts::buildMusicBrainzSearchUrl` | `GET /ws/2/release?query=<raw>&fmt=json&limit=<n>` — the raw trimmed user string is sent as the unqualified `query` value; **no Lucene escaping is applied today** |
| MusicBrainz release-ID pattern | `src/lib/catalog/musicbrainz.ts::MUSICBRAINZ_RELEASE_ID_PATTERN` | `/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i` — an already-existing, already-tested strict MBID validator, reused (not re-created) by §10 |
| Release-page URL | `src/lib/catalog/musicbrainz.ts::normalizeMusicBrainzRelease` | `derivedProviderPageUrl: 'https://musicbrainz.org/release/' + providerReleaseId` — built inline at normalization time; **no shared, independently-callable URL helper exists** (§13.3) |
| Pacing/retry | `catalog-handlers.mts` | `MUSICBRAINZ_PACING_MS = 1000` (serializes every outbound MusicBrainz call to ≥ 1/second, module-scoped `nextMusicBrainzRequestAt`); exactly one bounded retry on `provider_rate_limited` (429/503), with a `1200ms` backoff, only on the add-time exact lookup — search has no retry |
| Search draft persistence | `src/catalog/catalogSearchDraft.ts` | sessionStorage, per-user-scoped key, strict shape validation (`parseDraft`/`parseResult`/`parseCandidate` — any unrecognized/missing field invalidates the **whole** stored draft, falling back to no draft); persists only `draftQuery` and the last completed `{ submittedQuery, candidates }`; no mode, no pagination state today |
| Ownership/duplicate-copy | `src/lib/catalog/ownedRelease.ts::isExactCatalogReleaseOwned`, `src/catalog/DiscoverPanel.tsx` | exact `provider_release_id` match only; owned/not-owned is authoritative **only** when `collectionStatus === 'ready'` (spec 0016 Finding B); local per-panel confirm dialog; identical contract already shared by Discover and Scan |
| Album Detail | `src/pages/AlbumDetailPage.tsx` | uses `release.provider_release_id` **only** for Cover Art Archive artwork lookup (`releaseMbid` prop); **no outbound MusicBrainz link exists today** — confirmed by inspection, not assumed |
| Existing candidate MusicBrainz link | `src/catalog/DiscoverPanel.tsx`, `src/catalog/ScanPanel.tsx` | each candidate card already links to `c.derivedProviderPageUrl` — *"inspect this exact result"* — preserved unchanged, distinct purpose from §12's new *"search directly on MusicBrainz"* action |

## 5. MusicBrainz Facts vs. Vinyl Intelligence Decisions

This section explicitly separates **verified provider facts** (cited, from
official MusicBrainz documentation, fetched during this spec's research — not
from a live catalog search call) from **product decisions Vinyl Intelligence
is making on top of them**.

### 5.1 Verified MusicBrainz facts

Source: `https://musicbrainz.org/doc/MusicBrainz_API/Search`,
`https://musicbrainz.org/doc/MusicBrainz_API`, and the Lucene escaping
reference they link to.

- **Release search endpoint:** `GET /ws/2/release?query=<QUERY>&fmt=json&limit=<LIMIT>&offset=<OFFSET>` (already used exactly this way by `buildMusicBrainzSearchUrl`, minus `offset` today).
- **`limit`:** integer, **1–100 inclusive**, defaults to 25 if omitted. (Vinyl Intelligence already imposes its own tighter product bound — §7 — well inside this range.)
- **`offset`:** "Return search results starting at a given offset. Used for paging through more than one page of results."
- **Response JSON top-level fields:** `created`, `count`, `offset`, `releases`. `count` is the **total number of matching results in the entire result set**; `offset` **echoes the starting position of the returned page**. (`searchMusicBrainzReleases` today reads only `payload.releases`; it does not yet read `count`/`offset` — §8.2 extends it to.)
- **Release-search field names** (a non-exhaustive list; only the ones this spec uses):
  - `artist` — "the combined credited artist name for the release, including join phrases" (e.g. "Artist X feat. Artist Y").
  - `artistname` — "the name of any of the release artists" (an individual credited artist, not the joined string).
  - `release` — "(part of) the name of the release."
  - (Other documented fields — `arid`, `catno`, `country`, `date`, `format`, `label`, `tag`, etc. — exist but are not used by this enhancement.)
- **Combining fields:** the `AND` operator (documented example: `release:Schneider AND Shake`).
- **Escaping:** "you'll need to escape characters special to Lucene. This is in addition to any URL encoding." The documented Lucene special characters are:
  `+ - && || ! ( ) { } [ ] ^ " ~ * ? : \` — escaped by a preceding backslash. MusicBrainz's own example additionally escapes `/` the same way (`ac\/dc`, URL-encoded to `ac%5C%2Fdc`) for a literal band-name search, so this spec treats `/` as requiring the same backslash-escape.
- **Rate limiting:** "each of their client applications never make more than ONE call per second," or risk being IP-blocked. (Matches the existing `MUSICBRAINZ_PACING_MS = 1000` posture exactly — unchanged by this spec, §14.)
- **User-Agent:** mandatory, meaningful. (Matches the existing `MUSICBRAINZ_USER_AGENT` env var, ADR 0002 — unchanged.)
- **Public website search:** `https://musicbrainz.org/search?query=<term>&type=release&method=indexed` was directly observed (fetched during this spec's research) to render a working, correctly-populated release search-results page for a test query. This is the **verified, stable destination** for §12's "Search directly on MusicBrainz" outbound link.
- **Unicode/non-Latin query text:** MusicBrainz's own documentation does not explicitly state whether unescaped non-Latin script (e.g. Hebrew) is handled without transliteration. This spec does **not** invent a guarantee here — see §5.2.

### 5.2 Vinyl Intelligence product decisions built on those facts

- **Mode → field mapping (§6.2):** `Artist` mode scopes the query to the `artist` field (the combined credited-artist string, matching what a collector visually reads on a sleeve/spine, e.g. "Portishead" or "Simon & Garfunkel" as one string) rather than `artistname` (which would match any *individual* credited artist separately and could surface unrelated collaborators). `Album` mode scopes to `release`. This is a product choice favoring what the user visually recognizes over exhaustive per-artist matching; documented here as a deliberate choice, not asserted as MusicBrainz's own recommendation.
- **Escaping applies only to the two new field-qualified modes (§6.4):** `All` mode is byte-for-byte unchanged from current production behavior (raw, unescaped, unqualified query) specifically **because** changing it is not required to satisfy any goal in §2 and would be an unrequested behavior change to an already-shipped, already-Hebrew-tested path. `Artist`/`Album` mode escape the Lucene special-character set from §5.1 before wrapping the (already-trimmed) input in `field:(...)`, because these modes are new server-constructed field-qualified queries and an unescaped user value could otherwise break out of the intended field scope or inject additional clauses.
- **Non-Latin/Hebrew text (§27 requirement):** because MusicBrainz's own documentation does not explicitly address this, and because the *already-shipped* `All` mode already sends raw Hebrew text to the same `query` parameter today with accepted, human-verified behavior (`docs/specs/0015-hebrew-multilingual-record-support.md`), this spec's product decision is: **treat non-Latin text as literal, un-transliterated, un-translated query text in every mode**, subject only to the same Lucene special-character escaping applied to Latin text in `Artist`/`Album` mode (escaping is character-class-based, not script-based, so it behaves identically regardless of script). No transliteration table, no per-script logic, is introduced.
- **Pagination window (§7):** MusicBrainz permits `limit` up to 100; Vinyl Intelligence deliberately keeps its own much smaller product bound (initial page 5, total exposed window 20) for the same reasons the original `MAX_SEARCH_LIMIT = 10` was chosen — a small, high-quality, human-scannable candidate list, consistent with `intent.txt` §17's cost/latency-consciousness principle, not because MusicBrainz requires it.
- **Exact-lookup API shape (§10):** MusicBrainz's public API offers no "search by URL" primitive — the URL is a Vinyl Intelligence product affordance, parsed entirely client-and-server-side within this app, that resolves to a plain `providerReleaseId` lookup MusicBrainz already supports natively.

## 6. Search Modes

### 6.1 The three modes

Exactly three, mutually exclusive, single-select:

1. **All** (default)
2. **Artist**
3. **Album**

### 6.2 Exact query templates

Let `raw` be the user's input, trimmed of leading/trailing whitespace, with
internal whitespace runs collapsed to a single space (matching the existing
`.trim()` discipline already used for the query field — no new normalization
philosophy). Let `escape(s)` be: replace every occurrence of any character in
`+ - && || ! ( ) { } [ ] ^ " ~ * ? : \ /` with a backslash followed by that
character, applied in a single pass over `raw` (so the inserted backslashes
are never themselves re-escaped).

| Mode | MusicBrainz `query` value sent | Escaping applied |
| --- | --- | --- |
| **All** | `raw` (unmodified — current production behavior, byte-for-byte) | none (unchanged from today) |
| **Artist** | `artist:(${escape(raw)})` | yes |
| **Album** | `release:(${escape(raw)})` | yes |

Field-scoped values are **not** phrase-quoted (no wrapping `"..."`): this
preserves Lucene's default multi-term-OR-with-relevance-scoring behavior
*within* the chosen field, which is more forgiving of word order and partial
matches than a strict phrase match, while still constraining the match to
the correct field — the precision problem in §1 is "MusicBrainz doesn't know
which field," not "MusicBrainz needs exact phrase matching."

### 6.3 Input bounds

Unchanged from today, applied identically in all three modes, to the raw
(pre-escape) trimmed input length: minimum **2** characters, maximum **120**
characters (`SEARCH_QUERY_MIN_LENGTH`/`SEARCH_QUERY_MAX_LENGTH`, both
client- and server-enforced exactly as today). No mode gets a different
bound — introducing per-mode limits is not required by any goal in §2 and
would add untested asymmetry.

### 6.4 Unicode / Hebrew

See §5.2. No transliteration, no translation, in any mode. Escaping is
applied identically regardless of script (it targets specific ASCII
punctuation characters only; it never touches non-Latin letters).

### 6.5 Multilingual/Hebrew summary

Stated explicitly, consolidating §5.2 and §6.4: search input preserves the
original script in every mode, with no translation and no transliteration —
only the provider-required escaping in §6.2, which is script-independent.
Candidate display (search results, Load More's appended results, and the
exact-URL lookup's single result alike) continues to render through
Discover's **existing** bidi-safe dynamic-text components (`BidiText`/
`BidiJoin`) — this spec introduces no new candidate-rendering component
(§10.3 point 5), so no new script-handling logic is needed there. The
Record Detail MusicBrainz link (§13) is script-independent by construction —
its identity is the MBID, not the record's artist/title text. **The
application chrome, navigation, and static copy remain English/left-to-right,
unchanged by this enhancement** — this is not a localization project, and
this spec does not expand localization scope in any way.

### 6.6 Mode-change behavior

Changing the selected mode:

- makes **zero** database writes (client-side UI state only);
- **resets pagination state** (§7.3) — a mode change starts a fresh search
  from offset 0 when the user next submits; it does not re-run the previous
  query automatically;
- does **not** clear the typed-but-not-yet-submitted input text (changing
  your mind about mode should not force retyping);
- **does** clear any currently-displayed result list and pagination
  affordances, since those results were fetched under the *previous* mode's
  query semantics and would be misleading if left visible under a newly
  selected mode.

## 7. Pagination / "Load More"

### 7.1 Product behavior

- **Initial page:** `PAGE_SIZE = 5` results (matches today's existing
  default — no change to the first-page experience).
- **Load more results:** each click fetches the **next** page (`offset +=
  PAGE_SIZE`) and **appends** to the existing visible list — never replaces
  it.
- **Maximum exposed per query:** `MAX_EXPOSED_RESULTS = 20` — i.e. at most 4
  pages (offsets 0, 5, 10, 15) are ever fetchable through this UI for one
  submitted query/mode combination. This is a Vinyl Intelligence product
  bound (§5.2), well inside MusicBrainz's own 1–100 `limit` allowance.

### 7.2 Offset / exhaustion semantics

Let `rawPageCount` be the number of entries MusicBrainz's `releases` array
returned for a given `(query, mode, limit, offset)` request — **before**
Vinyl Intelligence's own normalization filtering (`normalizeMusicBrainzRelease`
can reject an entry, e.g. for a malformed MBID or missing required field;
per §12's own finding, relying on the *post-normalization* candidate count to
detect exhaustion could be wrong if the provider's raw page was full but
Vinyl Intelligence rejected some of its entries).

**"Load more" is offered after a page if and only if:**

```
rawPageCount === limitRequestedForThatPage
  AND (offsetOfNextPage) < MAX_EXPOSED_RESULTS
```

i.e. the provider returned a completely full raw page (strong evidence more
may exist) **and** the next page would still be within the 20-result window.
If MusicBrainz returns fewer raw entries than requested (a partial page),
that is treated as authoritative exhaustion regardless of the normalized
candidate count, and "Load more" is not offered.

- **Fewer than one page on the very first request** (0 < rawPageCount <
  `PAGE_SIZE`): show exactly those normalized candidates (possibly zero, if
  every raw entry was rejected by normalization — this is the existing
  "no results" empty state, §21, not an error); no "Load more."
- **Zero raw results on the first request:** existing "no results" state,
  unchanged.
- **Window exhausted at 20:** "Load more" is not shown, regardless of
  whether MusicBrainz might have more beyond offset 15 — this is the
  deliberate product bound from §7.1, not a provider limitation, and should
  read to the user as "you've seen the bounded set Vinyl Intelligence
  offers here" (§21 error-state text), distinct from genuine exhaustion.

### 7.3 Reset behavior

Pagination state (accumulated candidates, current offset, whether more are
available) is reset to empty/initial whenever: a new search is submitted
(same or different query text), the mode is changed (§6.6), or "New search"
is invoked (existing `resetSearch` behavior in `DiscoverPanel.tsx`, unchanged
in purpose).

### 7.4 Duplicate candidates across pages

MusicBrainz's own ranking can, in principle, repeat an ID across pages under
certain edge conditions (e.g. a concurrent index change between requests).
Vinyl Intelligence **deduplicates by `providerReleaseId`** when appending a
new page to the existing accumulated list: an entry whose ID is already
present in the accumulated list is silently dropped from the newly-appended
page rather than rendered twice. Ordering is otherwise preserved exactly as
returned (existing candidates keep their position; new, non-duplicate
entries are appended after them in the order MusicBrainz returned them).

### 7.5 Loading / error / click-guard behavior

- **Loading more:** the "Load more results" control shows a busy/loading
  state (existing `SkeletonAlbumCard`/`aria-busy` idiom, reused conceptually
  — implementation detail) and is **disabled** while a page request is in
  flight, so a rapid repeated click cannot start a second concurrent
  MusicBrainz request (mirrors the existing `inProgress`/`addingId` guard
  idioms already used elsewhere in `DiscoverPanel.tsx`).
- **A failed "Load more" request:**
  - does **not** clear, replace, or hide any already-visible result;
  - shows a distinct, localized error affordance near the bottom of the
    existing list (not a full-panel error state — the existing top-level
    `phase === 'error'` state is reserved for a *first-page* failure) with a
    **Retry** action that re-attempts the **same** next-page request (same
    offset) — it does not silently advance or skip a page;
  - leaves the "Load more" control in a retryable (not permanently
    disabled) state.
- **A failed first-page request** reuses the existing `phase === 'error'`
  full-panel error state and its existing "Try again" retry — unchanged.

## 8. Pagination API Contract

### 8.1 Client → server request

`GET /api/catalog/search` gains two new, optional query parameters, in
addition to the existing `q` and `limit`:

- `mode` — one of `all` | `artist` | `album`. Omitted or unrecognized ⇒
  `all` (matches §6.1's default and preserves compatibility with any
  in-flight/cached request built by not-yet-updated client code during a
  deploy transition).
- `offset` — non-negative integer. Omitted ⇒ `0`. Server clamps/validates:
  an `offset` that is not a non-negative integer, or that is `≥
  MAX_EXPOSED_RESULTS` (20), is rejected with the existing `invalid_query`
  error code (400) — this is the defense-in-depth server-side bound
  discussed in §5.2; the client's own UI logic (§7.1–§7.2) is expected to
  never construct such a request in normal operation, but the server does
  not trust the client alone.

`limit` keeps its existing validated range (1–10, default 5,
`DEFAULT_SEARCH_LIMIT`/`MAX_SEARCH_LIMIT`) — this enhancement does not widen
it; `PAGE_SIZE = 5` is simply the value the client always sends.

### 8.2 Server → client response

`CatalogSearchResponse` (`src/lib/catalog/types.ts`) gains two new fields,
additive to the existing `candidates`:

```ts
export type CatalogSearchResponse = {
  candidates: CatalogCandidate[]
  offset: number     // echoes the effective offset this page was fetched at
  hasMore: boolean    // per the §7.2 algorithm — never inferred client-side
}
```

`hasMore` is computed **server-side**, using the raw MusicBrainz page size
per §7.2 — the client never re-derives it from `candidates.length` alone,
precisely because normalization can reject entries. This requires
`searchMusicBrainzReleases` (`src/lib/catalog/musicbrainz.ts`) to expose
enough raw-page-size information (implementation detail — e.g. returning
`{ candidates, rawCount }` internally, or a sibling function) for the
handler to compute `hasMore`; the *exported public normalization contract*
(`normalizeMusicBrainzRelease`) is unchanged.

The client computes `nextOffset` itself as `offset + PAGE_SIZE` when it
next calls "Load more" — it is not sent by the server, since it is a pure
function of already-known client state and does not need to be a trust
boundary (the server independently validates whatever `offset` it actually
receives, per §8.1, regardless of how the client arrived at it).

This is an **additive, backward-compatible** change to `CatalogSearchResponse`
— any code that only reads `.candidates` continues to work unmodified.

### 8.3 Exact lookup shares the same response shape

See §10 — the exact-URL lookup reuses this exact same `CatalogSearchResponse`
shape (`{ candidates: [oneCandidate], offset: 0, hasMore: false }`), so no
second response type is introduced for that flow.

## 9. Existing Search-Draft State — Compatibility

`src/catalog/catalogSearchDraft.ts`'s persisted shape gains, additively:

```ts
export type CatalogSearchResult = {
  submittedQuery: string
  mode: SearchMode          // NEW — 'all' | 'artist' | 'album'
  candidates: CatalogCandidate[]
  offset: number            // NEW — the offset of the LAST successfully loaded page
  hasMore: boolean          // NEW — whether "Load more" should render on restore
}

export type CatalogSearchDraft = {
  draftQuery: string
  mode: SearchMode          // NEW — the currently-selected mode, independent of a completed search
  result: CatalogSearchResult | null
}
```

**Backward compatibility with an already-stored old-shaped draft** (a tab
left open across a deploy, per §13's own framing): the parser
(`parseDraft`/`parseResult`) is extended to treat the three new fields as
**optional on read**, defaulting `mode = 'all'`, `offset = 0`, `hasMore =
false` when absent — it does **not** invalidate the whole stored draft the
way an actually-malformed field does today. This means an old draft restores
exactly as it does today (query + candidates, "All" mode implied, no "Load
more" offered until the user searches again) rather than being silently
discarded. No database table, no server-side migration, is introduced for
this — it remains a client-only sessionStorage concern, unchanged in scope
from today.

Restoring a draft with `hasMore: true` restores the "Load more" affordance
in its normal (not loading, not error) state — a restored draft never
implies an in-flight request.

## 10. Exact MusicBrainz Release URL Lookup

### 10.1 UI

A second, clearly visually distinct input area beneath the search controls:

```
Know the exact release?

[ https://musicbrainz.org/release/...                    ]

[ Find exact release ]
```

The user pastes a MusicBrainz **release** URL; Vinyl Intelligence extracts
the MBID itself — the user never needs to manually copy just the ID.

### 10.2 Accepted URL contract

Reuses the existing `MUSICBRAINZ_RELEASE_ID_PATTERN`
(`src/lib/catalog/musicbrainz.ts`) for the MBID portion — no new, looser UUID
parser is introduced.

**Accepted** (case-insensitive host and scheme; hostname is `musicbrainz.org`
exactly — no subdomains):

- `https://musicbrainz.org/release/<mbid>`
- `http://musicbrainz.org/release/<mbid>` (normalized to `https://`)
- either of the above with **exactly one** optional trailing slash
- either of the above with an additional query string and/or fragment (e.g.
  `?srsltid=...` or `#recordings`) — **tolerated and stripped**, since these
  are exactly the kind of tracking/UI-anchor artifacts a user's browser
  address bar or copy action commonly appends; the release path and MBID
  are the only identity that matters

**Normalized to canonical form on acceptance:**
`https://musicbrainz.org/release/<lowercase-mbid>` (no trailing slash, no
query, no fragment) — this normalized string is what
`normalizeMusicBrainzRelease` already independently derives as
`derivedProviderPageUrl` for the returned candidate, so the two naturally
agree (see §13.3's shared-helper recommendation).

**Rejected**, with a local (no network request) validation error in every
case:

- any hostname other than exactly `musicbrainz.org` (including
  `www.musicbrainz.org`, `beta.musicbrainz.org`, or any other subdomain,
  unless a human later deliberately approves adding it — not assumed here;
  including any lookalike domain such as `musicbrainz.org.evil.example`);
- `/artist/<id>`, `/release-group/<id>`, `/recording/<id>`, `/work/<id>`,
  `/label/<id>`, or any other MusicBrainz entity path — release only;
- a malformed MBID (fails `MUSICBRAINZ_RELEASE_ID_PATTERN`);
- a missing ID (bare `/release/` or `/release`);
- any **extra path segment** after the MBID other than the single optional
  trailing slash (e.g. `/release/<mbid>/edit` is rejected, not silently
  truncated);
- a URL embedding userinfo/credentials (`https://user:pass@musicbrainz.org/...`);
- a non-`http`/`https` scheme (`javascript:`, `data:`, `file:`, etc.);
- an explicit non-default port (`musicbrainz.org:8080`) — MusicBrainz's
  production site has no documented alternate port for this path, so this
  spec does not accept one.
- an empty/whitespace-only input — treated as "untouched," not as an error
  (§21).

### 10.3 Lookup behavior

1. Client-side syntax validation (§10.2) runs **before** any request —
   invalid syntax never reaches the network.
2. On a syntactically valid URL, the client sends the extracted, lowercased
   MBID to the server (§11).
3. The server performs a **read-only** exact MusicBrainz release lookup —
   reusing `lookupMusicBrainzRelease`/`lookupReleaseWithRateLimitRetry`,
   the **exact same function already used today inside `handleCatalogAdd`**
   (§4), not a new lookup implementation.
4. The result is normalized through the **existing**
   `normalizeMusicBrainzRelease` — the exact same normalizer used by search
   and by add — and returned as a single-element `CatalogSearchResponse`
   (§8.3).
5. It is rendered through Discover's **normal** candidate card UI — no new
   candidate-rendering component.
6. Ownership/duplicate-copy is the **existing, unmodified**
   `isExactCatalogReleaseOwned` check, gated on `collectionStatus === 'ready'`
   exactly as today (spec 0016 Finding B) — §16.
7. Adding it requires the user's **normal** explicit Add / "Add another
   copy" action — the pasted URL itself **never** causes a database write,
   under any circumstance, including a not-yet-owned release.

### 10.4 Error states

| State | Trigger | Behavior |
| --- | --- | --- |
| Untouched | no input yet | no affordance shown |
| Local validation error | fails §10.2 before any request | inline error message; **zero** network requests |
| Loading | valid URL submitted | loading indicator on the "Find exact release" control; control disabled to prevent a duplicate concurrent request |
| Exact result | lookup + normalization succeed | the normal single-candidate card, with normal owned/not-owned/duplicate-copy behavior |
| Not found | MusicBrainz 404 for that MBID (release deleted/merged) | distinct "That release could not be found on MusicBrainz" message; retry re-submits the same URL |
| Malformed provider response | lookup succeeds but normalization rejects the payload | mapped to the existing `provider_bad_response` error category and message — not a silent empty result |
| MusicBrainz timeout | provider request exceeds the existing timeout | existing `provider_timeout` category/message |
| MusicBrainz rate-limited | 429/503 | existing `provider_rate_limited` category — reuses the **same** bounded single retry as `handleCatalogAdd`'s existing lookup path (§14), not a new retry policy |
| Provider unavailable | any other non-2xx / network failure | existing `provider_unavailable` category |
| Ownership data unavailable | `collectionStatus !== 'ready'` at render time | the exact result still renders, but with the **existing** disabled "Checking collection…" / "Collection unavailable" placeholder instead of any add action — spec 0016 Finding B's contract, unmodified |

No failure state falls through into showing or adding a different record —
every failure is either a local validation rejection or one of the mapped
error categories above, shown as a visible, honest failure (`intent.txt`
§16 "user-visible failure is preferable to fake success").

## 11. Exact Lookup API Design

**Decision: extend the existing `GET /api/catalog/search` contract with a
third, mutually-exclusive input, rather than add a seventh Netlify
Function.**

### 11.1 Contract

`GET /api/catalog/search` accepts **either**:

- `q` (+ optional `mode`, `offset`, `limit` — §8.1), **or**
- `releaseId` — a single MusicBrainz release MBID, already validated
  client-side against `MUSICBRAINZ_RELEASE_ID_PATTERN` before being sent, and
  **re-validated server-side against the same pattern** (defense in depth;
  the server never trusts client-side validation alone).

Providing **both** `q` and `releaseId`, or **neither**, is an
`invalid_query` (400) — exactly the same error code family the endpoint
already uses for a malformed request.

When `releaseId` is present, the handler skips `parseSearchRequest`'s
query/mode/offset handling entirely and instead calls
`lookupReleaseWithRateLimitRetry` (§10.3 point 3) — no genre enrichment is
performed here (unlike add — see §11.3), and no database write of any kind
occurs. The response is `{ candidates: [oneCandidate], offset: 0, hasMore:
false }` (§8.3) — the exact same `CatalogSearchResponse` shape as a normal
search, so the browser's existing candidate-rendering, ownership, and
duplicate-copy code needs **zero** new branches to handle it.

### 11.2 Why this design, and not a new Function

- `lookupReleaseWithRateLimitRetry` → `lookupMusicBrainzRelease` already
  exists, is already exercised in production by every catalog-add, and
  already has its own bounded-retry/error-mapping behavior — reusing it here
  is literally zero new provider-integration code, only a new *routing*
  branch inside a handler that already authenticates, paces, and maps errors
  identically.
- A new seventh Function would duplicate: the auth check, the pacing
  singleton (`nextMusicBrainzRequestAt` is module-scoped — a second Function
  module would need its own instance or a shared import, adding real
  complexity for zero product benefit), the error-mapping table, and the
  Netlify Function count/documentation surface (README, `architecture.md`,
  the endpoint list) for a read that is semantically "a search that already
  knows the exact answer," not a distinct capability.
- The **response shape stays identical** to a normal search response,
  which is what makes reusing Discover's *entire* existing candidate/
  ownership/duplicate-copy rendering path possible with no new UI branches
  (§10.3 points 5–6) — a separate endpoint would need either a different
  response type (more surface to keep in sync) or would need to be
  reshaped into the same type anyway.

### 11.3 What is deliberately *not* reused from add

`handleCatalogAdd`'s optional release-group genre enrichment
(`lookupReleaseGroupGenres`) and its two service-role writes
(`upsertCatalogRelease`, `createCatalogCollectionItem`) are **not** invoked
by this read-only lookup path — those remain exclusive to the actual,
explicitly-confirmed Add action (§10.3 point 7), unchanged.

## 12. Search Directly on MusicBrainz

An outbound navigation action — *"Search on MusicBrainz"* (or equivalent
product wording finalized at implementation time) — opens MusicBrainz's own
full search UI in a new tab, for when Vinyl Intelligence's bounded (§7.1)
result window still doesn't surface the desired pressing.

**Verified destination** (§5.1): `https://musicbrainz.org/search?query=<term>&type=release&method=indexed`,
directly observed to render a correct, working release-search results page.

**Pre-fill behavior:** the link uses the user's **current, currently-typed
or currently-submitted `All`-mode-equivalent search term** — i.e. the raw
text as typed, `query`-encoded, with `type=release&method=indexed` fixed.
This spec deliberately does **not** attempt to translate the in-app
`Artist`/`Album` mode selection into MusicBrainz's own website field-search
UI parameters, because that UI's own field-search parameter names were not
independently verifiable during this spec's research (§5.1's website fetch
confirmed the *plain-query* form works; it did not confirm a field-scoped
website URL shape) — inventing undocumented parameters is explicitly
disallowed by this task's own instructions. If no term has been typed yet,
the link target is the generic `https://musicbrainz.org/search?type=release&method=indexed`
(no `query`) rather than being hidden — the user can still reach
MusicBrainz's own search UI and type there directly.

This is a plain external navigation (`<a target="_blank" rel="noreferrer">`,
matching the existing candidate-card MusicBrainz-link idiom) — it makes **no**
Vinyl Intelligence server request of any kind.

### 12.1 Distinction from the existing per-candidate link

| Link | Purpose | Scope |
| --- | --- | --- |
| Existing per-candidate "MusicBrainz" link (`c.derivedProviderPageUrl`) | *Inspect this exact result* | One already-returned candidate's own release page |
| New "Search on MusicBrainz" | *Search MusicBrainz directly, beyond what Vinyl Intelligence surfaced* | MusicBrainz's own full search UI, not scoped to any one candidate |

The existing per-candidate link is **preserved unchanged** — not removed,
not duplicated in meaning.

## 13. Record Detail — MusicBrainz Provenance Link

### 13.1 Placement and wording

On the Album/Record Detail page (`src/pages/AlbumDetailPage.tsx`), add an
outbound link — suggested wording *"View on MusicBrainz"* — with a visible
external-link affordance (icon/label), matching the existing external-link
idiom already used for the per-candidate MusicBrainz link in Discover/Scan.

### 13.2 Visibility rule

Shown **if and only if**:

1. the release is provider-backed (`release.provider === 'musicbrainz'`, or
   equivalently `source !== 'manual'` per the existing manual/catalog
   distinction already established in `src/lib/supabase/collection.ts`), **and**
2. `release.provider_release_id` is present **and** matches
   `MUSICBRAINZ_RELEASE_ID_PATTERN` — the **same, already-existing** pattern
   reused throughout this spec, not a new validator.

If both conditions hold, the link points to the **exact release**:
`https://musicbrainz.org/release/<provider_release_id>` — **never** the
release-group page, even though `provider_release_group_id` is also stored.

If either condition fails — a manually-created release, or an unexpectedly
malformed/absent provider release ID on a nominally provider-backed row —
the link is **hidden**, not shown disabled and not shown pointing at a
malformed URL. Vinyl Intelligence never fabricates a provider identity for
data that doesn't have one (`intent.txt` §16).

### 13.3 Shared URL builder recommendation

To avoid three independent handwritten copies of
`https://musicbrainz.org/release/<id>` (today: only inside
`normalizeMusicBrainzRelease`; after this enhancement: also needed by §10.2's
URL normalization and by §13.2's Record Detail link), this spec recommends
**one small, shared, pure helper** — conceptually
`musicBrainzReleaseUrl(providerReleaseId: string): string | null`, returning
`null` (not a malformed string) for an ID that fails
`MUSICBRAINZ_RELEASE_ID_PATTERN` — reused by all three call sites.
**Not implemented in this spec**; this is a naming/location suggestion for
the implementation plan, in the same spirit as spec 0016's
`isExactCatalogReleaseOwned` shared-helper precedent (one small pure
function, not a shared component or shared state).

## 14. MusicBrainz Provider Etiquette / Pacing — Unchanged

This enhancement **reuses, without modification**:

- the existing `MUSICBRAINZ_PACING_MS = 1000` module-scoped pacer
  (`paceMusicBrainzRequest`) — every new call path this spec introduces
  (Load More's next-page fetch; the exact-URL lookup) calls the **same**
  `dependencies.paceProviderRequest()` that search and add already call,
  before its own MusicBrainz request;
- the existing single bounded retry-on-rate-limit
  (`lookupReleaseWithRateLimitRetry`, `1200ms` backoff) for the exact-URL
  lookup, because it reuses that exact function (§11.1) — Load More's
  paginated search calls do **not** get a new retry policy of their own
  (search today has none; this spec does not add one, to avoid a burst of
  retried requests defeating the 1/second pacing intent under a sustained
  provider outage);
- the existing `MUSICBRAINZ_USER_AGENT` requirement and value — unchanged.

No aggressive retry loop is introduced anywhere in this spec. No attempt is
made to exceed or route around the 1-request-per-second etiquette MusicBrainz
documents (§5.1).

## 15. Security / Trust Boundaries

The existing three-path architecture (`SPEC.md` §7, `README.md`) is
preserved exactly:

```
Browser -> Supabase directly (RLS/Storage-policy authorized user data)
Browser -> Cover Art Archive directly (display-time artwork, unaffected by this spec)
Browser -> Netlify Functions -> MusicBrainz / privileged Supabase operations
```

This enhancement adds **no new browser-to-Supabase path** and **no new
browser-to-provider path** — every new capability (search modes, pagination,
exact-URL lookup) is routed through the existing auth-gated
`/api/catalog/search` Function, using the existing service-only
`MUSICBRAINZ_USER_AGENT` and existing pacing.

**SSRF analysis (§10's pasted URL is the only new untrusted-input surface):**
the backend **never fetches the pasted URL itself, under any circumstance**.
The client-side parser (§10.2) extracts and validates a bare MBID string; the
value sent to the server is that extracted MBID — a string already
constrained to `MUSICBRAINZ_RELEASE_ID_PATTERN` — **never** the original
URL, never a hostname, never anything resembling a target for `fetch()`. The
server independently re-validates that MBID pattern (§11.1) before
constructing its **own**, entirely server-controlled MusicBrainz lookup URL
via the existing `buildMusicBrainzLookupUrl` — exactly as it already does for
every catalog-add today. There is no code path, in this spec's design, where
any part of the user-supplied URL string (scheme, host, path, query,
fragment) is ever passed to a `fetch()` call, an environment lookup, a
redirect, or a proxy. This is the same trust pattern the app already uses
for catalog-add's `providerReleaseId` input — extract-and-validate-an-
identifier, never forward-an-arbitrary-URL.

No privileged credential reaches the browser as a result of this
enhancement — no new secret, no widened grant, no new service-role usage
beyond what catalog-add already performs (§4).

## 16. Duplicate-Copy Contract — Preserved, Not Reimplemented

Spec 0016 Finding B's contract is authoritative and **unmodified**: ownership
is decided **only** by exact `provider_release_id` equality
(`isExactCatalogReleaseOwned`), never by artist/title/year/label/catalog-
number similarity; it is authoritative only while `collectionStatus ===
'ready'`; an owned candidate shows "In your collection" + "Add another copy"
behind one confirmation dialog with the exact existing approved copy; Cancel
writes nothing; Confirm creates exactly one row.

This behavior must be **identical**, using the **same** shared helper and
the **same** local per-panel dialog pattern (no new shared state, no new
confirmation component), whether the candidate came from:

- a normal search (any of the three modes);
- a "Load more" page;
- the exact MusicBrainz release URL lookup (§10);
- Scan's existing deterministic candidate stage (unaffected by this spec,
  listed here only to confirm no divergence is introduced).

No second duplicate-detection implementation is introduced anywhere in this
enhancement.

## 17. Manual Add — Preserved as the Final Fallback

Manual entry (`CollectionForm`, "Can't find it? Add it manually") remains
available, unchanged, at every stage. The full, conceptual Discover recovery
hierarchy after this enhancement:

1. normal search ("All" mode, current default behavior);
2. search-mode refinement (Artist / Album);
3. "Load more" within the bounded 20-result window;
4. "Search directly on MusicBrainz" (external, unbounded);
5. paste the exact MusicBrainz release URL found there;
6. manual entry, if the release genuinely isn't on MusicBrainz or the user
   prefers not to use it.

No step in this hierarchy is removed, and no step is ever made mandatory —
a user can jump straight to manual entry at any time, exactly as today.

## 18. No Expected Database / Schema Change

This enhancement is designed to use **only** release identity Vinyl
Intelligence already stores: `releases.provider` and
`releases.provider_release_id` (both already columns, already indexed via
the existing `releases_provider_release_identity_unique` constraint —
`supabase/migrations/20260826000100_add_catalog_releases.sql`). Explicitly:

- **No new table.**
- **No migration.**
- **No RLS policy change, no grant change.**
- **No Storage bucket change.**
- **No new runtime dependency** — pagination, mode selection, and URL
  parsing are all plain TypeScript/React using data already flowing through
  existing types.

**If implementation later discovers any of the above is genuinely
necessary, implementation must stop and obtain explicit human approval
before proceeding** — this spec does not pre-authorize any schema,
dependency, or migration change.

## 19. Accessibility

- The `All` / `Artist` / `Album` selector is a proper grouped control (radio
  group or equivalent ARIA semantics — `role="radiogroup"` with
  `role="radio"`/`aria-checked`, or a native fieldset/radio input group) —
  **not** color-only differentiation; the selected mode has a visible,
  non-color-dependent indicator (e.g. a filled/outlined state plus
  `aria-pressed`/`aria-checked`), consistent with the existing Grid/List
  toggle idiom already shipped in Collection (spec 0016 Finding A).
- The search input keeps its existing accessible label and `dir="auto"`
  behavior (`src/ui/primitives.tsx::SearchInput`) — unchanged.
- "Load more results" is a real, focusable, keyboard-activatable `<button>`
  with an accessible name that doesn't rely on surrounding visual context
  alone (e.g. "Load more results" as its own text, not just an icon).
- The exact-URL input has an explicit accessible label (e.g. "MusicBrainz
  release URL") and its "Find exact release" trigger is a real button.
- Every new inline validation/error message is associated with its control
  via `aria-describedby` (or rendered with `role="alert"`, matching the
  existing `vi-error-text`/`role="alert"` idiom already used throughout
  Discover).
- Every new external link (candidate-scoped MusicBrainz link — unchanged;
  "Search on MusicBrainz"; "View on MusicBrainz" on Record Detail) opens in
  a new tab with `rel="noreferrer"` (matching the existing idiom) and its
  accessible name or an adjacent visually-hidden note indicates it opens
  externally (e.g. "(opens in a new tab)" for assistive technology, matching
  common practice; exact implementation left as an implementation choice —
  the required external behavior is: a screen-reader user is not surprised
  by a new tab opening).
- No keyboard focus trap anywhere in this enhancement — every new control
  is reachable and leavable via normal Tab order.
- Focus is not stolen when "Load more" appends results — the newly-added
  candidates are inserted into the existing list without moving keyboard
  focus away from the "Load more" control the user just activated (so a
  keyboard/screen-reader user isn't disoriented), unless the "Load more"
  control itself is removed because the window is now exhausted, in which
  case focus should move to a sensible nearby element (e.g. the last-loaded
  candidate or the results heading) rather than being lost to `<body>`.

## 20. Mobile / Responsive

Reuses the existing responsive visual system (Visual Experience & Product
Identity pass) — no native app work, no new breakpoint system.

- The `All`/`Artist`/`Album` control fits or wraps without horizontal
  overflow at the existing mobile breakpoint (matching the existing
  Collection filter-bar wrap behavior, spec 0016 Finding A).
- The search field remains full-width-usable on a narrow viewport,
  unchanged from today.
- "Load more results" remains reachable by normal scroll — no fixed/sticky
  positioning is required or introduced.
- The exact-URL input does not overflow; a long pasted MusicBrainz URL
  wraps or is visually truncated (e.g. `text-overflow: ellipsis` on the
  input's rendered value) without breaking layout or making the input
  unusable — the underlying stored/submitted value is never truncated, only
  its visual presentation.
- All new buttons/controls meet the existing touch-target sizing already
  used by Discover's current buttons — no new smaller control is
  introduced.
- Candidate cards (including the exact-lookup's single card and Load More's
  appended cards) use the **existing** responsive card layout unchanged.

## 21. Error / Loading / Empty States — Consolidated

(Cross-references the detailed per-area tables above; provided here as one
consolidated checklist for implementation/test planning, per this task's own
instruction not to leave states vague.)

**Normal search:** initial (no search yet) · loading first page · results ·
no results (0 raw entries) · provider error (existing full-panel state).

**Load more:** idle (button visible, enabled) · loading more (button
disabled + busy) · append success (new candidates appended, duplicates per
§7.4 dropped) · exhausted (button removed — either raw partial page or the
20-result window reached, §7.2) · later-page error (§7.5 — prior results
untouched, scoped retry).

**Exact URL:** untouched · local validation error (§10.2, no network) ·
loading (§10.3) · exact result (normal candidate card + normal
owned/duplicate/not-owned rendering) · not found · provider timeout ·
provider rate-limited (retried once, then mapped) · provider unavailable ·
malformed provider response · ownership-data-unavailable (existing
"Checking collection…"/"Collection unavailable" placeholder, never a
premature owned/not-owned classification).

No state in this enhancement ever blanks a valid, already-visible result
list, and no state ever substitutes a fabricated success or a silently-empty
result for a real provider error (`intent.txt` §16, §18).

## 22. Automated Test Requirements

To be implemented alongside the feature (not in this spec-only PR). Minimum
required coverage, organized by the areas this spec defines observable
behavior for:

**Search-mode query builder** (`src/lib/catalog/musicbrainz.ts` and/or a new
sibling covering the mode→template mapping, §6.2): All/Artist/Album query
construction; Lucene special-character escaping (each character in the
documented set, §5.1); a literal `/` case (MusicBrainz's own documented
example); quote handling; Hebrew/non-Latin input passes through unescaped-
by-script, un-transliterated, in every mode; leading/trailing/internal
whitespace normalization; minimum/maximum length enforcement identical
across modes.

**Pagination** (`catalog-handlers.mts::handleCatalogSearch` and
`DiscoverPanel.tsx`): initial page at offset 0; offset advancement on
successive Load More calls; append (not replace) behavior; the 20-result
maximum-window cutoff; exhaustion when a raw page is partial; the
raw-vs-normalized-count distinction from §7.2 (a synthetic case where
normalization rejects entries from a full raw page must still report
`hasMore: true`); duplicate `providerReleaseId` across two pages is
deduplicated on append; existing candidate order is preserved; a failed
later-page request preserves all previously-rendered candidates; repeated
rapid clicks on "Load more" cannot produce two concurrent requests.

**Server contract** (`catalog-handlers.mts`): invalid `mode` value falls
back to `all` (not rejected — §8.1); invalid/out-of-range `limit` (existing
behavior, unchanged, re-verified not regressed); invalid `offset` (negative,
non-integer, or `≥ 20`) rejected as `invalid_query`; provider-error mapping
for the new code paths (pagination, exact lookup) matches the existing error
category table; `releaseId` + `q` together, or neither, rejected as
`invalid_query`; `hasMore`/`offset` present and correct in the response
shape.

**MusicBrainz URL parser** (a new pure module/function, unit-testable
without a network mock): canonical `https://musicbrainz.org/release/<mbid>`;
`http://` normalized to `https://`; one optional trailing slash; an
approved-tolerated query string and/or fragment stripped on normalization;
wrong hostname; a lookalike hostname (e.g. `musicbrainz.org.evil.example`,
`evil-musicbrainz.org`); `/release-group/<id>`; `/artist/<id>`; a malformed
MBID; an extra path segment after the MBID; a URL containing userinfo
credentials; a non-`http(s)` scheme (`javascript:`, `data:`); an empty
string (treated as untouched, not an error).

**Exact lookup** (`DiscoverPanel.tsx` + handler, mocked provider):
a valid URL performs the read-only lookup and renders one candidate; zero
database writes occur from the lookup step itself; not-found (404) maps
correctly; a mocked provider timeout maps correctly; an already-owned exact
release shows the owned+duplicate-copy affordance and reuses the **existing**
duplicate-copy mounted-test patterns (spec 0016 Finding B) rather than a
new parallel suite; a not-yet-owned exact release shows the normal single
add action; a `collectionStatus !== 'ready'` render never classifies the
release as owned or not-owned and never enables an add action (regression
guard against spec 0016's already-fixed stale-ownership race, §16).

**Record Detail** (`AlbumDetailPage.tsx`): a MusicBrainz-backed release with
a valid `provider_release_id` shows "View on MusicBrainz" pointing at the
exact release URL (not the release-group URL); a manually-created release
shows no such link; a synthetic malformed-`provider_release_id` case (should
be unreachable in practice, but tested as a defensive regression guard) does
not render a malformed link — the link is hidden instead; the link carries
the expected `target`/`rel` attributes.

**Regression suite** (must remain green, unmodified in intent): manual add
unchanged; ordinary (non-paginated, "All" mode, first-page) catalog add
unchanged; existing duplicate-copy Cancel/Confirm tests (spec 0016)
unchanged; Scan's own duplicate-copy and candidate tests unchanged; existing
Hebrew/multilingual Discover and Scan tests (spec 0015) unchanged; existing
collection-ownership readiness-gating tests (spec 0016 Finding B correction)
unchanged; existing `catalogSearchDraft` restoration tests, extended (not
replaced) to also cover an **old-shaped** stored draft restoring correctly
under the new parser (§9).

## 23. Human Runtime Acceptance Plan

Performed only after implementation, independent review, merge, and
deployment — not part of this spec-only PR. Bounded real-provider budget:
normal MusicBrainz calls Discover already requires today, **zero** OpenRouter/
Vision/curator calls (this enhancement touches none of them). Where an
already-accepted add path can be verified without a *new* write (e.g. by
inspecting an already-owned record's duplicate-copy affordance rather than
completing another confirm), prefer the read-only check; if a production
write is genuinely required for acceptance, it must be an explicit,
human-authorized, reversible action (e.g. add-then-delete the same test
copy), documented honestly in the acceptance evidence — matching the exact
discipline already used for spec 0016 Finding B's own human acceptance.

1. All-mode search still works exactly as before.
2. Artist mode search produces artist-focused MusicBrainz results (the
   selected/expected release ranks visibly better for at least one
   deliberately ambiguous real-world test case).
3. Album mode search produces title/release-focused results similarly.
4. A Hebrew (or other non-Latin) query remains intact end-to-end in every
   mode — no mangled characters, no transliteration.
5. Initial page renders correctly (5 results, or fewer with no error, for a
   real query with limited matches).
6. "Load more" appends new results without replacing/losing the old ones.
7. Rapid repeated "Load more" clicks do not produce parallel/duplicate
   requests or duplicate rendered candidates.
8. A simulated/observed Load More failure (e.g. a genuinely narrow query
   that exhausts early is an acceptable substitute for forcing a real
   provider failure) leaves prior results visible.
9. Result exhaustion (raw partial page, or the 20-result window) correctly
   removes/disables "Load more."
10. A real, valid MusicBrainz release URL resolves to the exact expected
    release.
11. An invalid release-group/artist/wrong-domain URL fails locally, with no
    network request (verifiable via browser dev tools if desired).
12. The exact lookup itself makes no database write (verify collection
    count unchanged after a lookup with no Add clicked).
13. An already-owned exact-lookup result shows the duplicate-copy
    affordance and exact approved dialog copy.
14. Cancel on that dialog writes nothing (collection count unchanged).
15. "Search on MusicBrainz" opens the correct, working external destination
    in a new tab.
16. Existing per-candidate MusicBrainz links still work exactly as before.
17. A MusicBrainz-backed owned record's Record Detail page shows "View on
    MusicBrainz."
18. That link opens the exact release page (not the release-group page).
19. A manually-created record's Record Detail page shows no MusicBrainz
    link.
20. Mobile Discover (search modes, Load More, exact-URL input) has no
    horizontal overflow and remains fully usable.
21. Existing manual-add path still works, unchanged.
22. Existing Scan flow (recognition → candidates → confirm, including its
    own duplicate-copy handling) remains fully intact and unaffected.

## 24. Documentation Closeout — Part of Definition of Done

Per this task's own instruction, the runtime enhancement is **not** complete
merely because code works. After implementation → independent audit → merge
→ deploy → human production acceptance, a **separate** documentation/
presentation closeout PR must evaluate and, where the enhancement genuinely
changed current truth, update:

- `README.md` (Discover feature description, and its architecture diagram's
  endpoint list only if the API surface description changed);
- root `SPEC.md` (its Discover/catalog sections, §13/§15/§16 as applicable);
- `docs/USER_GUIDE.md` (Discover section — search modes, Load More, exact
  URL lookup, the new Record Detail link);
- `docs/INSPECT.md` (only if a reviewer-path stop's evidence became stale or
  a new stop is warranted — not a mandatory new stop);
- `docs/api-integrations.md` (the MusicBrainz section — new query modes,
  pagination, exact lookup);
- `docs/architecture.md` (only if the topology or endpoint count/shape
  wording changed — this spec's design, §11, changes an existing endpoint's
  *parameters*, not the topology or endpoint count, so this may turn out to
  need no change; evaluate, don't assume);
- `docs/verification.md` (a new evidence section, following the exact
  precedent of spec 0016's "Final Submission Alignment Evidence" section —
  automated evidence distinguished from human-observed production evidence,
  as always);
- the current roadmap (`docs/roadmaps/2026-09-02-complete-project-roadmap.md`)
  — a new "post-freeze enhancement" entry, following the exact precedent
  already established for the Hebrew enhancement and Final Submission
  Alignment sections.

Historical specs/plans/ADRs (including this document once implementation
begins, and spec 0016) remain permanent historical evidence and are **not**
rewritten to imply this enhancement always existed.

## 25. Screenshot Closeout

After production acceptance, refresh **only** the documentation screenshots
that became genuinely stale:

- Discover initial state (`docs/assets/screenshots/09-discover.png`) — now
  shows the mode selector.
- Discover results (`10-discover-results.png`) — now potentially shows
  "Load more."
- A new Load-More-expanded state, if judged worth a dedicated screenshot.
- The exact-URL lookup UI/result (new).
- The duplicate-copy dialog (`11-discover-duplicate-dialog.png`) — only if
  its surrounding presentation visibly changed; the dialog's own approved
  copy is unchanged by this spec (§16), so this may not need recapture.
- Record Detail (`07-record-detail.png`, `08-hebrew-record.png`) — now shows
  "View on MusicBrainz" for a MusicBrainz-backed record.

**Explicitly not recaptured without reason:** Dashboard, VIN/Ask VIN,
History, Settings, and the mobile Collection screenshot — none of this
spec's scope touches those screens. Real application screenshots only (no
fabricated UI), redacted of any personal information before publication,
following the exact discipline already established and evidenced in
`docs/USER_GUIDE.md`/`docs/INSPECT.md`'s existing closeout. Annotated
`docs/assets/inspect/` images are updated only for the specific stop(s), if
any, whose represented evidence became stale.

## 26. Final Submission Tag Rule

The existing historical tag `ase26-final-submission-2026-09-15` (annotated
object `821676801084ddccb40e7f61821e945abe07b77a`, peeling to
`9ee871bf352564d3271181558d26498685afa98e`) remains **permanent, unmoved
evidence** of the state accepted before this enhancement began. It is never
moved, deleted, or recreated by this enhancement's work. A **new** annotated
final-submission tag may be created **only after** this enhancement has been:
implemented, independently reviewed, merged, deployed, human production
accepted, and had its documentation closeout (§24) completed and
independently re-audited — not before, and not automatically.

## 27. Definition of Done

This enhancement is **done** only when **all** of the following are true —
code alone is not completion:

1. This spec is human-approved.
2. A companion implementation plan exists and is human-approved.
3. Implementation matches this spec's observable-behavior contracts.
4. The automated tests in §22 exist and pass, alongside the full existing
   automated gate (typecheck, lint, `test:run`, build, pgTAP, db lint,
   `npm audit --omit=dev`) with no regression.
5. No unintended migration, dependency, or AI/model change occurred (§3,
   §18) — or, if one was found genuinely necessary, it was stopped and
   explicitly human-approved first.
6. An independent code audit passes (0 BLOCKER / 0 HIGH, matching this
   project's established bar).
7. Human local/runtime verification passes.
8. Merged through a reviewed PR (normal merge commit, matching this
   project's established Git discipline).
9. Deployed from merged `main` (the project's existing manual deploy
   workflow — no new deployment mechanism).
10. Human production acceptance (§23) passes.
11. Current documentation is updated (§24).
12. Affected screenshots are updated (§25).
13. Verification evidence is recorded in `docs/verification.md`.
14. A final independent submission audit (matching the rigor of the
    "Professor Attack" audit already performed for the original submission)
    passes.
15. **Only after all of the above**, a new final submission tag is created
    (§26).

## 28. Open Questions

Repository evidence and official MusicBrainz documentation resolved every
consequential decision this spec needed to make (§5.2 records each such
resolution explicitly, with its rationale). Genuinely unresolved items, left
open for the implementation plan / human approval rather than silently
decided here because they are cosmetic/flexible rather than behavior-
defining:

1. **Exact final UI wording** for the "Find exact release" button, the
   "Know the exact release?" heading, and the "Search on MusicBrainz" label
   — this spec fixes the *behavior* each must have (§10, §12) and gives
   product-consistent suggested wording, but leaves final copy to
   implementation-time product judgment, consistent with how prior specs
   (e.g. spec 0016) treated non-behavioral copy choices.
2. **Whether "View on MusicBrainz" on Record Detail sits near the existing
   metadata block or near the cover-art block** — a layout/placement choice
   with no behavioral consequence; §13.1/§13.2 fully define *when* it shows
   and *where it points*, not its exact pixel position.
3. **The precise accessible-external-link-indication implementation**
   (visually-hidden text vs. an icon with an accessible name vs. both) —
   §19 states the required external behavior (a screen-reader user is not
   surprised); the exact technique is left as an implementation choice.

No item above affects data safety, security, ownership, duplicate-copy
correctness, or provider trust boundaries — all of those are fully resolved
in §5.2, §10–§11, §15–§16.

## References

`intent.txt` §6.2, §6.3, §15, §16, §17, §19; `AGENTS.md` (Scope Control,
Verification, Git/PR discipline); `SPEC.md` §7, §13, §15, §16, §31–§33;
`docs/decisions/0002-proposed-catalog-provider-boundary.md`;
`docs/specs/0005-milestone-4-catalog-api.md`;
`docs/specs/0012-visual-experience-product-identity.md`;
`docs/specs/0015-hebrew-multilingual-record-support.md`;
`docs/specs/0016-final-submission-alignment.md` (§21.6–21.7 duplicate-copy
contract; Finding B closure evidence);
`docs/verification.md` "Final Submission Alignment Evidence";
`docs/roadmaps/2026-09-02-complete-project-roadmap.md`;
`docs/roadmaps/2026-08-18-complete-project-roadmap.md` (never edited);
official MusicBrainz documentation — `https://musicbrainz.org/doc/MusicBrainz_API`,
`https://musicbrainz.org/doc/MusicBrainz_API/Search`,
`https://musicbrainz.org/search` (directly observed).

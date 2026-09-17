# 020 Discogs Discover Parity Follow-up (Implementation Plan)

Status: **IMPLEMENTED** — specification first
(`docs/specs/0020-discogs-discover-parity-followup.md`), implementation in
the same working branch (`feature/discogs-discover-parity`), per this
follow-up's own explicit instruction to keep it small. This plan does not
restate the spec's rationale — only how it was executed.

Starting `main`: `635b32037d6ca0804e5d0036582ab9a20d328e55` (PR #42 merge
commit; migration `20260917130000_add_discogs_provider_image.sql` already
applied and deployed to production before this branch started). Historical
freeze tags `ase26-final-submission-2026-09-15`/`…-09-16` remain untouched;
no tag action in this branch. No database/schema change in this branch.

## 1. Discogs search modes — library + server

- `src/lib/catalog/discogs.ts`:
  - `buildDiscogsSearchUrl(query, mode)` gains a `mode: SearchMode`
    parameter. `all` keeps setting `q`; `artist` sets `artist` instead of
    `q`; `album` sets `release_title` instead of `q`. `type=release` and
    `per_page` are unchanged and unconditional.
  - `DiscogsSearchOptions`/`searchDiscogsReleases` thread the same `mode`
    through to `buildDiscogsSearchUrl`.
- `netlify/functions/_shared/catalog-handlers.mts`:
  - `DiscogsSearchPageRequest` gains `mode: SearchMode`.
  - `parseCatalogSearchRequest`: the Discogs branch now accepts `mode`
    (validated with the existing `parseMode`, defaulting to `all`) while
    still rejecting `offset`/`limit` (Discogs search still has no
    pagination) — the error message is updated to say so.
  - `handleCatalogSearch`'s `discogs-search` branch passes
    `mode: parsed.mode` to `dependencies.searchDiscogsReleases`.
- `src/lib/catalog/client.ts`: `searchDiscogsCatalog(client, query, mode)`
  gains a `mode` parameter and sends it as a `mode` query-string parameter
  (mirroring the MusicBrainz search request shape).

## 2. Discogs search modes — DiscoverPanel state/UI

- New independent state in `DiscoverPanel.tsx`: `discogsMode:
  SearchMode` (default `'all'`), mirroring the existing pattern that every
  Discogs surface here (`discogsPhase`, `discogsResults`, ...) is its own
  state, sharing only the top-level `query` text.
- New `handleDiscogsModeChange(next)`, mirroring `handleModeChange`:
  no-ops if unchanged; otherwise sets `discogsMode` and resets
  `discogsResults`/`discogsSubmittedQuery`/`discogsSearchError`/
  `discogsPhase` back to `'initial'`. Does not touch MusicBrainz's
  `mode`/`candidates`/`phase`, and does not touch
  `discogsResultsFetchedAt` (no results left to expire once cleared).
- `runDiscogsSearch` passes `discogsMode` to `searchDiscogsCatalog`.
- The Discogs branch of the render gains a `<div className=
  "vi-discover__modes">` row identical in structure to MusicBrainz's:
  `SegmentedRadioGroup` (reusing the existing `MODE_OPTIONS` constant —
  the same three options, no new labels) bound to `discogsMode`/
  `handleDiscogsModeChange`, plus the new "Search on Discogs" link (§4
  below) in the same slot as "Search on MusicBrainz".

## 3. Example searches for both providers

- The existing `EXAMPLES` constant and its rendering block (chip buttons
  calling `setQuery(ex); void runSearch(ex)`) are reused verbatim for
  Discogs's `discogsPhase === 'initial'` block, calling `setQuery(ex); void
  runDiscogsSearch(ex)` instead — same array, same labels, same chip
  markup/class, no new component.

## 4. Discogs hint copy + "Search on Discogs" link

- `discogsIdentity.ts`: new `discogsWebSearchUrl(term: string | null):
  string`, mirroring `musicBrainzWebSearchUrl` exactly — `URLSearchParams`
  with `q` set only when `term?.trim()` is non-empty, `type=release`
  always set, base `https://www.discogs.com/search/`. The file's header
  comment (which explicitly recorded "does NOT export a
  `discogsWebSearchUrl`") is updated to record the reversal and point at
  spec 0020 §5.
- `DiscoverPanel.tsx`'s Discogs hint paragraph text is replaced with
  exactly "Extra pressings and regional releases." (same `<p
  className="vi-hint vi-discover__discogshint">` wrapper, only the text
  content changes).
- The new "Search on Discogs" `<a>` uses the same `vi-btn vi-btn--ghost
  vi-btn--sm` classes, `target="_blank"`, `rel="noreferrer"`, and
  visually-hidden "(opens in a new tab)" span as "Search on MusicBrainz",
  with `href={discogsWebSearchUrl(query || null)}`.

## 5. Album Detail layout parity

- `src/pages/AlbumDetailPage.tsx`:
  - Import `DiscogsAttribution` from `../catalog/DiscogsAttribution.tsx`.
  - The `<dl>`-wrapping condition changes from `meta.length > 0 ||
    (providerReleaseUrl && !isDiscogs)` to `meta.length > 0 ||
    Boolean(providerReleaseUrl)` — the Discogs link now lives inside the
    `<dl>` too, so the fallback "No catalog details recorded." message no
    longer needs the `!isDiscogs` carve-out it had only because the
    Discogs link previously rendered outside the list.
  - The existing MusicBrainz-only `dt`/`dd` block (`providerReleaseUrl &&
    !isDiscogs`) drops its `!isDiscogs` condition, becoming a single block
    for both providers keyed on `providerReleaseUrl` alone. Its `dd`
    gains, immediately after the existing "View on {providerLabel}" link,
    a conditional `{isDiscogs ? <DiscogsAttribution
    releaseUrl={providerReleaseUrl} /> : null}` — the **full**, non-
    `compact` variant, which block-stacks under the link by the existing
    (unchanged) `.vi-discogs-attribution` CSS (no `display` override on
    the non-compact class, so it keeps the `<p>` default `display: block`
    and never sits on the same visual line as the link above it).
  - The old standalone `<p className="vi-discogs-attribution">…</p>` block
    below the `<dl>` (with its "kept out of the metadata definition list"
    comment) is deleted entirely — superseded by the merged `dt`/`dd`
    entry above. The comment is replaced with one describing the new
    parity layout and pointing at spec 0020 §6.
- `src/styles/pages.css`: a new, more specific `.vi-album__meta dd
  .vi-discogs-attribution` rule restates `color: var(--text-faint)` and
  `font-weight: 400` — needed because `.vi-album__meta dd` alone
  (`color: var(--text)`, `font-weight: 600`) is more specific than
  `.vi-discogs-attribution` alone, and would otherwise win once the full
  variant renders inside that `dd`. Every other existing call site
  (Discover cards, History rows, Dashboard, VIN cards) is untouched by
  this more specific, context-scoped rule.

## 6. Tests

- `src/lib/catalog/discogs.test.ts`: `buildDiscogsSearchUrl`/
  `searchDiscogsReleases` cases for `mode: 'artist'` (sends `artist=`, no
  `q=`) and `mode: 'album'` (sends `release_title=`, no `q=`); `mode: 'all'`
  (or omitted) keeps sending `q=` — plus `type=release` asserted in every
  case.
- `netlify/tests/catalog-functions.test.ts`: `provider=discogs&q=...&mode=
  artist`/`...&mode=album` are accepted and forwarded; `provider=discogs`
  with `offset`/`limit` is still rejected with the (updated) error message;
  an invalid `mode` value is still rejected the same way it already is for
  MusicBrainz.
- `src/lib/catalog/discogsIdentity.test.ts`: `discogsWebSearchUrl` cases —
  non-empty term sets `q`, empty/whitespace/`null` term omits it, `type=
  release` always present.
- `src/catalog/DiscoverPanel.test.tsx`:
  - Selecting Discogs shows the mode control; changing it does not call
    `searchDiscogsCatalog` and clears any visible Discogs results.
  - An Artist/Album-mode Discogs search calls `searchDiscogsCatalog` with
    the expected mode argument.
  - Clicking a Discogs example button runs a Discogs search with that
    text.
  - The shortened hint text is present; the old long sentence is not.
  - "Search on Discogs" renders only under Discogs, with the expected
    `href` (including the query-present vs. query-empty cases), opens in a
    new tab, and switching back to MusicBrainz restores "Search on
    MusicBrainz" instead.
- `src/pages/AlbumDetailPage.test.tsx`: an owned Discogs item renders a
  `DISCOGS` term inside the `<dl>` with a "View on Discogs" link and the
  exact "Data provided by Discogs." text in the same `dd`; a masked
  (`discogsUnavailable`) Discogs item renders neither; the existing
  MusicBrainz assertions are unchanged (still pass unmodified, confirming
  no regression).

## 7. Validation gate

`npm ci`, `git diff --check`, `npm run typecheck`, `npm run lint`, `npm run
test:run`, `npm run build`, `npm audit --omit=dev`. No Supabase
migration/reset — this branch makes no schema change.

## 8. Out of scope / explicitly not done

Same list as spec 0020 §7. No merge, deploy, tag, or model call in this
branch.

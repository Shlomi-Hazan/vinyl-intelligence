# 0020 Discogs Discover Parity Follow-up (Specification)

Status: **IMPLEMENTED, MERGED, DEPLOYED, PRODUCTION ACCEPTANCE COMPLETE /
ACCEPTED** (this spec and its companion plan,
`docs/plans/020-discogs-discover-parity-followup.md`, were written and
implemented together in the same branch, per this follow-up's own explicit
instruction to keep it small; one HIGH race-condition correction round
followed before merge — see PR #43). Human production acceptance ran
2026-09-17 against production runtime commit
`6a86f57b292826ecf73c4adab9d5a40baa5ecdeb` / Netlify deploy
`6aac1973b27b534636273f42` — see §9 below for the full record.

This is a small, post-production UX-parity follow-up to
`docs/specs/0019-discogs-discover-ux-and-artwork.md` (PR #42,
`635b32037d6ca0804e5d0036582ab9a20d328e55`, migration
`20260917130000_add_discogs_provider_image.sql` applied and deployed to
production). It does not reopen the Discogs architecture, database schema,
artwork, freshness, add, duplicate, VIN, or Scan decisions those documents
already settled — it brings five specific pieces of the Discogs side of
Discover, and the Discogs section of Album Detail, up to the same visual
and functional parity with MusicBrainz that spec 0019 stopped short of.

Baseline `main`: `635b32037d6ca0804e5d0036582ab9a20d328e55`.

## 1. What changed and why

Real human use of the shipped spec 0019 UX found the Discogs side of
Discover noticeably less capable and more cluttered than the MusicBrainz
side it sits beside, and Album Detail's Discogs section visually
inconsistent with its MusicBrainz counterpart:

1. Discogs search has no All/Artist/Album mode — every query runs as one
   general search, unlike MusicBrainz.
2. Discogs search has no example buttons, so first-time Discogs users have
   no quick way to see what a query looks like.
3. The Discogs explanatory hint is a long paragraph restating rules
   (provider separation, duplicate entries) that are documented elsewhere
   and not something the user needs re-explained every time they select
   Discogs.
4. There is no way to jump to Discogs's own web search — a user who wants
   to browse pressings before importing an exact release URL has no
   shortcut.
5. Album Detail's Discogs provenance is a single inline line ("View on
   Discogs ↗ · Data provided by Discogs."), while MusicBrainz's is a
   `MUSICBRAINZ` / `View on MusicBrainz` definition-list entry — the two
   providers read as differently designed rather than as two options on
   one system.

None of this changes what Discogs data means, how it is fetched, how it is
persisted, or how freshness/artwork/add/duplicate behave — only how the
existing Discogs surface is presented and navigated.

## 2. Discogs search modes

Discogs search gains the same `[ All ] [ Artist ] [ Album ]` segmented
control already used for MusicBrainz, shown directly above the (now
shortened) Discogs hint, in the same position/style as MusicBrainz's mode
row.

- **State is independent of MusicBrainz's mode** — a new `discogsMode`
  state, mirroring every other Discogs surface in `DiscoverPanel.tsx`
  (search results, exact-URL lookup), which is already fully independent
  of its MusicBrainz counterpart and shares only the top-level query text.
  Switching MusicBrainz's mode never touches Discogs's, and vice versa.
- **Mapping to the Discogs Database Search API** (`GET
  /database/search`), always with `type=release` (unchanged):
  - `All` → the existing general query parameter (`q=<query>`).
  - `Artist` → an artist-focused parameter (`artist=<query>`) instead of
    `q`.
  - `Album` → a release-title-focused parameter (`release_title=<query>`)
    instead of `q`.
- Switching the Discogs mode **never fires a search by itself** — it
  clears the current Discogs results back to the initial state (mirroring
  MusicBrainz's `handleModeChange`) and waits for an explicit submit,
  exactly like every other mode/provider switch in this panel.
- MusicBrainz and Discogs results are still never combined, matched, or
  deduplicated against each other — unchanged from spec 0018/0019.
- Discogs search still has no pagination (spec 0018 §8, unchanged) — the
  mode selector does not change that.

## 3. Example searches for both providers

The same three example buttons already shown under MusicBrainz's initial
hint (`Alice Coltrane`, `Bowie Low`, `Radiohead OK Computer`) are now also
shown under Discogs's initial hint, in the same visual position/style.

Clicking an example sets the shared query text and runs a real search
through **whichever provider and mode is currently selected** — the
MusicBrainz examples call `runSearch(example)` exactly as before; the new
Discogs examples call `runDiscogsSearch(example)` the same way. No new
example-specific logic; both call the provider's own normal search path.

## 4. Shorten the Discogs explanatory copy

The existing long Discogs hint paragraph is replaced with exactly:

> Extra pressings and regional releases.

No other paragraph is added elsewhere to restate the removed sentences
(provider separation, duplicate-entry behavior) — that material remains
documented in specs 0018/0019 and this document, not repeated in the UI.

## 5. "Search on Discogs" outbound link

When Discogs is selected, a "Search on Discogs" link appears in the same
position/style as MusicBrainz's existing "Search on MusicBrainz" link (next
to the mode selector). It opens `https://www.discogs.com/search/` in a new
tab, with `type=release` and, when the current query is non-empty, `q=
<query>` — mirroring `musicBrainzWebSearchUrl`'s own shape and empty-query
handling exactly (`discogsWebSearchUrl`, new, in `discogsIdentity.ts`).

This reverses one narrow part of spec 0018 §2.1/§3's original "no
`discogsWebSearchUrl`" decision (the file's own header comment recorded
this exclusion explicitly). The reason for the reversal: the exact-Discogs-
release-URL import feature (spec 0018 follow-up §5) is only useful to a
user who can first find the release's URL on Discogs's own site — today
there is no in-app path to get there. This link exists solely to support
that existing feature; it does not add or change any search, matching, or
persistence behavior.

## 6. Album Detail — Discogs/MusicBrainz layout parity

The Discogs section of Album Detail's metadata area changes from a single
inline line below the `<dl>`:

```
View on Discogs ↗ · Data provided by Discogs.
```

to a `dt`/`dd` entry inside the same `<dl>` MusicBrainz already uses,
mirroring it exactly:

```
DISCOGS
View on Discogs
Data provided by Discogs.
```

- The `dt` is `Discogs` (styled uppercase by the existing `.vi-album__meta
  dt` rule, same as `MusicBrainz`/`Year`/`Label`/etc.).
- The `dd` holds the existing "View on Discogs" button-styled link, with
  the required `DiscogsAttribution` mark rendered directly beneath it as
  its own line — the component's **full (non-`compact`)** variant, which
  is already documented as intended for "primary surfaces (the
  confirmation dialog, Album Detail, VIN cards)" but was not actually used
  on Album Detail before this change (spec 0018 follow-up §6 had replaced
  it with hand-written markup instead).
- This is the same `DiscogsAttribution` component and the same required
  exact phrase — "Data provided by Discogs." — already used everywhere
  else; nothing about the attribution's wording, legal requirement, or
  styling changes, only where and how it renders on this one page.
- MusicBrainz's own row and behavior are unchanged.
- A masked (`discogsUnavailable`) item still shows neither row — unchanged
  from spec 0018 §8.4.

## 7. Out of scope

Unchanged from spec 0019 §10, plus, explicitly for this follow-up:

- No change to the Discogs/MusicBrainz architecture, ranking, matching, or
  deduplication.
- No database/schema/migration change of any kind.
- No change to artwork, freshness (persisted or transient), the add flow,
  the duplicate-confirmation flow, exact-URL lookup/import, VIN
  (curator/recommendation) rendering, or Scan (photo recognition).
- No OAuth, Marketplace, or Discogs-image-binary storage.
- No seventh Netlify Function — the existing `catalog-search` handler
  gains a `mode` parameter for `provider=discogs`, it does not become a
  new endpoint.
- No new dependency.
- No deploy, tag, or model call.

## 8. Acceptance criteria

1. Selecting Discogs shows an `[ All ] [ Artist ] [ Album ]` mode control
   in the same position/style as MusicBrainz's.
2. Changing the Discogs mode does not fire a search and clears any
   existing Discogs results back to the initial state; the MusicBrainz
   mode/results are untouched by this.
3. A Discogs search under `Artist` mode sends `artist=<query>` (not `q=`);
   under `Album` mode sends `release_title=<query>`; under `All` mode
   sends `q=<query>` as before. `type=release` is sent in every case.
4. The Discogs initial-state hint shows the same three example buttons as
   MusicBrainz; clicking one searches Discogs with that text under the
   currently selected Discogs mode.
5. The Discogs hint paragraph reads exactly "Extra pressings and regional
   releases." with no other new explanatory paragraph added.
6. Selecting Discogs shows a "Search on Discogs" link that opens a new tab
   to Discogs's own search, `type=release`, and `q=<query>` when the
   current query is non-empty (omitted when empty).
7. Album Detail for an owned Discogs release shows a `DISCOGS` / `View on
   Discogs` / `Data provided by Discogs.` entry inside the same `<dl>` as
   MusicBrainz's `MUSICBRAINZ` / `View on MusicBrainz` entry; a masked
   item shows neither.
8. Album Detail for an owned MusicBrainz release is pixel-for-pixel
   unchanged (same markup, same condition).
9. `npm run typecheck`, `npm run lint`, `npm run test:run`, and `npm run
   build` all pass; no Supabase migration/reset was needed.

## 9. Production acceptance — COMPLETE / ACCEPTED (2026-09-17)

This spec, plus its PR #43 correction round (a HIGH race condition: an
in-flight Discogs search left pending across an All/Artist/Album mode
change could otherwise populate results under the newly-selected mode —
fixed with a Discogs-only request-generation counter, independent of
MusicBrainz's), merged to `main` and was deployed to production.

- **Production runtime commit:** `6a86f57b292826ecf73c4adab9d5a40baa5ecdeb`
  (merge of PR #43).
- **Production Netlify deploy:** `6aac1973b27b534636273f42`.
- **Date:** 2026-09-17.

Human production acceptance ran against that deploy and **PASSED** on all
of the following:

- Discogs All / Artist / Album mode control visible and working.
- Changing mode does not auto-search.
- Example searches are present under Discogs and work.
- The Discogs hint copy reads exactly "Extra pressings and regional
  releases."
- "Search on Discogs" works.
- Discogs Hebrew search and artwork work.
- Direct "Add to collection" (no client-side preview popup) works.
- The duplicate "Add another copy" confirmation works.
- The exact Discogs release-URL import flow works.
- Album Detail's Discogs provider layout (§6 above) is accepted.
- The MusicBrainz side of Discover and Album Detail (regression) passed
  unchanged.
- Manual-add placement is unchanged.

**Known minor UI issue, ACCEPTED FOR SUBMISSION:** the Discogs attribution
mark can visually crowd the rating/title area in Collection Grid view, and
makes Discogs rows taller/less aligned than MusicBrainz rows in Collection
List view. Stored rating values and all underlying collection data are
correct — this is presentation-only, does not affect any stored value or
any of the functionality above, and does not block submission. Not fixed
by this closure (documentation-only; no runtime change was made or
authorized here).

**Deployment note:** Netlify production deploys became paused after the
`6aac1973b27b534636273f42` deploy above because the team exhausted its
current production-deploy credit allowance. The already-published
production site remains online and continues serving that deploy. No
further production deploy is required for this closure.

This closes out spec 0020's production-acceptance gate — **COMPLETE /
ACCEPTED**.

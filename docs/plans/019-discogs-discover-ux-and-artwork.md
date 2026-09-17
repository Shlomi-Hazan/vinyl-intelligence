# 019 Discogs Discover UX and Provider Artwork (Implementation Plan)

Status: **IMPLEMENTED** — specification first
(`docs/specs/0019-discogs-discover-ux-and-artwork.md`), implementation in
the same working branch (`feature/discogs-discover-ux-artwork`), per this
enhancement's own explicit instruction to keep the follow-up small. This
plan does not restate the spec's rationale — only how it was executed.

Starting `main`: `b73d7a79769ddd7a1d4a109945eda301fca5f605` (PR #41 merge
commit; migration `20260917120000_add_discogs_catalog_provider.sql` already
applied and deployed to production before this branch started). Historical
freeze tags `ase26-final-submission-2026-09-15`/`…-09-16` remain untouched;
no tag action in this branch.

## 1. Migration

One new, forward-only migration:
`supabase/migrations/20260918120000_add_discogs_provider_image.sql` — adds
nullable `provider_image_url text`, a clean-format check (btrim + 1-1000
chars, mirroring every other text field's existing convention), and a
`provider = 'discogs'`-scoped check (never required, only ever scoped —
the opposite direction from `releases_discogs_requires_fetched_at`). No
grant, RLS, or unique-constraint change. **Not applied to the hosted
project by this branch** — verification ran against the local Supabase
instance only (`supabase db reset` + `supabase test db` + `supabase db
lint`).

## 2. Library layer (provider-agnostic types first)

- `src/lib/catalog/catalogFieldLimits.ts`: new `providerImageUrl: 1000`
  bound.
- `src/lib/catalog/types.ts`: `CatalogCandidate` gains `providerImageUrl:
  string | null` (always `null` for MusicBrainz).
- `src/lib/catalog/musicbrainz.ts`: sets `providerImageUrl: null`
  explicitly on every candidate (the type now requires it).
- `src/lib/catalog/discogs.ts`:
  - `DiscogsSearchResultItem` gains `transientCoverDisplayUrl` (from
    `cover_image` else `thumb`, both validated as real `http(s)` URLs, a
    malformed value discarded rather than partially trusted);
  - `normalizeDiscogsExactRelease` gains `selectDiscogsProviderImage`
    (primary-first, then first-usable, then `null`), feeding
    `candidate.providerImageUrl`.
- `src/lib/catalog/discogsIdentity.ts`: new `parseDiscogsReleaseUrl`
  (mirrors `parseMusicBrainzReleaseUrl`'s exact discipline — a real `URL`
  parse, anchored pathname regex, never string splitting); the module's own
  header comment (which previously said this was deliberately cut) is
  corrected to say it is reinstated by this follow-up, not silently
  contradicted.
- `src/catalog/catalogSearchDraft.ts`: its `parseCandidate` validator/
  reconstructor updated for the new required field (MusicBrainz-only
  drafts, so always `null`).

## 3. Persistence and server

- `netlify/functions/_shared/catalogPersistence.mts`: `upsertCatalogRelease`
  writes `provider_image_url: candidate.providerImageUrl` alongside every
  other candidate field it already writes explicitly.
- `netlify/functions/_shared/catalog-handlers.mts`: no add-flow logic
  change was needed — the existing normal-add and refresh paths already
  performed their own independent exact Discogs lookup before persisting
  (spec 0018 §9); `DiscogsRefreshResponse.candidate` already carries
  `providerImageUrl` once the shared `CatalogCandidate` type does, with no
  separate top-level response field required.
- `src/lib/supabase/client.ts` / `src/lib/supabase/collection.ts`: `Release`
  type, the `releases` Insert type, `CollectionItemWithRelease['release']`,
  and both `collection.ts` selects (`loadCollection`,
  `addManualCollectionItem`) gain `provider_image_url`.

## 4. Client freshness reconciliation

`src/app/CollectionDataProvider.tsx`'s `revalidateSequentially` now also
sets `release.provider_image_url` from the refreshed candidate in the same
`setItems` update that sets the new `provider_fetched_at` — the same
successful fetch, the same timestamp, never independently timed. A failed
refresh leaves the item masked and the image field untouched (no stale
value is ever surfaced, since masking already hides it at every caller).

## 5. Artwork precedence

`src/media/AlbumArtwork.tsx` gains one new prop, `providerImageUrl`,
inserted into the existing tiered `sources` array right after the signed
custom-cover URL and before the two Cover Art Archive tiers. The component
itself has no provider/freshness awareness — every caller decides what to
pass. Updated callers, all with the identical gate
(`provider === 'discogs' && !discogsUnavailable`, or for a search-result
card, the search result's own always-transient
`transientCoverDisplayUrl`):

- `src/collection/CollectionBrowser.tsx` (`artProps`)
- `src/pages/AlbumDetailPage.tsx`
- `src/pages/DashboardPage.tsx` (`AlbumMini`)
- `src/pages/HistoryPage.tsx`
- `src/curator/CuratorRecommendationCard.tsx` (`artworkProps`) — the fresh
  `recommendation.artist`/`title` text-source discipline from the PR #41
  review round is unchanged; only the artwork URL itself is new.
- `src/catalog/DiscoverPanel.tsx` (both `renderCandidate` for either
  provider's exact-release card, and the new `renderDiscogsResult` for a
  Discogs search result).

## 6. Discover UX rewrite

`src/catalog/DiscoverPanel.tsx` was substantially rewritten in place (not a
new component tree):

- New `provider` state (`CatalogProvider`, default `'musicbrainz'`), a
  `SegmentedRadioGroup` (the existing shared component, already used for
  the MusicBrainz mode selector — no new design system) directly beneath
  the shared search field.
- All existing MusicBrainz state/logic (search, Load More, exact-URL,
  drafts) is unchanged internally, only wrapped in a `provider ===
  'musicbrainz'` condition.
- New parallel Discogs state (`discogsPhase`/`discogsResults`/
  `discogsSubmittedQuery`/`discogsSearchError`, and a second independent
  exact-URL state block) — the two providers never share result/phase
  state, only the top-level `query` text and the add/duplicate-confirm
  machinery below.
- `add()` was widened from `(candidate: CatalogCandidate)` to
  `(candidate: Pick<CatalogCandidate, 'provider' | 'providerReleaseId'>)`
  — the confirmation dialog never rendered a candidate preview for either
  provider, so this is the true minimal shape every entry point (a
  MusicBrainz candidate, either provider's exact-URL candidate, or a bare
  Discogs search-result item) already satisfies without constructing a
  placeholder object.
- `confirmingCandidate`'s state type was widened identically; the dialog
  copy became provider-aware ("You already own this Discogs release…" vs.
  the existing generic wording) with no other change to the dialog itself.
- `renderCandidate` (shared by both providers' exact-URL results and
  MusicBrainz's normal results/Load More) gained provider-aware artwork
  gating and an provider-aware outbound link label ("Discogs" vs.
  "MusicBrainz" — previously hardcoded).
- New `renderDiscogsResult` for a normal Discogs search result: visual
  parity with `renderCandidate` (cover / title / meta / attribution /
  action), but uses the search result's own combined `displayTitle`
  (never split into artist/title, unchanged from spec 0018 §1/§3) and adds
  directly with no client-side preview step (§3 of the spec).
- The old standalone `src/catalog/DiscogsSearchPanel.tsx` (and its test
  file) was deleted — its logic was folded into `DiscoverPanel.tsx` rather
  than composed alongside it, since the two providers now share one search
  field and one result area rather than a separate collapsed panel.
- "Can't find it? Add it manually" — untouched: same location, same
  appearance, same behavior.

## 7. Attribution presentation

- `src/catalog/DiscogsAttribution.tsx`: added a decorative, `aria-hidden`
  "↗" after the required text (compact and full variants alike); the
  required wording itself is unchanged.
- `src/styles/pages.css`: new `.vi-discogs-attribution` rule (previously
  unstyled — plain default `<p>` sizing, which is what made it look "too
  large and too central" in production). Reuses the existing small/muted
  tokens (`--fs-label`, `--text-faint`) rather than inventing new ones.
- `src/pages/AlbumDetailPage.tsx`: the Discogs provenance `<dt>/<dd>` row
  was removed from the metadata definition list and replaced with one
  compact paragraph below it — "View on Discogs ↗ · Data provided by
  Discogs." — using the same `.vi-discogs-attribution` styling. The
  MusicBrainz `<dt>MusicBrainz</dt><dd>View on MusicBrainz</dd>` row is
  unchanged (no attribution requirement applies to it).

## 8. Tests

Focused coverage was added or updated (not exhaustively re-listed here —
see the diff and `docs/verification.md`'s eventual entry for this branch):
pure-function tests for `parseDiscogsReleaseUrl`, the search/exact image
normalizers, `AlbumArtwork`'s new precedence tier, `CollectionDataProvider`'s
image reconciliation on success/failure, each artwork caller's
fresh/masked image behavior, `DiscogsAttribution`'s new arrow/wording, the
Album Detail compact-line restructure, and a substantially rewritten
`DiscoverPanel.test.tsx` covering the provider toggle, the direct Discogs
add flow, the Discogs duplicate-confirmation flow, and the exact Discogs
URL flow (valid, slugged, and rejected cases).

## 9. Verification performed

`npm ci`, `git diff --check`, `npm run typecheck`, `npm run lint`,
`npm run test:run`, `npm run build`, `npx supabase start` +
`npx supabase db reset` (local only) + `npx supabase test db` +
`npx supabase db lint`, `npm audit --omit=dev`. Exact counts and results are
recorded in the PR description and the closing session report, not
duplicated here to avoid this document drifting out of sync with them.

## 10. Non-goals (unchanged from spec 0018/ADR 0008)

Discogs OAuth, Marketplace/prices, Discogs account sync, Master import,
automatic Discogs fallback, combined MB/Discogs ranking, fuzzy provider
deduplication, a Scan/Vision Discogs fallback, any VIN search-provider
change, new analytics infrastructure, any new dependency, a seventh Netlify
Function, image binary storage/caching, and any production migration/deploy
performed by this branch.

# 0019 Discogs Discover UX and Provider Artwork (Specification)

Status: **IMPLEMENTED** (this spec and its companion plan,
`docs/plans/019-discogs-discover-ux-and-artwork.md`, were written and
implemented together in the same branch, per this enhancement's own explicit
instruction to keep the follow-up small).

This is a focused follow-up to `docs/specs/0018-discogs-secondary-catalog-provider.md`
(PR B, merged as PR #41, `b73d7a79769ddd7a1d4a109945eda301fca5f605`,
migration `20260917120000_add_discogs_catalog_provider.sql` applied and
deployed to production) and to
`docs/decisions/0008-discogs-secondary-catalog-provider.md`. It does not
reopen the underlying provider/legal/architecture decisions those documents
already settled (MusicBrainz remains primary, Discogs remains explicit and
secondary, no OAuth, no Marketplace, no combined-provider ranking or
deduplication) — it changes specific UX and artwork decisions based on real
human production acceptance of spec 0018's shipped behavior.

Baseline `main`: `b73d7a79769ddd7a1d4a109945eda301fca5f605`.

## 1. What changed and why

Production acceptance of the spec 0018 UX found three problems and one gap:

1. **Discogs felt like a buried utility, not a real secondary catalog.** It
   lived behind a "Search Discogs" toggle far below MusicBrainz, visually
   adjacent to the manual-add fallback.
2. **The first-add confirmation was redundant.** A normal (not-yet-owned)
   Discogs result required a read-only preview lookup, a confirmation
   dialog, and then a second persisting lookup — confirming the same
   decision twice for the common case.
3. **No way to add an exact, already-known Discogs release by URL** — spec
   0018 §8 explicitly deferred this.
4. **No cover artwork for Discogs-backed records** — spec 0018 §14 put this
   entirely out of scope, and the resulting lack of artwork materially hurt
   the browsing experience the product exists to provide.

Additionally, the required Discogs attribution mark rendered too large and
central (plain, unstyled paragraph text), and Album Detail rendered
Discogs provenance as its own multi-line block instead of compact
supporting text.

## 2. Discover UX — one primary search area

MusicBrainz and Discogs now share one search field and one visible provider
selector, immediately below it:

```
[ search field ]
[ MusicBrainz ] [ Discogs ]
(provider-specific options/results)
```

- **MusicBrainz remains the default** selection on every mount.
- Selecting a provider is an explicit, deliberate action and **never fires
  a request by itself** — a request only ever happens on submit
  (Enter / a search button / an exact-URL submit), exactly as before.
- The typed query text is shared state and survives a provider switch.
- MusicBrainz's own All/Artist/Album mode selector and "Search on
  MusicBrainz" link are shown only while MusicBrainz is selected; Discogs
  shows a short hint ("More pressings and regional releases…") plus the
  existing never-combined/never-deduplicated notice instead.
- Each provider's results, pagination (MusicBrainz only — Discogs still has
  none, per spec 0018 §8), and exact-URL section are fully independent
  state, rendered only while that provider is selected. Switching providers
  never discards the other provider's results — they simply become hidden
  and reappear on switching back.
- No combined result ranking; no provider matching/deduplication. Unchanged
  from spec 0018.
- "Can't find it? Add it manually" keeps its existing location and
  appearance beneath both providers' areas — not promoted, not collapsed,
  not redesigned.

## 3. Discogs add flow — first add is direct

For a Discogs search result or exact-URL result **not already owned**:

```
Discogs result -> "Add to collection" -> server exact lookup -> persist -> success
```

There is no client-side read-only preview call and no confirmation modal
for this normal first-copy path. The button calls the existing persisting
add endpoint directly with only `{ provider: 'discogs', providerReleaseId }`
— never the browser's own search-result display fields (title, year, label,
etc.), which remain non-authoritative exactly as spec 0018 already required.

**This does not weaken server-side validation.** `POST /api/catalog/add`
for a normal (non-refresh) Discogs add already performed, and continues to
perform, its own independent exact Discogs lookup (`GET /releases/{id}`),
Vinyl-format verification, and normalization before ever touching the
database (spec 0018 §9) — removing the client-side preview step removes a
redundant *client* round-trip, not the server's authoritative check.

If the server's exact lookup fails (not found, not Vinyl, provider error),
the add fails cleanly with a visible error; the browser never falls back to
persisting the search result's own display metadata.

## 4. Duplicate case — confirmation is kept

If the exact `(provider='discogs', providerReleaseId)` identity is already
owned, the user still sees a confirmation before a second physical copy is
created:

> "You already own this Discogs release. Add another copy?"
> [Cancel] [Add another copy]

Confirming reuses the exact same authoritative add path as §3 — the server
performs its own exact Discogs lookup again; nothing about a duplicate copy
ever trusts cached or search-result metadata. This dialog and its
underlying add path are shared, unmodified, with MusicBrainz's own existing
duplicate-copy confirmation (spec 0016/0017) — only the confirmation
identity type was widened to accept a bare `{ provider, providerReleaseId }`
pair (no candidate object is required, since the dialog itself has never
rendered a candidate preview for either provider).

## 5. Exact Discogs release URL

"Know the exact release?" is now offered for **both** providers, each with
its own input, placeholder, and independent state:

- MusicBrainz: unchanged (`https://musicbrainz.org/release/...`).
- Discogs: `https://www.discogs.com/release/26770295-...`.

A strict URL parser (`parseDiscogsReleaseUrl`, mirroring the existing
`parseMusicBrainzReleaseUrl` exactly: a real `URL` parse, not string
splitting) accepts only:

- `https://discogs.com/release/<digits>` or
  `https://www.discogs.com/release/<digits>`, optionally followed by
  `-<any slug>` (Discogs's own canonical link shape), with at most one
  trailing slash and an optional query string/fragment.

It rejects: a master URL (`/master/…`), an artist URL (`/artist/…`), a
Marketplace URL (`/sell/…`, including one with a release id elsewhere in
the path), a numeric id in any other/extra path position, an id failing
`DISCOGS_RELEASE_ID_PATTERN`, embedded userinfo credentials, a non-`http(s)`
scheme, and an explicit non-default port.

Flow: `URL -> validated release id -> the existing read-only exact-lookup
endpoint -> render one exact result card -> "Add to collection"`. The exact
lookup here is a genuine, useful read-only preview (the user explicitly
asked for one specific release) — the persisting add still performs its
own second, independent, authoritative lookup, identical to §3/§4.

## 6. Attribution — wording unchanged, presentation fixed

The required phrase **"Data provided by Discogs."** is unchanged and still
appears adjacent to every piece of Discogs-sourced data, with a normal
(non-`nofollow`) link to the exact release. It now renders as small, muted
supporting microcopy (`.vi-discogs-attribution`, reusing the existing
small/muted text tokens `--fs-label`/`--text-faint` already used for other
secondary metadata) — never a section title, primary metadata, a CTA, or a
central content block. A small decorative "↗" (aria-hidden, never part of
the link's accessible name) marks it as an outbound link.

Album Detail no longer renders a standalone `DISCOGS` / `View on Discogs` /
`Data provided by Discogs` block inside the metadata definition list.
Discogs provenance is now one compact line beneath the release metadata:

> View on Discogs ↗ · Data provided by Discogs.

This compact treatment is the same `DiscogsAttribution` component (or, for
Album Detail's combined view-link line, the same CSS class) applied
consistently across search results, the collection grid/list, Album Detail,
Dashboard, History, and the VIN recommendation card. Attribution never
disappears — masking a `discogsUnavailable` item still shows no attribution
for the fields it is currently hiding (spec 0018 §8.4, unchanged), since
there is nothing Discogs-sourced being displayed for those fields in that
state.

## 7. Discogs provider artwork — new functional enhancement

The lack of artwork materially hurt the browsing experience. Cover images
are now supported, subject to the same legal/security boundary spec 0018
already established for every other Discogs-derived fact:

- Discogs Images are **Restricted Data** under the Discogs API Terms of
  Use, not CC0 catalog metadata (spec 0018 §5.2).
- Only the provider's own image **URL string** is ever persisted — never
  image bytes. No download into Supabase Storage, no proxy, no claim of
  ownership.
- `DISCOGS_TOKEN` is never exposed to the browser, never placed in an image
  URL or any query string, and never required by the browser to display an
  image.

### 7.1 Field names used — human live-API verification CLOSED / PASS

Both endpoints already used by spec 0018 return image fields; this
enhancement adds no new endpoint and no seventh Netlify Function.

**Verification status (human-run, 2026-09-17):** this section originally
recorded these field names and their public-loadability as an OPEN
gate — sourced only from the Discogs API's own published field
documentation and corroborating third-party integration references, since
the official developer pages return HTTP 403 to this project's automated
fetch tooling (the same persistent, known access constraint spec 0018 §5.2
already recorded for the Terms of Use document), never from a live
authenticated response this project had itself made. That gate is now
**CLOSED / PASS**, verified by the human directly against the live Discogs
API:

1. Exact release `26770295` (`GET /releases/26770295`) returns `images[]`
   with a primary image whose `uri` and `uri150` are both HTTPS.
2. That primary image URL loads publicly, with no `Authorization` header,
   and returns HTTP 200 `image/jpeg` — confirming the field-derived URL is
   a genuinely directly-loadable, unauthenticated image URL, not merely an
   API resource reference.
3. `GET /database/search` for `q="כהן מה שאפשר עם מה שנשאר"` returns
   results carrying both `cover_image` and `thumb`, including release
   `26770295`.

This confirms exactly the two field pairs this implementation actually
uses — `cover_image`/`thumb` (search, §7.2) and `images[].uri`/`uri150`
(exact release, §7.3) — and that URLs derived from them are safe to render
via a plain, unauthenticated `<img src>` in the browser, satisfying the
image-licensing/security boundary this spec requires (§7).

- **Database Search** (`GET /database/search`, used for Discogs search
  results): each result item's own `cover_image` (full-size) and `thumb`
  (150×150) fields.
- **Exact Release lookup** (`GET /releases/{id}`, spec 0018 §9's existing
  authoritative fetch): an `images` array, each entry documented as
  carrying `type` (`"primary"` or `"secondary"`), `uri` (full-size),
  `uri150` (150×150 thumbnail), `resource_url`, `width`, `height`.
  **`resource_url` is deliberately NOT used as an `<img>` source by this
  implementation, and remains unverified/unused** — the verification above
  covers `uri`/`uri150` only; `resource_url` was not part of what the
  human confirmed, so it is still excluded on the same "not independently
  confirmed" basis as before. This is not itself an open gate blocking the
  feature — it is a deliberate, permanent exclusion; `resource_url` could
  only be added later behind its own explicit verification.
- Fetching the metadata (search or exact release) requires the existing
  authenticated, server-only `DISCOGS_TOKEN` call, exactly as every other
  Discogs field already required (spec 0018 §5.1/§9). The resulting image
  URL, once known, is a plain public CDN URL rendered via a normal
  `<img src>` — the same pattern already established for Cover Art
  Archive imagery — now confirmed directly, not merely asserted by
  analogy.
- Every accepted image URL, from either endpoint, must be **HTTPS only**
  (§7.2/§7.3) — `http:`, `javascript:`, `data:`, and any relative/malformed
  value are rejected outright, never partially trusted or silently
  downgraded to an insecure fetch.

### 7.2 Search-result images — transient, never persisted

A Discogs search result's `cover_image` (preferred) or `thumb` (fallback)
becomes a new `transientCoverDisplayUrl` field on `DiscogsSearchResultItem`
— display-only, exactly like the existing (previously always-`null`)
`CatalogCandidate.transientCoverDisplayUrl` field MusicBrainz already
carries. It is rendered only in the search-result card; it is never
persisted as release artwork, and never confused with the exact-release
field below. Missing/invalid/non-HTTPS: falls back to the existing branded
fallback artwork, exactly as before this enhancement — a Discogs id is
still never sent to Cover Art Archive.

### 7.3 Exact-release image — persisted, deterministic, optional

The exact Discogs lookup gains a new `providerImageUrl` field on
`CatalogCandidate` (always `null` for MusicBrainz — it derives artwork from
the Cover Art Archive by mbid at render time, never a persisted URL).
Selection is deterministic, never inferred or fabricated, and considers
only `uri`/`uri150` (§7.1 - never `resource_url`):

1. the first `images[]` entry whose `type` is exactly `"primary"`, if it
   has a usable URL (`uri`, else `uri150`);
2. otherwise the first entry with any usable `uri`/`uri150` URL at all;
3. otherwise `null` — a release with no usable image is a normal, valid
   outcome, not an error, and not every Discogs row is required to have
   one.

A malformed URL (not HTTPS, empty, over the shared length bound) is
ignored entirely, never partially trusted.

## 8. Data model

One new migration, one new nullable column, no other schema change:

```sql
alter table public.releases add column provider_image_url text;

alter table public.releases add constraint releases_provider_image_url_clean
  check (
    provider_image_url is null
    or (provider_image_url = btrim(provider_image_url)
        and char_length(provider_image_url) between 1 and 1000)
  );

alter table public.releases add constraint releases_provider_image_url_scoped_to_discogs
  check (provider_image_url is null or provider = 'discogs');
```

`provider_image_url` is a persisted URL string only — no binary storage
column, no new Storage bucket, no new grants. It carries no independent
freshness clock: `provider_fetched_at` (spec 0018 §12, unchanged) remains
the single authoritative freshness timestamp for every Discogs-derived
field, this one included. The scoping constraint is defense in depth,
mirroring `releases_discogs_requires_fetched_at`'s existing pattern in the
opposite direction (this field is never *required*, only ever *scoped*, for
a Discogs row).

Existing RLS policies, table/column grants, and the
`(provider, provider_release_id)` unique constraint are all unaffected —
verified directly against the migration diff and the existing pgTAP suite
(`catalog_releases_rls.test.sql`).

## 9. Freshness and artwork precedence

### 9.0 Transient Discover-surface freshness (correction round finding 1)

Persisted owned-release freshness (§9.1 below) was already correct from
the first round of this follow-up. It does not, by itself, cover the
Discover screen's own transient Discogs data: a normal search's results
list and the exact-URL preview candidate were kept in React state
indefinitely, with no expiry of their own - meaning Discogs API metadata
(and, once fetched, a transient search-result image) could in principle
still be displayed more than six hours after it was fetched, if the user
simply left the tab/page open without re-searching.

This is now closed with the exact same six-hour boundary, applied to
ephemeral component state rather than a database row:

- Each surface (search results; the exact-URL preview candidate) records
  its own fetch/receipt timestamp independently when it successfully
  loads.
- Fresh through exactly six hours (boundary inclusive, matching
  `isDiscogsRowFresh`'s existing semantic); the first genuinely-stale
  instant is one millisecond past that.
- A floor-free one-shot timer (mirroring `CollectionDataProvider.tsx`'s
  existing pattern, reusing the same `msUntilStale`/`isDiscogsRowFresh`
  pure functions from `discogsFreshness.ts` against the local receipt
  timestamp) clears - never re-fetches - the expired surface's state back
  to its initial "search/find again" state at that exact moment. No
  polling.
- A `visibilitychange` listener performs the same check synchronously on
  tab resume, closing the gap where a backgrounded tab's `setTimeout` may
  have been throttled or paused past its scheduled fire time - stale
  transient data is never displayed even for one frame after the tab
  becomes visible again.
- Switching the provider toggle away and back never resurrects expired
  data - once cleared, the state is simply gone; toggling only changes
  which already-live surface is rendered.
- No automatic re-fetch under any circumstance. The user must explicitly
  search, or submit the exact-URL form, again.

This applies identically and independently to both transient surfaces -
they can expire at different times, tracked separately.

### 9.1 Persisted owned-release freshness

Discogs provider artwork obeys the exact same six-hour freshness boundary
as every other Discogs-derived field (spec 0018 §12):

- A fresh Discogs row may display its persisted provider image.
- A stale, `discogsUnavailable`, or unset `provider_fetched_at` row never
  displays a stale provider image — masking (spec 0018 §8.2/§8.4) already
  hides the whole item's provider-derived fields, and this field is treated
  identically by every caller: gated on `provider === 'discogs' &&
  !discogsUnavailable`, exactly like `provider_release_id`/artist/title
  already are.
- A successful revalidation/refresh persists the refreshed image URL tied
  to the exact same successful provider fetch, and the exact same
  server-generated `providerFetchedAt` timestamp from that fetch — never a
  separately-timed value, never a client-side `Date.now()`.
- A failed revalidation leaves the item masked; no stale image is ever
  shown while, or after, a failed async refresh.

`AlbumArtwork`'s precedence gains one new tier, inserted after the user's
own custom cover and before Cover Art Archive:

1. user's custom uploaded cover (unchanged, always wins);
2. a fresh Discogs provider image (new);
3. Cover Art Archive release front, then release-group front (MusicBrainz
   only, unchanged);
4. the existing branded SVG fallback (unchanged).

A MusicBrainz-backed item's precedence and behavior is completely
unaffected — its `providerImageUrl` is always `null`, and a Discogs row
never reaches Cover Art Archive (unchanged from spec 0018 §14).

Once persisted and fresh, the Discogs cover appears everywhere an owned
album's artwork already appears: the collection grid/list, Album Detail,
Dashboard cards/minis, History rows, and the VIN recommendation card when
it resolves to the owned Discogs item. Search-result artwork (§7.2) is
transient and entirely separate from this owned-release artwork. A custom
cover, where present, wins everywhere, unconditionally.

## 10. Explicitly not changed / not in scope

Unchanged from spec 0018/ADR 0008, not reopened by this follow-up:

- MusicBrainz remains the sole default/primary provider; Discogs remains
  explicit, secondary, user-triggered only.
- No automatic Discogs fallback from a MusicBrainz search.
- No combined-provider result ranking or fuzzy cross-provider
  deduplication.
- No Discogs OAuth, Marketplace data, pricing, or account sync.
- No Master-level import.
- Scan/Vision has no Discogs fallback (spec 0018's own structural
  confirmation stands unchanged — Scan never constructs a `provider:
  'discogs'` candidate).
- VIN's own search/provider behavior is unaffected — this is a Discover
  (catalog add) and artwork-display enhancement only.
- No new dependency, no seventh Netlify Function, no image binary storage
  or caching, no new analytics infrastructure.

## 11. Acceptance criteria

1. Discover shows one search field with a visible MusicBrainz/Discogs
   selector directly beneath it; MusicBrainz is selected by default.
2. Selecting Discogs makes no network request by itself.
3. Typing a query, then switching providers, preserves the typed text.
4. MusicBrainz's mode selector and "Search on MusicBrainz" link are hidden
   while Discogs is selected, and vice versa for the Discogs hint.
5. An unowned Discogs search result's "Add to collection" persists with no
   client-side preview call and no confirmation dialog; the request body
   contains only provider identity.
6. An owned Discogs release's search result shows a duplicate-copy
   confirmation naming Discogs; confirming invokes the same authoritative
   add path, which performs its own exact server-side lookup.
7. A valid Discogs release URL (with or without a slug) resolves to exactly
   one exact result card; a master/artist/Marketplace/malformed URL is
   rejected with a clear message and triggers no lookup.
8. The required Discogs attribution text is present and correctly linked
   everywhere Discogs data is shown, rendered as small/muted microcopy, not
   a large block; Album Detail shows one compact provenance line.
9. A fresh Discogs-backed collection item shows its persisted provider
   image (when one exists) in the collection grid/list, Album Detail,
   Dashboard, History, and a VIN card; a stale/masked item never shows a
   provider image; a custom cover always wins; a Discogs id never reaches
   Cover Art Archive; MusicBrainz artwork is unaffected.
10. `provider_image_url` exists, is nullable, is scoped to Discogs rows at
    the database level, and every pre-existing constraint/RLS
    policy/grant/unique constraint remains intact.
11. No image binary is ever written to Supabase Storage or the repository;
    no provider token appears in any image URL, request, or client-visible
    data.
12. A Discover search result or exact-URL preview candidate just below or
    exactly at six hours old is still shown; immediately past six hours it
    is cleared (never automatically re-fetched), independently for each
    surface; switching providers away and back after expiry never
    resurrects it; a tab resuming visibility after expiry clears it
    synchronously even if its timer was throttled while backgrounded.

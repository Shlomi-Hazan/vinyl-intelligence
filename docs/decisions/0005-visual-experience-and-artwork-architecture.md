# 0005 Visual Experience & Artwork Architecture

Status: **accepted** 2026-08-31 (human design approval, with the mandatory
provider-artwork correction in this revision). Spec `docs/specs/0012-...`
section 20, decisions A-K approved. Phase 0 (custom-cover storage) implemented
on branch `claude/visual-experience-product-identity`; migration
`20260903120000_add_custom_cover_storage.sql`.

Date: 2026-08-31 (revised same day for the provider-artwork correction)

## Context

Milestones 0-10 are complete. The application is a single scrolling page with no
routing, no product identity, and no album artwork (`releases` has no cover
column; `CatalogCandidate.transientCoverDisplayUrl` is always `null`; there is
no Supabase Storage - `config.toml` `[storage] enabled = false`). Before
Milestone 11 (Production Deployment), a Visual Experience & Product Identity pass
turns the app into a consumer product. Three cross-cutting architecture choices
need a decision record: client routing, persistent user album covers, and
provider artwork.

## Decision

### 1. Client routing - add `react-router-dom` (v7)

The redesign needs 10 real routes (`/`, `/auth`, `/dashboard`, `/collection`,
`/collection/:id`, `/discover`, `/scan`, `/vin`, `/history`, `/settings`, `*`),
auth-guarded route groups, deep-linkable album detail, browser history, and
route-level code splitting (today the build is one ~456 KB JS chunk). No routing
system exists. `react-router-dom` is the standard for a Vite React SPA,
integrates with the existing `AuthProvider`, and needs no server. We use the
plain `<BrowserRouter>` + `<Routes>` API. Production needs `public/_redirects`
(`/*  /index.html  200`); `npm run dev` already emulates redirects via
`@netlify/vite-plugin`.

This is the **only new runtime dependency** in the entire pass. Fonts, icons,
logo, mascot, and motion are all zero-dependency.

### 2. Persistent user album cover - private Storage bucket, per-user + per-item folder

- New **private** bucket `collection-covers` (`public = false`, **3 MiB**,
  **`image/webp` only**). The bucket row is created by the migration with
  `on conflict (id) do update` (self-healing privacy/limits) and mirrored in
  `supabase/config.toml` for local `supabase start` / `db reset`.
- **Canonical object name:** `{user_id}/{collection_item_id}/cover.webp` -
  exactly one object per item. The browser converts any accepted jpeg / png /
  webp input to a downscaled **WebP** before upload; only `image/webp` is a
  valid stored object.
- `public.collection_items` gains `custom_cover_path text` (nullable) +
  `custom_cover_updated_at timestamptz` (nullable). A CHECK constrains a
  non-null `custom_cover_path` to **exactly** `user_id::text || '/' || id::text
  || '/cover.webp'` for that same row - an arbitrary Storage path, another
  user's prefix, or another item's id can never be persisted. Column-scoped
  `update (custom_cover_path, custom_cover_updated_at)` grant to `authenticated`;
  the Milestone 7 own-row UPDATE policy already governs the row.
- `storage.objects` RLS for role `authenticated`, bucket-scoped, four policies:
  - INSERT: `bucket_id` + exactly two folder segments + segment 1 =
    `auth.uid()` + filename = `cover.webp` + segment 2 is a `collection_item`
    **currently owned** by `auth.uid()`.
  - SELECT / UPDATE: the above **plus** `owner_id = auth.uid()::text` (and the
    item still owned).
  - DELETE: `bucket_id` + segment 1 = `auth.uid()` + `owner_id =
    auth.uid()::text` - deliberately **not** requiring the collection item to
    still exist, so an owner can clean up an orphan.
  - No `anon` access (RLS default-deny; storage.objects had no prior policies).
- Upload / replace / delete are **direct browser -> Storage** calls (RLS +
  bucket config enforce ownership, type, size); no Netlify function. Serving
  uses short-TTL `createSignedUrl` (gated by the SELECT policy), memory-cached.
  A signed URL is a bearer credential for its TTL: keep TTL ~1 h, never log it.
- The custom cover is **never** written to the shared `releases` row.
- Orphan objects after a collection-item delete are handled best-effort in the
  browser; a scheduled sweep is deferred.
- This is the one part of the pass that gets a **focused security review**
  (Phase 0), done before any UI wiring.

### 3. Provider artwork - Cover Art Archive, resolved at DISPLAY time, no persistence

**Correction (mandatory, human-directed): `releases.cover_url` and a
catalog-add Cover Art Archive lookup are rejected.** Artwork must be visible in
Discover and Scan **before** the candidate is added, so it cannot depend on an
add-time write.

- `public.releases` gains **no column**. No catalog-add provider lookup. No new
  `service_role` grant. No Cover Art Archive call anywhere in the backend.
- Cover Art Archive exposes **deterministic** front-image URLs keyed by the
  MusicBrainz IDs the app already stores (`provider_release_id`,
  `provider_release_group_id`):
  - `https://coverartarchive.org/release/{release_mbid}/front-{250|500|1200}`
  - `https://coverartarchive.org/release-group/{release_group_mbid}/front-{250|500|1200}`
- The future `AlbumArtwork` component builds these URLs client-side and renders
  `<img src loading="lazy" decoding="async">` directly (no `crossorigin`, so no
  CORS, no image-proxy function). Grid uses `front-250`, detail hero
  `front-500`/`front-1200`.
- **Source chain (four tiers), advance on `<img>` error, never loop:**
  1. custom signed cover (`collection_items.custom_cover_path`)
  2. Cover Art Archive **release** front image (`provider_release_id`)
  3. Cover Art Archive **release-group** front image (`provider_release_group_id`)
  4. branded Vinyl Intelligence CSS/SVG fallback (deterministic accent from the
     release id / artist+title hash)
- Works identically for MusicBrainz search results before Add, Scan candidates
  before confirmation, owned catalog records, Dashboard, Collection, Album
  detail, VIN recommendations, and History - because the MBIDs are already
  present on every catalog release (and search/scan candidates carry them in
  `CatalogCandidate`).
- **No Discogs.** No re-hosting of provider art in our Storage.

### 3a. VIN recommendation artwork - trust boundary

Future VIN recommendation artwork **must not** widen the Milestone 9 / 10 model
payload or send provider IDs to the model. The AI result already contains
`collectionItemId`; the visual layer resolves artwork locally through the future
`CollectionDataProvider` using that currently-owned `collectionItemId`. The
M9/M10 model and security contracts are unchanged.

## Consequences

- `+1` runtime dependency (`react-router-dom`, added in Phase A - not Phase 0);
  optionally `+1` dev (`vitest-axe`). No font / icon / motion / image
  dependency.
- One migration (`collection_items.custom_cover_path` +
  `custom_cover_updated_at` + canonical-path CHECK + column grant; the private
  `collection-covers` bucket; four `storage.objects` policies) and one
  `config.toml` storage-enable + bucket block - isolated as the Phase 0 gate
  with a focused security review. **`public.releases` is not touched.**
- Cover Art Archive is a **display-time** dependency only: the browser builds
  deterministic front-image URLs from stored MBIDs and hotlinks them as
  `<img>`. No backend call, no persistence, no add-time coupling - so artwork
  shows in Discover and Scan before Add.
- Deep links become refresh-safe (SPA fallback); initial bundle shrinks via
  route-level `React.lazy`.
- Storage introduces a cleanup discipline (orphan objects) - accepted as a
  documented minor limitation for now.
- The M9/M10 curator model/security contracts are unchanged; recommendation
  artwork is resolved locally from `collectionItemId`.

## Alternatives considered

- **No router / hand-rolled:** rejected - reinvents history, guards, and
  code-splitting; harder to test. `wouter` (~2 KB) is an acceptable smaller
  alternative if the human prefers minimal footprint.
- **Custom cover on `releases`:** rejected - would expose one user's photo as
  everyone's release image.
- **`releases.cover_url` + Cover Art Archive lookup at catalog-add time:**
  rejected (human-directed) - artwork must be visible in Discover and Scan
  before Add, which an add-time write cannot provide; it also added a
  `service_role` write and a backend provider call for no benefit over the
  deterministic client-side URL chain.
- **jpeg/png as stored custom-cover objects:** rejected - one canonical
  `cover.webp` per item keeps the path constraint, the Storage policy, and the
  cache story simple; the browser converts input to WebP before upload.
- **Custom cover upload via a Netlify function:** rejected for now - Storage RLS
  + bucket config already enforce ownership/type/size; a function adds cost and
  a moving part without benefit. Can be added later if server-side image
  processing is wanted.
- **Proxy Cover Art Archive image bytes through a function:** rejected -
  `<img>` hotlinking works (no CORS), archive.org caches well, and a proxy adds
  function cost. Reconsider only if CAA blocks hotlinking.
- **Discogs for artwork:** rejected - explicitly out of scope; MusicBrainz +
  Cover Art Archive already cover it.
- **Google Fonts CDN / `@fontsource`:** rejected in favour of self-hosted
  woff2 - no third-party runtime request, works offline in dev, no dependency.

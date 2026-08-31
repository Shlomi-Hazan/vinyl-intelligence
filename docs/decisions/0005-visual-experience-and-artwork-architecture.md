# 0005 Visual Experience & Artwork Architecture

Status: proposed (pending human approval - spec `docs/specs/0012-...` section 20,
decisions B, G, H).

Date: 2026-08-31

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

### 2. Persistent user album cover - private Storage bucket, per-user folder

- New **private** bucket `collection-covers` (`public = false`, 3 MiB limit,
  mime allow-list jpeg/png/webp). Object path `{user_id}/{collection_item_id}.{ext}`.
- `storage.objects` RLS for role `authenticated`: SELECT/INSERT/UPDATE/DELETE
  only when `bucket_id = 'collection-covers'` and
  `(storage.foldername(name))[1] = auth.uid()::text`. No `anon`. No cross-user
  access.
- `public.collection_items` gains `custom_cover_path text` (nullable, checked to
  the owner's folder) + `custom_cover_updated_at timestamptz`; column-scoped
  `update` grant to `authenticated` (own-row UPDATE RLS already exists).
- Upload is a **direct browser -> Storage** call (RLS + bucket config enforce
  ownership, type, size); no Netlify function. Serving uses short-TTL
  `createSignedUrl` from the authenticated browser client, memory-cached.
- The custom cover is **never** written to the shared `releases` row - one
  user's photo must not become the release image for everyone.
- Orphan objects after a collection-item delete are handled best-effort in the
  browser; a scheduled sweep is deferred.
- This is the one part of the pass that gets a **focused security review**
  (Phase 0), before any UI wiring.

### 3. Provider artwork - Cover Art Archive, resolved at add time, hotlinked

- `public.releases` gains `cover_url text`, constrained to catalog releases
  only (`cover_url is null or source = 'catalog'`), written only by
  `service_role`.
- At catalog-add time, `catalog-handlers.mts` does **one** Cover Art Archive
  lookup (release MBID, then release-group MBID) with a 5s timeout, no retry,
  content-type validated; on success it stores the `front-500` URL, on any
  failure it stores `null` and the add still succeeds.
- The browser renders `<img src={cover_url} loading="lazy">` **directly** from
  Cover Art Archive / archive.org (no `crossorigin`, so no CORS issue, no image
  proxy function). The component rewrites the size suffix (`front-250` for grid,
  `front-500`/`front-1200` for detail).
- Artwork precedence everywhere: **user custom cover > provider `cover_url` >
  branded deterministic CSS/SVG fallback**.
- **No Discogs.** No re-hosting of provider art in our Storage.

## Consequences

- `+1` runtime dependency (`react-router-dom`); optionally `+1` dev
  (`vitest-axe`). No font/icon/motion/image dependency.
- One migration (`collection_items.custom_cover_path` + `custom_cover_updated_at`,
  `releases.cover_url`, the `collection-covers` bucket + policies) and one
  `config.toml` storage-enable change - isolated as the Phase 0 gate with a
  focused security review.
- One new external dependency at runtime: Cover Art Archive (public, keyless),
  called server-side once per add and hotlinked as `<img>` thereafter.
- Deep links become refresh-safe (SPA fallback); initial bundle shrinks via
  route-level `React.lazy`.
- Storage introduces a cleanup discipline (orphan objects) - accepted as a
  documented minor limitation for now.

## Alternatives considered

- **No router / hand-rolled:** rejected - reinvents history, guards, and
  code-splitting; harder to test. `wouter` (~2 KB) is an acceptable smaller
  alternative if the human prefers minimal footprint.
- **Custom cover on `releases`:** rejected - would expose one user's photo as
  everyone's release image.
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

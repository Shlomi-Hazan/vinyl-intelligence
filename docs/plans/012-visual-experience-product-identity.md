# 012 Visual Experience & Product Identity Pass - Implementation Plan

Status: **APPROVED 2026-08-31** (spec section 20, decisions A-K); art-direction
addendum approved **2026-09-01** (see spec 0012). Mandatory provider-artwork
correction stands (no `releases.cover_url`, no catalog-add Cover Art Archive
lookup - artwork is a client-side display-time concern) plus the canonical
`cover.webp` custom-cover object.

Progress:

- **Phase 0** (custom-cover storage): **merged to `main` in PR #12** (merge
  commit `945ed3d20bf5e5e1d94d60e7d104a3351b19bc38`).
- **Phase A** (design system + routing + app shell + transitional page hosts +
  fallback `AlbumArtwork` + `CollectionDataProvider`): **implemented and locally
  verified on branch `claude/visual-experience-product-identity-ui`, not
  merged.** `react-router-dom` 7.18.3 added (the one runtime dependency). See
  `docs/verification.md` "Visual Phase A Evidence".
- **Phases B-E:** unstarted.

Date: 2026-08-31 (plan); 2026-09-01 (art-direction addendum)

Branch: `claude/visual-experience-product-identity`

Baseline (`main`): `bfddeb5109e61eac65b184ff4ff5d58092b3984f`

Spec: `docs/specs/0012-visual-experience-product-identity.md` (authoritative for
product/design intent, screen states, tokens, and acceptance criteria).

---

## 1. Affected components

### New (all under `src/`)

- `src/app/` - `AppShell`, `Sidebar`, `BottomNav`, `TopBar`, `PageHeader`,
  `RouteView`, `Container`, `router.tsx` (route table + guards),
  `CollectionDataProvider` (single post-auth collection + listening-events
  load).
- `src/ui/` - `Button`, `IconButton`, `Input`, `Textarea`, `Select`,
  `SearchInput`, `FilterBar`, `SegmentedControl`, `Badge`, `Chip`,
  `RatingControl`, `Dialog`, `ToastProvider`/`useToast`, `EmptyState`,
  `ErrorState`, `LoadingSkeleton` (+ `SkeletonAlbumCard`/`SkeletonRow`/
  `SkeletonStat`), `Icon`.
- `src/brand/` - `Logo`, `VINAvatar`, `VINThinking`.
- `src/media/` - `AlbumArtwork` (precedence resolver + branded fallback),
  `AlbumCard`, `AlbumRow`, `useSignedCoverUrl` (batched, cached),
  `fallbackCover.ts` (deterministic hue).
- `src/pages/` - `LandingPage`, `AuthPage`, `DashboardPage`, `CollectionPage`,
  `AlbumDetailPage`, `DiscoverPage`, `ScanPage`, `VinPage`, `HistoryPage`,
  `SettingsPage`, `NotFoundPage`.
- `src/lib/collection/customCover.ts` - upload / replace / remove +
  path helpers (browser Supabase client).
- `src/styles/` - `tokens.css`, `base.css`, `fonts.css`, component CSS
  (replaces `src/styles.css`).
- `public/fonts/*`, `public/_redirects`, favicon from `Logo`.

### Changed

- `src/main.tsx` - mount `<RouterProvider>` / `<BrowserRouter>` + `ToastProvider`
  + `CollectionDataProvider` under `AuthProvider`.
- `src/App.tsx` - reduced to route composition + auth-guard wiring (status
  branches move into `AppShell`).
- `src/auth/AuthForm.tsx` -> folded into `AuthPage` / `AuthCard` (same
  `signIn`/`signUp` props).
- `src/profile/ProfilePanel.tsx` -> `SettingsPage` (same handlers).
- `src/curator/*` - `CuratorPanel` / `CuratorRefinePanel` / `CuratorTranscript`
  / `CuratorRecommendationCard` restyled and hosted by `VinPage`; **client and
  contract code untouched**.
- `src/catalog/*` - `CatalogPanel`/`CatalogPhotoPanel` split into `DiscoverPage`
  / `ScanPage`; `CatalogCandidateCard` -> `AlbumCard`/candidate card with art.
- `src/collection/*` - `CollectionPanel` split into `CollectionPage` (grid+list)
  and `AlbumDetailPage`; `CollectionItemCard` -> `AlbumCard`/`AlbumRow`;
  `collectionQuery.ts` reused as-is + a grid/list view state + URL-query sync.
- `netlify/functions/_shared/catalog-handlers.mts` - **not changed** (the
  provider-artwork correction removes the planned catalog-add CAA lookup). New
  pure helper `src/media/coverArtUrl.ts` builds the deterministic CAA
  release / release-group front-image URLs from the MBIDs the client already
  has; consumed only by `AlbumArtwork`.
- `supabase/config.toml` - `[storage] enabled = true` +
  `[storage.buckets.collection-covers]` (done in Phase 0).
- `eslint`/`tsconfig` - add the new `src/*` dirs to project references if
  needed.

### Not changed

`src/lib/curator/*`, `src/lib/vision/*`, `netlify/functions/curator-*.mts`,
`netlify/functions/catalog-recognize.mts` logic, `netlify/functions/_shared/
curator-handlers.mts`, `recognition-handlers.mts`, `model-calls.mts`, every
existing migration, the M9/M10 request/response contracts, rate limits,
telemetry, and prompts.

## 2. Database implications

One migration (Phase 0 only): `supabase/migrations/20260903120000_add_custom_cover_storage.sql`
(implemented). `public.releases` is **not touched**.

- `alter table public.collection_items add column custom_cover_path text,
  add column custom_cover_updated_at timestamptz;` (both nullable).
- `check (custom_cover_path is null or custom_cover_path = user_id::text || '/'
  || id::text || '/cover.webp')` - the value, when set, must be exactly the
  canonical object name for that same row.
- `grant update (custom_cover_path, custom_cover_updated_at) on
  public.collection_items to authenticated;` (the Milestone 7 own-row UPDATE
  policy already governs the row; no new policy on this table).
- `insert into storage.buckets (...) values ('collection-covers', ..., false,
  3145728, array['image/webp']) on conflict (id) do update set public,
  file_size_limit, allowed_mime_types` - self-healing private bucket.
- Four `storage.objects` RLS policies for bucket `collection-covers`, role
  `authenticated`:
  - INSERT: bucket + exactly two folder segments + segment 1 = `auth.uid()` +
    filename `cover.webp` + segment 2 is a `collection_item` owned by
    `auth.uid()`.
  - SELECT / UPDATE: as INSERT plus `owner_id = auth.uid()::text` (UPDATE
    checks both USING and WITH CHECK).
  - DELETE: bucket + segment 1 = `auth.uid()` + `owner_id = auth.uid()::text`
    (no item-ownership requirement, for orphan cleanup).
- pgTAP: `supabase/tests/database/custom_cover_storage.test.sql` - column
  shape, canonical-path CHECK (7 cases), least-privilege grant, `releases` has
  no `cover_url`, `collection_items` still has exactly 4 policies, own-row
  behavioural, bucket config, four object policies, cross-user isolation
  (User B cannot select / insert / update / delete User A's object), tamper
  cases, orphan-delete path, anon denied.

No other phase touches the schema.

## 3. External API implications

- **Cover Art Archive** (`coverartarchive.org`): **no backend call**. The
  browser builds deterministic front-image URLs
  (`/release/{mbid}/front-{size}`, `/release-group/{mbid}/front-{size}`) from
  the MBIDs already present on catalog releases and `CatalogCandidate`s, and
  renders them as `<img src loading="lazy">`. `<img onError>` advances the
  four-tier source chain. No key, no `crossorigin`, no proxy, no persistence.
- **MusicBrainz**: unchanged; we only reuse the MBIDs already stored.
- **OpenRouter**: unchanged.
- No automated test performs a real call to any of these; `AlbumArtwork` tests
  assert URL construction + `onError` fall-through with stub images.

## 4. AI / model implications

None. No new model call, prompt, schema, or telemetry feature. The VIN mascot is
presentation only. `/vin` reuses the M9/M10 client functions verbatim.

## 5. Security / privacy implications

- New: a private per-user Storage bucket. Risk surface = the `storage.objects`
  RLS policies + the new `collection_items` column grant. Mitigation: strict
  folder-prefix policies, private bucket, no public listing, signed short-TTL
  URLs, server-enforced mime/size, pgTAP coverage, and **one focused security
  review in Phase 0**.
- `public.releases` is not changed at all - no `cover_url`, no new grant, no
  catalog-add write. Nothing can be injected onto the shared release row.
- Custom covers never touch `releases`; one user's photo is never another user's
  release image.
- Cover Art Archive URLs are public; hotlinking leaks no user data (the `<img>`
  request carries no auth). The `Referer` on the image request is the app
  origin - acceptable.
- No secret is added, logged, or exposed. No `.env.example` change (no backend
  CAA call).

## 6. Phase 0 - architecture gate (IMPLEMENTED)

Deliverables (done on this branch): migration
`20260903120000_add_custom_cover_storage.sql` (section 2), `config.toml`
storage enablement + bucket block, pgTAP
`custom_cover_storage.test.sql`, ADR `0005` accepted, spec/plan approved.
**No UI, no dependency, no `react-router-dom`.** Automated verification +
**one focused security review** of the Storage RLS. This phase is its own PR
and must merge before Phase C wires custom covers; Phases A-B do not depend on
it.

## 7. Phases A-E

### Phase A - design system + routing + shell (DONE - branch, not merged)

1. `react-router-dom` 7.18.3 added (decision B). `public/_redirects` SPA
   fallback. `BrowserRouter` in the app, `MemoryRouter` in tests. **Done.**
2. `src/styles/` token / base / fonts / shell / components layers loaded after
   the legacy `src/styles.css`. `src/styles.css` is **kept for now** (it styles
   the not-yet-rebuilt Collection / Catalog / Curator panels); `base.css` retints
   the ground to the warm/dark tokens and a `.legacy-host` wrapper class carries
   defensive overrides so those panels stay legible. `styles.css` is deleted in
   Phase C-D as each page is rebuilt. Self-hosted WOFF2 in `public/fonts/`
   (Fraunces / Inter / IBM Plex Mono, OFL, `public/fonts/README.md`). **Done.**
3. `src/ui/` primitives (`Button`, `IconButton`, `Field`, `Input`, `Textarea`,
   `Select`, `SearchInput`, `SegmentedControl`, `Badge`, `Chip`,
   `RatingControl`, `Container`), `Icon` (original inline sprite),
   `feedback.tsx` (`EmptyState` / `ErrorState` / `LoadingSkeleton` +
   `SkeletonStat` / `SkeletonAlbumCard` / `SkeletonRow`), `Dialog` (focus trap +
   Esc), `ToastProvider` / `useToast`. `src/brand/Logo` (Grooved V-I, 3
   variants) + `src/brand/VinAvatar` (static foundation - the 5-state system is
   Phase D). `src/media/AlbumArtwork` **fallback tier only** +
   `src/media/fallbackCover` (deterministic ramp accent). **Done.**
4. `src/app/` - `AppShell` (sidebar / collapsible rail / slim top bar / mobile
   bottom nav + "More" drawer, `aria-current`, skip link, route `aria-live`
   announce, focus-to-`h1` via `PageHeader`), `AppRoutes` (route table + auth
   guards), `CollectionDataProvider` (+ context + `useCollectionData`), `nav.ts`,
   `useClient`, `FullPageState`. `App.tsx` reduced to
   `AuthProvider > ToastProvider > BrowserRouter > AppRoutes`. **Done.**
5. Every M2-M10 feature mounted at its route via a transitional page host
   (`src/pages/*`): `/auth` -> `AuthForm`; `/settings` -> `ProfilePanel`;
   `/collection` -> `CollectionPanel` (refreshed by the provider's `version`
   instead of the removed `App`-level `collectionRefreshKey` prop-drill);
   `/collection/:id` -> `CollectionItemCard` for the owned item (real data
   only, not-found state for a bad id); `/discover` -> `CatalogPanel` with a new
   `showPhotoPanel={false}` prop; `/scan` -> `CatalogPhotoPanel` (a chosen query
   is stashed as the `/discover` search draft, then navigate); `/vin` ->
   `CuratorPanel` **unchanged**; `/history` -> a flat reverse-chron list from the
   provider; `/dashboard` -> structural quick-nav host, **no statistics**; `/` ->
   structural landing; `*` -> branded 404. **Done.**
6. Ported `src/App.test.tsx` and `src/auth/auth-state.test.tsx` to the router
   (new `src/test/renderApp.tsx` helper); added
   `src/app/AppRoutes.test.tsx`, `src/app/AppShell.test.tsx`,
   `src/app/CollectionDataProvider.test.tsx`, `src/media/AlbumArtwork.test.tsx`,
   `src/media/fallbackCover.test.ts`. Every M9/M10 curator suite is byte
   unchanged. **Done.**

Exit met: `typecheck` / `lint` / `test:run` (initial 35 files / 424; after the
correction below 36 / 431) / `build` green; `supabase test db` 9 / 433; every
route reachable; every M2-M10 feature usable; M9/M10 contract tests unchanged.
The one code review is still reserved for the end of Phase E.

**Phase A correction (2026-09-02, before Phase B).** An independent GitHub audit
found two MEDIUM findings in the `CollectionDataProvider` integration - the
initial implementation was **not** actually the single post-auth source
(`CollectionPanel` still self-loaded and held a competing snapshot), and a
`Promise.all` partial-load failure could render "not in your collection" for a
data-load error. Both **fixed on this branch before Phase B**: `CollectionPanel`
gained a controlled mode (provider-owned data + `onMutated` -> one authoritative
`invalidate()`; uncontrolled mode unchanged for its own tests); the provider now
loads collection and listening events in two independent effects with separate
phases and separate errors; `AlbumDetailPage` / `HistoryPage` distinguish
loading / collection-error / genuine-not-found / events-error. +1 regression
test file (`src/app/collection-data-integration.test.tsx`, cases A-G). Full
detail in `docs/verification.md` "Phase A correction". The transitional
double-load in the first implementation was a mistake, not an intended design -
this plan is not being rewritten to suggest otherwise.

**Known Phase A deferrals (LOW / documented):** the client JS bundle is
~523 KB (149 KB gz) with `react-router-dom`; route-level `React.lazy`
code-splitting is a Phase B/E task per this plan (Phase E: "route-level code
splitting finalised + bundle budget check"). `src/styles.css` still present
(retired page-by-page in C-D). `/history` and `/collection/:id` are transitional
hosts (full designs in Phase D).

### Phase B - landing + auth + dashboard (DONE - branch, not merged)

Delivered on `claude/visual-experience-product-identity-ui`:

- **`LandingPage`** - cinematic public page: sticky brand header, hero with the
  approved eyebrow/headline/CTAs + `HeroVinyl` (original CSS/SVG turntable
  composition, slow rotation, reduced-motion static, `aria-hidden`), "See how it
  works" smooth in-page scroll, five sections (Your collection alive / Ask VIN /
  Scan / Rediscover) with original branded fallback visuals only, final CTA
  band. No copyrighted artwork / stock photo / external image.
- **`AuthPage` + `AuthCard`** - split brand panel / focused card at `>= md`,
  compact strip at `< md`; accessible two-mode `role="tablist"` switch; one
  `<h1>`; labelled fields; accessible client validation + verbatim Supabase
  notice/error. **Supabase auth semantics unchanged** (same `signIn` / `signUp`;
  session / email-confirmation / profile authority / `profile_missing` /
  authenticated-`/auth` redirect all untouched).
- **`DashboardPage`** - all values from `CollectionDataProvider`, no API/model
  call. Four real stats (definitions in `docs/verification.md` +
  `insights.test.ts`), `SkeletonStat` while loading, empty-collection
  onboarding (no zero-heavy analytics), Quick VIN (transient router-state
  prefill -> `/vin`, no model call, no persistence), quick actions, Recently
  added / Recently played / Rediscover rails (`AlbumArtwork` fallback,
  `/collection/:id` links, honest empty states), "Your collection at a glance"
  pure CSS/SVG decade bars + genre chips (no chart dependency; insufficient-data
  state), events-only failure does not hide the stats.
- **`CuratorPanel`** gained one optional additive `initialRequest?: string`
  (client-only textarea seed for Quick VIN; no submit, no model call; M9/M10
  contracts unchanged; `src/lib/curator/*` untouched).
- **Route-level code splitting** - every page `React.lazy` behind one
  `<Suspense>` with a branded fallback; simple `BrowserRouter` API, no data
  router, no code-splitting library. Entry chunk 522.95 kB -> 455.13 kB
  (149.49 -> 131.77 kB gz) + per-route chunks; a landing visit no longer
  downloads the authenticated pages. (`supabase-js` still in the entry chunk via
  `AuthProvider` - Phase E bundle-budget task.)
- `src/lib/dashboard/insights.ts` (pure, `now`-injected, unit-tested);
  superseded Phase A structural landing/auth CSS removed; new `pages.css`.

Exit met (initial): `typecheck` / `lint` / `test:run` (40 files / 465) /
`build` green; `supabase test db` 9 / 433 unchanged.

**Phase B correction (2026-09-02, before Phase C).** An independent audit found
two MEDIUM functional findings and a human visual review found the visual
implementation short of the approved identity. All addressed on this branch:
(A) `/auth` now returns the user to the intended internal route after login via
an allow-listed `safeInternalPath` (no open redirect); (B) the dashboard never
computes listening analytics from `events === []` during loading/failure -
`insights.ts` split into `collectionStats` / `listeningStats`, and every
event-derived value (Played-30d, Never-played, Recently-played, Rediscover) is
gated on `eventsStatus === 'ready'` with skeleton / `--` + Retry otherwise;
(C) the unsupported "Free to start." landing copy removed; (D-M) a systemic
visual pass - stronger responsive type scale + contrast + tactile grooved
surfaces (tokens), larger buttons/inputs/nav/shell, a redesigned unmistakable
V-I `Logo`, a first-class `VinAvatar` (grooved head, headphones, chest EQ, an
`idle`/`thinking` state) + `EmptyCrate`, scroll-reveal + scroll cue + slow
record rotation + Vinny thinking motion (all `prefers-reduced-motion`-safe), a
richer landing hero + section demos, a scaled-up split auth, a branded
dashboard/collection empty state (crate + Vinny; collection-first with manual
CRUD behind an "Add a record manually" disclosure - no field removed), and a
focused two-area Ask VIN composition with a 132px Vinny + real collection
context + a live curator-state line (`CuratorPanel` gained one optional
`onStatusChange` UI-only signal; no M9/M10 contract change). +4 test files
(`routing`, `intended-route`, strengthened dashboard event-gating,
insights split). 42 files / 472 tests. `supabase db reset` was **not** run per
instruction. Full detail: `docs/verification.md` "Phase B correction".

**Final Phase B visual acceptance (2026-09-02, before Phase C).** A pass against
a human visual checklist, still on this branch. The V-I mark was re-cut so the
**V** and **I** are two clearly separated letters (shared `ViGlyph`, reused by
header / sidebar / auth / `HeroVinyl` label / final CTA / `favicon.svg`); the
"How it works" link, hero button and scroll cue now all land on Section 01 (a
dedicated pre-Section-01 anchor with sticky-bar `scroll-margin-top`, deferred
`preventScroll` focus, Section 01 not reveal-gated, on-mount hash handler); the
scroll cue is a downward chevron; Section 03 is a new `ScanDemo` (vertical
photo -> clues -> candidates -> confirm progression) and Section 04 a new
`RediscoverDemo` (a sleeve pulled forward out of a record crate, four truthful
chips); `VinAvatar` was rebuilt with better head/body proportions and depth
(rim-light/core-shadow, padded headphones, EQ, copper hardware); the app-shell
top-clipping was fixed with a quiet breadcrumb + `preventScroll` h1 focus +
`scroll-margin-top`; the sidebar collapse control is now a borderless 26px
utility; the topbar no longer repeats the page name; the Ask VIN aside follows
the main column on narrow screens. Real screenshots were captured with
`puppeteer-core` + system Chrome at 1440x900 / 1280x800 / 1024x768 / 390x844
and visually reviewed. 42 files / **474 tests** (+2 landing regressions).
`supabase db reset` **not** run. Full detail: `docs/verification.md` "Final
Phase B visual acceptance".

**Final Phase B asset + micro-polish patch (2026-09-02, before Phase C).** Three
closing items, still on this branch. (1) Vinny is now the five approved
3D-rendered image assets (`public/vinny/*.png`, transparent, static, not
bundled) behind one `Vinny` component with an `idle|thinking|success|no-match|
empty` state map; the hand-drawn `VinAvatar` and the now-redundant `EmptyCrate`
are deleted; `CuratorPanel.onStatusChange` emits a semantic `CuratorUiState` so
Ask VIN shows the right Vinny. (2) The V·I glyph is light bronze via one new
`--vi-glyph: #d08b48` token inherited everywhere (geometry unchanged). (3) The
sidebar collapse toggle is now exactly 26x26 with the icon centred in both
states - it had been inheriting `.legacy-host button` padding + `min-height`.
43 files / **485 tests**. `supabase db reset` not run. Full detail:
`docs/verification.md` "Phase B final asset + micro-polish".

**Known deferrals (LOW):** `supabase-js` in the entry chunk;
`src/styles.css` still present for the C-D hosts; the landing demo SVGs remain
original project-owned schematic illustrations; the `thinking`/`success`/
`no-match` Vinny assets are verified as images + unit-tested state mapping but
not via a live curator run; human pixel-level design sign-off still pending;
exhaustive responsive/motion passes are Phase E.

### Phase C - artwork infrastructure + collection / discover / scan

1. `src/media/coverArtUrl.ts` - pure builder for the deterministic CAA
   release / release-group front-image URLs from `provider_release_id` /
   `provider_release_group_id` (already on catalog releases and
   `CatalogCandidate`). No backend change.
2. `AlbumArtwork` full four-tier chain (custom signed URL > CAA release > CAA
   release-group > branded fallback), `<img onError>` advancing one tier
   without looping; `useSignedCoverUrl` batching + cache for tier 1.
3. `src/lib/collection/customCover.ts` (WebP conversion + downscale + upload /
   replace / remove) + the "Replace / remove cover" dialog on `AlbumDetailPage`.
4. `CollectionPage` grid + compact list + `FilterBar` + URL-query sync + view
   persistence; `DiscoverPage` visual results + owned-state + manual fallback;
   `ScanPage` visual candidates.

Exit: artwork four-tier + `onError` fall-through tests; custom-cover lifecycle
tests; discover/scan state tests; Storage pgTAP green; **no real CAA call in
tests**.

**Phase C implemented (2026-09-02, on-branch, not merged).** `AlbumArtwork` now
owns the four-tier chain (`media/coverArtUrl.ts` + `media/signedCover.ts` +
rewritten `AlbumArtwork.tsx`); `lib/collection/customCover.ts` +
`CustomCoverControl` on `AlbumDetailPage`. `CollectionBrowser` = cover-first
grid / compact list + URL-synced toolbar over the unchanged `collectionQuery.ts`
+ favourite/log-listen quick actions + a filtered-empty state distinct from the
empty collection. `DiscoverPanel` / `ScanPanel` wrap the unchanged
`searchCatalog` / `addCatalogReleaseToCollection` / `recognizeCover` logic with
polished visual result cards, an owned-state, honest error vs no-result states,
a four-step scan rail with distinct analysing/searching phases, and
confirmation-before-save. No migration / schema / RLS change. 50 files /
**531 tests**. Full detail: `docs/verification.md` "Phase C - Collection /
Discover / Scan / Artwork".

**Phase C final correction (2026-09-02, on-branch, not merged).** 12 audit +
human-review fixes, still Phase C: listening-derived UI now branches on
`eventsStatus` so a loading/failed listening load never becomes fabricated
"Never played"; the Scan provider-error retry re-runs only `searchCatalog`
(no second Vision call); Collection quick actions use the toast system for
success/failure (no silent catch, no optimistic lie); the collapsed-sidebar
user control is a centred contained avatar; the manual-add form is a contained
warm panel; Discover gains a "New search" reset + restored result-page spacing;
Scan gains real drag-and-drop (shared validation) + replace/remove; album-card
overlay actions are exactly 30x30 with centred glyphs; the set favourite is a
filled bronze heart. Dashboard `AlbumMini` artwork wired to MBIDs for
consistency. **History redesign + listening-event edit/delete are deferred to
Phase D** (they change the Milestone 8 append/read-only listening-events
contract). 51 files / **553 tests**. Full detail: `docs/verification.md`
"Phase C - final correction + human-acceptance patch".

**Phase C final global shell micro-correction (2026-09-02, on-branch, not
merged).** One shared-shell blocker: the AppShell top bar shrank vertically
(measured 64 -> 37px) on any route whose content overflowed the viewport,
because `.vi-topbar` had `flex-shrink: 1` inside the fixed-height `.vi-main`
scroll column. Fixed in `shell.css` only: `.vi-topbar { flex: 0 0
var(--topbar-h); min-height: var(--topbar-h) }` + `.vi-main > main { flex: 1 0
auto }` + `.vi-main { min-height: 0 }`. Puppeteer-measured `.vi-topbar` height
= **64 in all 7 authenticated routes x 4 viewports x {short, tall,
scrolled}**; all top-bar children vertically centred; no horizontal overflow;
mobile unchanged. Plus 3 new `DashboardPage` regression tests locking the
canonical artwork inputs (MBIDs + custom-cover path) in the dashboard rails.
51 files / **556 tests**. Full detail: `docs/verification.md` "Phase C - final
global shell micro-correction".

### Phase D - VIN + history + settings + album detail

`VinPage` redesign + `VINAvatar` (5 states) + `VINThinking`; `HistoryPage`
(day-grouped, thumbnails); `SettingsPage`; `AlbumDetailPage` (hero + personal +
listening + cover + edit/remove). M9/M10 curator code unchanged.

Exit: existing curator suites unchanged and green; mascot state tests;
history grouping tests; detail not-found state.

**Phase D implemented (2026-09-02, on-branch, not merged) - history + album
detail + settings + profile avatar.** VIN / Ask VIN / Vinny were finished in
Phase B and are explicitly untouched here (no M9/M10 curator prompt, contract,
or OpenRouter change).

- **DB (3 forward migrations, applied locally via `supabase migration up`, not
  `db reset`, not applied to hosted):**
  - `20260904120000_allow_listening_event_management.sql` - M8 shipped
    `listening_events` append-only; Phase D product review approved letting a
    collector fix a wrong play time and delete an accidental play *of their own*.
    Minimum change: column-scoped `UPDATE (listened_at)` grant + `DELETE` grant +
    own-row RLS for UPDATE and DELETE; anon gets neither; id / user_id /
    collection_item_id / created_at stay immutable to the browser.
  - `20260904121000_add_personal_genres.sql` - fixes finding 8D-2. Catalog
    releases are `source='catalog'` / `created_by=NULL` and read-only to the
    browser, so the generic edit form could never save a genre onto them.
    Rather than weaken `releases` RLS, add `collection_items.personal_genres
    text[]` (owner-scoped, CHECK reuses `public.release_genres_valid`). Effective
    genres = union of `release.genres` + `personal_genres`, computed client-side,
    neither source mutated.
  - `20260904122000_add_profile_avatar_storage.sql` - human-approved optional
    avatar. `profiles.avatar_path` / `avatar_updated_at` (nullable, canonical
    `{userId}/avatar.webp` CHECK, column-scoped grant), `updated_at` trigger
    recreated to also fire on an avatar change, private `profile-avatars` bucket
    (webp only, 1 MiB), four owner-isolated `storage.objects` policies modelled
    on the custom-cover architecture. `config.toml` mirrors the bucket for local
    dev.
- **History** rebuilt as a day-grouped listening journal (browser-local Today /
  Yesterday / full date, newest first), real `AlbumArtwork` thumbnails, each row
  linking to `/collection/:id`, edit-play-time (native `datetime-local`, local
  <-> ISO, only `listened_at` written) and delete-play, both through the Dialog
  primitive with a truthful destructive confirmation. Loading is never an empty
  state; collection and listening errors stay independent with their own Retry.
- **Album Detail** rebuilt as the definitive record page: album-focused hero
  (large canonical artwork, artist, title, only real catalog metadata), personal
  state (filled-heart favourite, star rating, notes), truthful listening section
  with recent plays, custom-cover management, "Remove from collection" via a
  Dialog with wording distinct from deleting a listen. Catalog metadata is
  READ-ONLY (manual releases keep the edit form; catalog releases show an
  explanation instead of a form RLS would reject); owners manage their own
  genres via `personal_genres`. `legacy-host` retired on this page.
- **Settings** rebuilt to two honest sections - PROFILE (photo, display name,
  read-only account email) and ACCOUNT (sign out). No invented settings, no
  password / email-change flows. `legacy-host` retired; the unused `ProfilePanel`
  removed.
- **Profile avatar** - one canonical WebP per user, client-side centre-crop +
  resize (no external service), direct browser Storage calls governed by RLS +
  bucket config. The signed URL is treated as a bearer credential: memory-only
  cache with early re-sign, never written to the profile row, `localStorage`,
  `sessionStorage`, a log, telemetry, or an error message. **Initials are the
  default AND the fallback** in every state (no photo, URL still resolving,
  signing failed, `<img>` errored) - a broken-image glyph is never shown. One
  shared `UserAvatar` component owns photo + initials + circle geometry + failed-
  image fallback, used in the AppShell topbar, the sidebar account control
  (expanded + collapsed rail), and the Settings preview. `AuthProvider.refresh
  Profile()` propagates a profile mutation to every avatar without a reload.

Verification: `typecheck`, `lint` (0 warnings), `test:run` (**60 files /
619 tests**), `build`, `supabase test db` (**10 files / 507 assertions**,
including the new `profile_avatar_storage.test.sql` and extended
`listening_events` / `collection_item_signals` / `catalog_releases_rls`
suites - no local QA data deleted), `supabase db lint`, `npm audit --omit=dev`
(0). Full detail: `docs/verification.md` "Phase D".

VIN personal-genres integration is intentionally **deferred** - it would touch
the `curator-handlers.mts` Netlify function / M9-M10 candidate contract, and
section 8D-2.F permits deferral rather than accept that risk in this pass.

### Phase E - motion + responsive + accessibility + performance + final review

Motion vocabulary (spec section 10) applied consistently; `prefers-reduced-
motion` branches; responsive pass across all breakpoints; accessibility audit
(landmarks, focus order, contrast re-verification, alt text, colour-only
checks); route-level code splitting finalised + bundle budget check; one focused
code review; page-by-page human visual inspection (desktop/tablet/mobile);
final browser smoke of every critical flow.

Exit: spec section 19 acceptance criteria all met.

## 8. Testing plan

- **Framework:** existing Vitest + Testing Library + jsdom. Optionally add
  `vitest-axe` (devDependency) for automated role/label/contrast-ish assertions
  - recommend yes; otherwise hand-assert. No other test dependency.
- **Router/guards:** unauthed `/dashboard` -> `/auth`; authed `/auth` ->
  `/dashboard`; `*` -> 404; `MemoryRouter` deep-link to `/collection/:id`
  renders detail; nav `aria-current`; bottom nav under a narrow `matchMedia`
  mock; drawer focus trap.
- **Feature preservation:** each ported suite runs against its new page host and
  asserts the same client calls/args. `src/curator/*` and
  `netlify/functions/curator-functions.test.ts` suites are **unchanged**.
- **`AlbumArtwork`:** the four-tier chain; `onError` fall-through (no loop);
  deterministic fallback hue; `loading="lazy"`; alt text.
- **`coverArtUrl.ts`:** builds the right `/release/{mbid}/front-{size}` and
  `/release-group/{mbid}/front-{size}` URLs; null MBIDs skip that tier.
- **Custom cover:** client WebP-conversion + downscale; validation reject
  (type/size); success path updates the column via a mocked Supabase client;
  replace; remove (+ best-effort `remove` called); precedence flips.
- **Discover/scan:** artwork + skeleton + empty/no-match/error/owned states.
- **Collection:** grid<->list toggle + persistence; `applyCollectionQuery`
  parity; URL query round-trip; both empty states.
- **VIN:** M9/M10 suites unchanged; `VINAvatar` per-state render; reduced-motion.
- **History:** Today/Yesterday/Earlier bucketing from fixed timestamps.
- **A11y basics:** each page has one `h1`; interactive elements have accessible
  names; focus lands on `h1` after navigation; skeleton `aria-hidden`.
- **DB:** `supabase test db` incl. the new `custom_cover_storage.test.sql`;
  `supabase db lint`.
- **No real OpenRouter / MusicBrainz / Cover Art Archive calls anywhere in the
  automated suite.**

Expected baselines after the pass: Vitest file/test counts grow substantially
(new component + page + media suites); pgTAP grows by one file. Exact numbers
recorded in `docs/verification.md` when the work runs.

## 9. Review plan

| Scope | Review |
| --- | --- |
| Phase 0 Storage RLS + column grant + canonical-path CHECK | **one focused security review** |
| Phases A-E code | **one focused code review** at the end (no per-phase loops) |
| Every phase | automated checks: `typecheck`, `lint`, `test:run`, `build`, `supabase test db`, `supabase db lint`, `npm audit --omit=dev` |
| Phases B-E | page-by-page human visual inspection (desktop + tablet + mobile) |
| End | final browser smoke of every critical flow incl. deep-link refresh + reduced-motion |

No `/ultrareview`. No repeated security review beyond Phase 0. Deadline mode:
fix BLOCKER + meaningful MEDIUM; record/defer LOW/NOTE.

## 10. Dependency recommendation

| Dependency | Kind | Verdict | Reason |
| --- | --- | --- | --- |
| `react-router-dom` (v7) | runtime | **add** (decision B) | 10 real routes, guards, deep links, code-splitting; no routing system exists |
| `vitest-axe` | dev | optional, recommend add | automated a11y assertions for the redesign |
| fonts (`@fontsource/*`) | dev | **do not add** | self-host woff2 in `public/fonts/` instead - no dep, no third-party request |
| icon library | - | **do not add** | vendor ~20 static SVG paths (Lucide is ISC) |
| motion library (`framer-motion` etc.) | - | **do not add** | CSS keyframes + optional native View Transitions cover the spec |
| image/CDN library | - | **do not add** | `<img>` + CAA sizes + Supabase signed URLs |

Net: **+1 runtime (`react-router-dom`)**, optionally **+1 dev (`vitest-axe`)**.

## 11. Phasing / PR shape (decision K - APPROVED)

**Phase 0 is its own PR** (`Visual experience Phase 0: custom cover storage`,
base `main`), because it carries the migration + Storage RLS + focused security
review. After it merges, **Phases A-E land on one follow-up visual branch / PR
with coherent staged commits** - not five separate PRs.

Each phase leaves the app in a working, deployable-if-needed state; no phase
starts by destabilising an unfinished earlier one.

## 12. Risks

- **Scope size.** Mitigation: strict phase exits, the feature->page mapping as a
  checklist, one review at the end.
- **Silent feature loss during the split.** Mitigation: port every existing test
  suite first (Phase A exit gate) before restyling.
- **Storage RLS mistake.** Mitigation: isolated Phase 0 + pgTAP + focused
  security review before any UI wiring.
- **Bundle regression.** Mitigation: route-level `React.lazy` + a bundle-size
  check in Phase E.
- **Cover Art Archive 404 / slow image.** Mitigation: it is only ever an
  `<img src>` the browser is about to display; `onError` advances to the next
  tier (release-group, then branded fallback). No backend call, no add-time
  coupling.
- **Local/hosted bucket drift.** Mitigation: the migration `insert ... on
  conflict (id) do update` re-enforces private + 3 MiB + webp-only on every
  apply; `config.toml` mirrors it for local dev.
- **Font/asset licensing.** Mitigation: OFL fonts only, bundled woff2 + a
  `LICENSES` note; original logo/mascot/icons; no copyrighted album art
  committed.

## 13. Out of scope / deferred

Orphan-cover sweep function; light theme; Discogs; shelf scanning; any M9/M10
contract change for cosmetics; production deployment (Milestone 11 - still after
this pass).

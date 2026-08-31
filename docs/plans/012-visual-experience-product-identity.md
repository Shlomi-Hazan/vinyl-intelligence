# 012 Visual Experience & Product Identity Pass - Implementation Plan

Status: DRAFT - awaiting human design approval (spec section 20, decisions A-K).
No implementation, migration, dependency, or asset until approved. This turn
produced only this plan, the spec (`docs/specs/0012-...`), the proposed ADR
(`docs/decisions/0005-...`), and lightweight status updates.

Date: 2026-08-31

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
- `netlify/functions/_shared/catalog-handlers.mts` - after
  `upsertCatalogRelease`, one Cover Art Archive lookup -> `releases.cover_url`
  (`service_role` UPDATE). New helper `src/lib/catalog/coverArt.ts` (pure,
  testable, `fetch`-injected).
- `supabase/config.toml` - `[storage] enabled = true` + `collection-covers`
  bucket block.
- `eslint`/`tsconfig` - add the new `src/*` dirs to project references if
  needed.

### Not changed

`src/lib/curator/*`, `src/lib/vision/*`, `netlify/functions/curator-*.mts`,
`netlify/functions/catalog-recognize.mts` logic, `netlify/functions/_shared/
curator-handlers.mts`, `recognition-handlers.mts`, `model-calls.mts`, every
existing migration, the M9/M10 request/response contracts, rate limits,
telemetry, and prompts.

## 2. Database implications

One migration (Phase 0 only), file `supabase/migrations/<ts>_add_artwork_storage.sql`:

- `alter table public.collection_items add column custom_cover_path text`,
  `add column custom_cover_updated_at timestamptz`;
  `check (custom_cover_path is null or (custom_cover_path ~
  ('^' || user_id::text || '/[0-9a-f-]{36}\.(jpe?g|png|webp)$')))`.
- `grant update (custom_cover_path, custom_cover_updated_at) on
  public.collection_items to authenticated;` (own-row UPDATE RLS already exists).
- `alter table public.releases add column cover_url text`,
  `add constraint releases_cover_url_catalog_only check (cover_url is null or
  source = 'catalog')`. No new `authenticated` grant (`service_role` table
  UPDATE already covers catalog writes).
- Create the `collection-covers` storage bucket + `storage.objects` RLS
  policies (SELECT/INSERT/UPDATE/DELETE for `authenticated` scoped to
  `bucket_id = 'collection-covers' and (storage.foldername(name))[1] =
  auth.uid()::text`). Bucket `public = false`, size 3 MiB, mime allow-list
  jpeg/png/webp.
- pgTAP: `supabase/tests/database/artwork_storage.test.sql` - column grant,
  own-row policy still scoping the new columns, `cover_url` constraint,
  `collection-covers` object policies (a user reaches only their own folder).

No other phase touches the schema.

## 3. External API implications

- **Cover Art Archive** (`coverartarchive.org`): one server-side `fetch` per
  catalog add (release MBID, release-group fallback), 5s timeout, no retry,
  redirects followed, `Content-Type: image/*` validated, descriptive
  `User-Agent`. Result URL persisted to `releases.cover_url` or `null`.
  Behind `src/lib/catalog/coverArt.ts` (service boundary, `fetch` injected for
  tests). No key. Not called from the browser except as an `<img src>`.
- **MusicBrainz**: unchanged; we only reuse the MBIDs already stored.
- **OpenRouter**: unchanged.
- No automated test performs a real call to any of these.

## 4. AI / model implications

None. No new model call, prompt, schema, or telemetry feature. The VIN mascot is
presentation only. `/vin` reuses the M9/M10 client functions verbatim.

## 5. Security / privacy implications

- New: a private per-user Storage bucket. Risk surface = the `storage.objects`
  RLS policies + the new `collection_items` column grant. Mitigation: strict
  folder-prefix policies, private bucket, no public listing, signed short-TTL
  URLs, server-enforced mime/size, pgTAP coverage, and **one focused security
  review in Phase 0**.
- `releases.cover_url` is catalog-only (constraint) and `service_role`-written;
  a manual release cannot carry a URL, so no user can inject a URL onto a shared
  row.
- Custom covers never touch `releases`; one user's photo is never another user's
  release image.
- Cover Art Archive URLs are public; hotlinking leaks no user data (the `<img>`
  request carries no auth). The `Referer` on the image request is the app
  origin - acceptable.
- No secret is added, logged, or exposed. `.env.example` gains only
  `COVER_ART_ARCHIVE_USER_AGENT` (or reuse `MUSICBRAINZ_USER_AGENT`) - names
  only.

## 6. Phase 0 - architecture gate (requires approval + focused security review)

Deliverables: the one migration (section 2), `config.toml` storage enablement,
`.env.example` name addition, pgTAP, ADR `0005` moved to accepted. No UI, no
dependency. Automated verification + **one focused security review** of the
Storage RLS. This phase merges (or lands as the first staged commit) before
Phase C can wire custom covers, but Phases A-B do not depend on it.

## 7. Phases A-E

### Phase A - design system + routing + shell

1. `react-router-dom` added (decision B). `public/_redirects` SPA fallback.
2. `src/styles/` token/base/font layers; `public/fonts/` woff2; delete
   `src/styles.css` after every consumer is migrated.
3. `src/ui/` primitives + `Icon` sprite + `src/brand/Logo` + `AlbumArtwork`
   (fallback tier only for now) + skeleton/empty/error components.
4. `src/app/` `AppShell` + `Sidebar` + `BottomNav` + `TopBar` + `RouteView` +
   route table + auth guards + `CollectionDataProvider`.
5. Every existing feature mounted at its new route (spec section 15), visually
   rough but functional. `App.tsx` reduced to composition.
6. Port every existing Vitest suite to its new host; keep all green. Router /
   guard / nav tests added.

Exit: `npm run typecheck|lint|test:run|build` green; every route reachable;
every M2-M10 feature usable; M9/M10 contract tests unchanged.

### Phase B - landing + auth + dashboard

`LandingPage` (hero + 5 sections + motion), `AuthPage`/`AuthCard` redesign,
`DashboardPage` (stats + quick actions + recent activity + quick-VIN + optional
insight; empty-collection state). All dashboard data from
`CollectionDataProvider`. Route-level `React.lazy` for landing/auth so they do
not pull the app bundle.

Exit: the three screens match the spec's state matrix; lighthouse-style manual
check of the landing bundle size.

### Phase C - artwork infrastructure + collection / discover / scan

1. Cover Art Archive resolution in `catalog-handlers.mts` +
   `src/lib/catalog/coverArt.ts` + `releases.cover_url` wired into
   `CatalogCollectionItem` / catalog types.
2. `AlbumArtwork` full precedence (custom signed URL > `cover_url` > fallback);
   `useSignedCoverUrl` batching + cache.
3. `src/lib/collection/customCover.ts` + the "Replace / remove cover" dialog on
   `AlbumDetailPage`.
4. `CollectionPage` grid + compact list + `FilterBar` + URL-query sync + view
   persistence; `DiscoverPage` visual results + owned-state + manual fallback;
   `ScanPage` visual candidates.

Exit: artwork precedence tests; custom-cover lifecycle tests; discover/scan
state tests; Storage pgTAP green; **no real CAA call in tests**.

### Phase D - VIN + history + settings + album detail

`VinPage` redesign + `VINAvatar` (5 states) + `VINThinking`; `HistoryPage`
(day-grouped, thumbnails); `SettingsPage`; `AlbumDetailPage` (hero + personal +
listening + cover + edit/remove). M9/M10 curator code unchanged.

Exit: existing curator suites unchanged and green; mascot state tests;
history grouping tests; detail not-found state.

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
- **`AlbumArtwork`:** the 4 precedence cases; `onError` fall-through (no loop);
  deterministic fallback hue; `loading="lazy"`; alt text.
- **Custom cover:** client validation reject (type/size); success path updates
  the column via a mocked Supabase client; replace; remove (+ best-effort
  `remove` called); precedence flips.
- **Cover Art Archive helper:** mocked `fetch` - hit, miss (404 -> null),
  timeout -> null, wrong content-type -> null, release-group fallback.
- **Discover/scan:** artwork + skeleton + empty/no-match/error/owned states.
- **Collection:** grid<->list toggle + persistence; `applyCollectionQuery`
  parity; URL query round-trip; both empty states.
- **VIN:** M9/M10 suites unchanged; `VINAvatar` per-state render; reduced-motion.
- **History:** Today/Yesterday/Earlier bucketing from fixed timestamps.
- **A11y basics:** each page has one `h1`; interactive elements have accessible
  names; focus lands on `h1` after navigation; skeleton `aria-hidden`.
- **DB:** `supabase test db` incl. the new `artwork_storage.test.sql`;
  `supabase db lint`.
- **No real OpenRouter / MusicBrainz / Cover Art Archive calls anywhere in the
  automated suite.**

Expected baselines after the pass: Vitest file/test counts grow substantially
(new component + page + media suites); pgTAP grows by one file. Exact numbers
recorded in `docs/verification.md` when the work runs.

## 9. Review plan

| Scope | Review |
| --- | --- |
| Phase 0 Storage RLS + column grant + `cover_url` constraint | **one focused security review** |
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

## 11. Phasing / PR shape (decision K)

Recommended: a single long-lived branch `claude/visual-experience-product-
identity` with **Phase 0 landing first** (its own PR, because it carries the
migration + security review), then **Phases A-E as staged commits on one
follow-up PR** (or two: A-C, then D-E) to avoid dozens of micro-PRs while
keeping the diff reviewable. The human confirms the exact cut in decision K.

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
- **Cover Art Archive latency on add.** Mitigation: 5s timeout, no retry,
  failure => `null` and the add still succeeds.
- **Font/asset licensing.** Mitigation: OFL fonts only, bundled woff2 + a
  `LICENSES` note; original logo/mascot/icons; no copyrighted album art
  committed.

## 13. Out of scope / deferred

Orphan-cover sweep function; light theme; Discogs; shelf scanning; any M9/M10
contract change for cosmetics; production deployment (Milestone 11 - still after
this pass).

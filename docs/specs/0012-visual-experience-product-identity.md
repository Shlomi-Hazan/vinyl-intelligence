# 0012 Visual Experience & Product Identity Pass - Design / Product / Architecture Specification

Status: **HUMAN-APPROVED** 2026-08-31 (decisions A-K in section 20), with the
mandatory architecture corrections recorded inline: provider artwork is
resolved at **display time** from stored MusicBrainz IDs (no `releases.cover_url`,
no catalog-add Cover Art Archive lookup); custom covers are one canonical
`cover.webp` per item; VIN recommendation artwork resolves locally from
`collectionItemId` without touching the M9/M10 model contract.

**Phase 0** (custom-cover storage) is **merged to `main` in PR #12** (merge
commit `945ed3d20bf5e5e1d94d60e7d104a3351b19bc38`). **Phase A** (design system +
routing + app shell + transitional page hosts + fallback `AlbumArtwork` +
`CollectionDataProvider`; independently audited and corrected), **Phase B**
(the full landing, the redesigned auth, the real dashboard, route-level code
splitting), **Phase C** (one canonical `AlbumArtwork` precedence + visual
Collection / Discover / Scan, plus a shared-shell top-bar fix), and **Phase D**
(History as a day-grouped journal with owner-scoped play-time correction + play
deletion; Album Detail with read-only catalog metadata + user-owned
`personal_genres`; Settings; an optional private-bucket profile avatar with
initials as the permanent fallback - ADR 0006), and **Phase E** (motion
vocabulary + reduced-motion audit, responsive pass, accessibility corrections,
contrast re-verification, bundle budget - entry ~135 kB gzip - and the one
reserved end-of-pass focused code review, final: **0 blocker / 0 high /
0 medium** / LOW-NOTE only) are **implemented, locally verified, and
human-accepted on branch `claude/visual-experience-product-identity-ui`** (see
`docs/verification.md` "Visual Phase A/B Evidence", "Phase C ...", "Phase D",
"Phase E"). The A-E visual pass is complete on the branch; **the final A-E PR is
being opened now — nothing is merged or deployed, and no hosted Supabase
migration has been applied.** Milestone 11 has not started. Current roadmap:
`docs/roadmaps/2026-09-02-complete-project-roadmap.md`.

### Art-direction approval addendum - 2026-09-01

The human completed and approved the visual art-direction review. Two
human-approved reference images (an overall product moodboard and the VIN /
Vinny character sheet) are **canonical art-direction references** alongside this
spec; they are references only and are **not** committed to the repo or
rasterised into the UI - the design language is recreated with original
React/CSS/SVG. Where a reference image and this written spec disagree, the spec
wins.

Locked direction (no drift in later phases):

- **Product feel:** "premium record store x modern streaming app x retro Hi-Fi
  lounge" - premium, warm, cinematic, music-first, sophisticated, tactile,
  vinyl/hi-fi-influenced. **High wow factor is explicitly approved**; do not
  flatten it into a generic minimal dashboard. It must not feel like a SaaS
  dashboard, a Spotify clone, a childish mascot site, or a plain CRUD project.
- **Logo:** the "Grooved V-I" is the **primary** mark (circular grooved vinyl,
  V/I integrated at the centre, spindle detail, "VINYL" / "INTELLIGENCE"
  wordmark). Original SVG only, crisp from favicon to wordmark. Needle-drop is a
  secondary decorative motif only.
- **VIN / Vinny (canonical, full system is Phase D):** premium retro-futuristic
  vinyl-curator robot - black grooved vinyl-record head, soft ivory centre-label
  face with small intelligent eyes and a subtle friendly expression, copper
  spindle, premium brushed-copper over-ear headphones with bottle-green ear
  cushions, matte charcoal / dark-metal body, restrained copper hardware, a
  small chest EQ display; warm, smart, musical, friendly but sophisticated,
  slightly playful, **never childish/toy-like**. Approved future states:
  idle / thinking / pick-success / no-match / empty-crate. Approved future
  usage: landing, auth brand area, dashboard quick-VIN, `/vin`, AI
  thinking/loading, selected empty states - **not** on every card, toast, page,
  or control.
- **Colour system:** one warm/dark theme with selective cream surfaces
  (section 5.1 tokens, unchanged); warm translucent ivory borders, never cold
  grey; no light-theme system.
- **Typography:** Fraunces (display / major headings), Inter (body / UI), IBM
  Plex Mono (metadata / IDs / timestamps); self-hosted WOFF2, no runtime Google
  Fonts, no font npm dependency, OFL notices preserved. Used intentionally - not
  every heading is Fraunces.
- **Motion:** ambitious but not distracting, full `prefers-reduced-motion`.
  Desktop album cards may use a 3-4 px lift, ~1.015 artwork zoom, a subtle
  highlight, and a quick-action fade; no exaggerated 3D tilt; no constant
  distracting motion. The full motion pass is Phase E.

Date: 2026-08-31 (spec); 2026-09-01 (art-direction addendum)

Branch: `claude/visual-experience-product-identity` (Phase 0),
`claude/visual-experience-product-identity-ui` (Phases A-E)

Baseline (`main`): `bfddeb5109e61eac65b184ff4ff5d58092b3984f` (Milestone 10 merge, PR #11)

Related: `docs/plans/012-visual-experience-product-identity.md` (implementation
plan / phasing / testing / review), `docs/decisions/0005-visual-experience-and-artwork-architecture.md`
(proposed ADR: routing dependency, custom-cover storage, Cover Art Archive),
`docs/architecture.md`, `intent.txt` sections 4.5, 5, 10, 13, 14, 15, 31 (Phase 9),
`docs/roadmaps/2026-08-18-complete-project-roadmap.md` (historical snapshot - NOT
rewritten by this pass).

---

## 0. Why this pass is inserted here

Milestones 0-10 are complete and merged to `main`. Every core capability
exists: auth/profiles (M2), manual collection CRUD (M3), catalog lookup (M4),
photo recognition (M5), browse/search/filter (M6), ratings/favourites/notes
(M7), listening history (M8), the AI curator (M9), and conversational
refinement (M10).

The application is **functionally rich but visually still a
feature-development interface**: a single scrolling page (`src/App.tsx`) that
stacks four panels (`ProfilePanel`, `CuratorPanel`, `CatalogPanel`,
`CollectionPanel`) inside one 960px column, styled by a 491-line light-cream
`src/styles.css` with a system-font stack and no product identity, navigation,
album artwork, or motion.

`intent.txt` section 36 ("Final Product Vision") calls for the user to open
"a beautiful personal record library" that "immediately sees their collection
as something alive rather than a static spreadsheet". Section 14 requires every
flow to design its initial / loading / success / empty / error / no-match
states. Phase 9 (section 31) requires accessibility, responsive review, and
polish. None of that is possible on the current one-page shell.

This pass is therefore inserted **before Milestone 11 (Production Deployment)**:
deploying the current interface would ship a demo scaffold, not the product the
intent describes. The historical roadmap snapshot is left unchanged; this is an
inserted product-quality pass, documented as such.

## 1. Product goal

Transform the working application into a polished consumer product with a
coherent identity. The desired feeling is **premium record store + modern
streaming app + retro hi-fi lounge**. This is a genuine product-experience
redesign - real navigation, real pages, first-class album artwork, a brand
system, and a designed motion vocabulary - not a CSS refresh of the current
long page.

Every currently implemented feature must remain usable (section 19 mapping).
Visual restructuring must not silently remove functionality.

## 2. Current-state findings (repository evidence)

### 2.1 UI architecture

- `src/main.tsx` renders `<App/>` in `StrictMode`. `src/App.tsx` is the whole
  UI: `AuthProvider` -> `AuthenticatedShell`, which switches on `useAuth()`
  status (`loading` / `unauthenticated` / `profile_missing` / `error` /
  authenticated) and, when authenticated, renders a single
  `<main className="app-shell">` with `.authenticated-layout` stacking
  `ProfilePanel`, `CuratorPanel`, `CatalogPanel`, `CollectionPanel` vertically.
- **No routing library.** No URL reflects app state; refresh always returns to
  the top of the stack. `collectionRefreshKey` is prop-drilled from `App` to
  force `CollectionPanel` reloads after a catalog add.
- `src/styles.css` (491 lines, one file): `:root` light theme
  (`background:#f7f5f0`, `color:#251f1a`), `font-family: Inter, ui-sans-serif,
  system-ui, ...` - **Inter is named but no web font is loaded**; it resolves to
  the system fallback. Layout caps at `min(100% - 2rem, 960px)`; panels
  `34rem`-`58rem`. ~40 ad-hoc class names, no token layer, minimal responsive
  rules, no motion, no dark mode.
- Components are feature-siloed under `src/{auth,catalog,collection,curator,profile}/`
  plus `src/lib/*`. Cards: `CatalogCandidateCard`, `CollectionItemCard`,
  `CuratorRecommendationCard` - all text-only, no image element anywhere.
- `AuthForm` is a bare `<form>` with two buttons (sign-in / sign-up).

### 2.2 Dependencies / routing

- Runtime deps (3): `@supabase/supabase-js@2.112.3`, `react@^19.2.8`,
  `react-dom@^19.2.8`. No router, no styling library, no icon library, no motion
  library, no font package.
- Build: Vite 8 + `@vitejs/plugin-react` + `@netlify/vite-plugin` (emulates
  Netlify Functions and redirects in `npm run dev`). Tests: Vitest 4 + Testing
  Library + jsdom. `tsc -b` project references. ESLint 10 flat config.
- Production build today emits a **single ~456 KB JS chunk** (127 KB gz) - no
  route-level splitting.

### 2.3 Artwork / data model

- `CatalogCandidate.transientCoverDisplayUrl` exists in the type but
  `src/lib/catalog/musicbrainz.ts:338` **always sets it to `null`**. There is
  **no Cover Art Archive integration**.
- `public.releases` has **no cover column**. Fields: `artist`, `title`,
  `release_year`, `label`, `catalog_number`, `country`, `format`, `genres text[]`,
  `provider`, `provider_release_id` (release MBID), `provider_release_group_id`
  (release-group MBID), `source` (`manual` per-user | `catalog` global),
  `created_by`, timestamps. RLS: users see their own `manual` rows +
  all `catalog` rows; `service_role` has table INSERT/UPDATE for catalog writes;
  `authenticated` has column-scoped INSERT/UPDATE for manual metadata + `genres`.
- `public.collection_items` (per-user): `release_id`, `added_at`, `rating`
  (1-5 | null), `is_favorite`, `notes` (<= 1000 | null). RLS own-row select /
  insert(release_id) / update(rating,is_favorite,notes) / delete. **No cover
  field.**
- `public.listening_events` immutable append-only. `public.model_calls`
  telemetry only. `public.profiles` (id, display_name).
- **No Supabase Storage.** `supabase/config.toml` `[storage] enabled = false`;
  all bucket blocks commented out. No storage policy migration.
- Photo-recognition image is **transient**: browser downscales -> base64 data
  URL -> `POST /api/catalog/recognize` -> OpenRouter. Never written to a bucket
  or table. There is no `image_identification_attempts` table (the data-model
  sketch was never implemented).
- Data available with zero new queries for a dashboard: collection size,
  favourites count, ratings distribution, `genres[]`, `release_year` -> decade,
  `listening_events` (play count, last-listened, recency), `added_at` (recently
  added). All already loaded by `loadCollection` / `loadListeningEvents`.

## 3. Product information architecture

Nine surfaces, two of them public:

| Surface | Route | Auth | Purpose |
| --- | --- | --- | --- |
| Landing | `/` | public | Identity, pitch, primary CTA to sign up / in |
| Auth | `/auth` | public | Sign in + sign up (one designed screen) |
| Dashboard | `/dashboard` | required | Personal home: stats, quick actions, recent activity, quick VIN prompt |
| Collection | `/collection` | required | Browse owned records - grid (default) + compact list, filters, sort |
| Album detail | `/collection/:id` | required | One owned record: hero art, metadata, rating/favourite/notes, listening, custom cover, edit, remove |
| Discover | `/discover` | required | Catalog search + manual add; visual result cards; add to collection |
| Scan | `/scan` | required | AI cover scan: upload -> clues -> visual catalog candidates -> confirm -> add |
| Ask VIN | `/vin` | required | AI curator + bounded conversational refinement (M9/M10), redesigned |
| History | `/history` | required | Listening history, grouped by day, with artwork thumbnails |
| Settings | `/settings` | required | Profile (display name), account identity, sign out |

Route naming keeps the conceptual separation from the brief. `/vin` is kept as
the brand route (not `/curator`). A `/collection/:id` child route replaces the
per-card expansion currently inside `CollectionPanel`. A catch-all `*` renders
a branded 404.

## 4. Routing decision

**Recommendation: add `react-router-dom` (v7), one runtime dependency.**

Rationale: there is no routing system today; the redesign needs 10 real routes,
auth-guarded route groups, deep-linkable album detail, route-level code
splitting, and browser-history back/forward. React Router is the standard for a
Vite React SPA, integrates cleanly with the existing `AuthProvider`, and needs
no server. We will use the plain `<BrowserRouter>` + `<Routes>` API (not the
data-router / loader APIs) to keep the surface small and testable with the
existing Testing Library setup.

Production requirement: a SPA fallback so deep links resolve. Add
`public/_redirects` with `/*  /index.html  200` (Netlify). `npm run dev` already
emulates redirects via `@netlify/vite-plugin`.

Alternatives considered: hand-rolled `useState` router (rejected - reinvents
history, guards, code-splitting, and is less testable); `wouter` (~2 KB,
rejected only for being less standard - acceptable if the human prefers minimal
footprint). **No router is added during the planning turn.**

Dependency implication: `+1` runtime dependency (`react-router-dom`). No other
npm dependency is required by this entire pass (fonts, icons, logo, mascot, and
motion are all zero-dependency - see sections 8, 12, 13, 15).

## 5. Design system - tokens

All values are CSS custom properties on `:root`. The product commits to a
**single dark warm theme** (with selective light/cream surfaces); a light theme
is out of scope for this pass. `color-scheme: dark` is declared so form
controls and scrollbars match.

### 5.1 Colour

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#141210` | app background (warm near-black) |
| `--bg-inset` | `#100E0C` | recessed wells, code/mono blocks |
| `--surface` | `#1E1B18` | panels, cards, sidebar |
| `--surface-2` | `#272320` | elevated / hover surface, popovers |
| `--surface-cream` | `#F4EDE1` | selective light cards (e.g. "VIN's Pick" callout, landing accents) |
| `--text` | `#F2E9DC` | primary text (warm ivory) - >= 7:1 on `--bg` |
| `--text-muted` | `#A79D8E` | secondary text, metadata - >= 4.6:1 on `--bg` |
| `--text-faint` | `#776E60` | disabled, timestamps - large / non-essential only |
| `--text-on-cream` | `#241E16` | text on `--surface-cream` |
| `--border` | `rgba(242,233,220,0.10)` | hairline dividers, card edges |
| `--border-strong` | `rgba(242,233,220,0.20)` | inputs, focused card |
| `--accent` | `#C6743E` | primary accent: CTAs, active nav, best-match, links (copper / tube-amp glow) |
| `--accent-hover` | `#D8854B` | accent hover |
| `--accent-ink` | `#1B0F07` | text on `--accent` fills - verified >= 6:1 |
| `--accent-2` | `#2F5D50` | secondary accent: VIN identity, subtle highlights (bottle green) |
| `--gold` | `#C9A34E` | ratings stars, embossed-lettering highlights - used sparingly |
| `--success` | `#5CA37E` | success text / icon |
| `--warning` | `#C9A34E` | warning |
| `--danger` | `#D06A60` | error text / destructive |
| `--danger-surface` | `#3A211E` | error banner background (oxblood-tinted) |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.45)` | resting hairline lift |
| `--shadow-card` | `0 1px 2px rgba(0,0,0,.45), 0 10px 28px rgba(0,0,0,.30)` | card / popover |
| `--shadow-modal` | `0 24px 64px rgba(0,0,0,.55)` | dialogs |

Contrast: every text/background pair above is annotated with its target ratio.
The build's visual-inspection checklist (plan section 7) re-verifies each pair
and the `--accent`/`--accent-ink` button pairing with a contrast tool.

Gradients (used sparingly): landing hero radial "spotlight"
(`radial-gradient(circle at 50% 0%, rgba(198,116,62,.14), transparent 60%)`);
fallback-cover vinyl groove (`repeating-radial-gradient`); card top-edge
highlight (`linear-gradient(180deg, rgba(242,233,220,.05), transparent 12%)`).

Texture: one tiled SVG `feTurbulence` grain as a fixed `body::after`
pseudo-element at ~2.5% opacity - adds the "vinyl-inspired" tactile surface
without a raster asset.

### 5.2 Why this palette fits Vinyl Intelligence

Vinyl listening is an evening, low-light, deliberate, tactile activity - a
listening room, not an office dashboard. Warm near-black plus warm ivory recalls
a premium turntable plinth and the ink-on-uncoated-stock of a record sleeve.
Copper is the tonearm, the stylus, and the glow of a tube amplifier - the right
colour for "the intelligent spark" and for calls to action. Bottle green and
oxblood are the classic palette of mid-century hi-fi cabinetry and independent
record shops. Muted gold is the foil-stamped lettering on a gatefold. A dark
chrome ground also makes album artwork - the product's real hero content - read
louder than any UI colour, which is the point. It delivers "premium record
store + streaming app + retro hi-fi lounge" without neon, glassmorphism, or a
stock-SaaS look.

### 5.3 Spacing / radius / layering

- Space scale (4px base): `--space-1: .25rem` ... `--space-8: 4rem` (1,2,3,4,6,8,12,16 * 4px).
- Radius: `--radius-sm: 6px` (inputs, chips), `--radius-md: 10px` (cards,
  buttons), `--radius-lg: 16px` (panels, dialogs), `--radius-full: 999px`
  (badges, avatars).
- Container widths: `--width-prose: 40rem`, `--width-content: 72rem`,
  `--width-wide: 88rem` (collection grid). Page gutter `clamp(1rem, 4vw, 2.5rem)`.
- Elevation order: `--bg` < `--surface` < `--surface-2` < popover < dialog.
  Never more than one shadow tier stacked.

### 5.4 Typography

| Role | Family | Size / weight |
| --- | --- | --- |
| Display (landing hero) | Fraunces | `clamp(2.5rem, 6vw, 4rem)` / 500, optical `opsz` high |
| Page title (`h1`) | Fraunces | `1.9rem` / 500 |
| Section title (`h2`) | Fraunces | `1.35rem` / 500 |
| Album title (card) | Fraunces | `1rem` / 500 |
| Album title (detail hero) | Fraunces | `clamp(1.6rem, 3vw, 2.25rem)` / 500 |
| Artist | Inter | `0.95rem` / 500, `--text-muted` |
| Body | Inter | `1rem` / 400, line-height 1.6 |
| Metadata / facts | Inter | `0.8rem` / 400, `--text-muted`, `font-variant-numeric: tabular-nums` |
| Label / eyebrow | Inter | `0.72rem` / 600, `letter-spacing .08em`, uppercase |
| Button | Inter | `0.9rem` / 600 |
| Mono (catalog #, IDs, history timestamps) | IBM Plex Mono | `0.8rem` / 400 |

Fonts: **self-hosted woff2** in `public/fonts/`, loaded via `@font-face` with
`font-display: swap`, Latin subset, the two hottest faces (`Fraunces` variable
display, `Inter` variable) `<link rel="preload">`ed. Chosen faces are SIL OFL
(Fraunces, Inter, IBM Plex Mono) - bundling the woff2 files is licence-compliant
and adds **no npm dependency** and **no third-party runtime request** (works
offline in dev, no `fonts.googleapis.com` call). If the human prefers, the
`@fontsource/*` dev-dependency packages are an alternative (adds devDeps only).

## 6. Brand identity

Product name: **VINYL INTELLIGENCE** (unchanged).

AI curator identity: **VIN** - "Vinyl Intelligence Navigator". Friendly
nickname / mascot: **Vinny**. User-facing phrasing: "Ask VIN", "VIN's Pick",
"VIN is digging through your crate...", "Refine with VIN". The nav item is
"Ask VIN"; the page `h1` is "Ask VIN"; the mascot is referred to as Vinny only
in incidental copy, never as a required label.

### 6.1 Logo concepts (final asset NOT created this pass)

1. **Grooved V-I** - a circle drawn as concentric record grooves; the centre
   label's negative space forms a `V` with the spindle hole as the dot of an
   `I`, or a `V`/`I` ligature sits on the label. Wordmark: "VINYL" in Fraunces
   over "INTELLIGENCE" in tracked Inter caps. Compact mark: the grooved circle.
   Favicon: a 3-groove circle + spindle dot.
2. **Needle-drop** - a minimal record circle with a single diagonal tonearm
   line meeting the rim near 1 o'clock; the contact point is a copper dot (the
   "intelligence" spark). Compact mark: circle + arm. Favicon: circle + dot.
3. **Waveform label** - the round centre label where the printed rings become a
   short symmetric EQ/waveform wrapped in a ring: disc + sound + data. Compact
   mark: the ring-waveform. Favicon: three bars in a circle.

**APPROVED (decision F): Concept 1 - Grooved V-I - is the primary product
mark.** Concept 2 (needle-drop) may be used only as a **secondary visual
motif** (e.g. a loading accent or a section divider), not as the logo. All
concepts are original vector, deliverable as an inline `<Logo variant=
"wordmark|mark|favicon">` React component - no raster asset, no dependency. The
favicon is generated from the `mark` SVG.

### 6.2 VIN / Vinny mascot concept (asset NOT created this pass)

- **Construction:** a small retro-futuristic curator robot. Head = a vinyl
  record seen face-on (grooved circle) whose warm centre label is the "face":
  two dot eyes, a minimal mouth, a copper spindle-dot on the brow. Body is
  abstract/optional - usually just the head with over-ear **copper headphones**
  (bottle-green ear cushions) and a hint of shoulders or a floating record
  crate. A short 4-bar EQ strip under the chin animates for "thinking".
- **Palette:** charcoal body, `--surface-cream` label face, `--accent` copper
  hardware, `--accent-2` green cushions. Sits on any surface.
- **States:** `idle` (calm eyes, flat EQ), `thinking` (head-record spins slowly,
  EQ bars bounce - "digging through your crate"), `pick` / success (slight
  head-tilt, brighter eyes, one EQ bar peaked), `no_match` (level head, flat
  mouth, small "?"), `empty` (looking into an empty crate).
- **Appears in:** `/vin` page header + loading state; landing "Ask VIN"
  section; `/auth` brand panel (small, welcoming); dashboard quick-VIN card
  (small avatar); empty-collection CTAs. Optionally a 20px avatar on the
  "Ask VIN" nav item.
- **Must NOT appear in:** recommendation cards, album detail, collection grid,
  history rows, settings, toasts, error states, or anywhere it competes with
  album art. Never more than one hero-size instance per screen. Never animated
  on a screen the user is reading.
- **Scaling:** desktop hero 120-200px, card/nav avatar 24-40px. One SVG,
  crisp at any size. "Thinking" animation is CSS keyframes on SVG groups,
  gated by `prefers-reduced-motion` (static "thinking" pose + text fallback).
- **Accessibility:** decorative instances `aria-hidden="true"`; the loading
  instance is `role="img"` `aria-label="VIN is searching your collection"`
  inside an `aria-live="polite"` region that also carries the text status. The
  mascot never conveys information not also present as text.
- **Format:** SVG only (`<VINAvatar state size />` React component), original
  vector art. A richer illustrated WebP is optional later for the landing hero
  only.

### 6.3 Asset strategy

| Asset class | Source |
| --- | --- |
| Logo, favicon, VIN mascot, icons, fallback cover | **Original** - inline SVG / CSS, vendored into the repo, zero dependency |
| Provider album artwork | **Runtime, provider-derived** - Cover Art Archive, fetched/linked at request time, never committed as a repo asset |
| User custom album cover | **User-uploaded** - Supabase Storage, per-user, private |
| Landing decorative record imagery | Original SVG/CSS composition, or a self-shot/CC0 photo explicitly cleared by the human - **no copyrighted album art committed** |

No copyrighted album artwork is ever committed as a permanent demo asset.
Provider artwork stays provider-derived at runtime.

## 7. Album artwork system (core requirement)

Artwork is a first-class product concern. A record without any artwork is the
**fallback case, not the normal case**.

### 7.1 Precedence (four tiers)

`<AlbumArtwork>` resolves in order, advancing to the next tier on `<img>`
error, and **never looping**:

1. **User custom cover** - `collection_items.custom_cover_path` set -> a
   short-TTL signed URL from the private `collection-covers` bucket.
2. **Cover Art Archive release front** - deterministic URL from
   `provider_release_id`: `https://coverartarchive.org/release/{mbid}/front-{size}`.
3. **Cover Art Archive release-group front** - deterministic URL from
   `provider_release_group_id`:
   `https://coverartarchive.org/release-group/{mbid}/front-{size}`.
4. **Vinyl Intelligence branded fallback** - deterministic CSS/SVG cover
   (section 7.4).

For a **catalog search candidate** and a **scan candidate** (not yet owned),
precedence is 2 -> 3 -> 4 (the `CatalogCandidate` already carries
`providerReleaseId` and `providerReleaseGroupId`). Tiers 2 and 3 are just
`<img src>` values built client-side - **no backend call, no persisted
`cover_url`**. Every tier renders into a `1/1` `aspect-ratio` box -> zero layout
shift. `size` = `250` for grid/thumb, `500` (and `srcset` `1200`) for the
detail hero.

### 7.2 Where artwork appears

Dashboard (recent added / recent played / rediscovery), collection grid + list,
album detail hero, discover results, scan candidates, VIN recommendation cards,
listening history rows, favourites surfaces. One `<AlbumArtwork>` component
everywhere; size via a `size` prop (`grid` ~150-220px, `thumb` ~48px, `hero`
up to 480px).

### 7.3 Cover Art Archive plan (provider artwork) - DISPLAY-TIME, NO PERSISTENCE

**Mandatory correction (human-directed): `releases.cover_url` and a
catalog-add Cover Art Archive lookup are rejected.** Artwork must render in
Discover and Scan *before* the candidate is added, so it cannot depend on an
add-time write, and there must be no backend Cover Art Archive call and no new
`service_role` grant.

- **Source:** Cover Art Archive (CAA), `https://coverartarchive.org`, which
  exposes **deterministic** front-image URLs keyed by MusicBrainz IDs:
  - release: `/release/{release_mbid}/front-{250|500|1200}`
  - release group: `/release-group/{release_group_mbid}/front-{250|500|1200}`
  A missing image returns 404 (no bytes); a present image 302-redirects to an
  Internet Archive CDN object.
- **Resolution:** entirely **client-side, at display time**. `AlbumArtwork`
  builds tier-2 and tier-3 URLs from `provider_release_id` /
  `provider_release_group_id` (present on every catalog release and on every
  `CatalogCandidate` from search/scan) and renders `<img src loading="lazy"
  decoding="async">`. `<img>` is not subject to CORS (no `crossorigin`), so
  hotlinking works; the browser and any CDN cache the redirected object. No
  Netlify function, no image proxy, no re-hosting.
- **Sizing:** grid/thumb `front-250`; detail hero `front-500` (+ `srcset`
  `front-1200`).
- **Failure handling:** `<img onError>` advances tier 2 -> tier 3 -> tier 4
  (branded fallback), guarded against loops (an attempted-tier set per
  component instance).
- **Backend:** unchanged. `public.releases` gets no column; catalog-add does no
  CAA lookup; `catalog-handlers.mts` is untouched by artwork.
- **Rate / etiquette:** the browser only requests an image it is about to
  display; failures are a cheap 404. No server-side crawling of CAA.
- **Privacy / security:** CAA data is public; the `<img>` request carries no
  auth and no user data (only the app-origin `Referer`). No secret, no new
  dependency. **No Discogs.**

### 7.5 VIN recommendation artwork - trust boundary

Future VIN recommendation artwork **must not** widen the Milestone 9 / 10 model
payload or send provider IDs to the model. The AI result already contains
`collectionItemId`. The visual layer resolves artwork locally through the
future `CollectionDataProvider` using that **currently-owned**
`collectionItemId` (which yields the release MBIDs and any custom cover). The
M9/M10 model and security contracts are byte-unchanged.

### 7.4 Branded fallback cover

`<AlbumArtwork>` tier 4 is a pure CSS/SVG composition, no network, no raster:

- A vinyl-disc geometry: concentric grooves (`repeating-radial-gradient`), a
  centre label, a spindle hole.
- The centre label carries the artist (small) and title (Fraunces, truncated).
- A **deterministic accent**: hash `release.id` (fallback `artist + title`) into
  a hue picked from a curated ramp built on `--accent`, `--accent-2`, `--gold`,
  and two muted analogues - so a given record always gets the same tasteful
  colour, and a grid of fallbacks looks composed rather than random.
- The small `<Logo variant="mark">` sits discreetly at a corner.
- Renders at any size; text scales with container (clamp / container query).

It must still look intentional in a grid full of them.

## 8. Screen designs

Every screen specifies: initial, loading (skeleton), success, empty, validation
error, network/API error, AI/model error, no-match, ambiguous-match, and
auth-failure states where applicable (`intent.txt` section 14). The M9/M10
curator security and model contracts are unchanged - only presentation changes.

### 8.1 Landing (`/`, public)

- **Hero:** left = eyebrow ("Your collection, made intelligent"), display
  headline ("Your collection. Your mood. Your next record."), one-sentence
  explanation, primary CTA "Start your library" (-> `/auth`), secondary
  "See how it works" (scrolls). Right = an original vinyl/sleeve SVG-CSS
  composition with a very subtle parallax + slow record rotation (reduced-motion:
  static). Logo top-left in a slim public top bar with a "Sign in" link.
- **Sections (kept tasteful, not overloaded):** (1) "Your collection, alive" -
  grid preview + browse/rediscover copy; (2) "Ask VIN" - mascot + the natural-
  language prompt example from `intent.txt` section 36, "recommends only from
  records you own"; (3) "Scan a cover" - camera -> candidates -> confirm, 3
  steps; (4) visual album-wall showcase (branded fallback covers, no
  copyrighted art); (5) final CTA band.
- **States:** static page; the only async concern is font load (swap). No
  auth-gated content. If already authenticated, "Start your library" and
  "Sign in" become "Go to your dashboard".

### 8.2 Auth (`/auth`, public)

- **Split layout (md+):** left brand panel - logo, one line of value copy, small
  Vinny, `--surface`/gradient; right - the auth card on `--bg`. Mobile: brand
  strip collapses to a compact top banner over a single card.
- **One card, two modes:** segmented control "Sign in" / "Create account";
  email + password fields; primary submit; inline field validation; a
  `role="alert"` area for auth errors; a `notice` area (e.g. "Check your email"
  on sign-up if confirmation is on). Loading = button spinner + disabled form.
- **Behaviour unchanged:** calls the existing `useAuth().signIn` / `signUp`.
  On success, redirect to the intended route (or `/dashboard`). Supabase Auth,
  session handling, and the `profile_missing` boundary are untouched - the
  latter becomes a designed full-page state inside `AppShell`.

### 8.3 Authenticated app shell

- **Desktop (>= lg):** left **sidebar** (`--surface`, 240px) with the logo,
  primary nav (Dashboard, Collection, Discover, Scan, Ask VIN, History,
  Settings) each an icon + label with `aria-current="page"` + an accent left
  rail on the active item; a collapse control -> 64px icon-only rail. A slim
  **top bar** spans the content: page context / breadcrumb on the left (only
  where useful - e.g. `Collection / OK Computer`), a global "Add" affordance,
  and a user menu (avatar/initials, display name, Settings, Sign out) on the
  right.
- **Tablet (md-lg):** sidebar defaults to the 64px icon rail; top bar full.
- **Mobile (< md):** sidebar hidden; a **bottom tab bar** with 5 items
  (Dashboard, Collection, Discover, Ask VIN, More). "More" opens a drawer with
  Scan, History, Settings, and the user menu. Top bar shows the page title +
  Add.
- Consistent `--width-content` container for reading pages, `--width-wide` for
  the collection grid. Route transitions: 160ms fade + 8px rise (reduced-motion:
  none). Focus moves to the page `h1` on navigation; an `aria-live` region
  announces the new page.
- **Shell boundary states:** session-loading (branded skeleton shell),
  `profile_missing` (full-page designed state + sign out), auth `error`
  (full-page state + retry / sign out) - all replacing today's `status-panel`.

### 8.4 Dashboard (`/dashboard`)

Derived **only** from data the app already loads (`loadCollection`,
`loadListeningEvents`). No fabricated analytics.

- **Header:** "Welcome back, {display name or 'listener'}."
- **Stat row (`StatCard` x4):** collection size; favourites; played in the last
  30 days (from `listening_events`); never-played count.
- **Quick actions:** Add a record (`/discover`), Scan a cover (`/scan`),
  Ask VIN (`/vin`) - large tap targets with icons.
- **Quick VIN prompt:** a compact input + small Vinny that deep-links to `/vin`
  with the typed text prefilled (no model call from the dashboard).
- **Recently added** (last ~8, artwork) -> `/collection?sort=recently-added`.
- **Recently played** (last ~8 distinct records, artwork) -> `/history`.
- **Rediscover** ("You haven't played these in a while" - oldest last-listened
  / never-played with a rating >= 3 or favourite), artwork, up to ~6. Purely a
  deterministic client sort of already-loaded data.
- **A tasteful collection insight** (only if honest): decade distribution bar
  or top genres, computed client-side. Omitted entirely for a small/empty
  collection.
- **Empty collection:** the stat row and activity sections collapse into one
  large "Start your library" panel with Vinny, Add / Scan CTAs, and a one-line
  explanation of VIN needing owned records.
- **Loading:** skeleton stat cards + skeleton artwork rows. **Error:** if the
  shared collection load failed, a single retry banner replaces the activity
  area (stats hidden), never a fake zero.

### 8.5 Collection (`/collection`)

- **Default: grid view** - `AlbumCard`s (artwork, title, artist, a single
  at-a-glance line: year * primary genre, plus a favourite heart and rating
  dots as small overlays). Hover: lift + reveal quick actions (Log listen,
  Favourite). Click -> `/collection/:id`.
- **Compact list view** - `AlbumRow`s (small thumb, title, artist, year,
  genres, rating, last-played) for dense scanning. A grid/list segmented toggle;
  the choice persists per user in `sessionStorage` (view preference only).
- **FilterBar** (sticky under the top bar): search (artist/title), genre
  select, decade select, year, sort select, "Favourites only" toggle, active-
  filter chips with clear-all. All bind to the **existing** `collectionQuery.ts`
  (`CollectionFilters`, `CollectionSort`, `applyCollectionQuery`,
  `availableGenres`, `availableDecades`) - deterministic, client-side, unchanged
  semantics. Filter state is reflected in the URL query string so a filtered
  view is shareable/refresh-safe.
- **Manual add** moves to `/discover` (the "no catalog match -> manual entry"
  path). A "＋ Add record" button in the FilterBar links there.
- **States:** loading = skeleton grid; empty (no records) = "Start your
  library" panel; empty (filters exclude everything) = "No records match these
  filters" + clear-all; error = retry banner.

### 8.6 Album detail (`/collection/:id`)

Unifies what is currently spread across `CollectionItemCard`,
`CollectionItemPersonalControls`, and `CollectionItemListeningControls`.

- **Hero:** large `AlbumArtwork` (hero size) left; right = artist, title (Fraunces
  display), year * decade, genre pills, label / catalog # / country / format
  (mono where apt). On `< lg`, art stacks on top.
- **Your record:** `RatingControl` (1-5, clearable), favourite toggle, notes
  (textarea, <= 1000, autosave on blur) - all via the existing
  `updateManualRelease` / personal-signal update paths (RLS + column grants
  unchanged).
- **Listening:** play count, last-listened (relative + absolute), a prominent
  "Log listen" button (existing `addListeningEvent`), and a short recent-events
  list for this record.
- **Cover:** "Replace cover" (opens the custom-cover upload dialog - section 9),
  shown only when a custom cover exists: "Use provider artwork" / "Remove custom
  cover".
- **Actions:** Edit metadata (manual releases only - opens the existing
  `CollectionForm` in a dialog), Remove from collection (confirm dialog; on
  confirm, best-effort delete of any custom-cover object, then the existing
  `deleteCollectionItem`).
- **States:** loading skeleton hero; not-found (`:id` not owned / bad) = branded
  404-in-shell with a link back to `/collection`; error = retry.

### 8.7 Discover (`/discover`)

- **Search:** one prominent `SearchInput` (artist / album). Submitting calls the
  existing `searchCatalog`.
- **Results:** visual `AlbumCard` / `AlbumRow` list - `AlbumArtwork` (provider
  or fallback), title, artist, year, label / catalog # / country / format,
  genres if present, a link to the MusicBrainz release, and a primary
  **"Add to collection"** action (existing `addCatalogReleaseToCollection`).
  An **already-owned** result shows an "In your collection" state instead of
  Add (dedupe check against the loaded collection by `provider_release_id`).
- **Manual entry fallback:** "Can't find it? Add it manually" reveals the
  existing `CollectionForm` (manual release) inline / in a dialog.
- **States:** initial (prompt + examples), loading (skeleton rows), success,
  empty ("No catalog matches - try different words or add it manually"),
  provider error / rate-limit / timeout (honest messages from the existing
  `CatalogClientError` codes), add-in-progress (per-row spinner), add error
  (per-row).

### 8.8 Scan (`/scan`)

- **Capture:** a large drop / camera zone (`accept="image/*" capture` on
  mobile). Client downscales (existing `src/lib/vision/image.ts`) before upload.
- **Analysing:** "Analysing cover..." distinct from "Searching the catalogue..."
  (two labelled phases, per `intent.txt` section 14).
- **Clues:** the validated `CoverRecognition` clues shown compactly (artist,
  album, label/catalog hints, visible text) with the advisory confidence framed
  as advisory, never as certainty.
- **Candidates:** visual cards - `AlbumArtwork` (provider or fallback), artist,
  release title, year, label / catalog # / country / format, and a
  **"This is it - add"** action per candidate. The user visually disambiguates.
- **Confirm -> add:** uses the existing catalog-add path. The recognition image
  is never persisted (unchanged).
- **States:** idle; unsupported type / too-large (existing
  `RecognitionError` codes); blurred / low-confidence -> "We couldn't read this
  clearly" + retake + "search by text instead" (-> `/discover` prefilled) +
  manual entry; no catalog match -> same fallbacks; model/provider error ->
  honest message. **Never silently persists a guess** (unchanged M5 rule).

### 8.9 Ask VIN (`/vin`)

The M9 single-turn recommendation and M10 bounded refinement (max 1 initial + 3
refinements, React-memory-only conversation state, owned-ID invariant,
`previousRequest` only to call #1, structural "something else" exclusion) are
**authoritative and unchanged**. Only the presentation is redesigned.

- **Identity:** page `h1` "Ask VIN", Vinny present in the header (idle).
- **Initial state:** a large conversational request field, 4 suggested-prompt
  chips (fill-only, no submit - the existing pattern), and "Recommends only
  from records you own" messaging.
- **Loading:** "VIN is digging through your crate..." with the mascot in
  `thinking` state (spinning record-head + EQ bars; reduced-motion -> static +
  text).
- **Recommendations:** strong `AlbumArtwork` cards, a clearly marked **Best
  match**, the grounded `reason`, and grounded facts (year, genre, rating,
  favourite, play recency) - all from the server payload, never invented. A
  "Log listen" action per card and a "View in collection" link.
- **Refinement:** the bounded transcript + follow-up field + chips ("More
  energetic", "More relaxed", "Something older", "Something else") + "Start
  over", styled as a premium curator conversation. The "Excluded N previous
  picks" line and the no-match / empty-collection / error states keep their M10
  semantics with designed presentation.
- **No change** to `requestCuratorRecommendation`, `refineCuratorRecommendation`,
  the request/response contracts, rate limiting, telemetry, or prompts.

### 8.10 History (`/history`)

- **Grouped list:** "Today", "Yesterday", "Earlier this week", then by month -
  derived from `listening_events.listened_at`. Each row: artwork thumb, title,
  artist, and the time/date (mono). Reverse-chronological within a group
  (existing `compareListeningEventsNewestFirst`).
- **Optional insight cards** (only if honest): "Most played this month",
  "Longest since last play" - deterministic from loaded events + collection.
- **States:** loading skeleton rows; empty ("No listens logged yet - mark a
  record played from its page or the collection grid"); error = retry banner
  (must show even if a section is collapsed - the M8 review lesson).

### 8.11 Settings (`/settings`)

- **Profile:** display name (existing `updateDisplayName`, same validation),
  account email (read-only), member-since.
- **Account:** Sign out.
- **Visual preferences:** only if they have real behaviour - e.g. default
  collection view (grid/list), reduce motion override (mirrors the OS setting).
  No setting is invented without wiring.
- **Future-safe sections** are stubbed as headings only if genuinely planned;
  otherwise omitted.
- **States:** save in progress / success toast / validation error - keep the
  existing `ProfilePanel` behaviour.

## 9. Custom user album cover - architecture

A user can attach a **persistent** cover image to one owned collection item.
This is different from the transient photo-recognition input (which is never
stored). A user's cover must **never** be written to the shared `releases` row -
that would make one user's photo the release image for everyone.

### 9.1 Architecture (as implemented in Phase 0)

Migration `supabase/migrations/20260903120000_add_custom_cover_storage.sql`.

- **Storage:** a new **private** bucket `collection-covers` (`public = false`,
  `file_size_limit = 3145728` (3 MiB), `allowed_mime_types = ['image/webp']`).
  The bucket row is created by the migration with `on conflict (id) do update`
  (re-applying always re-enforces private + 3 MiB + webp-only) and mirrored in
  `supabase/config.toml` (`[storage] enabled = true` +
  `[storage.buckets.collection-covers]`) for local `supabase start` /
  `db reset`. Milestone 11 applies the same bucket row via the migration.
- **Canonical object name:** `{user_id}/{collection_item_id}/cover.webp` -
  exactly one object per item. Any accepted jpeg / png / webp input is
  converted client-side to a downscaled **WebP** before upload; only
  `image/webp` is a valid stored object. The recognition-upload flow is
  entirely separate and transient (untouched).
- **`public.collection_items` columns:** `custom_cover_path text` (nullable),
  `custom_cover_updated_at timestamptz` (nullable). CHECK:
  `custom_cover_path is null or custom_cover_path = user_id::text || '/' ||
  id::text || '/cover.webp'` - a non-null value must be exactly the canonical
  path for **that same row**; an arbitrary path, a foreign user prefix, a
  foreign item id, a wrong filename, or a wrong extension is rejected (23514).
  Grant `update (custom_cover_path, custom_cover_updated_at)` to
  `authenticated` (the Milestone 7 own-row UPDATE policy already governs the
  row). **No new RLS policy on `collection_items`. No `service_role` change.**
- **`storage.objects` RLS** (bucket `collection-covers` only; `storage.objects`
  had RLS on with no prior policies -> default deny):
  - **INSERT** (with check): `bucket_id` + exactly two folder segments +
    segment 1 = `auth.uid()` + filename = `cover.webp` + segment 2 is a
    `collection_item` **currently owned** by `auth.uid()`.
  - **SELECT** (using): the above **plus** `owner_id = auth.uid()::text` (and
    item still owned).
  - **UPDATE** (using + with check): same ownership on both sides; `with check`
    re-verifies the two-segment shape + filename + `owner_id`.
  - **DELETE** (using): `bucket_id` + segment 1 = `auth.uid()` + `owner_id =
    auth.uid()::text` - **deliberately not** requiring the collection item to
    still exist, so an owner can delete an orphan after removing the item.
  - No `anon` access.
- **`public.releases`:** unchanged. **No `cover_url` column, no catalog-add
  lookup, no new grant** (corrected per section 7.3).
- **Upload / replace / delete (browser, no function):** client converts to
  WebP + downscales (<= ~1400 px, <= 3 MiB) then
  `supabase.storage.from('collection-covers').upload(path, blob, { upsert: true })`;
  on success it writes `custom_cover_path` + `custom_cover_updated_at` via the
  authenticated client. `remove([path])` + null the columns on delete.
- **Serving:** `createSignedUrl(path, 3600)` (gated by the SELECT policy -
  only the owner can mint one), memory-cached per path until ~5 min before
  expiry, batched per visible page. A signed URL is a bearer credential for
  its TTL - short TTL, never logged.
- **Lifecycle / orphans:** Storage has no FK cascade. "Remove from collection"
  and "Remove custom cover" do a best-effort `remove([path])`; a residual
  orphan (tab closed mid-delete) is a documented minor limitation, deletable
  later by its owner via the DELETE policy. A scheduled sweep is **deferred**.
- **Note (Phase C implementer):** paths must use lowercase canonical UUID text
  (matches `id::text` / `user_id::text`); a `storage.objects` DELETE via raw
  SQL is blocked by the `protect_objects_delete` trigger unless the Storage API
  GUC is set - the browser `.remove()` path is unaffected.

### 9.2 DB / storage changes (as implemented)

| Change | Type |
| --- | --- |
| `collection_items.custom_cover_path` + `custom_cover_updated_at` + canonical-path CHECK + `update` grant on exactly those two columns | migration |
| private `collection-covers` bucket (webp-only, 3 MiB), `on conflict do update` | migration + `config.toml` |
| four `storage.objects` RLS policies, bucket + user + item bound | migration |
| `[storage] enabled = true` + `[storage.buckets.collection-covers]` | `config.toml` |
| `public.releases` | **not changed** |

One migration file, one `config.toml` change, one focused security review -
Phase 0. pgTAP: `supabase/tests/database/custom_cover_storage.test.sql`.

## 10. Motion / micro-interaction system

A defined vocabulary, not ad-hoc animation.

- **Tokens:** `--dur-fast 120ms`, `--dur 200ms`, `--dur-slow 320ms`,
  `--ease-out cubic-bezier(.2,.7,.2,1)`, `--ease-standard cubic-bezier(.4,0,.2,1)`.
- **Route transition:** 160ms opacity + 8px `translateY` on the routed view.
- **Album card hover (desktop, approved decision I):** 3-4 px lift + shadow
  step + a subtle highlight + ~1.015 artwork zoom (`transform: scale(1.015)` on
  the inner `<img>`, clipped) + quick-action fade-in, ~120-160ms. **No
  exaggerated 3D tilt.**
- **Buttons:** `:active` scale .98 (80ms); persistent `:focus-visible` ring.
- **Sidebar / drawer / dialog:** transform-based slide/scale 200-240ms; dialog
  backdrop fade 120ms; focus trap + `Esc`.
- **Toasts:** slide+fade from bottom-right (desktop) / top (mobile), auto-
  dismiss 4s, pause on hover.
- **Skeletons:** 1.4s shimmer sweep.
- **VIN thinking:** record-head spin (1.8s linear) + staggered EQ-bar bounce.
- **Landing:** slow record rotation + subtle parallax on the hero art only.
- **Global reduced-motion:** `@media (prefers-reduced-motion: reduce)` zeroes
  all durations/iterations; the VIN spinner and skeletons have explicit static
  branches; the landing rotation stops. No screen has constant motion while the
  user reads.

## 11. Responsive strategy

- **Breakpoints:** `sm 480`, `md 768`, `lg 1024`, `xl 1280`.
- **Nav:** bottom tab bar `< md`; 64px icon rail `md-lg`; full 240px sidebar
  `>= lg` (user-collapsible to the rail).
- **Album grid columns:** 2 (`< sm`), 3 (`sm`), 4 (`md`), 5 (`lg`), 6 (`xl`) via
  `repeat(auto-fill, minmax(150px, 1fr))` capped at `--width-wide`.
- **Dashboard:** 1-col stack -> 2-col (`md`) -> 3-col bento (`lg+`).
- **Landing hero / auth:** stacked -> 2-pane (`md+`).
- **Album detail:** art on top, full width -> art left / sticky info right
  (`lg+`).
- **VIN:** full-width conversation; recommendation cards 1-col -> 3-col (`lg`).
- **No horizontal overflow:** `min-width:0` on flex children, `overflow-x:auto`
  only on the curator transcript / any wide block, `img{max-width:100%}`.
- **Touch targets:** >= 44px for nav, chips, rating stars, quick actions.

## 12. Accessibility

A premium redesign, not an accessibility regression.

- Landmarks: one `<header>`, `<nav aria-label="Primary">`, `<main>`, a per-page
  `<h1>`. Skip-to-content link.
- Route change moves focus to the new `<h1>` and announces via `aria-live`.
- Full keyboard operability; `aria-current="page"` on the active nav item;
  dialogs trap focus, `Esc` closes, focus returns to the trigger.
- `:focus-visible` ring (2px `--accent` + 2px offset) on every interactive
  element; never bare `outline:none`.
- Contrast targets per section 5.1, re-verified with a tool during visual
  inspection; the copper CTA pairing checked explicitly.
- `<img alt="{artist} - {title} cover art">`; fallback covers `role="img"` with
  the same label; decorative vinyl/mascot geometry `aria-hidden`.
- No colour-only meaning: "Best match" is a text badge; ratings are star glyphs
  + `aria-label="Rated 4 of 5"` + optional visible "4/5"; favourite is an
  icon + label.
- Forms keep labels, `aria-describedby` errors, `role="alert"`, and the M9/M10
  `aria-live` result regions.
- `prefers-reduced-motion` honoured (section 10). Layout reflows cleanly at
  200% and 400% zoom (relative units, no fixed-height text boxes).
- Skeletons `aria-hidden` + a polite "Loading" message.

## 13. Performance

- **Route-level code splitting:** `React.lazy` per page; the landing + auth
  bundle must not pull in the authenticated app. Target initial route JS
  < 200 KB gz (today: one 456 KB / 128 KB gz chunk).
- **Images:** `loading="lazy"` + `decoding="async"` on all below-the-fold
  artwork; every artwork slot is a `1/1 aspect-ratio` box -> zero CLS. Grid
  requests CAA `front-250`; detail hero `front-500` (+ `srcset` `front-1200`).
- **Signed URLs:** batched per visible page, memory-cached to TTL.
- **Fallback covers:** pure CSS/SVG - no network, negligible cost.
- **Fonts:** `font-display: swap`, 2 preloaded subsetted woff2, no third-party
  request.
- **Shared collection load:** a `CollectionDataProvider` loads the owned
  collection + listening events **once** after auth and exposes it to every
  page; mutations invalidate locally. Removes the current `collectionRefreshKey`
  prop-drill and stops each page re-fetching.
- **Grain texture:** one small tiled data-URI on a fixed pseudo-element (no
  `background-attachment: fixed` repaint cost).
- No layout shift: skeletons match final dimensions; nav space reserved.

## 14. Reusable component plan

Kept deliberately small - no speculative abstraction.

- **Layout:** `AppShell`, `Sidebar`, `BottomNav`, `TopBar`, `PageHeader`
  (title + actions + optional breadcrumb), `RouteView` (lazy + transition +
  focus), `Container`.
- **Primitives:** `Button` (primary / secondary / ghost / danger; sm / md),
  `IconButton`, `Input`, `Textarea`, `Select`, `SearchInput`, `FilterBar`,
  `SegmentedControl` (grid/list, sign-in/up), `Badge`, `Chip`, `RatingControl`,
  `Dialog`, `ToastProvider` + `useToast`.
- **State:** `EmptyState`, `ErrorState` (+ retry), `LoadingSkeleton` with
  `SkeletonAlbumCard` / `SkeletonRow` / `SkeletonStat`.
- **Domain:** `AlbumArtwork` (precedence + fallback + lazy + skeleton - the core
  piece), `AlbumCard` (grid), `AlbumRow` (list), `StatCard`, `SectionHeader`,
  `GenrePills`, `ListeningMeta`, `BestMatchBadge`, `OwnedStateBadge`.
- **Brand:** `Logo` (`wordmark|mark|favicon`), `VINAvatar` (`state`, `size`),
  `VINThinking`, `Icon` (inline-SVG sprite, ~20 glyphs).
- **Icons:** ~20 glyphs (home, collection/crate, discover/search, scan/camera,
  VIN mark, history/clock, settings, star, heart, play, plus, edit, trash,
  chevrons, close, menu, upload, external-link, check, alert) vendored as static
  SVG paths (Lucide is ISC-licensed and may be copied; restyled to a 1.5px
  stroke). **No icon npm dependency.**

## 15. Current feature -> new page mapping

| Current component / flow | New home | Client contract |
| --- | --- | --- |
| `AuthProvider` / `useAuth` / `AuthContext` | wraps the router; guards authed routes | unchanged |
| `AuthForm` | `/auth` (`AuthPage` + `AuthCard`) | `signIn` / `signUp` unchanged |
| `App.tsx` status branches (`loading` / `profile_missing` / `error`) | `AppShell` full-page boundary states | unchanged logic |
| `ProfilePanel` | `/settings`; sign-out also in `TopBar` user menu | `updateDisplayName` / `signOut` unchanged |
| `CuratorPanel` + `CuratorRefinePanel` + `CuratorTranscript` + `CuratorRecommendationCard` | `/vin` (`VinPage`) | `requestCuratorRecommendation` / `refineCuratorRecommendation` and all M9/M10 contracts unchanged; cards gain `AlbumArtwork` |
| `CatalogPanel` + `CatalogSearchForm` + `CatalogCandidateList` + `CatalogCandidateCard` | `/discover` (`DiscoverPage`) | `searchCatalog` / `addCatalogReleaseToCollection` unchanged; results become `AlbumCard`s |
| `CatalogPhotoPanel` | `/scan` (`ScanPage`) | recognition + candidate-confirm path unchanged; candidates become visual cards |
| `CollectionPanel` + `CollectionForm` + `CollectionLibraryControls` + `CollectionItemCard` | `/collection` (grid + list) + `/collection/:id` (detail) | `loadCollection` / `addManualCollectionItem` / `updateManualRelease` / `deleteCollectionItem` unchanged |
| `CollectionItemPersonalControls` | `/collection/:id` (primary) + grid hover quick-action | personal-signal update path unchanged |
| `CollectionItemListeningControls` | `/collection/:id` + grid/row quick-action | `addListeningEvent` unchanged |
| `ListeningHistory` | `/history` (`HistoryPage`), grouped + thumbnails | `loadListeningEvents` unchanged |
| `collectionQuery.ts` | `/collection` `FilterBar` + URL query sync | unchanged functions; `+` grid/list view state |
| `listeningSummary.ts` | detail + history + dashboard stats | unchanged |
| `*Draft` / `sessionDraft.ts` | preserved, keyed per route; still sessionStorage-only | unchanged |
| `src/styles.css` (light, 491 lines) | `src/styles/` token + base + component layers (dark system) | nothing silently dropped |
| - | NEW `/` `LandingPage`, `/dashboard` `DashboardPage`, `*` `NotFoundPage` | derived from existing loads only |

No feature is removed. Every existing Vitest suite is ported to its new host and
must stay green (plan section 8).

## 16. Testing strategy (detail in the plan)

- Routing / guards: unauthed -> `/dashboard` redirects to `/auth`; authed ->
  `/auth` redirects to `/dashboard`; unknown route -> 404; deep-link refresh to
  `/collection/:id` works (SPA fallback).
- Navigation: `aria-current`, bottom nav on narrow viewport, drawer focus trap.
- Feature preservation: every current suite ported; the same client functions
  asserted with the same arguments; M9/M10 curator contract tests unchanged.
- `AlbumArtwork`: precedence (custom > provider > fallback), `<img onError>`
  fall-through without loops, deterministic fallback hue per id, `loading="lazy"`
  present, alt text.
- Custom cover: client type/size validation, upload success sets the column,
  replace overwrites, remove nulls + best-effort object delete, precedence
  flips immediately.
- Discover / scan: results and candidates render `AlbumArtwork` + skeletons +
  empty / no-match states.
- Collection: grid<->list toggle persistence, filter/sort semantics unchanged,
  URL query sync, both empty states.
- VIN: existing M9/M10 behaviour tests pass unchanged; mascot `state` prop
  renders the right pose; reduced-motion -> static.
- History: day-group bucketing from timestamps; thumbnails.
- Mobile nav, reduced-motion, and a11y basics (roles / labels / headings /
  focus order) in jsdom.
- Storage: pgTAP for the new `collection_items` column grant + the own-row
  policy; `storage.objects` policy assertions for `collection-covers`.
- **No real OpenRouter / MusicBrainz / Cover Art Archive calls in automated
  tests** - all mocked (existing pattern).

## 17. Review strategy

- **Phase 0 (architecture gate):** one **focused security review** of the
  Storage bucket RLS, the canonical-path CHECK, and the new `collection_items`
  column grant. Nothing else in this pass warrants a security review.
- **Phases A-E:** per-phase automated checks (`typecheck`, `lint`, `test:run`,
  `build`, `supabase test db`, `supabase db lint`, `npm audit --omit=dev`);
  **one focused code review at the end** (not per-phase loops); **page-by-page
  human visual inspection** on desktop + tablet + mobile; a **final browser
  smoke** of every critical flow (auth, manual add, catalog add with artwork,
  scan, custom-cover upload, collection grid/list, detail, log listen, VIN
  recommend + refine, history, settings, sign out, deep-link refresh,
  reduced-motion).
- No `/ultrareview`. No repeated security review beyond Phase 0.

## 18. Scope boundaries

In scope: navigation, pages, brand system, artwork system (provider + custom +
fallback), the one storage/data-model change artwork needs, motion, responsive,
accessibility, performance, and the visual redesign of every existing feature.

Out of scope (unchanged from `intent.txt` unless the human promotes it): any
change to the M9/M10 curator security or model contracts for cosmetic reasons;
Discogs; multi-record shelf scanning; a light theme; RAG / vector DB; social /
marketplace / streaming; an orphan-sweep scheduled function (deferred);
production deployment (Milestone 11, still after this pass).

## 19. Acceptance criteria

1. Every route in section 3 exists, is reachable, deep-linkable, and refresh-safe.
2. Unauthenticated access to an authed route redirects to `/auth`; authenticated
   access to `/auth` or `/` offers the dashboard.
3. Every current feature (M2-M10) is reachable and functional at its mapped
   location; every ported test suite is green; the M9/M10 curator contracts are
   byte-unchanged.
4. `AlbumArtwork` renders the correct tier for: a record with a custom cover, a
   catalog record whose CAA release image resolves, a catalog record that only
   resolves at release-group level, a catalog record with no CAA art, and a
   manual record - advancing on `<img>` error without looping, with no layout
   shift and correct alt text.
5. A user can upload, replace, and remove a custom cover on an owned record;
   another user cannot read or write it (verified by Storage RLS tests + the
   focused security review).
6. Provider artwork resolves entirely client-side from stored MusicBrainz IDs;
   `public.releases` has no `cover_url` column and catalog-add makes no Cover
   Art Archive call; no automated test makes a real CAA call.
7. Discover results and scan candidates are visual cards with artwork and their
   full state set.
8. The dashboard shows only data derived from existing loads; the empty-
   collection dashboard is a designed "start your library" state.
9. `/vin` presents the M9/M10 flow as a premium curator conversation with the
   mascot, best-match, grounded facts, and all M10 refinement / no-match /
   exclusion states.
10. All interactive elements have a visible focus state; `prefers-reduced-motion`
    removes non-essential motion; contrast targets in section 5.1 are met.
11. No horizontal overflow at any supported width; nav collapses to a bottom bar
    on mobile.
12. Initial route JS is materially smaller than today via route-level splitting.
13. The historical roadmap snapshot is unchanged; this pass is documented as an
    inserted pre-deployment product-quality pass.

## 20. Human design decisions (APPROVED 2026-08-31)

| # | Decision | Outcome |
| --- | --- | --- |
| A | Brand palette | **APPROVED as specified** - warm near-black + ivory + copper primary + bottle-green + gold (section 5.1). |
| B | Routing dependency | **APPROVED** - `react-router-dom` v7. Added in Phase A, **not** Phase 0. |
| C | Navigation style | **APPROVED** - desktop sidebar + tablet icon rail + mobile bottom navigation + persistent top bar. |
| D | VIN / Vinny naming | **APPROVED** - identity `VIN` = Vinyl Intelligence Navigator; friendly nickname `Vinny`; nav label "Ask VIN"; route `/vin`. |
| E | Mascot direction | **APPROVED** - premium retro-futuristic record-head curator robot, copper headphones, subtle EQ states; friendly, sophisticated, not childish. Asset later. |
| F | Logo direction | **APPROVED - Concept 1 (Grooved V-I) is the primary product mark.** Concept 2 (needle-drop) may be used only as a secondary visual motif. |
| G | Custom-cover storage / data-model | **APPROVED with the section 4-7 corrections** - private `collection-covers` bucket, canonical `{user_id}/{collection_item_id}/cover.webp` (webp only), `collection_items.custom_cover_path` bound by CHECK to the row, defense-in-depth `storage.objects` RLS. Implemented in Phase 0. |
| H | Provider artwork | **APPROVED in concept; the `releases.cover_url` persistence architecture is REJECTED and replaced** - artwork resolves at **display time** from stored MusicBrainz IDs via deterministic CAA URLs; source chain custom > CAA release > CAA release-group > branded fallback; advance on `<img>` error, never loop. No `cover_url`, no catalog-add lookup, no `service_role` widening, no Discogs, no image proxy (section 7.3). |
| I | Animation intensity | **APPROVED** - ambitious but not distracting; full `prefers-reduced-motion`. Desktop album cards may use a 3-4 px lift, ~1.015 artwork zoom, a subtle highlight, and a quick-action fade. **No exaggerated 3D tilt** (section 10). |
| J | Dashboard content | **APPROVED** - section 8.4 modules; include the honest derived **decade-distribution + top-genres** insight when there is enough collection data, omit it for very small collections. No chart dependency. |
| K | Implementation phasing | **APPROVED** - Phase 0 = its own PR. After Phase 0 merges, Phases A-E land on **one** follow-up visual branch / PR with coherent staged commits (not five PRs). |

### 20.1 Mandatory architecture corrections applied to this spec

1. **No `releases.cover_url`, no catalog-add Cover Art Archive lookup, no
   `service_role` widening for artwork** (section 7.3). Provider artwork is a
   client-side display-time concern using the MBIDs already stored, so it works
   in Discover and Scan before Add.
2. **Four-tier artwork source chain** (section 7.1): custom signed cover -> CAA
   release front -> CAA release-group front -> branded fallback; `<img>` error
   advances one tier and never loops.
3. **VIN recommendation artwork trust boundary** (section 7.5): resolved
   locally from the AI result's `collectionItemId`; the M9/M10 model payload is
   not widened and provider IDs are never sent to the model.
4. **Canonical custom-cover object** (section 9): one
   `{user_id}/{collection_item_id}/cover.webp` per item, `image/webp` only;
   input jpeg/png/webp is converted to WebP client-side before upload; the
   recognition-upload flow stays separate and transient.

## 21. Fonts / assets to be produced later (not this turn)

- Self-hosted woff2: Fraunces (variable, display), Inter (variable), IBM Plex
  Mono - subsetted to Latin, placed in `public/fonts/`, with a `LICENSES` note.
- `Logo` SVG (3 variants) from the approved concept.
- `VINAvatar` SVG with the 5 states.
- Icon sprite (~20 glyphs).
- Grain texture data-URI.
- Landing decorative record composition (original SVG/CSS; any photo must be
  CC0 / self-made and human-cleared).

No asset is created until decisions A-K are approved.

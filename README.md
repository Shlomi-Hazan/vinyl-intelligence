# Vinyl Intelligence

Vinyl Intelligence is an AI-assisted web application for vinyl collectors. It turns a personal record collection into a searchable, organized, conversational music library.

The product is not a generic music recommender. Its core job is to help a collector decide what to play from records they actually own.

## Problem

Vinyl collectors often remember a mood, setting, decade, or feeling before they remember the exact album. Traditional collection tools answer "what do I own?" Vinyl Intelligence should also answer "given what I own, what should I listen to now, and why?"

## Planned Capabilities

- Personal authenticated vinyl collection
- API-based record search and metadata import
- Manual collection browsing, search, filtering, and editing
- Organization by artist, genre, style, year, decade, rating, favorites, and listening history
- Listening history with played count and last-listened tracking
- AI curator that interprets natural-language listening intent
- Recommendations limited to records owned by the user
- AI-assisted cover-photo recognition with catalog candidate confirmation
- Audit-friendly model/API call logging where practical

## Architecture Summary

The recommended baseline is:

- Frontend: Vite + React + TypeScript.
- Backend: Netlify Functions for privileged server-side logic.
- Database/Auth/Storage: Supabase Postgres, Supabase Auth, and Supabase Storage.
- AI: server-side LLM API access, with OpenRouter as the initial candidate.
- Music metadata: Discogs and MusicBrainz must be compared in a small documented API spike before implementation.
- Deployment: Netlify.

## Project Status

Current status: Milestone 8 (Listening History - immutable `listening_events`,
derived listening count / last-listened, and a reverse-chronological history) is
**merged to `main`** in PR #8 (merge commit
`9af8beec701cb108b3ed6de7bdf3962fbf938ee3`), following local automated
verification, a focused review (0 BLOCKER / 0 MEDIUM), and human runtime
verification (PASS, 4/4). Milestone 7 (Ratings / Favorites / Notes) is also
merged to `main`. Milestone 9 (AI Curator - single-turn natural-language
recommendations drawn only from owned records) is **merged to `main`** in PR #10
(merge commit `1ad61c0c537dbed0f71f102071bda7dd5d66a444`), following automated
verification, a focused cloud `/ultrareview` (0 BLOCKER / 0 MEDIUM), a
runtime-discovered selection-truncation defect found and fixed during human
runtime, and human runtime **PASS 5/5**
(`docs/specs/0010-milestone-9-ai-curator.md`,
`docs/plans/010-milestone-9-ai-curator.md`, ADR
`docs/decisions/0004-openrouter-curator-text-models.md`,
`docs/verification.md`). Milestone 10 (Conversational Refinement - bounded
follow-up over the M9 curator via `POST /api/curator/refine`, React-memory-only
conversation state, no migration) is **implemented and verified** on
`claude/milestone-10-conversational-refinement` at
`74490282b504d445753308434380747c23d7a72c` - local automated verification, a
focused self-review plus an independent GitHub review whose one MEDIUM was fixed
(final gate 0 BLOCKER / 0 MEDIUM), and human runtime **PASS 4/4**
(`docs/specs/0011-milestone-10-conversational-refinement.md`,
`docs/plans/011-milestone-10-conversational-refinement.md`,
`docs/verification.md` "Milestone 10 Evidence"). **Merged to `main`** in PR #11
(merge commit `bfddeb5109e61eac65b184ff4ff5d58092b3984f`). Hosted/production
verification and production deployment have not occurred and remain later
milestones; no hosted Supabase migration has been applied.

Before Milestone 11 (Production Deployment), a **Visual Experience & Product
Identity pass** is underway
(`docs/specs/0012-visual-experience-product-identity.md`,
`docs/plans/012-visual-experience-product-identity.md`, ADR
`docs/decisions/0005-visual-experience-and-artwork-architecture.md`). The design
is **human-approved** (decisions A-K, art-direction addendum 2026-09-01); it
adds real multi-page navigation, a brand system (VIN curator identity, Grooved
V-I logo, dark warm hi-fi visual system), first-class album artwork (client-side
Cover Art Archive front images + optional user custom covers + a branded
fallback), and a motion/responsive/accessibility pass.

- **Phase 0** (private `collection-covers` Storage bucket +
  `collection_items.custom_cover_path`; migration
  `20260903120000_add_custom_cover_storage.sql`) is **merged to `main` in
  PR #12** (merge commit `945ed3d20bf5e5e1d94d60e7d104a3351b19bc38`).
- **Phase A** (design system + `react-router-dom` routing + the 9-route app
  shell + transitional page hosts for every M2-M10 feature + fallback
  `AlbumArtwork` + `CollectionDataProvider`) is **implemented and locally
  verified on branch `claude/visual-experience-product-identity-ui`, not
  merged** (`docs/verification.md` "Visual Phase A Evidence"). This is the only
  new runtime dependency in the whole pass.
- **Phases B-E** (landing/auth/dashboard; artwork infra + visual collection/
  discover/scan; VIN/history/settings/album-detail; motion/responsive/a11y/perf)
  are not started.

Milestone pull-request and merge state are tracked in GitHub history.

Implemented:

- Product intent copied into the repository
- Initial engineering documentation structure
- Codex project instructions
- Approved initial architecture decisions, data model direction, AI/API/security constraints, verification approach, and milestone roadmap
- Vite, React, TypeScript, Netlify Functions, linting, type-checking, testing, and build scaffold
- Supabase local development structure
- Supabase Auth browser client foundation
- Email/password authentication UI
- Local email confirmation flow using Mailpit
- User-owned `profiles` table with RLS and least-privilege grants
- Minimal authenticated profile workflow for editing `display_name`
- Manual collection schema: `releases` and `collection_items`
- Browser-authoritative Supabase RLS and least-privilege access for manual collection data
- Authenticated manual add, view, edit, and remove workflow
- Manual release validation and recoverable CRUD error behavior
- Milestone 3 automated verification, spec-driven test remediation, and human runtime verification
- MusicBrainz-first catalog search through authenticated Netlify Functions
- Authenticated catalog add flow with server-side provider revalidation
- Shared canonical provider-backed catalog releases with Supabase persistence
- Least-privilege `service_role` grants for server-side catalog persistence
- Explicit-submit catalog search with a bounded single retry on provider
  rate-limit responses (best-effort pacing, not a distributed guarantee)
- Browser-safe catalog UI with normalized candidates and recoverable errors
- Milestone 4 automated/local verification and human runtime verification
- Authenticated server-side cover-photo recognition (`POST /api/catalog/recognize`)
  through an OpenRouter vision model, server-only API key
- Client + server image validation (MIME allow-list, byte-size limit, magic
  bytes); browser downscale/re-encode; no permanent image storage
- Strict server-side validation of the model's structured JSON output;
  model-inferred year/label/catalog number treated as search hints only
- Deterministic clue-to-MusicBrainz-query builder; candidate lookup and
  confirmation reuse the Milestone 4 search/add path (explicit human
  confirmation before any collection write; the model never auto-persists)
- `model_calls` telemetry (one row per recognition attempt), least-privilege
  access (`authenticated` reads own rows via RLS; `service_role` INSERT only)
- Per-user recognition rate limit (10 per 10 minutes, counted from
  `model_calls`, enforced before the provider call), course/demo-scoped
- Per-tab per-user `sessionStorage` persistence for the recognition
  clues/query, the catalog search draft/results, and the manual add-form draft
  (restore is UI-state only; no provider or database call, no auto-submit)
- Milestone 5 automated verification, final multi-agent review, and human
  runtime verification
- Deterministic client-side collection browse/search/filter/sort: search owned
  records by artist or title, filter by exact year, decade (derived), or genre
  (where stored), combine as logical AND, clear filters, result count, and five
  compact sorts - no LLM and no external request on a filter change (Milestone 6)
- `releases.genres` metadata: catalog-sourced community-curated MusicBrainz
  genre tags (best-effort paced release-group lookup on catalog Add, never
  overwriting existing genres) plus an optional manual Genre field (Milestone 6)
- Per owned collection item: a 1..5 rating (or unrated), a favorite flag, and a
  plain-text personal note (<= 1000 chars); partial-patch saves on the browser
  Supabase client with an own-row `UPDATE` policy scoped to the three signal
  columns (Milestone 7)
- Listening history: immutable append-only `listening_events` as the source of
  truth, "Mark played" on every owned record, browser-derived play count and
  last-listened time (no denormalized columns, no triggers), and a compact
  collapsible reverse-chronological history; authenticated `SELECT` + `INSERT
  (collection_item_id)` only, no `UPDATE`/`DELETE`, own-item `INSERT` RLS, both
  foreign keys `ON DELETE CASCADE` (Milestone 8)
- AI Curator: `POST /api/curator/recommend` - a single-turn natural-language
  request produces a small set of recommendations drawn only from owned records.
  Two-stage OpenRouter pipeline (intent extraction -> deterministic hard filter
  + rank over the RLS-owned collection/history -> <= 12 allowed candidates ->
  selection/explanation), strict allowed-ID validation, per-user rate limit,
  `model_calls` telemetry; no `service_role` collection read, no new table
  beyond a `model_calls` feature-allow-list widening (Milestone 9)
- Conversational refinement: `POST /api/curator/refine` - a bounded follow-up
  (max 1 initial + 3 refinements per local session) returns a new owned-only
  recommendation set that refines the previous interpreted intent. Complete
  revised `CuratorIntent` from the model, fresh RLS-owned reads every turn,
  structural "something else" exclusion of prior picks, React-memory-only
  conversation state (no table, no `sessionStorage` / `localStorage`), the
  shared `curator_intent` rate budget, no migration (Milestone 10; merged in
  PR #11)

Planned:

- Production deployment (Milestone 11)

## Local Setup

The project uses Node.js 24 and npm.

```bash
nvm use
npm install
npm run dev
```

The current Supabase-backed milestones require browser-safe Supabase settings. Copy `.env.example` to a
local `.env` file and fill in local or hosted Supabase values. Do not commit
`.env`.

For the local Supabase stack:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase db lint
```

After `npx supabase start`, run:

```bash
npx supabase status
```

Use the local `API URL` as `VITE_SUPABASE_URL`. Use the local browser-safe
`anon key` as the local value for `VITE_SUPABASE_PUBLISHABLE_KEY`. Do not copy
the service-role key, JWT secret, database URL/password, or any other privileged
credential into a `VITE_` variable.

Local email confirmation is intentionally enabled. Mailpit is available at:

```text
http://127.0.0.1:54324
```

The local Vite development server exposes the application shell. With the
Netlify Vite integration active, the scaffold health function is available at:

```text
http://127.0.0.1:5173/api/health
```

Useful verification commands:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run preview
```

Browser code must use only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. Milestone 4 catalog add uses
`SUPABASE_SERVICE_ROLE_KEY` only inside Netlify Functions after verifying the
browser Supabase user token. Milestone 5 photo recognition uses
`OPENROUTER_API_KEY` (server-only) and optional `OPENROUTER_VISION_MODEL` only
inside the recognition Netlify Function; the key is never sent to the browser,
logged, or written to a database row. Running the photo-recognition flow makes
a paid OpenRouter call.

Expected future requirements:

- Hosted Supabase / Netlify credentials for production deployment

Never commit `.env` or local credentials. This repository includes a safe `.env.example` for documented public scaffold settings.

## Documentation

- [Product Intent](intent.txt)
- Original project roadmap: [Complete Project Roadmap - 2026-08-18 historical
  snapshot](docs/roadmaps/2026-08-18-complete-project-roadmap.md) - this is the
  original planning document, preserved unchanged and intentionally historical.
  Every milestone status inside it reflects what was known or planned on
  2026-08-18, **not** current state. Current implementation status is tracked by
  this README, the feature specs, the verification evidence, the pull requests,
  and Git history - not by that file.
- [Architecture](docs/architecture.md)
- [Data Model](docs/data-model.md)
- [AI Design](docs/ai-design.md)
- [API Integrations](docs/api-integrations.md)
- [Security](docs/security.md)
- [Verification](docs/verification.md)
- [Initial Project Plan](docs/plans/001-initial-project-plan.md)
- [Approved Initial Architecture Decision](docs/decisions/0001-approved-initial-architecture.md)
- [Music Catalog API Spike](docs/specs/0001-music-catalog-api-spike.md)
- [Decision Records](docs/decisions/README.md)
- [Feature Specs](docs/specs/README.md)

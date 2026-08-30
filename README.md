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

Current status: Milestone 7 (Ratings / Favorites / Notes - personal preference
signals on owned collection items) is merged to `main`. Milestone 8 (Listening
History - immutable `listening_events`, derived listening count / last-listened,
and a reverse-chronological history) is in planning on branch
`claude/milestone-8-listening-history`: the specification (`docs/specs/0009-...`)
and implementation plan (`docs/plans/009-...`) are drafted and awaiting human
approval; no Milestone 8 code has been written. Hosted/production verification
and production deployment have not occurred and remain later milestones.

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

Planned:

- Listening history (Milestone 8, in planning)
- AI recommendation workflow
- Production deployment

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

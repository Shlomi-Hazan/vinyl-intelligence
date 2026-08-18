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

Current status: Milestone 2 authentication/profile foundation implemented on the active milestone branch.

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

Planned:

- Catalog search/add flow
- Collection browsing
- Listening history
- AI recommendation workflow
- Photo recognition workflow
- Production deployment

## Local Setup

The project uses Node.js 24 and npm.

```bash
nvm use
npm install
npm run dev
```

Milestone 2 requires browser-safe Supabase settings. Copy `.env.example` to a
local `.env` file and fill in local or hosted Supabase values. Do not commit
`.env`.

For the local Supabase stack:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase db lint
```

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

No service-role key is required for Milestone 2. Browser code must use only
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

Expected future requirements:

- Music catalog API credentials if required
- LLM provider API key

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

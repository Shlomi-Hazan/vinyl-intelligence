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

No application code has been implemented yet.

## Project Status

Current status: Milestone 1 stack scaffold implemented on the active milestone branch.

Implemented:

- Product intent copied into the repository
- Initial engineering documentation structure
- Codex project instructions
- Approved initial architecture decisions, data model direction, AI/API/security constraints, verification approach, and milestone roadmap
- Vite, React, TypeScript, Netlify Functions, linting, type-checking, testing, and build scaffold

Planned:

- Authentication
- Database migrations and RLS policies
- Catalog search/add flow
- Collection browsing
- Listening history
- AI recommendation workflow
- Photo recognition workflow
- Production deployment

## Local Setup

Milestone 1 uses Node.js 24 and npm.

```bash
nvm use
npm install
npm run dev
```

The local Vite development server exposes the minimal application shell. With
the Netlify Vite integration active, the scaffold health function is available
at:

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

No secrets are required for Milestone 1. Future milestones will introduce
documented environment variables only after their specifications are approved.

Expected future requirements:

- Supabase project credentials
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

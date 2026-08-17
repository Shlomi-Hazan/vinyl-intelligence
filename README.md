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

- Frontend: React with TypeScript, likely Vite unless the implementation plan chooses Next.js for stronger full-stack routing.
- Backend: server-side API boundary for all privileged work, likely Supabase Edge Functions or framework API routes.
- Database/Auth/Storage: Supabase Postgres, Supabase Auth, and Supabase Storage.
- AI: server-side LLM API access, with OpenRouter as the initial candidate.
- Music metadata: Discogs as the likely primary vinyl/release catalog, with MusicBrainz as a serious alternative or fallback after provider verification.
- Deployment: Netlify for the frontend if paired with Supabase backend services, or an equivalent modern deployment target if the framework choice changes.

No application code has been implemented yet.

## Project Status

Current status: planning and engineering foundation.

Implemented:

- Product intent copied into the repository
- Initial engineering documentation structure
- Codex project instructions
- Initial architecture, data model, AI, API, security, verification, and roadmap documents

Planned:

- Application scaffold
- Authentication
- Database migrations and RLS policies
- Catalog search/add flow
- Collection browsing
- Listening history
- AI recommendation workflow
- Photo recognition workflow
- Production deployment

## Local Setup

Local setup will be documented after the stack is approved and the application scaffold exists.

Expected future requirements:

- Node.js and npm or pnpm
- Supabase project credentials
- Music catalog API credentials if required
- LLM provider API key

Never commit `.env` or local credentials. A safe `.env.example` should be added when the first runtime configuration is defined.

## Documentation

- [Product Intent](intent.txt)
- [Architecture](docs/architecture.md)
- [Data Model](docs/data-model.md)
- [AI Design](docs/ai-design.md)
- [API Integrations](docs/api-integrations.md)
- [Security](docs/security.md)
- [Verification](docs/verification.md)
- [Initial Project Plan](docs/plans/001-initial-project-plan.md)
- [Decision Records](docs/decisions/README.md)
- [Feature Specs](docs/specs/README.md)

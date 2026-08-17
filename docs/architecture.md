# Architecture Proposal

Last updated: 2026-08-17.

This document is based on `intent.txt` and the human architecture review completed on 2026-08-17.

## System Shape

Vinyl Intelligence should be a real deployed web application with four clear parts:

- Browser frontend for UI, interaction, camera/file selection, and normal collection browsing.
- Server-side backend boundary for authentication enforcement, validation, external API calls, LLM calls, recommendation orchestration, image recognition, logging, and rate protection.
- Relational database for users, releases, collection items, listening events, ratings/favorites, model-call audit records, and optional bounded conversation state.
- Deployment/runtime environment that can be demonstrated from a real URL.

The frontend must never contain private API keys, service-role credentials, privileged prompts, or authoritative security logic.

## Approved Baseline

| Area | Proposed technology | Responsibility | Why it fits | Disadvantages | Reasonable alternative | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| Frontend | Vite + React + TypeScript | Responsive collection UI, forms, filters, album pages, curator UI, camera/upload UX | Small, understandable, fast for a university project, works well with Supabase client libraries and Netlify | Does not provide backend routes by itself | Next.js with TypeScript | Approved. Keep frontend focused on browser UI and non-privileged Supabase client usage. |
| Backend API | Netlify Functions | Server-only catalog calls, LLM calls, image workflow, validation, orchestration, lightweight telemetry | Keeps secrets out of the browser, fits Netlify deployment, and avoids mixing privileged logic into the Vite client | Function/runtime boundaries must be designed carefully; local development needs Netlify tooling | Supabase Edge Functions or Next.js API routes | Approved. Use Netlify Functions for privileged server-side logic. |
| Database | Supabase Postgres | Relational persistence, ownership, release metadata, history, audit records | Natural fit for structured collection data and RLS | Requires careful policy design | Neon Postgres + custom auth | Approved. Use Supabase Postgres. |
| Auth | Supabase Auth | Sign up, login, session identity, user ownership | Direct integration with Postgres RLS | Vendor-specific auth concepts | Auth.js, Clerk | Approved. Use Supabase Auth. |
| Storage | Supabase Storage | Temporary cover-photo uploads for identification attempts | RLS-aware storage policies and simple integration with Supabase Auth | Requires cleanup discipline so temporary uploads do not become accidental retention | Cloudinary, S3 | Approved. Uploaded cover photos are temporary and should be deleted after the identification flow unless a future retention reason is explicitly approved. |
| AI provider | OpenRouter server-side | Text intent extraction, recommendation explanation, vision model access if chosen model supports image input | One gateway for multiple models; documented structured outputs and multimodal image inputs | Model capabilities, latency, and cost vary by model/provider; another vendor dependency | Direct OpenAI, Anthropic, Google APIs | Recommend OpenRouter initially if course constraints allow it, but verify exact text and vision models before implementation. |
| Music catalog | Discogs and MusicBrainz to be compared in a documented API spike | Release search, artist/title, release year, label, format, tracklist, genres/styles, external release IDs | The project needs evidence-based provider selection against product requirements | Provider terms, rate limits, auth, image usage, and metadata quality may change | Use one provider first, add the other only if justified | Approved process: run a small API spike before implementation. Do not select a provider by preference alone. |
| Deployment | Netlify | Public app URL, frontend hosting, and Netlify Functions runtime | Fits Vite frontend and approved backend function choice | Requires Netlify account/project configuration and environment management | Vercel, Render, Supabase Edge Functions plus static host | Approved. Use Netlify. |
| Source control | GitHub | Version control, audit trail, milestone branches, PR review | Required for project history and reviewability | Requires disciplined branch/PR flow | GitLab | Approved. Meaningful milestones use branches and PRs before merging to `main`. |

## Proposed Runtime Boundaries

```text
Browser
  -> authenticated frontend client
  -> Netlify Functions for privileged backend work
  -> Supabase Postgres/Auth/Storage
  -> music catalog APIs
  -> LLM/vision provider
```

The browser may call Supabase with publishable credentials for normal authenticated reads/writes only where RLS policies are authoritative. Privileged actions such as service-role access, catalog calls requiring secrets, LLM calls, image processing, and recommendation orchestration must go through Netlify Functions.

## Approved Data Boundaries

- Store release-level provider identifiers where available.
- Keep the normal UI album-first so users are not forced to think in pressing/release details.
- Treat `listening_events` as the initial source of truth for listening count and last-listened state.
- Avoid denormalizing `listening_count` and `last_listened_at` into `collection_items` until there is a demonstrated performance or UX need.
- Uploaded cover photos are temporary and should be deleted after the identification flow unless future retention is explicitly approved.
- Do not permanently store full AI curator chat transcripts for MVP.
- Store only bounded structured conversation state if persistence becomes necessary.

## Recommendation Workflow

The first recommendation architecture should be an orchestrated workflow, not a multi-agent system.

1. LLM interprets a natural-language request into structured intent.
2. Backend validates the structured intent.
3. Backend retrieves candidate `collection_items` owned by the user.
4. Backend filters and ranks candidates deterministically where possible.
5. LLM may select/explain only from the allowed candidate IDs.
6. Backend validates returned IDs before returning the response.

## Image Recognition Workflow

1. User uploads or captures a cover image.
2. Backend validates file type and size.
3. Backend stores it temporarily or sends it directly to a vision model.
4. Vision model extracts artist/title/artwork clues.
5. Backend searches catalog API with extracted clues.
6. UI shows candidate releases.
7. User confirms or rejects.
8. Backend persists only the confirmed release/collection item.

## Initial Recommendation

Use Vite + React + TypeScript for the frontend, Netlify Functions for privileged backend logic, Supabase for Auth/Postgres/Storage, OpenRouter as the initial AI-provider candidate, and a documented Discogs/MusicBrainz API spike before choosing the music catalog provider.

Do not scaffold the application until the milestone specification and implementation plan are explicitly approved by the human.

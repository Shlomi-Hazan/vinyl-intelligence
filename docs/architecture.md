# Architecture Proposal

Last updated: 2026-08-17.

This proposal is based on `intent.txt`. It is not a production implementation decision until reviewed.

## System Shape

Vinyl Intelligence should be a real deployed web application with four clear parts:

- Browser frontend for UI, interaction, camera/file selection, and normal collection browsing.
- Server-side backend boundary for authentication enforcement, validation, external API calls, LLM calls, recommendation orchestration, image recognition, logging, and rate protection.
- Relational database for users, releases, collection items, listening events, ratings/favorites, model-call audit records, and optional bounded conversation state.
- Deployment/runtime environment that can be demonstrated from a real URL.

The frontend must never contain private API keys, service-role credentials, privileged prompts, or authoritative security logic.

## Recommended Baseline

| Area | Proposed technology | Responsibility | Why it fits | Disadvantages | Reasonable alternative | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| Frontend | React + TypeScript, likely Vite | Responsive collection UI, forms, filters, album pages, curator UI, camera/upload UX | Small, understandable, fast for a university project, works well with Supabase client libraries | Does not provide backend routes by itself | Next.js with TypeScript | Use Vite React if backend lives in Supabase/Netlify functions. Use Next.js only if we want app routes and API routes in one framework. |
| Backend API | Supabase Edge Functions or Netlify Functions | Server-only catalog calls, LLM calls, image workflow, validation, orchestration, logging | Keeps secrets out of the browser and pairs well with Supabase Auth/Postgres | Edge Functions use Deno; Netlify Functions add another deployment surface | Next.js API routes | Prefer Supabase Edge Functions if Supabase is selected for DB/Auth/Storage; they are close to the data and keep the architecture compact. |
| Database | Supabase Postgres | Relational persistence, ownership, release metadata, history, audit records | Natural fit for structured collection data and RLS | Requires careful policy design | Neon Postgres + custom auth | Recommend Supabase Postgres because auth, RLS, storage, and functions reduce project glue. |
| Auth | Supabase Auth | Sign up, login, session identity, user ownership | Direct integration with Postgres RLS | Vendor-specific auth concepts | Auth.js, Clerk | Recommend Supabase Auth for MVP simplicity and RLS alignment. |
| Storage | Supabase Storage | Temporary or retained image uploads for recognition attempts | RLS-aware storage policies and simple integration with Supabase Auth | Image retention policy must be explicit | Cloudinary, S3 | Recommend Supabase Storage for first version, with short retention for recognition uploads unless user confirms retention. |
| AI provider | OpenRouter server-side | Text intent extraction, recommendation explanation, vision model access if chosen model supports image input | One gateway for multiple models; documented structured outputs and multimodal image inputs | Model capabilities, latency, and cost vary by model/provider; another vendor dependency | Direct OpenAI, Anthropic, Google APIs | Recommend OpenRouter initially if course constraints allow it, but verify exact text and vision models before implementation. |
| Music catalog | Discogs primary candidate | Release search, artist/title, release year, label, format, tracklist, genres/styles, external release IDs | Vinyl/release-oriented and likely best match for collector semantics | Auth/rate limits/terms and image usage must be confirmed; official docs were not fully accessible via automated lookup | MusicBrainz + Cover Art Archive | Recommend evaluating Discogs first. Use MusicBrainz if Discogs access, licensing, or rate limits are not acceptable. |
| Deployment | Netlify frontend + Supabase backend | Public app URL and production demo | Simple React deployment and compatible with Supabase services | If backend functions are split between Netlify and Supabase, debugging may be more complex | Vercel, Supabase hosting alternatives | Recommend Netlify only if the selected frontend is Vite React. If Next.js is selected, reassess Vercel vs Netlify. |
| Source control | GitHub | Version control, audit trail, commits, PRs if used | Required for project history and reviewability | CLI auth must be fixed before remote creation | GitLab | Recommend GitHub once `gh auth login` is repaired. |

## Proposed Runtime Boundaries

```text
Browser
  -> authenticated frontend client
  -> backend API/functions
  -> Supabase Postgres/Auth/Storage
  -> music catalog APIs
  -> LLM/vision provider
```

The browser may call Supabase with publishable credentials for normal authenticated reads/writes only where RLS policies are authoritative. Privileged actions such as service-role access, catalog calls requiring secrets, LLM calls, image processing, and recommendation orchestration must go through backend functions.

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

Use Supabase for Auth/Postgres/Storage and backend functions, Vite React + TypeScript for the frontend, OpenRouter for AI, and evaluate Discogs as the primary catalog before falling back to MusicBrainz.

Do not scaffold the application until the stack and catalog provider decision are approved.

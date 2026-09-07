# Architecture

As-built section last updated: 2026-09-07 (Milestone 12). The original
2026-08-17 proposal is preserved below "As-Built Architecture" as the design
rationale; where they differ, the as-built section is authoritative.

---

## As-Built Architecture (current, supersedes the 2026-08-17 proposal)

Vinyl Intelligence is a deployed single-page web application, live at
`https://vinyl-intelligence.netlify.app`.

### Topology

```text
Browser (Vite + React 19 + TypeScript SPA on Netlify static hosting)
  | react-router-dom v7, route-level React.lazy code splitting
  | Supabase JS client with the browser-safe publishable key only; RLS authoritative
  v
Netlify Functions (netlify/functions/*.mts, esbuild, six deployable functions)
  |   /api/health                 - public liveness
  |   /api/catalog/search  (GET)  - MusicBrainz release search  [auth]
  |   /api/catalog/add     (POST) - upsert release + insert owning collection item  [auth, service role]
  |   /api/catalog/recognize (POST) - OpenRouter vision recognition  [auth, rate-limited]
  |   /api/curator/recommend (POST) - initial recommendation pipeline  [auth, rate-limited]
  |   /api/curator/refine    (POST) - bounded refinement pipeline  [auth, rate-limited]
  |   server-only secrets: SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
  v
Hosted Supabase (project dlkaljnywnrhzfxcfklx)      OpenRouter        MusicBrainz + Cover Art Archive
  Postgres + RLS, Auth (built-in email), Storage
```

### Frontend
- Vite 8 + React 19 + TypeScript (`verbatimModuleSyntax`, explicit `.ts`/`.tsx`
  import extensions, `noUnusedLocals`/`noUnusedParameters`, `erasableSyntaxOnly`,
  no enums).
- `react-router-dom` v7 with real routes: landing, auth, dashboard, collection,
  album detail (`/collection/:id`), discover (catalog add), scan (photo add),
  Ask VIN (curator), history, settings, 404. Every page is behind
  `React.lazy` + `Suspense`; landing/auth never eagerly pull authenticated pages.
- `public/_redirects` (`/*  /index.html  200`) makes every route deep-link and
  refresh safe.
- One shared post-auth data load via `CollectionDataProvider`
  (`src/app/CollectionDataProvider.tsx`) - route hosts read collection + listening
  events from context and never issue their own initial load. Search/filter/sort
  are deterministic and client-side: no LLM, no network request on a filter
  change.
- One canonical artwork component (`src/media/AlbumArtwork.tsx`): custom signed
  cover -> Cover Art Archive release front -> CAA release-group front -> branded
  CSS/SVG fallback, advancing only on `<img>` error, never looping. Cover Art
  images are plain client-built `<img src>` URLs from stored MusicBrainz ids;
  there is no `releases.cover_url` column and no image proxy.
- Design tokens in `src/styles/tokens.css`; duration tokens
  (`--dur-fast: 120ms`, `--dur: 200ms`, `--dur-slow: 320ms`); a global
  `prefers-reduced-motion` reset. Self-hosted WOFF2 fonts (`font-display: swap`),
  no runtime Google Fonts, no motion/icon/image library.
- The browser holds no server secret, no service-role credential, no
  privileged prompt, and no authoritative security rule.

### Backend (Netlify Functions)
- `.mts` handlers delegate to `netlify/functions/_shared/*-handlers.mts`; the
  Vitest coverage for them lives in `netlify/tests/` (kept out of the functions
  directory so it is not packaged as a function).
- Every provider-backed handler calls `authenticateRequest(...)` as its first
  statement - the browser bearer token is verified before any MusicBrainz /
  OpenRouter call. A missing/invalid token returns 401 with bounded JSON and
  makes no provider call.
- `SUPABASE_SERVICE_ROLE_KEY` is used server-side only, with explicit
  least-privilege SQL grants (`releases`: SELECT/INSERT/UPDATE, no DELETE;
  `collection_items`: SELECT/INSERT, no UPDATE/DELETE; `model_calls`: INSERT
  only). It is never used to read `collection_items` / `listening_events` /
  `profiles` for the curator - those reads go through the user's own token + RLS.
- Costly endpoints enforce per-user rate limits
  (`MAX_RECOGNITIONS_PER_WINDOW = 10`; a shared curator-intent budget), request
  size limits, hard retry limits, timeouts, and `model_calls` telemetry
  (provider, feature, success/failure, latency, token usage, error category).
- Error logging is category-only (`console.warn` for a failed telemetry
  insert); no secrets, no raw provider bodies, no unnecessary personal content.

### Database (hosted Supabase Postgres)
- 13 version-controlled migrations, all applied to the hosted project (zero
  pending). See `docs/data-model.md` for the as-built schema.
- RLS enabled and owner-scoped on every public table (`profiles`,
  `collection_items`, `listening_events`, `releases`, `model_calls`) and on both
  Storage buckets. `releases` is globally readable catalog metadata; writes go
  through the trusted backend.
- An `auth.users` insert trigger (`create_profile_after_auth_user_insert` ->
  `private.create_profile_for_new_user`, `SECURITY DEFINER`) creates the profile
  row.
- Two private Storage buckets: `collection-covers` (3 MiB, `image/webp` only)
  and `profile-avatars` (1 MiB, `image/webp` only). No public bucket listing.
  Signed URLs are short-TTL and memory-only - never written to a table,
  `localStorage`, or `sessionStorage`.

### AI (see `docs/ai-design.md` for detail)
- One OpenRouter gateway. Model roles: vision recognition and curator intent
  extraction use `google/gemini-3.1-flash-lite`; curator selection/explanation
  uses `google/gemini-3.5-flash` (`docs/decisions/0003`, `0004`).
- Curator: one compact structured-output intent call -> deterministic
  filter/rank over the RLS-owned collection -> <= 12 backend-generated allowed
  candidate IDs -> one selection/explanation call. Strict JSON schemas; the
  model may choose only from the allowed IDs and any out-of-set id rejects the
  whole response.
- Milestone 11 added an outer `{ inScope, intent }` wrapper on the intent /
  refinement structured output: an out-of-scope request stops before the
  selection call (no second model call) and returns a fixed bounded message.
- Vision: one call, `temperature: 0`, capped output, strict JSON schema. Trusted
  instructions are in a `system` message that frames all in-image text as
  untrusted data; recognition is a clue source only and never persists without
  user confirmation.
- Refinement conversation state is bounded and React-memory only: no table, no
  `sessionStorage` / `localStorage`, no server memory; cleared by refresh /
  logout / "Start over". No permanent transcript.

### Deployment
- Netlify site `vinyl-intelligence` (`fd95e6cf-309e-434a-99b6-8ae716ec694a`),
  default `*.netlify.app` domain, **no custom domain**, **no Git continuous
  deployment** - deploys are run manually from merged `main` with
  `netlify deploy --prod --context production`.
- 11 environment variables configured in the Netlify dashboard; the two secrets
  marked "contains secret values".
- Supabase Auth Site URL + redirect URL point at the `*.netlify.app` origin; the
  built-in Supabase email sender is used (no custom SMTP).
- Source: GitHub `Shlomi-Hazan/vinyl-intelligence`; meaningful milestones use a
  `claude/` branch and a reviewed PR before merge to `main`.

### Deliberately NOT in the architecture
No RAG / vector database. No multi-agent system. No Next.js. No Supabase Edge
Functions as the privileged backend. No `releases.cover_url` / image proxy. No
permanent curator transcript storage. No analytics / telemetry infrastructure
beyond `model_calls` + `/api/health`. No CI pipeline.

---

## Architecture Proposal (2026-08-17, historical - design rationale)

This section is based on `intent.txt` and the human architecture review completed on 2026-08-17.

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

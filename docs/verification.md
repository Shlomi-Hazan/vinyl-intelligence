# Verification Strategy

Last updated: 2026-08-18.

Verification must be based on written acceptance criteria, not on generated confidence.

## Required Verification Types

- Human approval check for each milestone specification and implementation plan before implementation begins
- Unit tests for deterministic recommendation filtering/ranking helpers
- Unit tests for model output validation schemas
- Integration tests for Netlify Functions where practical
- RLS/security tests for user ownership
- Manual verification for external API failure states
- Manual end-to-end demo checks in production before final submission
- Lint, type checking, and build for every meaningful code milestone

## Acceptance Areas

### Collection

- Logged-in user can add a record through catalog search.
- Saved record remains after refresh/login.
- User A cannot access User B's collection.
- User can edit and delete owned records.
- Duplicate behavior follows the documented rule.

### Search and Filtering

- Search by artist/title works.
- Filter by genre works.
- Filter by year and decade works.
- Combined filters behave predictably.
- Empty results display a clear state.

### Listening History

- Marking an album as played creates an event.
- Last-listened state is derived correctly from `listening_events`.
- Listening count is derived correctly from `listening_events`.
- History is displayed in reverse chronological order.

### Ratings and Favorites

- Rating persists.
- Favorite flag persists.
- AI receives only accurate stored values when these are used as signals.

### AI Curator

- Recommendation IDs always belong to the user's allowed candidate set.
- Explicit exclusions are respected.
- Recency requests use real listening history.
- "Surprise me" can surface less-played or forgotten records.
- Full AI curator chat transcripts are not permanently stored for MVP.
- Malformed model output is rejected.
- Model/API failure is visible to the user.

### Photo Identification

- Supported image can be uploaded.
- Unsupported or oversized image is rejected.
- Workflow produces candidate matches rather than silently saving a guess.
- User confirmation is required before save.
- Model-reported vision confidence is treated as advisory/debug information only.
- Temporary uploaded cover photos are deleted after the identification flow unless future retention is explicitly approved.
- No-match flow has manual fallback.

### Music Catalog API

- Discogs and MusicBrainz are compared in a documented spike before implementation.
- Provider selection is grounded in project requirements, sample searches, official documentation, and observed responses.
- Catalog calls happen through Netlify Functions, not directly from the browser when privileged access or secrets are involved.
- Release-level provider identifiers are stored where available.

### Security

- Secrets are absent from client bundles and repository.
- Backend authorization is tested.
- RLS policies enforce ownership.
- Upload validation exists.
- Model output is treated as untrusted.
- `model_calls` remains lightweight audit/telemetry and does not store unnecessary private content.

### Deployment

- Deployed URL is reachable.
- Critical flows work in production, not only locally.
- Environment variables are configured server-side only.

## Verification Evidence

Each milestone should record:

- Commands run
- Test/build results
- Manual checks performed
- Known gaps
- Links to relevant specs or decisions

Store durable evidence in docs or commit messages when useful.

## Milestone 1 Evidence - Stack Scaffold

Date: 2026-08-18

Branch: `codex/milestone-1-stack-scaffold`

Implementation commit reviewed: `72f0d22acb86a8b943ee2aefa7908619fea4814a`

### Command Results

| Check | Result |
| --- | --- |
| `node --version` | Passed: `v24.19.0` |
| `npm --version` | Passed: `11.17.0` |
| `npm run typecheck` | Passed: `tsc -b --noEmit` completed successfully |
| `npm run lint` | Passed: `eslint .` completed successfully |
| `npm run test:run` | Passed: 2 test files, 3 tests |
| `npm run build` | Passed: Vite built `dist/` successfully |
| `git diff --check` | Passed: no whitespace errors |
| `git status --short --branch` | Passed before evidence commit: branch was clean and tracking `origin/codex/milestone-1-stack-scaffold` |

### Local Runtime Verification

`npm run dev -- --port 5173 --strictPort` started the Vite development server with the Netlify Vite plugin active.

Observed local runtime output:

- Netlify environment loaded.
- Netlify middleware loaded.
- Local URL: `http://127.0.0.1:5173/`.

HTTP checks:

- `curl -I http://127.0.0.1:5173/` returned `HTTP/1.1 200 OK`.
- `curl -i http://127.0.0.1:5173/api/health` returned `HTTP/1.1 200 OK` with body `{"status":"ok"}`.

The health response contained no secrets, user data, environment variable values, system information, or external API data.

### Security and Scope Checks

Secret scan command searched the repository excluding `.git/`, `node_modules/`, `dist/`, `.netlify/`, and TypeScript build-info files for common API key, GitHub token, Supabase service-role key, Discogs token, and bearer-token patterns.

Result: passed, no matches.

Oxlint scan:

- Checked `package.json`, `package-lock.json`, `eslint.config.js`, `vite.config.ts`, `src/`, and `netlify/`.
- Result: passed, no Oxlint dependency, script, or configuration remains.

Out-of-scope product-code scan:

- Checked implementation files for Supabase, Discogs, MusicBrainz, OpenRouter, LLM, RAG, vector database, recommendation logic, listening history, ratings/favorites, auth/login, database migration, and RLS references.
- Result: passed, no out-of-scope product code found.

### Production Audit

`npm audit --omit=dev` result: passed, `found 0 vulnerabilities`.

The deployed production app does not bundle or run the Netlify local-development packages that appear in the full development audit.

### Development Dependency Audit Triage

`npm audit --json` reported 9 high-severity findings and 0 critical findings. All high findings are in development-only transitive dependencies reachable from `@netlify/vite-plugin@2.12.9`.

`@netlify/vite-plugin@2.12.9` is the direct dev dependency. `npm outdated @netlify/vite-plugin --json` returned `{}`, and `npm view @netlify/vite-plugin version` returned `2.12.9`, so no normal newer plugin update was available during this verification pass.

| Finding | Installed Version | Advisory / Identifier | Severity | Dependency Path | Runtime or Dev-Only | Production Reachability | Patched Version / npm Fix | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `extract-zip` | `2.0.1` | `GHSA-jmr9-qjv8-65gv`; CWE-22; vulnerable range `<=2.0.1` | High | `@netlify/vite-plugin@2.12.9 -> @netlify/dev@4.18.13 -> @netlify/functions-dev@1.3.5 -> extract-zip@2.0.1` | Dev-only | Not reachable in the deployed frontend or health function. Potentially reachable only through local/build tooling paths that process archives. | `npm view extract-zip version` returned `2.0.1`; no newer package version was available. npm proposes changing `@netlify/vite-plugin` to `2.1.4` with `isSemVerMajor: true`, which requires a forced/breaking audit fix. | Do not force-fix in Milestone 1. Track upstream Netlify/dependency remediation. |
| `image-size` | `2.0.2` | `GHSA-w3rx-r6r6-pgpr`; `GHSA-5p2g-fcmc-qvqq`; CWE-835; vulnerable range `<=2.0.2` | High | `@netlify/vite-plugin@2.12.9 -> @netlify/dev-utils@4.4.7 -> image-size@2.0.2` | Dev-only | Not reachable in the deployed frontend or health function. Potentially reachable only through development/build tooling that inspects image metadata. | `npm view image-size version` returned `2.0.2`; no newer package version was available. npm proposes changing `@netlify/vite-plugin` to `2.1.4` with `isSemVerMajor: true`, which requires a forced/breaking audit fix. | Do not force-fix in Milestone 1. Track upstream Netlify/dependency remediation. |
| `sharp` | `0.34.5` | `GHSA-f88m-g3jw-g9cj`; CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591; vulnerable range `<0.35.0` | High | `@netlify/vite-plugin@2.12.9 -> @netlify/dev@4.18.13 -> @netlify/images@1.3.12 -> ipx@3.1.1 -> sharp@0.34.5` | Dev-only | Not reachable in the deployed frontend or health function. The scaffold does not use Netlify image processing or user-uploaded images. | `npm view sharp version` returned `0.35.3`, but it is transitive under `ipx`. npm proposes changing `@netlify/vite-plugin` to `2.1.4` with `isSemVerMajor: true`, which requires a forced/breaking audit fix. | Do not override transitive dependencies or force-fix in Milestone 1. Track upstream Netlify/IPX remediation. |
| `ipx` | `3.1.1` | Transitive via `sharp`; vulnerable range `<=4.0.0-alpha.1` | High | `@netlify/vite-plugin@2.12.9 -> @netlify/dev@4.18.13 -> @netlify/images@1.3.12 -> ipx@3.1.1` | Dev-only | Not reachable in the deployed frontend or health function. The scaffold does not use Netlify image processing. | `npm view ipx version` returned `4.0.0-beta.1`. npm still proposes changing `@netlify/vite-plugin` to `2.1.4` with `isSemVerMajor: true`, not a normal update. | Do not force-fix in Milestone 1. Track upstream Netlify/IPX remediation. |
| `@netlify/functions-dev` | `1.3.5` | Transitive via `extract-zip` | High | `@netlify/vite-plugin@2.12.9 -> @netlify/dev@4.18.13 -> @netlify/functions-dev@1.3.5` | Dev-only | Not reachable in the deployed frontend or health function. Used for local Netlify Function emulation. | `npm view @netlify/functions-dev version` returned `1.3.5`. npm proposes changing `@netlify/vite-plugin` to `2.1.4` with `isSemVerMajor: true`. | Keep the approved Netlify local integration; monitor upstream package updates. |
| `@netlify/images` | `1.3.12` | Transitive via `ipx` and `sharp` | High | `@netlify/vite-plugin@2.12.9 -> @netlify/dev@4.18.13 -> @netlify/images@1.3.12` | Dev-only | Not reachable in the deployed frontend or health function. The scaffold does not use Netlify image processing. | `npm view @netlify/images version` returned `1.3.12`. npm proposes changing `@netlify/vite-plugin` to `2.1.4` with `isSemVerMajor: true`. | Keep the approved Netlify local integration; monitor upstream package updates. |
| `@netlify/dev-utils` | `4.4.7` for the direct plugin path; `5.0.0` also appears under `@netlify/dev` | Transitive via `image-size` for the `4.4.7` path; vulnerable range `3.2.0 - 4.4.7` | High | `@netlify/vite-plugin@2.12.9 -> @netlify/dev-utils@4.4.7 -> image-size@2.0.2` | Dev-only | Not reachable in the deployed frontend or health function. | `npm view @netlify/dev-utils version` returned `5.0.0`, but the direct dependency range is controlled by `@netlify/vite-plugin`. npm proposes changing `@netlify/vite-plugin` to `2.1.4` with `isSemVerMajor: true`. | Do not override transitive dependencies in Milestone 1. Track upstream Netlify plugin update. |
| `@netlify/dev` | `4.18.13` | Transitive via `@netlify/functions-dev` and `@netlify/images` | High | `@netlify/vite-plugin@2.12.9 -> @netlify/dev@4.18.13` | Dev-only | Not reachable in the deployed frontend or health function. Used by local Netlify/Vite emulation. | `npm view @netlify/dev version` returned `4.18.13`. npm proposes changing `@netlify/vite-plugin` to `2.1.4` with `isSemVerMajor: true`. | Keep current approved integration; monitor upstream Netlify package updates. |
| `@netlify/vite-plugin` | `2.12.9` | Aggregates vulnerable transitive dependencies `@netlify/dev` and `@netlify/dev-utils`; no direct advisory ID in audit JSON | High | Direct dev dependency: `@netlify/vite-plugin@2.12.9` | Dev-only/build tooling | Not bundled into the deployed frontend or health function. It is used for local Netlify platform emulation and Vite integration. | Already latest. npm proposes `@netlify/vite-plugin@2.1.4` with `isSemVerMajor: true`, which is a forced/breaking downgrade rather than a normal safe update. | Do not run `npm audit fix --force`. Keep current approved plugin for Milestone 1 and revisit when Netlify publishes a non-breaking remediation or the human approves a dependency strategy change. |

Remediation decision: no dependency changes were made. A forced/breaking audit fix would change the approved Netlify integration surface and is not justified for Milestone 1 because production audit is clean, the vulnerable packages are dev-only, and no deployed product code reaches them.

### Netlify Preview Status

Remote Netlify deployment verification has not yet been performed because authenticated Netlify site/project access has not been established in this workflow.

The official Vite integration was sufficient for local Function verification. This is not treated as a Milestone 1 implementation blocker because the approved plan made early Netlify preview deployment conditional on practical Netlify authentication and project access.

### Known Remaining Risks

- Development-only `npm audit` findings remain in the Netlify local development integration dependency chain.
- The project should re-run `npm audit` before merging future dependency changes and revisit the Netlify plugin chain when upstream packages publish a normal non-breaking remediation.
- Production deployment verification remains pending until Netlify project access is available.

## Milestone 2 Evidence - Supabase Auth + Profile/RLS

Date: 2026-08-18

Branch: `codex/milestone-2-supabase-auth-profile-rls`

Planning approval commit: `62fe536ef7b21a138bea383d1fbc1c2afddf4411`

Implementation commits:

- `00937c7` - `docs: approve milestone 2 implementation`
- `40f5297` - `chore: add Supabase local auth foundation`
- `02e250e` - `db: add profile ownership and RLS foundation`
- `a46a8b8` - `feat: add authenticated profile workflow`
- `e79e2b8` - `chore: tighten milestone 2 local setup`

### Tool and Dependency Versions

| Item | Result |
| --- | --- |
| `node --version` | `v24.19.0` |
| `npm --version` | `11.17.0` |
| Docker | `Docker version 29.7.2, build a7dcaa6` |
| Docker Server | `29.7.2`, Docker Desktop, `aarch64` |
| Docker Compose | `v5.4.0` |
| `@supabase/supabase-js` | `2.112.3` |
| Supabase CLI npm package | `2.115.0` |
| `@testing-library/user-event` | `14.6.5` |

### Implemented Database Boundary

Migration: `supabase/migrations/20260818134203_create_profiles.sql`

Implemented `public.profiles`:

- `id uuid primary key references auth.users(id) on delete cascade`
- `display_name text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Display-name constraint:

```sql
display_name is null
or (
  display_name = btrim(display_name)
  and char_length(display_name) between 1 and 80
)
```

Trigger/helper design:

- `private` schema exists and is not granted to `anon` or `authenticated`.
- `private.create_profile_for_new_user()` is `security definer`, uses `set search_path = ''`, and inserts only `public.profiles(id) = new.id`.
- The creation trigger is `create_profile_after_auth_user_insert` on `auth.users`.
- `private.touch_profile_updated_at()` is `security definer`, uses `set search_path = ''`, and updates `updated_at` before `display_name` changes.
- `execute` is explicitly revoked from `public`, `anon`, and `authenticated` for both helper functions.

Table privilege behavior:

```sql
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
```

RLS policies:

- `Users can select their own profile`: `for select to authenticated using ((select auth.uid()) = id)`.
- `Users can update their own profile`: `for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id)`.

No `anon`, `insert`, `delete`, broad authenticated select, service-role application, collection, catalog, AI, or storage policies were added.

### Command Results

| Check | Result |
| --- | --- |
| `npx supabase start` | Passed. Local API, DB, Studio, and Mailpit became available. |
| `npx supabase db reset` | Passed. Migration `20260818134203_create_profiles.sql` applied from a clean local database. |
| `npx supabase test db` | Passed: 1 database test file, 43 tests. |
| `npx supabase db lint` | Passed: no schema errors found. |
| `npm run typecheck` | Passed: `tsc -b --noEmit`. |
| `npm run lint` | Passed: `eslint .`. |
| `npm run test:run` | Passed: 3 test files, 11 tests. |
| `npm run build` | Passed: Vite built `dist/` successfully. |
| `git diff --check` | Passed during implementation checkpoints. |

### Database/RLS/Privilege Evidence

`supabase/tests/database/profiles_rls.test.sql` behaviorally verifies:

- `public.profiles` exists.
- `profiles.id` is primary key and references `auth.users(id)` with `on delete cascade`.
- RLS is enabled.
- Only the two expected policies exist.
- `anon` cannot read profiles.
- User A can select User A profile.
- User A cannot select User B profile.
- User A can update User A `display_name`.
- User A cannot update User B profile.
- Authenticated clients cannot directly insert or delete profiles.
- Authenticated clients cannot update protected columns `id`, `created_at`, or `updated_at`.
- Invalid display names fail at the database layer: blank, whitespace-only, untrimmed, and over 80 characters.
- A valid display name succeeds.
- New `auth.users` rows create exactly one profile row through the trigger.
- Trigger-created profiles do not copy display-name metadata.
- Normal API roles cannot execute privileged helper functions.
- Helper function permissions are explicit.
- Deleting an auth user cascades to its profile.
- `updated_at` changes after an allowed display-name update.

### Local Runtime and Auth Smoke

Codex automated/local runtime verification:

- Started the Vite/Netlify dev runtime with local browser-safe Supabase values passed as process environment variables.
- Did not write or commit a real `.env`.
- `curl -i http://127.0.0.1:5173/` returned `HTTP/1.1 200 OK`.
- `curl -i http://127.0.0.1:5173/api/health` returned `HTTP/1.1 200 OK` with body `{"status":"ok"}`.
- Mailpit was reachable at `http://127.0.0.1:54324`.

Codex automated/local Auth smoke results:

- `signup_status=200`
- `signup_has_session=false`
- `signup_confirmation_sent=true`
- `mailpit_message_found=true`
- `confirmation_link_found=true`
- `confirmation_status=303`
- `confirmation_redirect=true`
- `signin_status=200`
- `profile_select_status=200`
- `profile_rows=1`
- `profile_initial_display_name=null`
- `profile_update_status=200`
- `profile_updated_display_name=Smoke User`
- `signout_status=204`

This confirms the local email-confirmation flow, Mailpit delivery, redirect configuration, sign-in, trigger-created profile, profile read/update through RLS, and sign-out behavior.

Human browser verification was not performed or claimed in this milestone evidence.

### Environment and Secret Checks

- `.env.example` contains only browser-safe placeholders: `VITE_APP_NAME`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- No real `.env` file was created or committed.
- No service-role key, secret key, database URL, JWT secret, SMTP password, OAuth secret, catalog key, or LLM key was introduced into application configuration.
- Milestone 2 does not create a service-role Supabase client or Netlify Function for normal profile access.
- Supabase generated local runtime artifacts are ignored under `supabase/.temp`.
- Storage, S3 protocol, and storage vector features are disabled in local Supabase config for this milestone.

### Scope Checks

No Milestone 3 or later product functionality was implemented:

- No `releases` or `collection_items` schema.
- No collection CRUD.
- No Discogs, MusicBrainz, or Cover Art Archive integration.
- No Supabase Storage product workflow.
- No OpenRouter, LLM calls, recommendations, image recognition, listening history, ratings, favorites, notes, RAG, vector database, or multi-agent system.
- No OAuth, magic-link-only login, password reset, or MFA.

Oxlint scan: no Oxlint dependency or configuration was introduced.

### Production Audit

`npm audit --omit=dev` result: passed, `found 0 vulnerabilities`.

No high or critical production dependency vulnerability was reported.

### Development Dependency Audit Triage

`npm audit --json` reported 9 high-severity findings and 0 critical findings. All findings remain in development-only transitive dependencies reachable through the existing Netlify local-development tooling chain, consistent with Milestone 1 audit context.

The direct vulnerable aggregate remains `@netlify/vite-plugin@2.12.9`. npm proposes `@netlify/vite-plugin@2.1.4` with `isSemVerMajor: true`, which is not a normal safe update and would be a forced/breaking remediation path. No `npm audit fix` or `npm audit fix --force` was run.

| Finding | Advisory / Identifier | Severity | Dependency Path | Runtime or Dev-Only | Production Reachability | npm Fix | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `extract-zip` | `GHSA-jmr9-qjv8-65gv`; npm audit range `<=2.0.1` | High | `@netlify/vite-plugin -> @netlify/dev -> @netlify/functions-dev -> extract-zip` | Dev-only | Not bundled or reachable in deployed frontend/profile workflow. | Forced/breaking via `@netlify/vite-plugin@2.1.4`. | Monitor upstream; no forced fix. |
| `image-size` | `GHSA-w3rx-r6r6-pgpr`; `GHSA-5p2g-fcmc-qvqq` | High | `@netlify/vite-plugin -> @netlify/dev-utils -> image-size` | Dev-only | Not bundled or reachable in deployed frontend/profile workflow. | Forced/breaking via `@netlify/vite-plugin@2.1.4`. | Monitor upstream; no forced fix. |
| `sharp` | `GHSA-f88m-g3jw-g9cj`; CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 | High | `@netlify/vite-plugin -> @netlify/dev -> @netlify/images -> ipx -> sharp` | Dev-only | Not bundled or reachable; milestone does not use image processing. | Forced/breaking via `@netlify/vite-plugin@2.1.4`. | Monitor upstream; no forced fix. |
| `ipx` | Transitive via `sharp` | High | `@netlify/vite-plugin -> @netlify/dev -> @netlify/images -> ipx` | Dev-only | Not bundled or reachable; milestone does not use image processing. | Forced/breaking via `@netlify/vite-plugin@2.1.4`. | Monitor upstream; no forced fix. |
| `@netlify/functions-dev` | Transitive via `extract-zip` | High | `@netlify/vite-plugin -> @netlify/dev -> @netlify/functions-dev` | Dev-only | Local function emulation only. | Forced/breaking via `@netlify/vite-plugin@2.1.4`. | Monitor upstream; no forced fix. |
| `@netlify/images` | Transitive via `ipx` / `sharp` | High | `@netlify/vite-plugin -> @netlify/dev -> @netlify/images` | Dev-only | Local/build tooling only; no image workflow in Milestone 2. | Forced/breaking via `@netlify/vite-plugin@2.1.4`. | Monitor upstream; no forced fix. |
| `@netlify/dev-utils` | Transitive via `image-size` | High | `@netlify/vite-plugin -> @netlify/dev-utils` | Dev-only | Local/build tooling only. | Forced/breaking via `@netlify/vite-plugin@2.1.4`. | Monitor upstream; no forced fix. |
| `@netlify/dev` | Transitive aggregate via `@netlify/functions-dev` and `@netlify/images` | High | `@netlify/vite-plugin -> @netlify/dev` | Dev-only | Local Netlify/Vite emulation only. | Forced/breaking via `@netlify/vite-plugin@2.1.4`. | Monitor upstream; no forced fix. |
| `@netlify/vite-plugin` | Aggregates `@netlify/dev` and `@netlify/dev-utils` | High | Direct dev dependency | Dev-only/build tooling | Not bundled into deployed frontend/profile workflow. | Forced/breaking downgrade/remediation suggestion. | Keep approved integration; monitor upstream. |

### Hosted Supabase Smoke Status

Hosted Supabase smoke testing was not performed because hosted Supabase project credentials/access were not established in this workflow.

Local Supabase CLI verification is the approved required verification path for Milestone 2 and passed.

### Known Gaps

- Human browser verification remains pending.
- Hosted Supabase smoke testing remains pending until project access and non-production credentials are available.
- Dev-only Netlify tooling audit findings remain pending upstream remediation.

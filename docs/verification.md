# Verification Strategy

Last updated: 2026-08-29.

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

Human browser verification was not performed or claimed in this automated
milestone evidence. It was completed later and is recorded separately below.

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

- Hosted Supabase smoke testing remains pending until project access and non-production credentials are available.
- Dev-only Netlify tooling audit findings remain pending upstream remediation.

## Milestone 2 Human Review Correction Pass

Date: 2026-08-18

Branch: `codex/milestone-2-supabase-auth-profile-rls`

Reviewed implementation baseline: `d334df01f1149901293be18f93f44cc37951aa74`

Human review found two focused issues:

- Recoverable auth/profile action errors moved the app into the fatal `error`
  shell, preventing normal retry paths.
- The Milestone 2 specification and plan were marked implemented but still
  contained unresolved pre-approval wording at the bottom of each document.

Corrections made:

- Failed password sign-in now keeps the unauthenticated auth form visible and
  shows the Supabase-safe error there.
- Failed sign-up now keeps the unauthenticated auth form visible and allows
  retry.
- Failed profile update now keeps the authenticated protected profile UI visible
  and shows the error there.
- Failed sign-out no longer fabricates an unauthenticated state; the
  authenticated profile UI remains visible and sign-out can be retried.
- Initial/config/session-boundary failures may still use the fatal `error`
  shell.
- Milestone 2 spec/plan approval-gate sections now explicitly state that the
  listed pre-implementation decisions were resolved through human review,
  planning refinement commit `62fe536ef7b21a138bea383d1fbc1c2afddf4411`,
  implementation approval commit `00937c73e7ccb8e67b151f6b0c7d3e3c22a68059`,
  and subsequent approved implementation.
- README local setup now explains how to read the local Supabase `API URL` and
  browser-safe `anon key` from `npx supabase status`, and warns not to copy
  service-role, JWT, database, or other privileged credentials into `VITE_`
  variables.

Additional frontend tests:

- Failed password sign-in shows the error, leaves the sign-in form usable, and
  supports retry.
- Failed signup shows the error and keeps signup/sign-in controls available.
- Failed profile update shows the error while the protected profile remains
  visible.
- Failed sign-out preserves the authenticated profile UI and supports retry.

Command results:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run test:run` | Passed: 3 test files, 15 tests. |
| `npm run build` | Passed. |
| `npx supabase test db` | Passed: 1 database test file, 43 tests. |
| `npx supabase db lint` | Passed: no schema errors found. |

Database migration/RLS architecture was not changed during this correction pass.

## Milestone 2 Human Runtime Verification

Date: 2026-08-18

Branch: `codex/milestone-2-supabase-auth-profile-rls`

Verified baseline before this documentation update:
`6ec0b6cc36834a3cb550388b47237db48e8e1eae`

This section records human browser/runtime verification performed personally by
the human against the local Supabase development stack and local Vite/Netlify
runtime.

### Human-Verified Environment

- Branch confirmed: `codex/milestone-2-supabase-auth-profile-rls`.
- Working tree was clean before runtime verification.
- `npx supabase status` confirmed the local Supabase development stack was
  running.
- Local Project/API URL: `http://127.0.0.1:54321`.
- Local Studio: `http://127.0.0.1:54323`.
- Local Mailpit: `http://127.0.0.1:54324`.
- Vite/Netlify runtime started successfully at `http://127.0.0.1:5173`.

### Human Browser Results

- The unauthenticated Vinyl Intelligence auth screen rendered successfully.
- The human created a new local test account:
  `shlomi.m2.test@example.com`.
- After Create account, the app remained unauthenticated and showed:
  `Check your email to confirm your account before signing in.`
- Mailpit at port `54324` contained the confirmation email.
- The confirmation email recipient matched the test account.
- The confirmation email subject was `Confirm your email address`.
- Clicking the confirmation link completed confirmation, returned the browser to
  the local Vinyl Intelligence app, and displayed the authenticated protected
  profile UI.
- The trigger-created profile was available automatically; no browser-side
  profile creation was required.
- Setting display name to `Shlomi Test` and saving showed `Profile saved.` and
  left the value visible.
- Refreshing the browser preserved the authenticated session and loaded
  `Shlomi Test` again from the profile.
- Signing out returned the application to the normal unauthenticated sign-in
  screen.
- The reviewed recoverable-login fix was verified: the human entered the correct
  email with an intentionally wrong password, saw `Invalid login credentials`,
  and the normal auth form remained visible and usable instead of entering the
  fatal error shell.
- Entering the correct password afterward succeeded, returned to the protected
  profile UI, and loaded the persisted `Shlomi Test` display name.
- Display-name input longer than 80 characters was rejected by the UI and Save
  profile became disabled.
- Clearing the display-name field completely and saving succeeded, showed
  `Profile saved.`, and behaved as the approved nullable/`NULL` state.
- Opening `http://127.0.0.1:5173/api/health` returned `{"status":"ok"}`.

### Human Verification Boundary

The human runtime pass did not manually test:

- Cross-user RLS attacks.
- Direct SQL grants.
- Helper `EXECUTE` privileges.
- Cascade behavior.
- Failed profile-update network behavior.
- Failed sign-out network behavior.

Those behaviors remain covered by the automated frontend and database tests
recorded above unless separately human-tested later.

### Remaining Gaps

- Hosted Supabase smoke testing remains pending until hosted project access and
  non-production credentials are available.
- Dev-only Netlify tooling audit findings remain pending upstream remediation.

## Milestone 3 Automated/Local Verification - Manual Collection CRUD

Date: 2026-08-19

Branch: `codex/milestone-3-manual-collection-crud`

Milestone 3 status in this section: database/RLS foundation and frontend/service
implementation passed Codex automated/local verification. Human runtime
verification was pending at the time of this automated section and is recorded
separately below after human completion.

Implementation commits:

- `381aed84e3e9c5753c993a20cb4a9ae0e1d015a9` - `docs: approve milestone 3 implementation`
- `71aab2a6a2cdce3922eeff7f87cdd9d1c2e6cc01` - `db: add manual collection schema and RLS`
- `b972c0809dc6936e5572ad2da1f4c5b0a5cd5d3e` - `feat: add manual collection workflow`

### Implemented Frontend/Service Scope

Frontend files created:

- `src/lib/supabase/collection.ts`
- `src/lib/supabase/collection.test.ts`
- `src/collection/CollectionPanel.tsx`
- `src/collection/CollectionForm.tsx`
- `src/collection/CollectionItemCard.tsx`
- `src/collection/CollectionPanel.test.tsx`

Milestone 3 UI was integrated into the existing authenticated shell alongside
the Milestone 2 profile/sign-out controls. No router, service-role client,
Netlify Function, catalog API, image recognition, AI, ratings, favorites, notes,
listening history, or search/filter implementation was added.

The collection service uses the existing browser Supabase client and keeps raw
Supabase query details out of presentation components. It implements:

- `normalizeManualReleaseInput`
- `validateManualReleaseInput`
- `loadCollection`
- `addManualCollectionItem`
- `updateManualRelease`
- `deleteCollectionItem`

The approved two-step manual add flow is preserved: insert a creator-owned
manual release first, then insert the collection item. If the second insert
fails, the UI shows a recoverable error and does not claim release cleanup.

### Command Results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed: `tsc -b --noEmit`. |
| `npm run lint` | Passed: `eslint .`. |
| `npm run test:run` | Passed: 5 test files, 31 tests. |
| `npm run build` | Passed: Vite built `dist/` successfully. |
| `npx supabase start` | Passed. Local Supabase stack was running. |
| `npx supabase db reset` | Passed. Migrations `20260818134203_create_profiles.sql` and `20260819000100_create_manual_collection.sql` applied from a clean local database. The expected no-seed-file warning was emitted. |
| `npx supabase test db` | Passed: 2 database test files, 128 tests. |
| `npx supabase db lint` | Passed: no schema errors found. |
| `npm audit --omit=dev` | Passed: `found 0 vulnerabilities`. |
| `npm audit --json` | Completed with 9 high, 0 critical, all in development-only Netlify tooling dependencies. |
| `git diff --check` | Passed before implementation commit. |

### Frontend Test Evidence

The Vitest/React Testing Library suite verifies:

- Authenticated empty collection state.
- Loading existing collection records.
- Deterministic collection ordering by `added_at desc, id desc`.
- Add success.
- Add input normalization.
- Add validation.
- Recoverable release-insert failure.
- Recoverable collection-item insert failure without cleanup claims.
- Edit success.
- Edit validation.
- Recoverable edit failure.
- Same-release duplicate UI consistency after edit.
- Delete confirmation.
- Delete success removing only the selected collection item.
- Recoverable delete failure leaving the item visible.
- Optional metadata display.
- Blank optional string normalization to `null`.
- Load/session-boundary failure recovery through retry.
- Existing Milestone 2 auth/profile tests continue to pass.

### Database/RLS Evidence

The previously approved Milestone 3 database/RLS foundation was retained without
frontend-driven security changes.

`supabase/tests/database/collection_rls.test.sql` and
`supabase/tests/database/profiles_rls.test.sql` passed together with 128 tests.
They cover the approved profile boundary plus manual release and collection-item
schema, constraints, least-privilege grants, RLS ownership behavior, duplicate
semantics, orphan semantics, protected columns, helper permissions, and
timestamp behavior.

### Local Runtime Smoke

Codex automated/local runtime verification:

- Started the Vite/Netlify dev runtime with local browser-safe Supabase values
  passed as process environment variables.
- Did not write or commit a real `.env`.
- `curl -i http://127.0.0.1:5173/` returned `HTTP/1.1 200 OK`.
- `curl -i http://127.0.0.1:5173/api/health` returned `HTTP/1.1 200 OK` with
  body `{"status":"ok"}`.

This was an automated smoke check only. Human browser/runtime verification was
performed later and is recorded separately below.

### Security And Scope Checks

Secret scan result: passed. No service-role key, secret key, database URL, JWT
secret, SMTP password, OAuth secret, catalog key, LLM key, real `.env`, or local
generated Supabase runtime artifact was staged or committed.

Scope scan result: passed. No Discogs, MusicBrainz, Cover Art Archive,
OpenRouter, LLM/model call, recommendation, image recognition, listening
history, rating, favorite, note, search/filter, RAG, vector database, or
multi-agent functionality was added.

No Oxlint dependency or configuration was introduced.

### Development Dependency Audit Triage

The full development audit remains consistent with the previously documented
Netlify tooling risk: 9 high-severity findings, 0 critical findings, all in
development-only transitive dependencies reachable through
`@netlify/vite-plugin`.

`npm audit` again proposed remediation through `@netlify/vite-plugin@2.1.4`
with `isSemVerMajor: true`. No `npm audit fix` or `npm audit fix --force` was
run, and no dependency or architecture change was made for this dev-only
tooling chain.

### Known Gaps

- Human runtime verification for Milestone 3 was pending at the time of this
  automated verification section and is now recorded separately below.
- Hosted Supabase smoke testing remains pending until hosted project access and
  non-production credentials are available.
- Dev-only Netlify tooling audit findings remain pending upstream remediation.

## Milestone 3 Frontend Review Correction

Date: 2026-08-19

Branch: `codex/milestone-3-manual-collection-crud`

Corrective commit:

- `c67bcfce6f990a87f79a62e7d51061c949e9e422` - `fix: verify collection deletion result`

Independent frontend/service review identified two issues before Milestone 3
human runtime verification:

- Collection-item deletion could treat a zero-row or RLS-filtered delete as
  success because the service only checked for a Supabase error.
- Recoverable add/edit failures were rendered twice because both the panel and
  the active form owned the same error message.

Corrections:

- `deleteCollectionItem` now performs `delete().eq('id', collectionItemId)
  .select('id').single()`, propagates Supabase/PostgREST errors, and verifies
  the returned deleted row id matches the requested collection item id.
- Zero-row/not-visible deletes are treated as recoverable failures, not success.
- Release deletion is still never attempted by the collection-item delete
  service.
- Collection form submission errors are now owned by `CollectionForm`; panel
  `actionError` remains for non-form actions such as delete failures.

Correction verification:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:run`: passed, 5 test files / 34 tests.
- `npm run build`: passed.
- `npx supabase db reset`: passed.
- `npx supabase test db`: passed, 2 database test files / 128 tests.
- `npx supabase db lint`: passed, no schema errors found.
- `npm audit --omit=dev`: passed, `found 0 vulnerabilities`.
- `git diff --check`: passed.
- The approved Milestone 3 migration remained byte-for-byte unchanged.

Human runtime verification for Milestone 3 was pending at the time of this
frontend review correction and is now recorded separately below.

## Milestone 3 Human Runtime Verification

Date: 2026-08-19

Branch: `codex/milestone-3-manual-collection-crud`

Verified baseline after correction:
`007b599d520354de4be77c53655edb5fc35a493f`

Result: PASSED.

This section records human-observed browser/runtime verification performed
against the local Supabase development stack and local Vite/Netlify runtime.

### Human-Observed Results

- The app loaded successfully at `http://127.0.0.1:5173/`.
- The initial unauthenticated screen displayed the expected sign-in/create-account UI.
- Fresh local account signup succeeded.
- The confirmation email was received in local Mailpit.
- The confirmation link returned to the app.
- The authenticated profile and collection shell loaded.
- The initial collection empty state displayed correctly.
- Manual add succeeded for:
  - Artist: `Pink Floyd`
  - Title: `The Dark Side of the Moon`
  - Release year: `1973`
  - Label: `Harvest`
  - Catalog number: `SHVL 804`
  - Country: `UK`
  - Format: `LP`
- During human verification, a UX defect was found: after successful add, the
  cleared form incorrectly displayed `Artist is required.`
- That defect was corrected in
  `007b599d520354de4be77c53655edb5fc35a493f` -
  `fix: reset add form validation after success`.
- After the correction, refreshing preserved `The Dark Side of the Moon`.
- After the correction, the cleared add form showed no erroneous validation
  message.
- Edit succeeded by changing Label from `Harvest` to `Harvest Records`.
- Refresh confirmed the edited metadata persisted.
- A second record was successfully added:
  - Artist: `Radiohead`
  - Title: `OK Computer`
  - Release year: `1997`
- Both records appeared together.
- Removing `OK Computer` succeeded after confirmation.
- `The Dark Side of the Moon` remained after removing `OK Computer`.
- Sign out and sign back in succeeded.
- After re-authentication, `The Dark Side of the Moon` was still present.
- After re-authentication, `OK Computer` remained deleted.
- Invalid release-year validation was verified using year `2201`.
- The UI displayed:
  `Release year must be a whole number from 1900 to 2100.`
- Add Record remained disabled for the invalid release year.
- The health endpoint was manually verified at `/api/health`.
- Exact health response: `{"status":"ok"}`.

### Human Verification Boundary

The human runtime pass verified the intended Milestone 3 manual collection user
workflow and the reviewed add-form validation correction. Cross-user RLS,
direct grants, protected helper behavior, duplicate semantics, orphan behavior,
and column privilege behavior remain covered by the automated database tests
recorded above unless separately human-tested later.

### Conclusion

Milestone 3 Human Runtime Verification: PASSED.

## Milestone 3 Spec-Driven Test Quality Remediation

Date: 2026-08-19

Branch: `codex/milestone-3-manual-collection-crud`

An independent, spec-driven Milestone 3 test-quality audit was performed in a
fresh Codex session. The audit verdict was `PASS WITH TARGETED GAPS`. The human
reviewed the audit and approved targeted test remediation only, without
broadening Milestone 3 scope.

Strengthened test areas:

- App/auth integration now verifies that an authenticated session with a loaded
  profile renders both the protected profile capability and the collection
  capability.
- App/auth state handling now verifies that a Supabase signed-out auth-state
  callback removes protected profile and collection UI and returns to the
  unauthenticated sign-in boundary.
- Collection service tests now verify `loadCollection()` reads
  `collection_items`, requests joined release metadata, requests
  `added_at desc` and `id desc` ordering, normalizes returned rows, and
  propagates Supabase read errors.
- Collection service tests now verify `updateManualRelease()` normalizes manual
  input, scopes updates to the requested release ID, returns editable release
  metadata, propagates Supabase update errors, and rejects invalid input before
  persistence.
- Database pgTAP tests now explicitly verify authenticated browser users cannot
  insert protected/system-managed release columns: `id`, `created_by`, `source`,
  `created_at`, and `updated_at`.
- Database pgTAP tests now explicitly verify authenticated browser users cannot
  insert protected/system-managed collection item columns: `id`, `user_id`,
  `added_at`, and `created_at`.
- Database pgTAP tests now cover additional representative validation
  boundaries for overlong artist, blank/whitespace-only title, blank optional
  text, catalog number normalization/length, country normalization/length,
  format normalization/length, and valid release-year boundaries `1900` and
  `2100`.

Resulting test totals:

- Vitest/frontend-unit suite: 5 test files, 41 tests.
- Supabase database suite: 2 test files, 153 tests.
- Combined automated test assertions reported by the runners: 194 tests.

Verification commands run:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed. |
| `npm run test:run` | Passed: 5 test files, 41 tests. |
| `npm run build` | Passed. |
| `npx supabase db reset` | Passed. |
| `npx supabase test db` | Passed: 2 database test files, 153 tests. |
| `npx supabase db lint` | Passed: no schema errors found. |
| `npm audit --omit=dev` | Passed: `found 0 vulnerabilities`. |

The first sandboxed `npm audit --omit=dev` attempt could not resolve the npm
registry because network access was restricted; the approved rerun completed
successfully. A concurrent Supabase reset/test attempt was rerun serially after
the local database restart completed; the final database test gate passed.

Scope confirmation:

- Production code changed: no.
- Migration changed: no.
- Dependencies changed: no.
- Milestone 4 work started: no.

## Lessons 1-7 Course Requirements Evidence Audit

Date: 2026-08-19

Branch/HEAD under review:
`codex/milestone-3-manual-collection-crud` at
`129a5ee07e5bd5e83f807af62ee6656370fc0261`.

An independent external repository review was performed against university
course Lessons 1-7. The external verdict was:

`COURSE EVIDENCE STRONG WITH TARGETED DOCUMENTATION GAPS`

The findings were independently checked against GitHub repository evidence and
course materials before remediation.

Confirmed findings:

- The Milestone 3 implementation plan had stale human-runtime-verification
  status language.
- The README still described Milestone 2 as the current implemented state.
- Stakeholder framing existed implicitly but was not explicit in `intent.txt`.
- PRD-equivalent content already exists in `intent.txt`; duplicating it in a
  new PRD file would reduce clarity.
- `AGENTS.md` already fulfills the persistent agent-context role.
- Current Milestones 1-3 needs are covered by Git/GitHub, Node/npm,
  Vite/React/TypeScript, Vitest/React Testing Library, Supabase CLI, pgTAP, DB
  lint, Netlify local integration, browser/manual runtime verification, and
  official documentation/research when required.
- No current capability gap justifies adding an MCP. Adding one now would add
  context, permissions, maintenance, and blast radius without a concrete
  engineering benefit.

Corrected interpretation of external specification finding:

- The initial follow-up review interpreted the claim that the Milestone 3
  specification contradicted itself as a false positive because the
  specification's Human Runtime Verification Plan is historical
  pre-implementation planning evidence and should remain preserved.
- That interpretation remains correct for the historical verification-plan
  section.
- A later full PR merge-readiness review identified a separate lower
  current-state section, `Remaining verification gate`, that still said human
  runtime verification was pending after it had passed.
- That lower current-state wording was genuinely stale, so the previous blanket
  false-positive classification was incomplete and is superseded by the
  correction below.

Approved remediation:

- Documentation-only synchronization of README, `intent.txt`, `AGENTS.md`,
  the Milestone 3 implementation plan, and this verification record.
- No production code, tests, migrations, dependencies, Supabase/Netlify config,
  or Milestone 1 history changes were justified.

Human decisions:

- Do not create `PRD.md`.
- Do not create `CLAUDE.md`.
- Do not install or configure an MCP merely for course visibility.
- Do not rewrite Milestone 1 history.
- Do not add tests merely because of this audit.
- Preserve historical planning artifacts honestly while keeping current status
  fields truthful.

## Milestone 3 PR Merge-Readiness Documentation Correction

Date: 2026-08-19

PR: `#3`

Reviewed head before correction:
`c6d8f14fa10aa5144b3da5500ac5efbfbb31ae08`.

Independent full PR merge-readiness review verdict: `NOT MERGE READY` due to
one documentation contradiction. The code, security model, and tests had no
merge-blocking finding.

Documentation contradiction found:

- The top of `docs/specs/0004-milestone-3-manual-collection-crud.md` correctly
  stated that human runtime verification passed.
- A lower current-state section still said `Remaining verification gate` and
  claimed human runtime verification was pending.

The previous false-positive interpretation was incomplete: it was correct for
the historical Human Runtime Verification Plan, but not for the later
current-state gate. The approved remedy was documentation-only. No production
code, tests, migration, dependencies, security model, or Milestone 3 scope
changed.

PR `#3` must be re-checked at the corrected head before merge authorization.

## Milestone 4 Evidence - Catalog API

Date: 2026-08-26 through 2026-08-29

Branch: `codex/milestone-4-catalog-api`

Baseline (Milestone 3 merge on `main`):
`e5909e729106483d156a462b1e575479e7ef008a`

Implementation commits:

- `fa4befcb7b85b484085306fab325d97b7e211457` - `db: add catalog release schema and RLS`
- `d3ceb323906742e57f16b04f857c41b5f36d3ce0` - `feat: add authenticated MusicBrainz catalog functions`
- `918cd8e116603746efe738dd50b6a29e887e1b77` - `feat: add catalog search and add workflow`

Primary-agent transition commit (not Milestone 4 feature work):

- `f73561ea62445a8d395a8fd2205e5567f5a9f239` - `chore: add Claude Code project instructions`
  (adds `CLAUDE.md`; makes `AGENTS.md` tool-neutral; historical decisions preserved)

Runtime correction commits (found during human verification, see below):

- `adfc5c241849f66e239414552dcc1cbeca1409ae` - `fix: grant catalog persistence privileges to service role`
- `0d1e69c2d10e573be205fa69f0bc3dae56243d25` - `fix: reduce MusicBrainz request bursts`

### Implemented Scope

- `public.releases` evolved for provider-backed catalog rows: `source` now
  `manual | catalog`, nullable `provider` / `provider_release_id` /
  `provider_release_group_id`, clean-text and manual/catalog identity
  constraints, a unique `(provider, provider_release_id)` index, and an
  authenticated `SELECT` policy for `source = 'catalog'` rows.
- `GET /api/catalog/search` and `POST /api/catalog/add` Netlify Functions,
  both requiring a valid Supabase user JWT, with a meaningful MusicBrainz
  User-Agent, query validation, timeout, best-effort per-instance pacing,
  normalized candidates, and sanitized provider errors.
- Add revalidates the selected release server-side by MBID, upserts the shared
  canonical `catalog` release with the service role, and creates a
  `collection_item` for the verified user only.
- Browser catalog panel: explicit-submit search, normalized candidate cards,
  add-to-collection, and recoverable search/add error states.
- No Discogs, Cover Art Archive persistence, AI, image recognition, ratings,
  favorites, notes, listening history, or browse/filter milestone scope was
  introduced.

### Automated / Agent-Run Verification

These results were produced by the implementation agent in the local
development environment. They are agent-run/local evidence, not human runtime
verification.

Latest results, at branch head `0d1e69c` (reliability fix):

| Check | Result |
| --- | --- |
| `git diff --check` | Passed |
| `npm run typecheck` (`tsc -b --noEmit`) | Passed |
| `npm run lint` (`eslint .`) | Passed |
| `npm run test:run` (`vitest run`) | Passed: 9 test files, 84 tests |
| `npm run build` (`tsc -b && vite build`) | Passed |
| `npx supabase db lint` | Passed: no schema errors found |
| `npm audit --omit=dev` | Passed: `found 0 vulnerabilities` |

Database tests:

- An initial `npx supabase test db` run against a local database that still
  contained residual catalog rows from human runtime testing failed one
  assertion in `supabase/tests/database/catalog_releases_rls.test.sql`
  (`have: 3, want: 1` on a `source = 'catalog'` count). This is a
  test-isolation limitation of that file, not a product or runtime failure.
- After the canonical clean flow:
  - `npx supabase db reset` - Passed; migrations `20260818134203`,
    `20260819000100`, `20260826000100`, and `20260829120000` apply in order.
  - `npx supabase test db` - Passed: 4 test files, 210 tests.

Frontend/adapter/function test coverage added for Milestone 4 includes:
MusicBrainz URL building and User-Agent, candidate normalization and malformed
/ no-result / 503 / 429 / timeout handling, function auth rejection before
provider calls, query/limit validation, provider-identity-only add body,
server-side revalidation and ownership assignment, recoverable
database-error surfacing, the bounded add retry paths, and the
explicit-submit / no-auto-search / duplicate-submit-guard behavior.

Database security tests (`catalog_releases_rls.test.sql`,
`service_role_catalog_privileges.test.sql`, plus the retained M2/M3 suites)
verify catalog provider columns and constraints, the unique provider identity,
anonymous denial, authenticated read-only access to catalog rows, browser
inability to insert/update/delete catalog rows or mutate provider/source
columns, the exact least-privilege `service_role` grant set (see blocker
section), and preserved M3 manual-CRUD and profile-deletion semantics.

### Runtime Blocker: service_role Table Privileges (PostgreSQL 42501)

Discovered during human runtime testing: catalog search reached real
MusicBrainz results, but "Add to collection" failed. The browser showed
"Catalog release could not be saved."; the server path returned HTTP 403 with
PostgreSQL `42501 permission denied for table releases`.

Independent local diagnosis confirmed:

- `SUPABASE_SERVICE_ROLE_KEY` was present and valid.
- `service_role` has the `BYPASSRLS` attribute.
- `service_role` nevertheless lacked ordinary `SELECT`/`INSERT`/`UPDATE`
  privileges on `public.releases` and `SELECT`/`INSERT` on
  `public.collection_items`. The Milestone 3 and Milestone 4 migrations granted
  table privileges only to `anon`/`authenticated`, and Supabase's default-ACL
  grant for `service_role` applies only to objects created by `supabase_admin`,
  not migration tables owned by `postgres`.
- PostgreSQL enforces ordinary table privileges independently of RLS, so
  `BYPASSRLS` does not substitute for a missing `GRANT`.

Fix: `adfc5c2` adds forward migration
`supabase/migrations/20260829120000_grant_service_role_catalog_privileges.sql`:

```sql
grant select, insert, update on table public.releases to service_role;
grant select, insert on table public.collection_items to service_role;
```

No `DELETE` on `releases`; no `UPDATE`/`DELETE` on `collection_items`; no RLS
policy or browser grant changed. `supabase/tests/database/service_role_catalog_privileges.test.sql`
adds regression coverage: `has_table_privilege` assertions for the exact
allowed and disallowed privileges, and behavioral proof under
`SET LOCAL ROLE service_role` (insert/select/update a catalog release and its
collection item succeed; `DELETE` on `releases` and `UPDATE`/`DELETE` on
`collection_items` throw `42501`).

Post-fix verification:

- Automated: `supabase db reset` + `supabase test db` pass 210 tests including
  the new file.
- Real PostgREST probe with the configured local service-role key (agent-run):
  upsert a synthetic catalog release, select it, insert a `collection_items`
  row for a runtime test user, select it, then clean up; all steps succeeded
  and the synthetic rows were removed. MusicBrainz was not called.
- Human runtime after the fix: catalog Add succeeds; the catalog record
  persists across a browser refresh; two duplicate physical copies of the same
  provider release are allowed; deleting one owned copy leaves the other
  intact.

### Runtime Finding: MusicBrainz Intermittent 503

Observed during human runtime: MusicBrainz search intermittently returned the
sanitized message "MusicBrainz is rate limiting or temporarily unavailable."
while a near-identical retry shortly afterward succeeded.

Diagnostic verdict: BOTH / CANNOT GUARANTEE.

- MusicBrainz's public endpoint returns intermittent `503` even to compliant
  clients.
- The old frontend also generated additional sub-second provider requests: a
  450 ms live re-search fired on every query edit after the first search, Add
  performs a fresh server-side MusicBrainz lookup, and the in-memory pacing
  counter is per module instance / per function bundle. In the local
  Netlify dev runtime each function invocation runs in a fresh worker with a
  fresh module, so the counter resets to zero and applies no delay.

Human-approved correction: `0d1e69c`.

- Typing or editing the query never calls `/api/catalog/search`.
- A provider search happens only on an explicit Search / Enter submit.
- A duplicate submit while a search is in flight is ignored.
- Add still revalidates server-side, and now retries a
  `provider_rate_limited` lookup exactly once after ~1200 ms; a second
  rate-limit surfaces the normal recoverable HTTP 503. No other error is
  retried. No loop.
- MusicBrainz HTTP `429` is treated like `503` (`provider_rate_limited`).
- No distributed/global rate limiter, KV, or Blobs coordination was added.

Documented limitation (accepted for Milestone 4 scope): the in-memory
per-instance pacing is best-effort. Milestone 4 does not claim a hard
one-request-per-second guarantee across function bundles, concurrent
serverless instances, cold starts, or the local worker-per-invocation runtime.
Distributed/global coordination was explicitly deferred as unnecessary for the
low-concurrency university/demo scope.

### Milestone 4 Human Runtime Verification

The human performed browser/runtime verification against the local Supabase
stack and local Vite/Netlify runtime.

Initial pass (before the runtime corrections):

- Authenticated app shell: PASS.
- Real MusicBrainz search returned candidates: PASS, with the intermittent
  `503` behavior described above.
- Manual collection add/edit/remove still worked: PASS.
- Release-year validation and recoverable error states: PASS.
- Authentication boundary (anonymous cannot use catalog): PASS.
- `/api/health` returned `{"status":"ok"}`: PASS.
- Catalog Add: FAILED with PostgreSQL `42501` (see blocker section).

After `adfc5c2` (service-role grant fix):

- Catalog Add succeeds: PASS.
- Catalog record persists after a browser refresh: PASS.
- Duplicate physical copies of the same MusicBrainz release are allowed: PASS.
- Deleting one owned copy leaves the other copy intact: PASS.

Final smoke after `0d1e69c` (reliability fix):

1. Typed "Pink Floyd The Dark Side of the Moon" and waited without submitting.
   No search, no spinner, no provider error, no results. PASS.
2. Explicitly clicked "Search catalog". Real MusicBrainz candidates returned.
   PASS.
3. Clicked "Add to collection" on Vitamin String Quartet feat. The Section -
   "The String Quartet Tribute to Pink Floyd's The Dark Side of the Moon".
   Catalog Add succeeded. PASS.

Conclusion: Milestone 4 Human Runtime Verification: PASS.

### Human Verification Boundary

The human runtime pass exercised the intended catalog search/add user
workflow, persistence, duplicate semantics, single-copy deletion, the
explicit-search behavior, and the health endpoint. Cross-user RLS attacks,
direct SQL grant inspection, `service_role` privilege behavior, and the
provider adapter failure branches remain covered by the automated database and
Vitest suites recorded above unless separately human-tested later.

### Security And Scope Checks

- `.env` is git-ignored and untracked; no real credential is committed.
  `.env.example` gained placeholder-only `SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."`
  and `MUSICBRAINZ_USER_AGENT="VinylIntelligence/0.0.0 (contact@example.com)"`.
- The service-role key is used only inside Netlify Functions after verifying
  the browser Supabase user token; it is never sent to the browser, logged, or
  written to database rows.
- Branch-diff secret scan: no keys, tokens, or private material.
- Scope scan: no Discogs credentials/schema, no AI/model calls, no image
  recognition, no listening history / ratings / favorites / notes, no
  browse/filter milestone, no RAG or vector database, no Milestone 5 work.

### Known Deferred Findings

1. Test hygiene (deferred): `catalog_releases_rls.test.sql` contains a
   `source = 'catalog'` count assertion that assumes a clean starting database
   and can fail when runtime catalog rows already exist. The canonical
   `supabase db reset` + `supabase test db` flow passes.
2. Rate-limit limitation (accepted): no distributed/global MusicBrainz request
   coordinator. Milestone 4 relies on low-concurrency/demo assumptions plus
   explicit-submit search, best-effort per-instance pacing, a bounded single
   Add retry, and sanitized `503`/`429` handling.
3. Low / note: MusicBrainz free-text search relevance is imperfect for some
   queries.
4. Low / note: a non-JSON provider error body can surface as
   `provider_unavailable`.

These are documented limitations, not Milestone 4 blockers.

### Production / Hosted Status

Hosted Supabase smoke testing and Netlify production deployment were not
performed for Milestone 4. Production deployment and hosted verification remain
later-milestone work. No production deployment is claimed.

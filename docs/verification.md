# Verification Strategy

Last updated: 2026-08-17.

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

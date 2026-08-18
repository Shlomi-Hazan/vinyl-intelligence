# 0002 Milestone 1 Stack Scaffold Specification

Status: approved and implemented

Approved: 2026-08-18

Milestone: 1 - Vite/React/TypeScript + Netlify Functions Scaffold

Date: 2026-08-17

## Intent

Establish the approved application runtime skeleton without implementing product features.

This milestone should prove that the chosen stack can run locally, build, test, lint, type-check, and expose a minimal Netlify Function boundary. It must prepare the project for later milestones without silently starting Supabase Auth, database schema, catalog integration, AI workflows, or vinyl collection functionality.

## Approved Context

Relevant approved decisions:

- Frontend: Vite + React + TypeScript
- Backend: Netlify Functions for privileged server-side logic
- Database/Auth/Storage: Supabase, but not implemented in this milestone
- Deployment: Netlify
- Node.js: major version 24
- Package manager: npm
- Testing: Vitest, React Testing Library, and jsdom
- Linting: ESLint flat configuration
- Type-checking: TypeScript no-emit behavior
- Generated Vite template linting must be inspected; do not carry Oxlint into the repository if present
- No RAG
- No unjustified multi-agent architecture
- Milestones require explicit human-approved specification and implementation plan before implementation begins

## User Outcome

A reviewer or developer can run the project and see a minimal Vinyl Intelligence application shell that confirms:

- the browser app renders
- the Vite build pipeline works
- TypeScript is configured
- linting is configured
- tests can run
- a Netlify Function can be reached
- no product feature has been implemented yet

## In Scope

- Create a Vite + React + TypeScript application scaffold in the existing repository.
- Add a minimal application shell with project name and stack status only.
- Add a minimal Netlify Functions directory.
- Add one non-privileged health/check function only.
- Add `netlify.toml` for Vite build output and Netlify Functions configuration.
- Add `package.json`, lockfile, TypeScript config, Vite config, ESLint config, and test config.
- Add `.env.example` documenting Milestone 1 environment expectations without secrets.
- Add `.nvmrc` with `24`.
- Add scripts for local development, build, preview, lint, type-check, and tests.
- Add minimal tests that verify the app shell and health function shape.
- Update setup documentation only as needed for running the scaffold.
- If practical, create a basic Netlify preview deployment for the scaffold after implementation approval.

## Out of Scope

Do not implement:

- Supabase Auth
- Supabase client setup for real project data
- database tables
- migrations
- Row Level Security policies
- collection CRUD
- album detail pages
- music catalog API calls
- Discogs or MusicBrainz integration
- LLM calls
- prompts
- model output schemas
- image upload
- image recognition
- Supabase Storage
- recommendation logic
- listening history
- ratings/favorites
- conversational state
- product telemetry
- user accounts
- protected routes
- product dashboard modules
- production deployment milestone work

The frontend shell must not pretend these features exist. It may mention that the project is in scaffold status.

## Minimal Frontend Behavior

The frontend should render a simple application shell that includes:

- project name: `Vinyl Intelligence`
- a concise scaffold status
- a non-product stack check area
- optionally, a frontend-to-function health check indicator that calls `/api/health` if it is implemented with the local Netlify runtime

The shell must not include real navigation to future features, fake collection data, fake authentication states, fake recommendations, fake catalog search, or placeholder forms that imply unfinished features work.

## Minimal Backend Behavior

The Netlify Functions side should include one health/check function only.

Expected behavior:

- Implementation file is `netlify/functions/health.mts`.
- Public application path is `/api/health`.
- Uses Netlify's supported function routing configuration mechanism, such as the exported function `config.path`, instead of making frontend code depend on `/.netlify/functions/health`.
- Preferred route configuration uses the currently documented Netlify form with `method: ["GET"]` and `path: "/api/health"`.
- Returns minimal JSON with non-sensitive scaffold information, such as `{ "status": "ok" }`.
- Restricts the endpoint to `GET` if supported by the chosen Netlify Functions configuration.
- Does not read secrets.
- Does not connect to Supabase.
- Does not call external APIs.
- Does not perform authentication.
- Does not implement privileged product logic.

## Environment Variables

Milestone 1 should require no secrets.

Allowed `.env.example` content at this stage:

- `VITE_APP_NAME=Vinyl Intelligence`

Do not add Supabase, catalog, AI, Netlify token, or service-role variables yet. Future placeholders for those services belong in later milestone specs.

## Security Requirements

- No `.env` file is committed.
- No credentials or tokens are committed.
- No service-role key is introduced.
- Netlify Function returns only non-sensitive data.
- Health response must not include environment variable values, secrets, system information, user data, or external API results.
- Any browser-exposed variable must use the `VITE_` prefix and must be safe to expose publicly.
- The scaffold should preserve the existing `.gitignore` protections.

## Testing Requirements

Minimum test coverage for the scaffold:

- App shell renders without crashing.
- Health function returns a successful JSON response with expected public fields at `/api/health`.

Testing should use Vitest because it integrates naturally with Vite and TypeScript.

React component tests may use React Testing Library and jsdom.

## Linting and Type-Checking Requirements

- ESLint must run successfully for TypeScript/React code.
- ESLint flat configuration is the approved linting stack.
- If the generated Vite React TypeScript template includes Oxlint, omit/remove generated Oxlint dependencies, configs, and scripts.
- Do not maintain both Oxlint and ESLint.
- Do not change the approved linting decision without human approval.
- TypeScript must run in no-emit checking mode.
- Functions must be included in type-checking or have their own TypeScript coverage.
- Build must fail on TypeScript errors.

## Netlify Requirements

The scaffold should include:

- `netlify.toml`
- Vite build command and publish directory
- functions directory configuration
- function route configuration for `/api/health`
- local function development approach

Milestone 1 does not include client-side routing, so it must not add a catch-all SPA fallback redirect. Add SPA fallback routing only in a later milestone when client-side routing actually requires it.

Early deployment check:

If practical during implementation, create a basic Netlify preview deployment proving:

- Vite build works on Netlify
- frontend routing/build configuration works
- Netlify Functions can be reached at `/api/health`
- no secrets are exposed

This preview check does not replace the later Production Deployment milestone.

## Acceptance Criteria

- Human-approved specification and implementation plan exist before implementation begins.
- The milestone branch may be created for planning and review before implementation approval, but no implementation commits may be added until the specification and implementation plan are explicitly approved by the human.
- Vite + React + TypeScript scaffold exists in the current repository without overwriting existing documentation.
- Local dev command starts the app.
- Build command creates production output.
- Preview command can serve the built app locally.
- Type-check command passes.
- Lint command passes.
- Test command passes.
- Netlify Function health endpoint works locally.
- Health endpoint public path is `/api/health`.
- `netlify.toml` configures build output and function directory.
- `.env.example` exists and contains no secrets.
- No Supabase Auth, database, collection, catalog, AI, image, or recommendation code exists.
- Repository has no committed secrets.
- If Netlify preview deployment is practical, preview URL is created and verified; otherwise the blocker is documented.

## Verification Commands Expected After Implementation

Exact commands may be adjusted by the approved implementation plan, but the milestone must support equivalents of:

```bash
npm install
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run preview
```

Local Netlify Function verification should use the approved local Netlify strategy and check `/api/health`.

## Human Approval Gate

This specification and the implementation plan were reviewed before implementation.

The planning branch may contain this specification and plan for GitHub review. Do not scaffold, install dependencies, create application files, or implement Milestone 1 until the human explicitly approves implementation.

Human implementation approval was granted before implementation began. The approval gate was satisfied, and Milestone 1 implementation and verification have completed. Remote Netlify preview remains the documented conditional deployment check pending authenticated Netlify site/project access.

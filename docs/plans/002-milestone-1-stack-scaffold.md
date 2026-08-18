# 002 Milestone 1 Stack Scaffold Implementation Plan

Status: approved and implemented

Approved: 2026-08-18

Milestone: 1 - Vite/React/TypeScript + Netlify Functions Scaffold

Date: 2026-08-17

## Objective

Create the approved stack scaffold only:

- Vite + React + TypeScript frontend
- Netlify Functions backend boundary
- Netlify deployment configuration
- npm-based scripts for development, type-checking, linting, testing, building, and previewing

No product features should be implemented.

## Repository State Before Implementation

Current inspected state:

- Current directory: `/Users/shlomihazan/Documents/The vinyl collector`
- Planning branch: `codex/milestone-1-stack-scaffold`
- Base branch for implementation: `main`
- Starting base before this planning branch: clean, tracking `origin/main`
- Last approved commit: `939ef81f67ac77c7979c0779370f8aecbec64c0f`
- Existing content: documentation and project intent only
- Ignored local `.DS_Store` files exist in the workspace but are protected by `.gitignore`
- Node/npm were not initially visible in the shell PATH.
- After loading the existing nvm environment, detected Node.js `v24.19.0` and npm `11.17.0`.

## Proposed Git Branch

Review and implementation branch:

```text
codex/milestone-1-stack-scaffold
```

This branch may contain the Milestone 1 specification and plan for GitHub review. Do not add implementation commits to it until the human explicitly approves implementation.

## Package Manager Recommendation

Use `npm`.

Justification:

- It is bundled with Node.js, so there is no extra package-manager bootstrap step.
- Vite, ESLint, Vitest, and Netlify examples all support npm directly.
- `package-lock.json` gives deterministic installs for a university project.
- The project does not yet need pnpm workspace behavior or monorepo features.

If the human strongly prefers pnpm later, that can be changed before the scaffold is implemented. For Milestone 1, npm is the conservative choice.

Do not introduce pnpm, Yarn, Bun, or another package manager without explicit approval.

## Node.js Version Requirement

Recommended project standard: Node.js `24.x`.

Implementation should add:

- `.nvmrc` containing `24`
- `package.json` `engines.node` set to `>=24 <25`
- `package-lock.json` committed from npm

Rationale:

- Current Vite documentation requires Node.js `20.19+` or `22.12+`.
- Current ESLint documentation requires Node.js `^20.19.0`, `^22.13.0`, or `>=24`.
- Netlify announced Node.js 24 as the default for new sites in July 2026.
- Using Node 24 locally and in Netlify reduces build/function runtime drift.

If local development cannot use Node 24, stop and ask before lowering the requirement.

Do not install another Node copy if Node/npm are not visible. Reload the existing shell/nvm environment first and verify again.

## Vite + React + TypeScript Initialization Approach

Do not run a generator directly over the existing repository without review.

Preferred implementation approach:

1. Confirm the implementation branch starts from current `main`.
2. Create a temporary Vite template outside the repository, for example under `/tmp`.
3. Run the Vite React TypeScript scaffold command against the temporary directory.
4. Inspect all generated files.
5. Determine exactly which generated files are required.
6. Copy or merge only those required files into the project repository.
7. Preserve all existing project artifacts.
8. Review the resulting diff before accepting the scaffold.
9. Remove the temporary scaffold directory.
10. Verify no unexpected generated files remain.

Example command for the temporary scaffold:

```bash
npm create vite@latest /tmp/vinyl-intelligence-vite-template -- --template react-ts
```

Then adapt the scaffold into the repository rather than blindly replacing existing files.

Existing artifacts that must be preserved:

- `intent.txt`
- `AGENTS.md`
- existing `README.md`
- `docs/`
- existing `.gitignore`
- existing Git history
- existing engineering and decision records

Conflict handling:

- Generated Vite `README.md`: do not overwrite the existing README. Extract only useful setup details and merge them into the current README under a scaffold/local setup section.
- Generated Vite `.gitignore`: do not overwrite the existing `.gitignore`. Compare entries and add only missing safe ignore patterns if needed.
- Generated Vite sample assets: omit default logos/assets unless required by Vite. Do not keep decorative starter assets that imply product UI.
- Generated `src/` sample app: replace with a minimal Vinyl Intelligence scaffold shell.
- Generated package/config files: review and adapt deliberately rather than copying blindly.
- Generated Oxlint dependencies/config/scripts if present: omit/remove them and use only the approved ESLint flat configuration.

## Exact Proposed File Structure

Expected repository structure after Milestone 1 implementation:

```text
/
├── .env.example
├── .gitignore
├── .nvmrc
├── AGENTS.md
├── README.md
├── index.html
├── intent.txt
├── netlify.toml
├── package-lock.json
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── eslint.config.js
├── docs/
│   └── ...
├── netlify/
│   └── functions/
│       ├── health.mts
│       └── health.test.ts
└── src/
    ├── App.tsx
    ├── App.test.tsx
    ├── main.tsx
    ├── styles.css
    └── vite-env.d.ts
```

Notes:

- `src/` should contain only minimal scaffold UI.
- `netlify/functions/health.mts` should contain only a non-privileged health response and an exported route config for `/api/health`.
- No Supabase directories, migrations, catalog services, AI modules, prompt files, or product feature folders should be created in this milestone.

## Runtime Dependencies

Expected runtime dependencies:

- `react`
- `react-dom`

Do not add Supabase, catalog API clients, LLM SDKs, UI frameworks, router libraries, or state-management libraries in Milestone 1.

## Development Dependencies

Expected development dependencies:

- `@vitejs/plugin-react`
- `vite`
- `typescript`
- `eslint`
- `@eslint/js`
- `typescript-eslint`
- `eslint-plugin-react-hooks`
- `eslint-plugin-react-refresh`
- `globals`
- `vitest`
- `jsdom`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@netlify/functions`
- `@netlify/vite-plugin`

Reasoning:

- Vite plugin handles React development/build integration.
- ESLint flat config covers JavaScript/TypeScript/React checks.
- Vitest keeps tests aligned with Vite.
- jsdom and Testing Library allow minimal React component tests.
- Netlify packages provide the local platform integration and function types.

`@netlify/vite-plugin` is approved only for stack/runtime integration. Do not use it to add product behavior in Milestone 1. If implementation discovers it is no longer the appropriate current integration for Vite + Netlify, stop and document the reason before replacing it.

## Linting Setup

Use ESLint flat config in `eslint.config.js`.

The current Vite React TypeScript template may include Oxlint. During implementation, inspect the generated scaffold and do not blindly carry Oxlint into the repository. Do not maintain both Oxlint and ESLint. Remove or omit generated Oxlint dependencies, config files, and package scripts if present. Do not change the approved linting decision without human approval.

Minimum coverage:

- browser globals for `src/**/*`
- Node globals for config files
- TypeScript support through `typescript-eslint`
- React hooks rules
- React refresh rules for Vite development safety

Recommended script:

```json
"lint": "eslint ."
```

## Type-Checking Setup

Use TypeScript project references or split configs matching the Vite React TypeScript template:

- `tsconfig.app.json` for browser app files
- `tsconfig.node.json` for Vite/Vitest/config/function tooling as appropriate
- root `tsconfig.json` referencing the sub-configs

Recommended script:

```json
"typecheck": "tsc --noEmit"
```

If the split configs require build mode, use:

```json
"typecheck": "tsc -b --noEmit"
```

Choose the version that works cleanly with the final TypeScript config.

The command must use no-emit behavior and must be part of milestone verification.

## Testing Framework Recommendation

Use Vitest.

Recommended test coverage in this milestone:

- `src/App.test.tsx`: verifies the scaffold app shell renders.
- `netlify/functions/health.test.ts`: imports the handler and verifies the public health JSON response.

Recommended scripts:

```json
"test": "vitest",
"test:run": "vitest run"
```

Coverage is not required in Milestone 1. It can be added later once meaningful business logic exists.

## Netlify Functions Setup

Use `netlify/functions/` as the function directory.

Use TypeScript `.mts` function entry files to make ES modules explicit.

Health function behavior:

- file: `netlify/functions/health.mts`
- public path: `/api/health`
- routing: use Netlify's supported Functions path configuration mechanism, preferably exported `config.path`
- no auth
- no secrets
- no Supabase
- no external calls
- returns public scaffold JSON only
- no environment variable values
- no system information
- no user data

Example response shape:

```json
{
  "status": "ok"
}
```

Expected route config shape:

```ts
import type { Config } from "@netlify/functions"

export const config: Config = {
  method: ["GET"],
  path: "/api/health",
}
```

## `netlify.toml` Approach

Use a minimal explicit configuration:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
```

Notes:

- Keep the config minimal.
- Do not add a catch-all SPA fallback redirect in Milestone 1 because this milestone does not include client-side routing.
- Add SPA fallback routing only in a later milestone when client-side routing actually requires it.
- Use the function's route config for `/api/health`; do not add a broad `/api/*` redirect to `/.netlify/functions/:splat` for this milestone.
- Ensure future routing changes do not shadow `/api/health`.
- Netlify function runtime should align with Node 24. If Netlify site configuration does not use Node 24, set it through Netlify environment/configuration rather than committing secrets.

## `.env.example`

Milestone 1 should require no secrets.

Expected `.env.example`:

```bash
# Milestone 1 scaffold only. No secrets are required.
VITE_APP_NAME="Vinyl Intelligence"
```

Do not add these yet:

- Supabase URL/key variables
- service-role variables
- Discogs variables
- MusicBrainz variables
- OpenRouter or LLM variables
- Netlify auth tokens

Those belong to later milestone specs.

## Local Development Commands

Expected scripts after implementation:

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run preview
```

Local function check:

```bash
curl http://localhost:<dev-port>/api/health
```

The exact dev port should be documented after implementation. Vite commonly defaults to `5173`, but the verified value should be recorded in the implementation notes.

## Build Commands

Expected build:

```bash
npm run build
```

Expected output:

```text
dist/
```

Netlify build command:

```bash
npm run build
```

Netlify publish directory:

```text
dist
```

## Verification Commands

Required before declaring Milestone 1 complete:

```bash
npm install
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run preview
```

Additional checks:

```bash
git diff --check
git status --short --branch
```

Run the project secret scan used by the current Codex session, excluding `.git/` and ignored local artifacts. The scan should check for common API key, GitHub token, Supabase service-role, catalog token, and bearer-token patterns without committing real secret values into documentation.

Manual checks:

- Open local app.
- Verify the shell renders.
- Call the health function locally.
- Verify `/api/health`, not `/.netlify/functions/health`, is the public application path.
- Confirm browser source/client bundle contains no secrets.
- Confirm no future feature appears implemented.

## Early Netlify Preview Deployment Check

If practical during implementation, create a basic Netlify preview deployment after the scaffold builds locally.

Preferred path:

1. Push the milestone branch to GitHub.
2. Connect/import the repository in Netlify if not already connected.
3. Let Netlify create a deploy preview for the branch or PR.
4. Verify the preview URL renders the scaffold shell.
5. Verify `/api/health` returns the expected public JSON.
6. Check Netlify build logs for Node version, build command, publish directory, and function bundling.
7. Confirm no secrets are configured or exposed.
8. Confirm no product APIs or privileged credentials are required.

Fallback if GitHub-Netlify integration is not available:

- Use a manual Netlify preview deploy if Netlify CLI/auth is available.
- If no Netlify access is available, record the blocker and complete local build/function verification only.

This does not replace Milestone 11 Production Deployment.

## Expected Commits

Implementation should happen after human approval on `codex/milestone-1-stack-scaffold`.

Expected commits:

1. `chore: scaffold Vite React Netlify stack`
2. Optional: `docs: document scaffold setup and verification`

Keep the milestone focused. Do not include unrelated docs cleanup or future feature preparation.

## Risks

- Local environment may not expose Node/npm until the existing nvm environment is loaded; do not install another Node copy.
- Running Vite scaffolding directly in a non-empty repo could overwrite documentation; use a temporary scaffold and copy deliberately.
- Netlify local function emulation may differ depending on whether the Vite plugin or Netlify CLI is used.
- `/api/health` routing must be validated through Netlify's supported route config, not by depending on default function URLs.
- Netlify preview deployment may require user-owned Netlify authentication or project setup.
- Dependency versions may change between planning and implementation; lock them in `package-lock.json` during implementation.
- Adding too many libraries in the scaffold could create premature architecture choices.

## Rollback Strategy

Because this milestone should be implemented on its own branch:

- If scaffolding goes wrong before commit, discard uncommitted changes on the milestone branch.
- If committed but not merged, reset or recreate the milestone branch.
- If merged and later rejected, revert the Milestone 1 PR/commit from `main`.
- No database migrations or external product resources should exist, so rollback should not require data cleanup.
- If a Netlify preview site was created only for the scaffold and is not wanted, disconnect/delete the preview/project from Netlify.

## Acceptance Criteria

- Human-approved spec and plan exist before implementation starts.
- The milestone branch may be created for planning and review before implementation approval, but no implementation commits may be added until the specification and implementation plan are explicitly approved by the human.
- Vite + React + TypeScript app scaffold exists.
- Netlify Functions scaffold exists with only a health/check function.
- `netlify.toml` builds to `dist` and points to `netlify/functions`.
- `netlify/functions/health.mts` exposes `/api/health` using supported Netlify function routing.
- `.env.example` contains no secrets and no future service credentials.
- Type-check passes.
- Lint passes.
- Tests pass.
- Production build passes.
- Local preview works.
- Health function is reachable locally at `/api/health`.
- If practical, Netlify preview deploy renders and `/api/health` is reachable.
- No Supabase integration, Supabase client configuration, Supabase Auth, database migrations, database tables, RLS policies, collection CRUD, music API, Discogs integration, MusicBrainz integration, OpenRouter integration, LLM calls, model wrappers, image recognition, Supabase Storage, recommendation logic, listening history, ratings/favorites, conversational state, product telemetry, or product feature logic is implemented.
- Documentation is updated only to explain how to run and verify the scaffold.

## Remaining Approval and Deployment Dependency

The human review decisions for Node.js 24, npm, Vitest, React Testing Library, jsdom, ESLint flat config, `/api/health`, and the planning branch name are reflected in this plan.

Human implementation approval was granted before implementation began. The approval gate was satisfied, and Milestone 1 implementation and verification have completed.

The early Netlify preview deployment remains conditional on Netlify authentication and project access being available. Remote Netlify preview remains pending because authenticated Netlify site/project access has not been established in this workflow; local scaffold and `/api/health` verification completed.

## Reference Documentation Checked

- Vite getting started and Node requirement: https://vite.dev/guide/
- Netlify Functions get started: https://docs.netlify.com/build/functions/get-started/
- Netlify Functions configuration and Node runtime behavior: https://docs.netlify.com/build/functions/configuration/
- Netlify file-based configuration: https://docs.netlify.com/build/configure-builds/file-based-configuration/
- Netlify Node 24 default announcement: https://www.netlify.com/changelog/2026-07-07-nodejs-24-default-new-sites/
- ESLint getting started and Node requirement: https://eslint.org/docs/latest/use/getting-started
- Vitest getting started: https://vitest.dev/guide/
- Vitest test file conventions: https://vitest.dev/guide/learn/writing-tests

## Stop Point

This was the original stop point before human approval.

Do not install dependencies, scaffold Vite, or modify application code until the human explicitly approves implementation. That approval was granted for Milestone 1, and the implementation and verification work has completed.

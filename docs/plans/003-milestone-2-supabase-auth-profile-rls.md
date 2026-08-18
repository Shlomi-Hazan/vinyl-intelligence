# 003 Milestone 2 Supabase Auth + Profile/RLS Implementation Plan

Status: approved and implemented

Milestone: 2 - Supabase Auth + Profile/RLS

Date: 2026-08-18

Approved: 2026-08-18

Implementation approval granted after human review of planning commit `62fe536ef7b21a138bea383d1fbc1c2afddf4411`.

Implemented: 2026-08-18

## Objective

Implement the authentication and first user-owned database boundary for Vinyl Intelligence:

- Supabase Auth.
- Minimal authenticated/unauthenticated React shell.
- Persistent browser session handling.
- `profiles` table linked to `auth.users`.
- Row Level Security policies proving self-only profile access.
- Verification evidence for Auth and RLS.

This milestone must not implement vinyl collection product features.

## Current Repository State

Starting point:

- Branch before planning: `main`.
- Approved merged Milestone 1 commit: `a9d3b3130299bb3e1d9b16e95b9a0eb54697d8e1`.
- Local `main` matched `origin/main` before the planning branch was created.
- Working tree was clean before branch creation.
- Planning branch: `codex/milestone-2-supabase-auth-profile-rls`.
- Current scaffold:
  - Vite + React + TypeScript.
  - Node 24 and npm.
  - ESLint flat config.
  - Vitest + React Testing Library + jsdom.
  - Netlify Vite plugin.
  - Minimal `src/App.tsx` shell.
  - Minimal `netlify/functions/health.mts`.
  - No Supabase code, migrations, auth UI, product schema, or product features yet.

Ignored local artifacts such as `node_modules/`, `dist/`, `.netlify/`, and `.DS_Store` may exist but are ignored by `.gitignore` and must not be staged.

## Approved Constraints

- Frontend: Vite + React + TypeScript.
- Backend privileged boundary: Netlify Functions.
- Database/Auth/Storage: Supabase.
- Deployment: Netlify.
- Normal browser database access should use browser-safe Supabase credentials plus RLS.
- Service-role credentials must never be exposed to the browser.
- Do not add Netlify Function complexity where Supabase Auth + RLS is sufficient.
- Do not implement collection CRUD or later product features.
- Do not use RAG, vector databases, or multi-agent architecture.
- Do not begin implementation until this plan and the matching specification are explicitly approved.

## Human Planning Decisions Recorded

Human review accepted these planning decisions before implementation approval:

- Authentication method: email + password.
- No magic-link-only flow in Milestone 2.
- No OAuth in Milestone 2.
- Hosted email confirmation remains enabled.
- Local Supabase development should configure `auth.email.enable_confirmations = true` to intentionally exercise the confirmation flow.
- Mailpit is the local confirmation-email mechanism.
- Do not add custom production SMTP in Milestone 2.
- Hosted SMTP/email-delivery limits remain a known constraint.
- Profile creation strategy: database trigger on `auth.users`.
- Trigger responsibility: create the profile row with `id = new.id` only.
- Do not copy `display_name` or other user metadata during signup.
- Display name is edited later through the protected profile workflow.
- Profile schema: `id`, nullable `display_name`, `created_at`, `updated_at`.
- Add a database-level `display_name` constraint: `NULL` allowed, otherwise trim-normalized/non-blank, maximum length 80 characters.
- Supabase CLI is approved as a project-scoped npm dev dependency.
- During implementation, verify the current stable Supabase CLI version from the official source or npm registry, pin it in `package.json`, and commit `package-lock.json`.
- Run Supabase CLI commands through `npx supabase`.
- Local Supabase CLI verification is the required database/RLS verification path.
- A Docker-compatible container runtime is required for implementation verification.
- If no compatible container runtime is available, stop and report the blocker instead of silently replacing the verification strategy.
- A hosted Supabase smoke test may be performed if project access is available, but it does not replace local migration/RLS tests.

Implementation approval has been granted. Keep implementation limited to this approved Milestone 2 scope.

## Official Documentation Checked

Official Supabase documentation checked during planning:

- React Auth quickstart: https://supabase.com/docs/guides/auth/quickstarts/react
- API keys: https://supabase.com/docs/guides/getting-started/api-keys
- User management and profiles: https://supabase.com/docs/guides/auth/managing-user-data
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Password-based Auth: https://supabase.com/docs/guides/auth/passwords
- Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- JavaScript Auth overview: https://supabase.com/docs/reference/javascript/auth
- `signUp`: https://supabase.com/docs/reference/javascript/auth-signup
- `signInWithPassword`: https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- `signInWithOtp`: https://supabase.com/docs/reference/javascript/auth-signinwithotp
- `signOut`: https://supabase.com/docs/reference/javascript/auth-signout
- `getSession`: https://supabase.com/docs/reference/javascript/auth-getsession
- `onAuthStateChange`: https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- Local development workflow: https://supabase.com/docs/guides/local-development/cli-workflows
- CLI testing/linting: https://supabase.com/docs/guides/local-development/cli/testing-and-linting
- Testing overview: https://supabase.com/docs/guides/local-development/testing/overview
- pgTAP: https://supabase.com/docs/guides/database/extensions/pgtap

## Proposed Files and Directories

Expected implementation files after approval:

```text
/
├── .env.example
├── README.md
├── package.json
├── package-lock.json
├── docs/
│   └── verification.md
├── src/
│   ├── App.tsx
│   ├── App.test.tsx
│   ├── auth/
│   │   ├── AuthForm.tsx
│   │   ├── AuthProvider.tsx
│   │   ├── auth-state.test.tsx
│   │   └── useAuth.ts
│   ├── lib/
│   │   └── supabase/
│   │       ├── client.ts
│   │       └── profile.ts
│   ├── profile/
│   │   ├── ProfilePanel.tsx
│   │   └── ProfilePanel.test.tsx
│   └── test/
│       └── ...
└── supabase/
    ├── config.toml
    ├── migrations/
    │   └── <timestamp>_create_profiles.sql
    └── tests/
        └── database/
            └── profiles_rls.test.sql
```

Exact file names may be adjusted during implementation if the approved plan is updated, but the scope must remain auth/profile/RLS only.

Do not create:

- `releases` migrations.
- `collection_items` migrations.
- catalog service files.
- AI/model files.
- image upload/storage files.
- recommendation/listening/rating/favorite modules.

## Proposed Dependencies and Tooling

Runtime dependency to add during implementation:

- `@supabase/supabase-js`

Reason:

- Official Supabase React guidance uses `@supabase/supabase-js` for browser Auth and database access.

Approved development dependency:

- `supabase`

Plan: add Supabase CLI as a project-scoped npm dev dependency during implementation.

Reason:

- Supabase official local-development docs support project-scoped npm installation.
- A project dev dependency makes the CLI version controlled by `package-lock.json`.
- It avoids relying on a developer's global CLI version.
- Commands can be run as `npx supabase ...`.

Implementation requirements:

- Verify the current stable CLI version from the official source or npm registry before adding it.
- Pin the CLI version in `package.json`; do not rely on an unbounded `latest` range.
- Commit `package-lock.json`.
- Run CLI commands through `npx supabase`.
- Do not install the CLI during this planning correction.

Tradeoffs:

- Supabase CLI local stack requires Docker or another compatible container runtime.
- Adding the CLI increases dependency surface.

Possible test helper dependency:

- `@testing-library/user-event` for realistic auth form interactions.

No service-role SDK, OAuth packages, UI frameworks, router libraries, RAG/vector libraries, or model SDKs should be added in Milestone 2.

## Supabase Client Setup

Planned browser client file:

```text
src/lib/supabase/client.ts
```

Responsibilities:

- Read `import.meta.env.VITE_SUPABASE_URL`.
- Read `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`.
- Create a browser Supabase client.
- Fail clearly in local development if required variables are missing.
- Export only browser-safe client behavior.

Do not create a service-role client in this milestone.

If a Netlify Function later needs to verify a user's JWT, that should be separately specified. Milestone 2 profile access can use Supabase Auth + RLS directly from the browser.

## Environment Variable Handling

Update `.env.example` during implementation to include:

```bash
# Browser-safe Supabase configuration. Safe only with RLS enabled.
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
```

Notes:

- `VITE_SUPABASE_PUBLISHABLE_KEY` may hold a legacy anon key if the project has not migrated to publishable keys yet.
- Browser-safe keys are not secrets, but RLS must be correct.
- Do not add real values.
- Do not add `.env`.
- Do not add `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, or JWT secrets.
- Server-only values must not use `VITE_`.

## Authentication UX Recommendation

Approved planning decision: email + password.

Reasoning:

- Smallest practical approach for a university demo.
- Familiar to users.
- Easier to repeatedly test than magic-link-only flows.
- Uses Supabase-native `signUp`, `signInWithPassword`, and `signOut`.
- Avoids OAuth provider configuration and secrets.
- Compatible with future password reset without implementing reset in this milestone.

Milestone 2 must not implement a magic-link-only flow or OAuth.

Email confirmation behavior:

- Hosted email confirmation remains enabled.
- Local Supabase should set `auth.email.enable_confirmations = true` so local behavior intentionally exercises the confirmation path.
- Use Mailpit for local confirmation email inspection.
- Implementation must include a clear "check your email" state after sign-up when confirmation is required.
- Do not add custom production SMTP in Milestone 2.
- Hosted SMTP/email-delivery limits remain a known constraint.

## Auth State Architecture in React

Recommended structure:

- `AuthProvider` owns session/user/profile loading state.
- `useAuth` exposes:
  - `session`
  - `user`
  - `profile`
  - `status`: `loading | unauthenticated | authenticated | profile_missing | error`
  - `signUp`
  - `signIn`
  - `signOut`
  - `updateProfile`
- `AuthProvider` initializes from Supabase Auth on load.
- `AuthProvider` subscribes to `onAuthStateChange`.
- The `onAuthStateChange` callback should stay synchronous and lightweight:
  - update session/auth state inside the callback
  - unsubscribe on cleanup
  - do not run profile/database fetching directly inside the callback
- Profile fetching should happen in a separate effect/service path keyed from the authenticated user/session.
- App shell conditionally renders:
  - loading state while session is unknown
  - auth form for unauthenticated users
  - protected profile shell for authenticated users
- No client-side router is required unless implementation discovers a practical need and the plan is updated/approved.

Use deterministic UI state for auth. Do not use LLMs for auth, profile, validation, or authorization.

## UI Changes

Minimal user-visible UI for Milestone 2:

- Unauthenticated state:
  - email field
  - password field if email/password is approved
  - sign-up action
  - sign-in action
  - concise error/success messages
- Authenticated state:
  - user email or user identifier from Supabase Auth
  - editable display name field
  - save profile action
  - sign-out action
  - simple protected shell status

Do not add:

- dashboard modules
- collection navigation
- album forms
- fake recommendations
- placeholder product panels

## Migration Approach

Use version-controlled SQL migrations under:

```text
supabase/migrations/
```

Approved implementation setup:

```bash
npx supabase init
npx supabase migration new create_profiles
```

The migration should be reviewed as source-controlled SQL. Do not make undocumented dashboard-only schema changes.

The generated local Supabase config should intentionally set:

```toml
[auth.email]
enable_confirmations = true
```

This keeps local Auth behavior aligned with hosted confirmation behavior for Milestone 2.

Implementation should also add database test files under:

```text
supabase/tests/database/
```

Required verification commands:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase db lint
```

Local Supabase CLI verification is required for Milestone 2. If the Supabase CLI or a Docker-compatible container runtime is unavailable during implementation, stop and report the blocker. Do not silently replace this with hosted-only verification.

A hosted Supabase smoke test may also be performed if project access is available, but it does not replace local deterministic migration/RLS/privilege tests.

## Proposed Profile Schema

Recommended SQL shape, subject to human approval before implementation:

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Required display-name constraint intent:

- `display_name` nullable.
- If non-null, trim-normalized/non-blank.
- Maximum length 80 characters.
- The database must enforce this boundary; React validation is useful UX but not authoritative.
- Exact SQL can be finalized during implementation review.

Timestamps:

- `created_at` defaults to `now()`.
- `updated_at` defaults to `now()` and should be maintained by a small trigger on profile update.

Do not include collection, catalog, preferences, images, recommendation, or listening data in `profiles`.

## Proposed Profile Creation Approach

Approved planning decision: database trigger on `auth.users`.

Planned behavior:

- After a new Supabase Auth user is inserted, a `public.profiles` row is inserted with `id = new.id`.
- Do not copy `display_name` from user metadata.
- Do not copy any other user metadata during signup.
- The display name should be edited later through the protected profile workflow.
- Trigger function is minimal, deterministic, and contains no external calls.
- Use `security definer` with a fixed/empty `search_path` and fully-qualified relation names.
- Prefer placing the trigger helper function in a non-exposed schema such as `private`.
- If implementation uses another schema, explicitly revoke `execute` from `public`, `anon`, and `authenticated`.
- No browser/client role should be able to invoke the profile-creation helper as an RPC.
- Test thoroughly because Supabase warns trigger failure can block signups.

Fallback/recovery behavior:

- If authenticated UI finds a missing profile, it should not silently create broad data.
- Preferred recovery after trigger strategy: show a clear profile setup/retry state and document whether a narrow repair path is needed.
- Do not add a service-role Netlify repair function unless explicitly approved.

## Proposed RLS Policies

Recommended policy intent:

```sql
alter table public.profiles enable row level security;

create policy "Users can select their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
```

## Proposed Data API Grants and Column Privileges

RLS restricts rows. Postgres grants and column privileges restrict operations and mutable columns. Milestone 2 must use both layers and must not depend on Supabase's evolving default Data API grants.

Grant/revoke intent:

- No `anon` profile access.
- Revoke all table privileges on `public.profiles` from `anon`.
- Revoke all table privileges on `public.profiles` from `authenticated`.
- Grant `select` on `public.profiles` to `authenticated`; RLS still limits rows to self.
- Grant column-limited `update (display_name)` on `public.profiles` to `authenticated`; RLS still limits rows to self.
- Do not grant normal client `insert`.
- Do not grant normal client `delete`.

Implementation shape to review:

```sql
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;

grant select
on table public.profiles
to authenticated;

grant update (display_name)
on table public.profiles
to authenticated;
```

Exact final migration SQL must be reviewed during implementation.

Do not add "all authenticated users can read all profiles" policies.

## Testing Approach

### Frontend tests

Use Vitest + React Testing Library.

Test:

- Unauthenticated auth form renders.
- Loading state renders while auth state is unknown.
- Authenticated profile shell renders with a supplied user/profile fixture.
- Profile update form validates the display name boundary.
- Sign-out action calls the auth handler.

Mock Supabase client behavior at the module/service boundary. Do not require a live Supabase project for unit/component tests.

### Database and RLS tests

Preferred automated approach:

- Use Supabase CLI local stack.
- Use `supabase/tests/database/profiles_rls.test.sql`.
- Use pgTAP for schema/policy assertions and controlled user-context tests.

Minimum behavior to verify:

- `profiles` table exists.
- `profiles.id` is primary key and references `auth.users(id)` with `on delete cascade`.
- RLS is enabled on `profiles`.
- Only expected policies exist.
- Expected Data API grants exist.
- User A can select User A profile.
- User A cannot select User B profile.
- An unauthenticated/anon role cannot select profile rows.
- User A can update User A `display_name`.
- User A cannot update User B profile.
- Normal authenticated clients cannot delete profile rows.
- Normal authenticated clients cannot insert profile rows directly.
- Normal authenticated clients cannot update protected columns such as `id`, `created_at`, or `updated_at`.
- Creating a new auth user creates exactly one profile row.
- Normal API roles cannot execute the profile-creation helper function.
- Deleting an auth user cascades to the profile row in the controlled database test environment.

Do not treat "migration applied" as RLS verification. Policy and privilege behavior must be exercised.

### Integration/manual tests

Manual or controlled-hosted checks:

- Sign up with the approved auth method.
- Confirm email if confirmation is enabled.
- Sign in.
- Refresh and confirm session restoration.
- Update display name.
- Sign out.
- Verify signed-out state.
- Use two test users to confirm cross-profile denial.
- Confirm direct profile insert/delete attempts fail for normal authenticated clients.
- Confirm protected column updates fail for normal authenticated clients.

Record evidence in `docs/verification.md` after implementation.

## Verification Commands

Expected application checks after implementation:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
git diff --check
git status --short --branch
```

Required Supabase checks:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase db lint
```

If a Docker-compatible container runtime is unavailable, stop and report the blocker rather than claiming database/RLS verification is complete.

Expected security checks:

- Secret-pattern scan excluding `.git/`, `node_modules/`, `dist/`, `.netlify/`, `.supabase/`, and build artifacts.
- Confirm no `SUPABASE_SERVICE_ROLE_KEY` or secret key is committed.
- Confirm browser bundle/config uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Confirm `anon` has no `public.profiles` privileges.
- Confirm `authenticated` can update only `display_name` on `public.profiles`.
- Confirm the profile-creation helper is not executable by `public`, `anon`, or `authenticated`.
- Confirm the helper function uses a fixed/empty `search_path` and fully-qualified table names.
- Confirm no collection/catalog/AI/product feature code was introduced.

## Implementation Commit Strategy

Implementation should happen only after explicit human approval on:

```text
codex/milestone-2-supabase-auth-profile-rls
```

Expected commits:

1. `chore: add Supabase auth foundation`
   - dependencies, Supabase client, auth state, minimal auth/profile UI
2. `db: add profiles RLS migration`
   - Supabase config/migration/tests
3. Optional: `docs: record milestone 2 verification`
   - setup and verification evidence

Keep commits coherent. Do not mix Milestone 3 collection schema or product UI into Milestone 2.

## Known Risks

- Hosted Supabase email confirmation defaults may differ from local development behavior.
- Supabase's default email sender is limited and not suitable for production; production SMTP belongs later unless needed for demo reliability.
- Magic-link/OTP flows require redirect/template handling and can be fragile in demos if email delivery is delayed.
- Database trigger profile creation is reliable for invariants but can block signup if implemented incorrectly.
- RLS policies can appear correct in SQL but still fail behaviorally; policy tests are required.
- Supabase CLI local stack requires Docker/container runtime availability; absence of a compatible runtime is an implementation blocker.
- Adding Supabase CLI as a dev dependency increases dependency surface, so its pinned version must be verified and reviewed.
- Publishable/anon keys are safe to expose only when RLS and grants are correct.
- RLS alone does not restrict mutable columns; explicit grants/column privileges are required.
- A `security definer` trigger helper can become dangerous if it is exposed as callable RPC; schema placement and execute revokes must be verified.
- Existing Milestone 1 Netlify tooling has documented dev-only audit findings; dependency changes should re-run audit.

## Rollback and Recovery

Because implementation should happen on a milestone branch:

- If frontend auth work is wrong before merge, revert or amend the milestone branch before PR approval.
- If migration SQL is wrong before merge, create a corrective migration on the same branch rather than editing an already-applied remote migration.
- If a migration reaches a shared remote Supabase project and must be reversed, add a deliberate rollback migration; do not mutate dashboard schema manually.
- If profile trigger blocks signup in a test environment, disable/drop the trigger in a corrective migration and update the strategy before merge.
- Do not reset a linked remote database unless it is a disposable dev/staging project and the human explicitly approves.

## Resolved Pre-Implementation Approval Decisions

These decisions were required before implementation while this plan was still
proposed. They were resolved through human review, planning refinement commit
`62fe536ef7b21a138bea383d1fbc1c2afddf4411`, implementation approval commit
`00937c73e7ccb8e67b151f6b0c7d3e3c22a68059`, and subsequent approved
implementation:

- Adding `@supabase/supabase-js` was approved.
- Pinning the Supabase CLI as a project-scoped npm dev dependency was approved.
- The implemented display-name constraint was reviewed as part of the milestone
  implementation.
- The implemented grants/revokes, RLS policies, trigger helper schema, and
  execute revokes were reviewed as part of the milestone implementation.
- Hosted Supabase smoke testing remains conditional on hosted project access and
  does not replace the required local Supabase CLI verification path.
- No Netlify Function auth verification helper was added for the normal profile
  workflow.
- Explicit implementation approval for Milestone 2 was granted before
  implementation began.

## Stop Point

This was the pre-implementation stop point. It preserved the approval gate:
dependencies, Supabase client files, migrations, SQL, auth components,
`.env.example` changes, and Milestone 2 implementation were prohibited until the
human explicitly approved this specification and implementation plan. That gate
has now been satisfied, and Milestone 2 implementation and verification have
completed.

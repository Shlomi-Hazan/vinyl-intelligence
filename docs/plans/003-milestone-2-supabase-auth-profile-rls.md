# 003 Milestone 2 Supabase Auth + Profile/RLS Implementation Plan

Status: proposed for human approval

Milestone: 2 - Supabase Auth + Profile/RLS

Date: 2026-08-18

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

Possible development dependency:

- `supabase`

Recommendation: add Supabase CLI as an npm dev dependency during implementation if the human approves local migration/RLS verification as part of the repo workflow.

Reason:

- Supabase official local-development docs support project-scoped npm installation.
- A project dev dependency makes the CLI version controlled by `package-lock.json`.
- It avoids relying on a developer's global CLI version.
- Commands can be run as `npx supabase ...`.

Tradeoffs:

- Supabase CLI local stack requires Docker or another compatible container runtime.
- Adding the CLI increases dependency surface.
- If the human prefers global installation, the repo can document a required external CLI version instead.

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

Recommended method: email + password.

Reasoning:

- Smallest practical approach for a university demo.
- Familiar to users.
- Easier to repeatedly test than magic-link-only flows.
- Uses Supabase-native `signUp`, `signInWithPassword`, and `signOut`.
- Avoids OAuth provider configuration and secrets.
- Compatible with future password reset without implementing reset in this milestone.

Magic link / OTP remains a reasonable alternative, but it depends more heavily on email delivery, redirect template handling, Mailpit/local email inspection, and hosted email limits.

Human approval required:

- Approve email + password for Milestone 2, or choose magic link/OTP.
- Decide whether hosted email confirmation stays enabled for Milestone 2. Hosted Supabase projects enable email confirmation by default, while local development differs. If confirmation is enabled, implementation must include a clear "check your email" state and local Mailpit instructions.

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

Recommended implementation setup if Supabase CLI is approved:

```bash
npx supabase init
npx supabase migration new create_profiles
```

The migration should be reviewed as source-controlled SQL. Do not make undocumented dashboard-only schema changes.

Implementation should also add database test files under:

```text
supabase/tests/database/
```

Recommended verification commands if the local stack is available:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase db lint
```

If local Docker/Supabase CLI is unavailable, use a controlled hosted Supabase project and document the exact verification gap and substitute checks. Do not claim RLS is verified unless policy behavior has been exercised.

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

Potential additional constraints:

- `display_name` nullable.
- If non-null, trim/check length between 1 and 80 characters.

Timestamps:

- `created_at` defaults to `now()`.
- `updated_at` defaults to `now()` and should be maintained by a small trigger on profile update.

Do not include collection, catalog, preferences, images, recommendation, or listening data in `profiles`.

## Proposed Profile Creation Approach

Recommendation: database trigger on `auth.users`.

Planned behavior:

- After a new Supabase Auth user is inserted, a `public.profiles` row is inserted with `id = new.id`.
- Optionally copy `display_name` from `new.raw_user_meta_data ->> 'display_name'`.
- Trigger function is minimal, deterministic, and contains no external calls.
- Use `security definer set search_path = ''`.
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

Recommended grants/permissions:

- No `anon` profile access.
- `authenticated` can select own rows through RLS.
- `authenticated` can update approved mutable columns, initially `display_name`.
- Normal client INSERT is not granted if trigger strategy is approved.
- Normal client DELETE is not granted in Milestone 2.

If the application-side profile creation strategy is approved instead, add a narrow INSERT policy:

```sql
for insert
to authenticated
with check ((select auth.uid()) = id)
```

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
- User A can select User A profile.
- User A cannot select User B profile.
- An unauthenticated/anon role cannot select profile rows.
- User A can update User A `display_name`.
- User A cannot update User B profile.
- Normal authenticated clients cannot delete profile rows.
- Normal authenticated clients cannot insert profile rows if trigger strategy is approved.

Do not treat "migration applied" as RLS verification. Policy behavior must be exercised.

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

Expected Supabase checks if CLI/local stack is approved and available:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase db lint
```

Expected security checks:

- Secret-pattern scan excluding `.git/`, `node_modules/`, `dist/`, `.netlify/`, `.supabase/`, and build artifacts.
- Confirm no `SUPABASE_SERVICE_ROLE_KEY` or secret key is committed.
- Confirm browser bundle/config uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
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
- Supabase CLI local stack requires Docker/container runtime availability.
- Adding Supabase CLI as a dev dependency increases dependency surface and should be approved.
- Publishable/anon keys are safe to expose only when RLS and grants are correct.
- Existing Milestone 1 Netlify tooling has documented dev-only audit findings; dependency changes should re-run audit.

## Rollback and Recovery

Because implementation should happen on a milestone branch:

- If frontend auth work is wrong before merge, revert or amend the milestone branch before PR approval.
- If migration SQL is wrong before merge, create a corrective migration on the same branch rather than editing an already-applied remote migration.
- If a migration reaches a shared remote Supabase project and must be reversed, add a deliberate rollback migration; do not mutate dashboard schema manually.
- If profile trigger blocks signup in a test environment, disable/drop the trigger in a corrective migration and update the strategy before merge.
- Do not reset a linked remote database unless it is a disposable dev/staging project and the human explicitly approves.

## Unresolved Human Approval Decisions

Required before implementation:

- Approve email + password, or choose magic link/OTP.
- Decide email confirmation behavior for Milestone 2 local and hosted verification.
- Approve database trigger profile creation, or choose application-side/server-side creation.
- Approve minimal `profiles` schema and whether `display_name` should have a length constraint.
- Approve adding `@supabase/supabase-js`.
- Approve Supabase CLI strategy: npm dev dependency versus externally installed CLI.
- Decide whether RLS verification must use local Supabase CLI, a hosted dev project, or both.
- Confirm whether any Netlify Function auth verification helper is needed in Milestone 2. Recommendation: no, not for the profile workflow.

## Stop Point

Stop here until human approval.

Do not install dependencies, create Supabase client files, create migrations, write SQL, create auth components, alter `.env.example`, or implement Milestone 2 until the human explicitly approves this specification and implementation plan.

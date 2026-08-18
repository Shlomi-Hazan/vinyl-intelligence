# 0003 Milestone 2 Supabase Auth + Profile/RLS Specification

Status: approved and implemented

Milestone: 2 - Supabase Auth + Profile/RLS

Date: 2026-08-18

Approved: 2026-08-18

Implementation approval granted after human review of planning commit `62fe536ef7b21a138bea383d1fbc1c2afddf4411`.

Implemented: 2026-08-18

## Intent

Establish the first authenticated, user-owned data boundary for Vinyl Intelligence.

This milestone should prove that the approved Supabase Auth and Row Level Security foundation works before any vinyl collection data is introduced. It should let the app distinguish authenticated and unauthenticated users, persist/restore an authenticated session, create a corresponding minimal profile row, and enforce that each user can read/update only their own profile.

This is not a product-feature milestone. It must not start collection CRUD, music catalog integration, AI, image recognition, recommendations, listening history, ratings, or any later workflow.

## Approved Architectural Context

Approved project decisions that apply to this milestone:

- Frontend: Vite + React + TypeScript.
- Backend privileged boundary: Netlify Functions.
- Database/Auth/Storage: Supabase.
- Deployment: Netlify.
- Browser database access may use Supabase browser-safe credentials when Row Level Security is authoritative.
- Supabase service-role credentials must never be exposed to the browser.
- Privileged operations belong behind Netlify Functions only when they are justified.
- Normal Supabase Auth and RLS should be used directly where sufficient.
- No RAG, vector database, or multi-agent architecture.

Milestone 2 should use Supabase Auth + RLS directly from the browser for the minimal profile workflow. It should not add service-role access unless the human explicitly approves a specific need.

## Official Supabase Guidance Checked

Planning is based on current official Supabase documentation checked on 2026-08-18:

- [Use Supabase Auth with React](https://supabase.com/docs/guides/auth/quickstarts/react)
- [Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [User Management](https://supabase.com/docs/guides/auth/managing-user-data)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Password-based Auth](https://supabase.com/docs/guides/auth/passwords)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [JavaScript Auth reference](https://supabase.com/docs/reference/javascript/auth)
- [signUp](https://supabase.com/docs/reference/javascript/auth-signup)
- [signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [signInWithOtp](https://supabase.com/docs/reference/javascript/auth-signinwithotp)
- [signOut](https://supabase.com/docs/reference/javascript/auth-signout)
- [getSession](https://supabase.com/docs/reference/javascript/auth-getsession)
- [onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- [Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Testing and linting](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Testing Overview](https://supabase.com/docs/guides/local-development/testing/overview)
- [pgTAP: Unit Testing](https://supabase.com/docs/guides/database/extensions/pgtap)

Relevant findings:

- Supabase React guidance uses `@supabase/supabase-js` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Supabase now recommends publishable keys for browser/client-side operations where available; legacy anon keys remain a fallback.
- Publishable/anon keys are browser-safe only when RLS and grants are correctly configured.
- Secret keys and legacy service-role keys are elevated, bypass RLS, and belong only in backend components.
- `auth.users` is managed by Supabase and is not exposed through the generated API; application profile data should live in a protected public table referencing `auth.users`.
- Supabase user-management docs show a `public.profiles` table with a foreign key to `auth.users` and `on delete cascade`.
- Supabase documents an `auth.users` trigger as a profile creation option, while warning that trigger failure can block signups.
- RLS policies should specify roles with `to authenticated` and commonly use `(select auth.uid())` patterns.
- Supabase CLI supports version-controlled local migrations, local stack startup, database reset, database linting, and pgTAP database tests.

## Human Planning Decisions Recorded

Human review accepted these planning decisions before implementation approval:

- Authentication method: email + password.
- Do not implement a magic-link-only flow in Milestone 2.
- Do not implement OAuth in Milestone 2.
- Hosted email confirmation remains enabled.
- Local Supabase development should configure `auth.email.enable_confirmations = true` so local auth intentionally exercises the confirmation flow.
- Mailpit is the local confirmation-email mechanism.
- Do not add custom production SMTP in Milestone 2.
- Hosted SMTP/email-delivery limits remain a known constraint.
- Profile creation strategy: database trigger on `auth.users`.
- Trigger responsibility: create one profile row with `id = new.id` only.
- Do not copy `display_name` or other user metadata during signup.
- Display name is edited later through the protected profile workflow.
- Profile schema: `id`, nullable `display_name`, `created_at`, and `updated_at`.
- Enforce the display-name boundary in the database, not only in React.
- Supabase CLI is approved as a project-scoped npm dev dependency, pinned to a verified current stable version during implementation.
- Run Supabase CLI through `npx supabase`.
- Local Supabase CLI verification is the required Milestone 2 database/RLS verification path.
- A Docker-compatible container runtime is required for implementation verification.
- If no compatible container runtime is available during implementation, stop and report the blocker.
- A hosted Supabase smoke test may be added if project access is available, but it does not replace local migration/RLS tests.

Implementation approval has been granted. Keep implementation limited to this approved Milestone 2 scope.

## User Outcome

After Milestone 2 implementation, a reviewer should be able to verify:

- An unauthenticated visitor sees an authentication entry point.
- A user can sign up or sign in using the approved authentication method.
- The authenticated session is restored after a page refresh.
- A user can sign out.
- The app can clearly distinguish authenticated from unauthenticated state.
- An authenticated user has a corresponding `profiles` row.
- A signed-in user can read their own profile.
- A signed-in user can update only allowed fields on their own profile.
- A signed-in user cannot read or update another user's profile.
- An unauthenticated user cannot read profile rows.
- No secrets are exposed to browser code or committed files.

## In Scope

- Add Supabase browser client setup using browser-safe environment variables.
- Add minimal Supabase Auth UI and state handling.
- Implement the approved authentication method after human selection.
- Restore session state on refresh.
- Subscribe to auth state changes and cleanly handle sign out.
- Add version-controlled Supabase migration files for the `profiles` table and policies.
- Add a minimal `profiles` table linked 1:1 to `auth.users`.
- Add RLS policies for self-profile select/update.
- Add a safe profile creation path.
- Add tests and verification steps for auth state, profile ownership, and RLS.
- Update `.env.example` during implementation with browser-safe Supabase variables only.
- Update README/setup docs only as needed for Milestone 2 local setup.

## Out of Scope

Do not implement:

- Collection CRUD.
- `releases` or `collection_items` product schema.
- Discogs, MusicBrainz, or Cover Art Archive integration.
- Image recognition or cover-photo upload/storage.
- Supabase Storage.
- OpenRouter or any LLM calls.
- Recommendations.
- Listening history.
- Ratings, favorites, or notes.
- Conversational refinement.
- Production deployment work.
- RAG or vector databases.
- Multi-agent systems.
- Placeholder product flows for later milestones.
- Social OAuth unless separately justified and explicitly approved.

## Authentication Behavior

### Options Evaluated

Email + password:

- Pros: familiar UX, straightforward sign-up/sign-in/sign-out APIs, easy repeated demo login, easier automated testing than email-only login, compatible with future password reset.
- Cons: introduces password fields, must account for email confirmation behavior, password reset is future scope, hosted projects need email sending configuration for confirmation flows.

Magic link / OTP:

- Pros: no password to remember, Supabase has current React quickstart examples, reduces password UI.
- Cons: every login depends on email delivery or local Mailpit, requires email template/redirect handling, less convenient for repeated classroom demos, harder to automate cleanly.

Social OAuth:

- Pros: convenient for users who have an account with the provider.
- Cons: additional provider setup, callback configuration, credentials, and review surface. Not required by product intent.

### Recommendation

Approved planning decision: use email + password for Milestone 2.

Reasoning: it is the smallest sensible approach for a university project because it is understandable, repeatable for demos, compatible with Supabase Auth and RLS, easier to test than magic-link-only login, and avoids OAuth setup complexity. Email confirmation behavior must still be handled deliberately.

Milestone 2 must not implement a magic-link-only flow or OAuth.

Hosted email confirmation should remain enabled. Local Supabase development should configure `auth.email.enable_confirmations = true` so local behavior exercises the same confirmation path instead of relying on the local default. Mailpit should be documented as the local confirmation-email mechanism. Do not add custom production SMTP in Milestone 2; hosted SMTP/email-delivery limitations remain a known constraint.

## Session Behavior

The implementation should:

- Use Supabase Auth's browser session persistence.
- Initialize auth state on app load using the Supabase client.
- Subscribe to auth events with `onAuthStateChange`.
- Keep the `onAuthStateChange` callback synchronous and lightweight: update session/auth state inside the callback and unsubscribe on cleanup.
- Fetch profile data in a separate effect/service path keyed from the authenticated user/session.
- Do not bury asynchronous profile/database work directly inside the auth-state-change callback.
- Treat `SIGNED_IN`, `SIGNED_OUT`, token refresh, and initial session states explicitly.
- Restore authenticated UI after refresh when a valid session exists.
- Show a stable loading state while auth state is being determined.
- Sign out using the current-session behavior unless the human approves global sign-out.

The UI must not claim collection features exist after sign-in. A protected shell/profile state is sufficient.

## Profile Model

Minimal `profiles` table for this milestone:

| Field | Type | Requirement | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | Primary key, not null | 1:1 with `auth.users.id`. |
| `display_name` | `text` | Nullable | Minimal user-editable profile field. Database-level constraint required. |
| `created_at` | `timestamptz` | Not null, default `now()` | Created automatically. |
| `updated_at` | `timestamptz` | Not null, default `now()` | Updated by trigger/function when editable fields change. |

Relationship:

- `profiles.id` references `auth.users(id)` with `on delete cascade`.

Display-name boundary:

- `NULL` is allowed.
- Non-null values must be trim-normalized/non-blank.
- Maximum length is 80 characters.
- The database must enforce this boundary; React validation may duplicate it for UX but is not sufficient.
- The exact SQL expression can be finalized during implementation review.

Do not add vinyl collection state, catalog metadata, AI preferences, listening history, ratings, favorites, notes, recommendation preferences, or avatar/storage fields in this milestone.

## Profile Creation Strategy

Options:

Database trigger on new `auth.users`:

- Pros: creates the profile close to the identity event, avoids missing profiles when browser code fails after sign-up, preserves a 1:1 database invariant, does not require normal clients to insert profile rows.
- Cons: Supabase warns trigger failure can block signups, so the trigger must be minimal and thoroughly tested.

Application-side creation after authentication:

- Pros: simpler to reason about in React code, easier to show a retry UI if profile insert fails.
- Cons: can leave authenticated users without profiles, requires an INSERT policy or privileged backend path, and makes first-login recovery more complex.

Netlify Function creation:

- Pros: can centralize recovery and validation if privileged service-role access is later needed.
- Cons: introduces server-side complexity and potentially a service-role secret for a workflow that Supabase Auth + RLS can handle without it.

Approved planning decision: use a minimal database trigger on `auth.users` to create `public.profiles`.

Rationale: the profile row is foundational identity-linked data, not product data. A trigger gives the strongest invariant and lets normal clients avoid profile inserts. To reduce risk, the trigger should insert only `id = new.id`, avoid copying `display_name` or any other user metadata during signup, avoid external calls, use a fixed/empty search path with fully-qualified relation names, and be covered by migration/RLS/privilege tests.

The profile-creation trigger requires a `security definer` function. Prefer placing the trigger helper in a non-exposed schema such as `private`. If implementation uses another schema, it must explicitly revoke `execute` on the helper function from `public`, `anon`, and `authenticated`. No browser/client role should be able to invoke the profile-creation helper as an RPC.

## RLS Requirements

Milestone 2 must define and verify concrete Row Level Security behavior:

- Enable RLS on `public.profiles`.
- Do not allow unauthenticated users to read profile rows.
- Authenticated users may select only their own profile.
- Authenticated users may update only their own profile.
- Authenticated users may update only approved mutable profile fields, initially `display_name`.
- One user cannot read another user's profile.
- One user cannot update another user's profile.
- Normal clients should not be allowed to insert profile rows if the trigger strategy is approved.
- Normal clients should not be allowed to delete profile rows in Milestone 2.
- Do not add broad policies such as "all authenticated users can select all profiles."
- Use `to authenticated` and `(select auth.uid()) = id` style policy predicates.

RLS and Data API privileges are separate layers:

- RLS restricts which rows are visible or mutable.
- Postgres grants and column privileges restrict operations and mutable columns.
- The migration must not rely on Supabase's evolving default Data API grants.
- Both layers must be tested behaviorally.

Proposed policy intent:

- `select own profile`: `for select to authenticated using ((select auth.uid()) = id)`.
- `update own profile`: `for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id)`.

Required grant intent:

- Revoke all table privileges on `public.profiles` from `anon`.
- Revoke all table privileges on `public.profiles` from `authenticated`.
- Grant `select` on `public.profiles` to `authenticated`.
- Grant column-limited `update (display_name)` on `public.profiles` to `authenticated`.
- Do not grant normal client `insert`.
- Do not grant normal client `delete`.

Implementation shape to review during migration work:

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

The exact final migration SQL must be reviewed during implementation. DELETE should not be exposed to the normal app in Milestone 2.

## Security Requirements

- Never commit `.env`, real Supabase URLs/keys for private projects, tokens, or credentials.
- Browser code may receive only the Supabase project URL and publishable key or legacy anon key.
- No `VITE_` variable may contain a secret key, service-role key, database URL, or JWT secret.
- Do not introduce a Supabase service-role key for Milestone 2 unless a later approved implementation plan proves it is necessary.
- RLS must be enabled before profile data is considered safe.
- Explicit least-privilege grants/revokes must be defined before profile data is considered safe.
- `anon` must have no Data API access to `public.profiles`.
- `authenticated` may select through RLS and may update only the `display_name` column through column-level privileges plus RLS.
- `authenticated` must not have normal INSERT or DELETE privileges on `public.profiles`.
- Do not rely on Supabase default grants for profile access.
- Profile metadata must not be used as authorization data.
- Do not rely on client-side route hiding as authorization.
- Do not log access tokens, refresh tokens, or user profile contents unnecessarily.
- Auth and database errors should be visible enough for the user to recover, without revealing sensitive internals.
- The profile-creation helper should live in a non-exposed schema such as `private`.
- If the helper function is not in a non-exposed schema, explicitly revoke `execute` from `public`, `anon`, and `authenticated`.
- The helper function must use a fixed/empty `search_path` and fully-qualified relation names.
- No browser/client role may invoke the profile-creation helper as an RPC.

## Environment Variable Boundary

Browser-safe variables planned for `.env.example` during implementation:

```bash
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
```

Legacy fallback if the selected Supabase project has not migrated keys:

```bash
VITE_SUPABASE_PUBLISHABLE_KEY="your-legacy-anon-key"
```

Do not add these in Milestone 2 unless explicitly justified and approved:

- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_JWT_SECRET`
- OAuth provider secrets
- Netlify auth tokens

Server-only variables must never use the `VITE_` prefix.

## Error and Failure Behavior

The implementation should handle:

- Missing Supabase environment variables with a clear local setup failure.
- Sign-up validation errors.
- Sign-in errors without exposing whether an account exists beyond Supabase's safe error behavior.
- Email confirmation pending state if email confirmation is enabled.
- Expired or invalid auth session.
- Sign-out failure.
- Missing profile after sign-in, with a safe recovery message/path.
- Profile update validation failure.
- RLS denial/cross-user access failure during verification.
- Network/API errors from Supabase.

Do not fabricate a signed-in state or profile when Supabase fails.

## Testing Requirements

Minimum implementation verification must include:

- TypeScript type-check.
- ESLint.
- Vitest component/unit tests for auth state rendering and profile UI behavior where practical.
- Supabase migration verification using the local Supabase CLI stack.
- Local Supabase CLI migration/RLS/privilege verification.
- RLS and privilege verification that exercises behavior, not merely SQL presence.
- Secret scan.
- Build verification.

Database verification must use the local Supabase CLI stack. If a Docker-compatible container runtime is unavailable during implementation, stop and report the blocker rather than silently replacing the verification strategy. A hosted Supabase smoke test may be added when project access exists, but it does not replace local deterministic migration/RLS tests.

RLS and privilege verification must demonstrate at least:

- User A can select User A profile.
- User A cannot select User B profile.
- `anon` cannot read profiles.
- User A can update User A `display_name`.
- User A cannot update User B profile.
- An authenticated client cannot insert a profile directly.
- An authenticated client cannot delete a profile.
- An authenticated client cannot update protected columns such as `id`, `created_at`, or `updated_at`.
- The profile trigger creates exactly one profile for a newly created auth user.
- The trigger helper is not executable by normal API roles.
- Deleting an auth user cascades to its profile in the controlled database test environment.

Recommended database testing approach:

- Use the Supabase CLI local stack.
- Use pgTAP tests under `supabase/tests/database/` for schema/policy structure and behavior.
- Supplement with a controlled integration test using Supabase client sessions if practical.

## Acceptance Criteria

- Human-approved specification and implementation plan exist before implementation begins.
- Milestone 2 planning branch exists and contains only planning documentation before implementation approval.
- Auth UX method is explicitly approved by the human.
- Profile creation strategy is explicitly approved by the human.
- Local email confirmation behavior intentionally exercises confirmation flow with Mailpit.
- Supabase CLI local migration/RLS/privilege verification runs successfully.
- Supabase browser client uses only browser-safe configuration.
- No service-role or secret key is introduced unless explicitly approved.
- User can sign up/sign in using the approved method.
- Authenticated session restores after refresh.
- User can sign out.
- Authenticated user has a corresponding profile row.
- User can read/update only their own allowed profile fields.
- User cannot read/update another user's profile.
- Unauthenticated users cannot read protected profile data.
- RLS and privilege tests meaningfully verify ownership, allowed operations, protected columns, trigger creation, trigger-helper non-executability, and auth-user cascade behavior.
- No collection, catalog, AI, image, recommendation, listening, rating, or favorite feature is implemented.
- Type-check, lint, tests, build, migration verification, RLS verification, and secret scan pass before completion is claimed.

## Human Approval Decisions Still Required

- Approve adding `@supabase/supabase-js` as a runtime dependency during implementation.
- Approve the exact pinned Supabase CLI version after implementation verifies the current stable version from the official source or npm registry.
- Approve the exact SQL for the profile table display-name constraint.
- Approve the exact SQL for grants/revokes, RLS policies, trigger helper schema, and function execute revokes during implementation review.
- Confirm whether a hosted Supabase smoke test should be attempted in addition to required local verification if project access is available.
- Grant explicit implementation approval for Milestone 2.

## Stop Point

Stop after this specification and the implementation plan are reviewed.

Do not install dependencies, create Supabase client files, create migrations, write SQL, build auth UI, or implement Milestone 2 until the human explicitly approves implementation.

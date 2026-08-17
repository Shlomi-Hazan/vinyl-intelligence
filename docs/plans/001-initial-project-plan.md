# 001 Initial Project Plan

Last updated: 2026-08-17.

This plan divides Vinyl Intelligence into small vertical milestones. Each milestone should leave the repository in a working state. Do not let stretch features enter MVP accidentally.

## Scope Split

### MVP

- Authentication
- Persistent personal collection
- API-based record search/add
- Browse collection
- Manual search
- Genre/year/decade filtering
- Listening history
- Basic AI recommendation from owned records
- Deployment

### Final Project

- AI cover-photo identification
- Candidate confirmation workflow
- Ratings/favorites
- Richer recommendation logic
- Conversational refinement
- Stronger failure handling
- Model/API telemetry
- Complete verification and documentation
- UI polish

### Stretch

- Forgotten gems dashboard
- Recommendation presets
- Personal listening statistics and charts
- External discovery clearly separated from owned recommendations
- Barcode/catalog-number recognition
- Import/export
- Model comparison mode
- Carefully justified recommendation critic workflow

## Milestone 0: Repository and Engineering Foundation

Objective: establish source of truth, documentation, agent instructions, and local Git baseline.

User-visible result: reviewer can inspect the repository and understand the product, constraints, architecture direction, and roadmap.

Files/components likely affected:

- `intent.txt`
- `README.md`
- `AGENTS.md`
- `.gitignore`
- `docs/**`

Database work: none.

APIs involved: none at runtime; provider docs reviewed only.

Acceptance criteria:

- `intent.txt` exists at repository root.
- Required documentation structure exists.
- `AGENTS.md` includes permanent workflow and AI/security boundaries.
- No application features are claimed as implemented.

Verification:

- Inspect files.
- Review diff for secrets.
- Confirm Git status and initial commit.

Dependencies: none.

## Milestone 1: Stack Scaffold and Environment Contract

Objective: create the approved frontend/backend skeleton without feature logic.

User-visible result: local app renders a minimal authenticated-app shell or placeholder and can build.

Files/components likely affected:

- package files
- frontend app directory
- backend/functions directory if selected
- `.env.example`
- setup docs

Database work: none or local Supabase placeholder config only.

APIs involved: none.

Acceptance criteria:

- App starts locally.
- TypeScript, lint, and build scripts exist.
- `.env.example` documents required variables without secrets.
- README setup is updated.

Verification:

- Install dependencies.
- Run type check/lint/build.
- Open local app.

Dependencies: approved stack decision.

## Milestone 2: Auth and User Profile Vertical Slice

Objective: implement sign up/login/logout and per-user profile bootstrap.

User-visible result: user can create/login to an account and see a protected app shell.

Files/components likely affected:

- auth UI
- auth client/server helpers
- profile API/database code
- protected routing
- auth spec

Database work:

- `profiles` table
- RLS policies
- profile creation trigger or server path

APIs involved:

- Supabase Auth if approved

Acceptance criteria:

- Logged-out users cannot access protected collection pages.
- Logged-in users see their own profile context.
- User A cannot read/update User B profile.

Verification:

- Auth manual flow.
- RLS tests or SQL policy checks.
- Type check/lint/build.

Dependencies: Milestone 1.

## Milestone 3: Manual Collection CRUD Baseline

Objective: store owned records manually before external catalog complexity.

User-visible result: user can add, view, edit, and delete a manually entered record.

Files/components likely affected:

- collection pages
- add/edit record forms
- album detail route
- collection services
- database migrations

Database work:

- `releases`
- `collection_items`
- ownership policies

APIs involved: none.

Acceptance criteria:

- Manual record persists after refresh.
- User can edit/delete owned record.
- User A cannot access User B records.
- Duplicate policy is at least documented, even if richer duplicate handling waits for catalog IDs.

Verification:

- CRUD tests/manual checks.
- RLS checks.
- Type check/lint/build.

Dependencies: Milestone 2.

## Milestone 4: Catalog Search and Add Vertical Slice

Objective: search a music catalog, show candidates, import selected metadata, and save to the user's collection.

User-visible result: user searches artist/title, selects a candidate, confirms, and sees the imported record in collection.

Files/components likely affected:

- catalog search UI
- backend catalog service
- candidate result components
- release normalization code
- duplicate warning UI
- API integration spec

Database work:

- provider identifiers on `releases`
- unique `(provider, provider_release_id)` constraint
- duplicate checks in `collection_items`

APIs involved:

- Discogs or MusicBrainz, selected after verification

Acceptance criteria:

- Search returns candidate releases.
- Metadata import stores artist, title, year, genre/style if available, label/format/tracklist where available.
- Exact duplicate warns before adding.
- API failure and no-match states are visible.

Verification:

- Mocked provider tests where possible.
- Manual search/add with at least three records.
- Type check/lint/build.

Dependencies: Milestones 2 and 3, catalog provider decision.

## Milestone 5: Browse, Search, Filter, and Album Detail

Objective: make the collection useful without AI.

User-visible result: user can browse covers/list, search by artist/title, filter by genre/year/decade, and open album details.

Files/components likely affected:

- collection grid/list
- filter controls
- album detail
- query helpers
- empty/error/loading states

Database work:

- indexes for user collection queries
- derived decade field or query helper

APIs involved: none at runtime beyond stored catalog metadata.

Acceptance criteria:

- Manual search works.
- Genre filter works.
- Year/decade filters work.
- Combined filters behave predictably.
- Empty results have a clear state.

Verification:

- Query helper tests.
- Manual UI checks with mixed demo records.
- Type check/lint/build.

Dependencies: Milestone 4.

## Milestone 6: Listening History

Objective: record listening behavior and expose it in UI and recommendation-ready data.

User-visible result: user marks a record as played and sees history, last-listened date, and listening count update.

Files/components likely affected:

- album detail play action
- history page
- collection item summary cards
- database write path

Database work:

- `listening_events`
- indexes by user and listened date
- update logic for `last_listened_at` and `listening_count`

APIs involved: none.

Acceptance criteria:

- Mark played creates an event.
- Last-listened and listening count update.
- History is reverse chronological.
- User cannot create events for another user's item.

Verification:

- Database tests or integration checks.
- Manual checks.
- Type check/lint/build.

Dependencies: Milestones 3 and 5.

## Milestone 7: Basic AI Curator

Objective: implement first recommendation flow from owned records only.

User-visible result: user asks a natural-language request and receives a few grounded recommendations from their collection.

Files/components likely affected:

- curator UI
- backend recommendation route/function
- intent schema
- candidate retrieval
- model call wrapper
- model-call audit record

Database work:

- `model_calls`
- optional read-optimized candidate query

APIs involved:

- LLM provider selected after verification

Acceptance criteria:

- Recommendations come only from owned collection IDs.
- Explicit exclusions are respected.
- Recency request uses real listening data.
- Malformed model output is rejected.
- Model failure is visible.

Verification:

- Unit tests for allowed-ID validation.
- Mocked model tests.
- Manual recommendation checks.
- Type check/lint/build.

Dependencies: Milestones 5 and 6, AI provider/model decision.

## Milestone 8: MVP Deployment

Objective: deploy the MVP vertical slice to a real URL.

User-visible result: reviewer can log in, add records, browse/filter, mark played, and ask the basic curator in production.

Files/components likely affected:

- deployment config
- README setup/deploy docs
- environment documentation
- production verification notes

Database work:

- production Supabase project setup and migrations

APIs involved:

- selected catalog API
- selected LLM API
- deployment platform

Acceptance criteria:

- Deployed app is reachable.
- Critical flows work in production.
- Secrets are server-side only.
- README documents setup accurately.

Verification:

- Production smoke test.
- Build logs.
- Manual end-to-end flow.

Dependencies: Milestones 1 through 7.

## Milestone 9: Ratings, Favorites, and Notes

Objective: add personal preference signals and expose them in UI and recommendation context.

User-visible result: user can rate, favorite, and annotate records.

Files/components likely affected:

- album detail
- collection cards
- filter controls
- recommendation candidate facts

Database work:

- finalize rating/favorite/note fields and constraints
- indexes by favorite/rating

APIs involved: none.

Acceptance criteria:

- Rating persists.
- Favorite persists.
- Notes persist and are sanitized in UI.
- AI receives only stored values if used.

Verification:

- UI persistence checks.
- Type check/lint/build.

Dependencies: Milestones 3, 5, and 7.

## Milestone 10: Photo Identification

Objective: implement AI-assisted cover recognition with user confirmation.

User-visible result: user uploads/takes a cover photo, sees candidate matches, confirms one, and saves the record.

Files/components likely affected:

- photo upload/camera UI
- storage service
- vision model wrapper
- catalog reconciliation service
- candidate confirmation UI
- image attempt audit records

Database work:

- `image_identification_attempts`
- storage policies
- optional retention cleanup job/process

APIs involved:

- vision-capable LLM model
- selected catalog API
- Supabase Storage if approved

Acceptance criteria:

- Supported image uploads.
- Unsupported/oversized image rejected.
- Vision output produces search clues only.
- Candidate confirmation is required before persistence.
- No-match and ambiguous-match states are visible.

Verification:

- Upload validation tests.
- Mocked vision/catalog flow.
- Manual test with at least one cover image.
- Type check/lint/build.

Dependencies: Milestones 4 and 7.

## Milestone 11: Conversational Refinement

Objective: support short bounded follow-up for the AI curator.

User-visible result: user can refine a request such as "make it more energetic" and receive updated owned-record recommendations.

Files/components likely affected:

- curator session UI
- conversation state helper
- intent merge logic
- optional `conversation_sessions`

Database work:

- optional `conversation_sessions` table
- retention/expiration policy

APIs involved:

- LLM provider

Acceptance criteria:

- Follow-up retains relevant prior intent.
- Conversation state is bounded.
- Rejected suggestions can be avoided within the session.
- No uncontrolled long-term memory is used.

Verification:

- Intent merge tests.
- Manual multi-turn scenarios.
- Type check/lint/build.

Dependencies: Milestone 7.

## Milestone 12: Reliability, Security, Telemetry, and Final Polish

Objective: harden critical workflows for final course review.

User-visible result: app handles failures honestly and feels production-ready for the demo story.

Files/components likely affected:

- error states
- validation schemas
- logging/audit helpers
- security docs
- verification docs
- UI polish

Database work:

- complete audit indexes
- review RLS policies
- retention decisions

APIs involved:

- all selected runtime APIs

Acceptance criteria:

- At least one handled failure state can be triggered.
- No known secret exposure.
- RLS ownership checks pass.
- Model/API telemetry records non-sensitive usage.
- Final demo story can run end to end.

Verification:

- Full test suite.
- Type check/lint/build.
- Production verification.
- Manual demo rehearsal.

Dependencies: all final-scope milestones.

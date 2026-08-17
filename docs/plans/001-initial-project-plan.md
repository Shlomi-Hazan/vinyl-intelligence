# 001 Initial Project Plan

Last updated: 2026-08-17.

This plan divides Vinyl Intelligence into small vertical milestones. Each milestone should leave the repository in a working state. Do not let stretch features enter MVP accidentally.

Do not begin implementation of a new milestone until its specification and implementation plan have been explicitly approved by the human.

## Approved Stack

- Frontend: Vite + React + TypeScript
- Backend: Netlify Functions for privileged server-side logic
- Database/Auth/Storage: Supabase
- Deployment: Netlify
- Source control: GitHub

## Git Workflow

Each meaningful milestone should be implemented on its own `codex/` branch and reviewed through a pull request before merging to `main`.

PR descriptions should include:

- Specification
- Implementation summary
- Verification performed
- Known gaps

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

## Milestone 0: Engineering Foundation

Status: complete.

Objective: establish source of truth, documentation, agent instructions, Git/GitHub repository, and local/remote baseline.

User-visible result: reviewer can inspect the repository and understand the product, constraints, architecture direction, and roadmap.

Files/components likely affected:

- `intent.txt`
- `README.md`
- `AGENTS.md`
- `.gitignore`
- `docs/**`

Database work: none.

APIs involved: none at runtime; provider docs and architecture tradeoffs reviewed only.

Acceptance criteria:

- `intent.txt` exists at repository root.
- Required documentation structure exists.
- `AGENTS.md` includes permanent workflow and AI/security boundaries.
- GitHub repository exists and `main` is pushed.
- No application features are claimed as implemented.

Verification:

- Inspect files.
- Review diff for secrets.
- Confirm Git status and initial commit.
- Confirm remote and pushed branch.

Dependencies: none.

## Milestone 1: Vite/React/TypeScript + Netlify Functions Scaffold

Objective: create the approved frontend/backend skeleton without product feature implementation.

User-visible result: local app renders a minimal shell and Netlify Functions are wired enough to prove the runtime boundary.

Files/components likely affected:

- package files
- Vite app source directory
- Netlify Functions directory
- Netlify config
- `.env.example`
- README setup docs
- milestone spec and implementation plan

Database work: none.

APIs involved: none.

Acceptance criteria:

- Vite React TypeScript app starts locally.
- Netlify Functions directory exists with no privileged product logic yet.
- TypeScript, lint, and build scripts exist.
- `.env.example` documents expected variable names without secrets.
- README setup is accurate for the scaffold.

Verification:

- Install dependencies.
- Run type check, lint, and build.
- Run local dev server.
- Confirm no secrets are committed.

Dependencies: approved Milestone 1 spec and plan.

## Milestone 2: Supabase Auth + Profile/RLS

Objective: implement sign up/login/logout, profile bootstrap, and first RLS ownership boundary.

User-visible result: user can create/login to an account and see a protected app shell.

Files/components likely affected:

- auth UI
- Supabase client configuration
- auth helper modules
- Netlify Function auth verification helper if needed
- profile migration and policies
- protected routing

Database work:

- `profiles` table
- RLS policies
- profile creation trigger or explicit server path

APIs involved:

- Supabase Auth

Acceptance criteria:

- Logged-out users cannot access protected app pages.
- Logged-in users see their own profile context.
- User A cannot read/update User B profile.
- Supabase keys are correctly separated between browser-safe and server-only contexts.

Verification:

- Auth manual flow.
- RLS policy checks.
- Type check, lint, and build.
- Secret scan.

Dependencies: Milestone 1.

## Milestone 3: Manual Collection CRUD

Objective: store owned records manually before external catalog or AI complexity.

User-visible result: user can add, view, edit, and delete a manually entered record.

Files/components likely affected:

- collection pages
- add/edit record forms
- album detail route
- collection service modules
- database migrations and RLS policies

Database work:

- `releases`
- `collection_items`
- ownership policies
- initial release-level identifier fields even if manual records do not use them yet

APIs involved: none.

Acceptance criteria:

- Manual record persists after refresh.
- User can edit/delete owned record.
- User A cannot access User B records.
- UI remains album-first.
- Database can store release-level identifiers when available.

Verification:

- CRUD tests/manual checks.
- RLS checks.
- Type check, lint, and build.

Dependencies: Milestone 2.

## Milestone 4: Music Catalog API Integration

Objective: search a selected music catalog, show candidates, import selected metadata, and save to the user's collection.

User-visible result: user searches artist/title, selects a candidate, confirms, and sees the imported record in their collection.

Files/components likely affected:

- catalog API spike document
- catalog search UI
- Netlify Function for catalog search/lookup
- catalog service boundary
- candidate result components
- release normalization code
- duplicate warning UI
- API integration spec

Database work:

- provider identifiers on `releases`
- unique `(provider, provider_release_id)` constraint
- duplicate checks in `collection_items`

APIs involved:

- Discogs or MusicBrainz, selected only after the documented API spike

Acceptance criteria:

- Discogs and MusicBrainz are compared against project requirements before provider selection.
- Search returns candidate releases from the selected provider.
- Metadata import stores artist, title, year, genre/style if available, label/format/tracklist where available.
- Exact duplicate warns before adding.
- API failure and no-match states are visible.

Verification:

- Completed API spike with sample searches and provider recommendation.
- Mocked provider tests where possible.
- Manual search/add with at least three records.
- Type check, lint, and build.

Dependencies: Milestones 2 and 3, approved catalog spike/spec/plan.

## Milestone 5: AI Photo Recognition + Candidate Confirmation

Objective: implement AI-assisted cover recognition with user confirmation and temporary upload cleanup.

User-visible result: user uploads/takes a cover photo, sees candidate matches, confirms one, and saves the record.

Files/components likely affected:

- photo upload/camera UI
- Supabase Storage bucket/policies
- Netlify Function for vision workflow
- vision model wrapper
- catalog reconciliation service
- candidate confirmation UI
- image attempt audit records
- cleanup path for temporary uploads

Database work:

- `image_identification_attempts`
- storage policies
- retention/deletion fields or cleanup notes

APIs involved:

- vision-capable LLM model
- selected music catalog API
- Supabase Storage

Acceptance criteria:

- Supported image uploads.
- Unsupported/oversized image rejected.
- Uploaded cover photos are deleted after the identification flow unless retention is explicitly approved later.
- Vision output produces search clues only.
- Model-reported confidence is advisory/debug only.
- Candidate confirmation is required before persistence.
- No-match and ambiguous-match states are visible.

Verification:

- Upload validation tests.
- Mocked vision/catalog flow.
- Manual test with at least one cover image.
- Confirm temporary upload deletion path.
- Type check, lint, and build.

Dependencies: Milestone 4 and approved AI/photo spec/plan.

## Milestone 6: Browse/Search/Filter

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
- derived decade query helper or stored field only if approved
- listening recency/count query helpers based on `listening_events` when needed

APIs involved: none at runtime beyond stored catalog metadata.

Acceptance criteria:

- Manual search works.
- Genre filter works.
- Year/decade filters work.
- Combined filters behave predictably.
- Empty results have a clear state.
- UI remains album-first while retaining release-level metadata where available.

Verification:

- Query helper tests.
- Manual UI checks with mixed demo records.
- Type check, lint, and build.

Dependencies: Milestones 3 and 4.

## Milestone 7: Ratings/Favorites/Notes

Objective: add personal preference signals and expose them in UI and later recommendation context.

User-visible result: user can rate, favorite, and annotate records.

Files/components likely affected:

- album detail
- collection cards
- filter controls
- collection item update paths

Database work:

- finalize rating/favorite/note fields and constraints
- indexes by favorite/rating

APIs involved: none.

Acceptance criteria:

- Rating persists.
- Favorite persists.
- Notes persist and are sanitized in UI.
- User A cannot update User B personal signals.

Verification:

- UI persistence checks.
- RLS checks.
- Type check, lint, and build.

Dependencies: Milestones 3 and 6.

## Milestone 8: Listening History

Objective: record listening behavior and expose it in UI and recommendation-ready data.

User-visible result: user marks a record as played and sees history, last-listened state, and listening count derived from events.

Files/components likely affected:

- album detail play action
- history page
- collection item summary cards
- database query helpers

Database work:

- `listening_events`
- indexes by user, collection item, and listened date
- no initial denormalized `listening_count` or `last_listened_at` on `collection_items`

APIs involved: none.

Acceptance criteria:

- Mark played creates a `listening_events` row.
- Listening count is derived from events.
- Last-listened state is derived from events.
- History is reverse chronological.
- User cannot create events for another user's item.

Verification:

- Database tests or integration checks.
- Manual checks.
- Type check, lint, and build.

Dependencies: Milestones 3 and 6.

## Milestone 9: AI Curator

Objective: implement first recommendation flow from owned records only.

User-visible result: user asks a natural-language request and receives a few grounded recommendations from their collection.

Files/components likely affected:

- curator UI
- Netlify Function for recommendation orchestration
- intent schema
- candidate retrieval
- ranking helpers
- model call wrapper
- lightweight `model_calls` audit record

Database work:

- `model_calls`
- recommendation candidate queries over `collection_items`, `releases`, `ratings/favorites`, and `listening_events`

APIs involved:

- LLM provider selected after verification

Acceptance criteria:

- Recommendations come only from owned collection IDs.
- Explicit exclusions are respected.
- Recency request uses real `listening_events`.
- No full AI curator chat transcripts are permanently stored for MVP.
- Malformed model output is rejected.
- Model failure is visible.

Verification:

- Unit tests for allowed-ID validation.
- Unit tests for event-derived recency/count candidate facts.
- Mocked model tests.
- Manual recommendation checks.
- Type check, lint, and build.

Dependencies: Milestones 6, 7, and 8.

## Milestone 10: Conversational Refinement

Objective: support short bounded follow-up for the AI curator.

User-visible result: user can refine a request such as "make it more energetic" and receive updated owned-record recommendations.

Files/components likely affected:

- curator session UI
- bounded conversation state helper
- intent merge logic
- optional `conversation_sessions`

Database work:

- optional `conversation_sessions` table only if persistence is necessary
- no permanent full chat transcript storage for MVP
- retention/expiration policy for bounded structured state

APIs involved:

- LLM provider

Acceptance criteria:

- Follow-up retains relevant prior intent.
- Conversation state is bounded and structured.
- Rejected suggestions can be avoided within the session.
- No uncontrolled long-term memory is used.
- No permanent full chat transcripts are stored for MVP.

Verification:

- Intent merge tests.
- Manual multi-turn scenarios.
- Type check, lint, and build.

Dependencies: Milestone 9.

## Milestone 11: Production Deployment

Objective: deploy the working product to a real Netlify URL backed by Supabase.

User-visible result: reviewer can use the app from a public production URL.

Files/components likely affected:

- Netlify config
- deployment docs
- environment documentation
- production verification notes
- README setup/deploy docs

Database work:

- production Supabase project setup and migrations
- production RLS verification
- production storage policies

APIs involved:

- selected catalog API
- selected LLM API
- Supabase
- Netlify

Acceptance criteria:

- Deployed app is reachable.
- Critical flows work in production.
- Secrets are server-side only.
- README documents setup accurately.
- Production environment variables are not committed.

Verification:

- Production smoke test.
- Build logs.
- Manual end-to-end flow.
- Secret scan.

Dependencies: Milestones 1 through 10.

## Milestone 12: Reliability/Security/Telemetry/Final Polish

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

- review indexes
- review RLS policies
- lightweight `model_calls` retention decision
- upload cleanup verification

APIs involved:

- all selected runtime APIs

Acceptance criteria:

- At least one handled failure state can be triggered.
- No known secret exposure.
- RLS ownership checks pass.
- Model/API telemetry records non-sensitive usage without becoming a large observability subsystem.
- Final demo story can run end to end.

Verification:

- Full test suite.
- Type check, lint, and build.
- Production verification.
- Manual demo rehearsal.

Dependencies: all final-scope milestones.

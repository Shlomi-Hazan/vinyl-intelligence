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

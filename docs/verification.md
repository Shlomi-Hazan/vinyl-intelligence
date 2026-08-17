# Verification Strategy

Last updated: 2026-08-17.

Verification must be based on written acceptance criteria, not on generated confidence.

## Required Verification Types

- Unit tests for deterministic recommendation filtering/ranking helpers
- Unit tests for model output validation schemas
- Integration tests for API routes/functions where practical
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
- Last-listened updates correctly.
- Listening count updates correctly.
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
- Malformed model output is rejected.
- Model/API failure is visible to the user.

### Photo Identification

- Supported image can be uploaded.
- Unsupported or oversized image is rejected.
- Workflow produces candidate matches rather than silently saving a guess.
- User confirmation is required before save.
- No-match flow has manual fallback.

### Security

- Secrets are absent from client bundles and repository.
- Backend authorization is tested.
- RLS policies enforce ownership.
- Upload validation exists.
- Model output is treated as untrusted.

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

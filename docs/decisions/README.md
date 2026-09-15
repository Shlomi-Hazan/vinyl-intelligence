# Decision Records

Use this directory for ADR-style records when an architecture, product, provider, security, or scope decision matters to future work.

Each decision should include:

- Status: proposed, accepted, superseded, or rejected
- Context
- Decision
- Consequences
- Alternatives considered
- Date

Accepted decisions:

- [0001 Approved Initial Architecture](0001-approved-initial-architecture.md)
- [0002 Catalog Provider Boundary](0002-proposed-catalog-provider-boundary.md)
- [0003 OpenRouter Vision Provider](0003-openrouter-vision-provider.md) - vision
  model for Milestone 5 cover recognition: `google/gemini-3.1-flash-lite`
  (accepted 2026-08-29; implemented in Milestone 5, shipped and verified in
  production)

- [0004 OpenRouter Curator Text Models](0004-openrouter-curator-text-models.md) -
  Milestone 9: `google/gemini-3.1-flash-lite` for intent extraction,
  `google/gemini-3.5-flash` for selection/explanation (accepted 2026-08-31)

- [0005 Visual Experience & Artwork Architecture](0005-visual-experience-and-artwork-architecture.md) -
  routing dependency (`react-router-dom`), private per-user Storage bucket for
  custom album covers (canonical `cover.webp`), and **display-time** Cover Art
  Archive front images for provider artwork - no `releases.cover_url`, no
  catalog-add lookup (accepted 2026-08-31; Visual Experience & Product Identity
  pass, spec `0012`)

- [0006 Listening-Event Mutability & Optional Profile Avatar](0006-listening-event-mutability-and-profile-avatar.md) -
  Phase D: owner-scoped `listened_at` correction + play deletion (M8 was
  append-only, superseded minimally); user-owned `collection_items.personal_genres`
  instead of weakening catalog `releases` RLS (finding 8D-2); optional profile
  avatar in a private bucket with signed URLs never persisted, initials always
  the default and fallback (accepted 2026-09-02, spec `0012`)

- [0007 Hebrew & Multilingual Record Support](0007-hebrew-multilingual-record-support.md) -
  local BiDi isolation for dynamic content, comparison-only Hebrew-aware
  search, one authoritative canonical Hebrew/English genre-alias module shared
  by Collection/Dashboard/VIN, VIN preserves explicit genre wording/script at
  extraction with deterministic server-side canonicalization as the sole
  authority, Vision original-script preservation, no migration, no app-wide
  RTL, no bundled Hebrew webfont (accepted 2026-09-09, post-M12 enhancement,
  spec `0015`; implemented and verified 2026-09-14)

Resolved (previously listed as pending):

- **Exact duplicate-copy representation** - multiple `collection_items` rows
  may reference one `release`; the explicit duplicate-confirmation UX (an
  honest "already owned" indicator plus an "Add another copy" confirmation
  dialog, identical in Discover and Scan) was finalized in
  `docs/specs/0016-final-submission-alignment.md` (§21.6-21.7) and
  implemented/merged/deployed/human-accepted in PR #31.
- **Whether bounded structured conversation state is persisted or kept
  ephemeral** - resolved in Milestone 10 (`docs/specs/0011-milestone-10-conversational-refinement.md`):
  bounded, React-memory-only session state, no table, no `sessionStorage` /
  `localStorage`. Production session continuity (surviving in-app navigation)
  was corrected and accepted later in Milestone 12 via `CuratorSessionProvider`
  (PR #19) without changing this privacy contract.

Initial decisions still pending:

- How long lightweight `model_calls` audit records are retained

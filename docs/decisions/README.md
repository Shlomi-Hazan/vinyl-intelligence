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

Proposed decisions (pending human approval):

- [0003 OpenRouter Vision Provider](0003-openrouter-vision-provider.md) - vision
  model for Milestone 5 cover recognition

Initial decisions still pending:

- Exact duplicate-copy representation
- Whether bounded structured conversation state is persisted or kept ephemeral for MVP implementation
- How long lightweight `model_calls` audit records are retained

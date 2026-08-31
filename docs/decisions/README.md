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

Proposed decisions (pending human approval):

- [0003 OpenRouter Vision Provider](0003-openrouter-vision-provider.md) - vision
  model for Milestone 5 cover recognition
- [0005 Visual Experience & Artwork Architecture](0005-visual-experience-and-artwork-architecture.md) -
  routing dependency (`react-router-dom`), private per-user Storage bucket for
  custom album covers, and Cover Art Archive for provider artwork (Visual
  Experience & Product Identity pass, spec `0012`)

Initial decisions still pending:

- Exact duplicate-copy representation
- Whether bounded structured conversation state is persisted or kept ephemeral for MVP implementation
- How long lightweight `model_calls` audit records are retained

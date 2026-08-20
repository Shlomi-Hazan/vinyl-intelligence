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

Proposed decisions:

- [0002 Proposed Catalog Provider Boundary](0002-proposed-catalog-provider-boundary.md)

Initial decisions still pending:

- Catalog provider/boundary/sharing model: see proposed ADR 0002
- Music catalog API spike 0001: in progress; MusicBrainz samples recorded and
  Discogs empirical comparison blocked on current official developer/API
  verification unless explicitly dispositioned by the human
- AI provider and exact models
- Exact duplicate-copy representation
- Whether bounded structured conversation state is persisted or kept ephemeral for MVP implementation
- How long lightweight `model_calls` audit records are retained

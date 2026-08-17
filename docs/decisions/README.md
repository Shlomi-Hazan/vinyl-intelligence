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

Initial decisions still pending:

- Catalog provider: Discogs vs MusicBrainz
- AI provider and exact models
- Exact duplicate-copy representation
- Whether bounded structured conversation state is persisted or kept ephemeral for MVP implementation
- How long lightweight `model_calls` audit records are retained

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

Proposed decisions (pending human approval):

- [0003 OpenRouter Vision Provider](0003-openrouter-vision-provider.md) - vision
  model for Milestone 5 cover recognition

Initial decisions still pending:

- AI text models for the curator milestone (the vision model is addressed by
  proposed decision 0003)
- Exact duplicate-copy representation
- Whether bounded structured conversation state is persisted or kept ephemeral for MVP implementation
- How long lightweight `model_calls` audit records are retained

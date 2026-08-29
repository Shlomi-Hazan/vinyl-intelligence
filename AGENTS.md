# AGENTS.md

Permanent instructions for agentic engineering sessions on Vinyl Intelligence.

## Source of Truth

Always read `intent.txt` before planning substantial product, architecture, database, AI, or feature changes.

Do not silently change the product concept. Vinyl Intelligence is an intelligent personal vinyl collection system, not a generic music recommender and not a chatbot with album data attached.

## Development Workflow

For every meaningful feature follow:

1. Intent
2. Specification
3. Context
4. Plan
5. Execution
6. Verification
7. Audit trail

Keep the repository understandable as an agentic software-engineering project. Preserve specifications, decisions, implementation plans, verification evidence, and commits.

Do not begin implementation of a new milestone until its specification and implementation plan have been explicitly approved by the human.

## Planning

Before substantial code changes:

- Inspect the relevant existing code.
- Write a short implementation plan.
- Identify affected components.
- Identify database implications.
- Identify external API implications.
- Identify AI/model implications.
- Identify security and privacy risks.
- Identify verification steps.

Do not begin large implementation work until the plan is understandable.

## Git Workflow

Each meaningful milestone must be implemented on its own branch and reviewed through a pull request before merging to `main`.

New branch names should use the active primary implementation agent's agreed prefix unless the human asks for a different naming convention. Existing in-progress branches must not be renamed solely because the implementation agent changes.

Pull request descriptions should include:

- Specification
- Implementation summary
- Verification performed
- Known gaps

Keep commits small and coherent. Do not combine unrelated milestones in one branch or pull request.

## Pre-PR Repository Evidence Gate

Before opening any future milestone pull request, perform a repository evidence consistency review. This gate exists so reviewers can reconstruct the engineering process directly from the repository without end-of-project documentation archaeology.

Check at least:

- Specification: approved scope still matches implementation, historical planning/test plans remain preserved, and current status metadata is accurate.
- Implementation plan: current milestone/gate status reflects what actually occurred, while historical stop points are not rewritten as though they never existed.
- README: current milestone/status is accurate, implemented and planned capabilities are clearly separated, and no future feature is represented as implemented.
- Verification evidence: commands, tests, and human checks actually performed are recorded; known gaps remain visible; agent claims are distinguished from independently verified evidence; no verification is claimed before it happened.
- Intent/product requirements: update only if product intent, stakeholders, constraints, definition of done, or scope genuinely changed; do not create duplicate PRD/context artifacts.
- Course/reviewability evidence: when course requirements or review criteria materially change, confirm the repository visibly demonstrates them and distinguish mandatory requirements from recommendations/examples.
- Tooling/skills/MCP assessment: ask whether the next milestone needs capabilities not already available. Add a tool or MCP only for a concrete missing capability; do not install tools merely to demonstrate tool usage. Consider permissions, context cost, maintenance, and blast radius.
- Git/scope: the branch contains only the intended milestone, no next-milestone work has started, and the PR is not opened until the evidence gate passes.
- Contradiction scan: search docs for stale phrases such as `pending`, `proposed`, `current milestone`, `remaining gate`, and `not implemented`. Review matches semantically; do not blindly replace historical wording. Distinguish historical planning language from stale current-state claims.
- Human gate: if the review finds an ambiguity or contradiction that changes project meaning, security, architecture, scope, or claimed verification, stop and ask the human. Minor factual status synchronization may be proposed, but implementation of new scope still requires human approval.

Historical artifacts should show what was known or planned at the time. Current status fields should show what is true now. Do not "clean up" history by rewriting past planning evidence.

## AI Boundaries

Use an LLM only where cognition adds value.

AI is appropriate for:

- Interpreting natural-language mood or musical intent
- Album-cover vision recognition
- Recommendation reasoning
- Natural-language explanation
- Conversational refinement

Use deterministic software for:

- Authentication
- Authorization
- CRUD
- Filtering
- Sorting
- Database integrity
- Listening history storage
- Validation
- Exact artist, album, year, genre, and decade searches

## Recommendation Safety

Never allow the model to recommend an album outside the user's owned collection in the core recommendation workflow.

Candidate collection item IDs must be generated by the backend. The LLM may choose only from allowed candidate IDs.

Validate all structured model output. Treat all LLM output as untrusted.

If a returned recommendation ID is not in the allowed candidate set, reject it and return a visible failure or safe fallback.

Do not let the model invent ownership, listening history, ratings, genres, release years, or database IDs.

## Image Recognition

The vision model does not automatically create collection records.

Expected pipeline:

```text
image
-> vision extraction
-> catalog API search
-> candidate matches
-> user confirmation
-> database persistence
```

Never silently persist an uncertain AI guess.

If recognition confidence is low, if multiple releases are plausible, or if no catalog match exists, show the uncertainty and provide a manual fallback.

## Security

Never expose server secrets to the client.

Never commit:

- `.env`
- API keys
- service-role keys
- credentials
- authentication tokens
- local secrets

Enforce authorization on the backend and in database Row Level Security policies.

Validate uploads, external API responses, and model responses.

Use least privilege. Keep service-role credentials server-side only.

Do not log secrets or unnecessary personal content.

## Quality

Before declaring work complete, run the relevant:

- Tests
- Type checking
- Linting
- Build
- Manual verification

"Codex says it works" is not verification.

Verification must be checked against the written specification and acceptance criteria.

## Scope Control

Do not introduce the following without explicit approval:

- RAG
- Vector databases
- Unnecessary agents
- Social networking
- Marketplace features
- Streaming functionality
- Unrelated recommendation APIs
- Autonomous collection modification without user confirmation

Prefer reversible, incremental changes. Keep each milestone in a working state.

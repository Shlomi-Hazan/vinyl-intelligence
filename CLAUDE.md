# CLAUDE.md

Claude Code is the primary implementation agent for Vinyl Intelligence.

## Required project instructions

@AGENTS.md
@intent.txt

AGENTS.md is the authoritative shared contract for:
- development workflow
- human approval gates
- security
- Git/PR discipline
- AI boundaries
- verification
- scope control

intent.txt is the authoritative product-intent document.

If CLAUDE.md and AGENTS.md ever conflict, AGENTS.md wins.

## Human authority

The human remains the final authority over:
- scope
- architecture
- milestone approval
- security-sensitive decisions
- PR approval
- merge approval

Do not begin implementation of a new milestone until its specification and
implementation plan are explicitly approved by the human.

## Existing work and handoffs

Do not assume work produced by another agent is correct.

Before continuing existing work:
- inspect the current branch and HEAD
- inspect git status
- read the relevant specification and implementation plan
- preserve intentional uncommitted work
- verify prior-agent claims against repository evidence

Never discard or overwrite uncommitted work unless explicitly instructed.

## Git

Do not rename an in-progress branch merely because implementation ownership
moves between agents.

For new branches created by Claude Code, use the `claude/` prefix unless the
human explicitly specifies another naming convention.

## Verification

Run and report required verification yourself.

Clearly distinguish:
- repository evidence
- checks Claude Code actually ran
- human runtime verification
- external-service failures
- assumptions or unverified claims

"The agent says it works" is not verification.

## Completion / handoff reporting

After substantial implementation work report:
- branch
- HEAD
- files changed
- verification performed
- known gaps
- uncommitted files
- recommended next step

Do not open a PR, merge, or start another milestone unless explicitly asked.

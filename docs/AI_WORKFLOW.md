# ZOZ Pro AI Toolchain Workflow

## Roles
- Codex: primary implementation agent.
- Claude Code: review and test agent when available.
- Google Antigravity (agy): secondary review/analysis agent when available.
- GitHub: source of truth and durable checkpoint.

## One-task / one-writer rule
- Only one agent edits a task branch at a time.
- Other agents review, inspect, or test unless explicitly assigned as the writer.
- Do not run competing agents on the same task branch.

## Session economy
- Use one task ID per unit of work.
- Do not reopen a completed task in a new AI session.
- Resume from Git history and task records.
- Stop an agent after its assigned task and required checks are complete.

## Safe task lifecycle
1. Inspect the repository and current branch.
2. Create or select the task branch.
3. Write the smallest required change.
4. Run focused tests/checks.
5. Review the diff.
6. Commit with a task-specific message.
7. Only merge after verification.
8. Deploy only with explicit operator approval.

## Project boundary
ZOZ Pro is independent from the legacy ZOZ AI repair. Do not copy legacy repair code into this project without explicit approval.

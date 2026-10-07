# ZOZ Pro AI Toolchain Workflow

## Roles
- Codex: primary implementation agent.
- Claude Code: review and test agent when available.
- Gemini CLI: secondary review/analysis agent when available.
- Antigravity: separate Google agentic platform; it is NOT Gemini CLI and is not part of the ZOZ Pro baseline toolchain.
- GitHub: source of truth and durable checkpoint.

## One-task / one-writer rule
- Only one agent edits a task branch at a time.
- Other agents review, inspect, or test unless explicitly assigned.
- Do not run competing coding agents on the same task branch.

## Session economy
- Use one task ID per unit of work.
- Do not reopen a completed task just because an AI session changed.
- Resume from Git history and task records.
- Start an agent only for a defined task, then stop it after required checks.

## Safe task lifecycle
1. Inspect repository and current branch.
2. Select/create the task branch.
3. Implement the smallest required change.
4. Run focused tests/checks.
5. Review the diff.
6. Commit with a task-specific message.
7. Merge only after verification.
8. Deploy only with explicit operator approval.

## Project boundary
ZOZ Pro is independent from legacy ZOZ AI. Do not import legacy repair code into this project without explicit approval.

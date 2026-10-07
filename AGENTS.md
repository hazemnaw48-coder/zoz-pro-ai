# ZOZ Pro Engineering Rules

Repository: hazemnaw48-coder/zoz-pro-ai
Default branch: main

## Project boundary
- This repository is ZOZ Pro.
- Do not import or modify the legacy ZOZ AI repair from another repository.
- Do not copy production integrations, credentials, or unfinished legacy fixes into ZOZ Pro without explicit approval.

## Git discipline
- GitHub is the source of truth.
- main is the integration branch.
- Create a task branch before application code.
- Never rewrite shared history.
- Never force-push.
- Every completed task must have a clear commit message and recorded test result.

## Multi-agent discipline
- Only one coding agent writes for a task at a time.
- Other agents are reviewers/testers unless explicitly assigned.
- No agent may silently modify another agent's work.

## Safety gates
- No deployment without explicit operator approval.
- Financial, destructive, external-send, irreversible, or production-affecting actions require explicit operator approval.
- Diagnostic actions may inspect and test but must not cross an approval gate.

## Session continuity
Record current task, branch, last verified commit, changed files, tests, and next action in docs/AI_STATE.md.
Resume from Git history and AI_STATE.md rather than repeating work after a chat/session change.

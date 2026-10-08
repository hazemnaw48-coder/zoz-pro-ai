# ZOZ Pro Cloud Runtime

ZOZ Pro production runtime does not require the Windows computer.

## Production path

Phone -> Vercel Serverless -> Vercel Blob -> GitHub Actions Cloud Executor -> task branch -> verification -> audit.

Windows + Tailscale are optional development tooling only.

## Required GitHub Secrets

The repository must define:
- `ZOZ_PRO_CONTROL_URL`
- `ZOZ_CONTROL_TOKEN`
- `CODEX_ACCESS_TOKEN` OR `OPENAI_API_KEY`

Never put these values in source control.

## Cloud executor rules

The executor processes one queued non-risk command at a time. It never:
- merges to `main`;
- deploys production;
- changes secrets/credentials;
- performs financial/external-send/destructive/irreversible actions.

Every implementation ends in `verification`. Completion of the task requires the existing ZOZ Pro verification flow.

The scheduled workflow checks the queue every five minutes and can also be started manually.

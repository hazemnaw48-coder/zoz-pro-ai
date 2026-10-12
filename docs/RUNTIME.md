# ZOZ Pro Runtime — independent cloud path

This branch prepares an isolated Vercel serverless deployment from the existing ZOZ Pro repository. Floot is not modified or removed.

## Architecture
Phone/browser -> Vercel API function -> private Vercel Blob state
GitHub Actions Cloud Executor -> authenticated ZOZ Pro API -> task branch -> verification/audit

## Required configuration (never commit values)
Vercel project environment:
- `ZOZ_CONTROL_TOKEN`: strong random owner control token.
- `BLOB_READ_WRITE_TOKEN`: supplied by the Vercel Blob store integration.

GitHub repository Actions configuration:
- Variable `ZOZ_PRO_CONTROL_URL`: final deployed HTTPS origin.
- Secret `ZOZ_CONTROL_TOKEN`: the same owner control token.
- For code execution, configure exactly one supported executor credential in a later, separately reviewed step. Do not add a secret until the chosen executor and its permission model are approved.

## Data safety
- Local JSON remains the default for tests and local runtime.
- Cloud mode is selected by Vercel runtime or `ZOZ_CLOUD_STATE=true`.
- State is stored as one private Blob snapshot. This is suitable for a limited single-writer pilot, not concurrent multi-writer production. Before production, move state to a transactional database and add concurrency-safe mutations.
- Do not copy local data into the cloud until the owner reviews the export and confirms the target is empty or intentionally replaceable.

## Security boundaries
- API control routes still require `Authorization: Bearer <ZOZ_CONTROL_TOKEN>`.
- `/api/health` is a non-sensitive health check.
- Risky, financial, external-send, destructive, irreversible, credential/account, and production-affecting actions still require explicit owner approval.
- Cloud executor is not enabled by deployment alone. GitHub Actions secrets and variable must be configured, and an approved executor must be selected.
- No automatic merge to `main` or production deployment is authorized by this branch.

## Verification
Run `npm test` and `npm run build` in GitHub Actions. Deploy this branch only as a preview after adding required environment configuration. Confirm health, owner authentication, state read/write, and approval rejection paths before any production switch.

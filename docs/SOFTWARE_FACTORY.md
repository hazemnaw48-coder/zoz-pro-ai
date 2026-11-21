# ZOZ Software Factory

Owner-only product lifecycle dashboard backed by the isolated ZOZ Pro Supabase Preview project `vjnwojrqduoxhetutxrs`.

## Current implementation
- UI: `software-factory.html`.
- Tables: `zoz_software_products`, `zoz_software_runs`, `zoz_software_quality_gates`, `zoz_software_ledger`.
- All four tables have RLS enabled with authenticated owner-only policies; no anonymous policies are present.
- Initial tracked product: ZOZ FieldOps, with its source repository and isolated Supabase Preview schema recorded in the product row.
- Product lifecycle dashboard supports product records, quality gates, run history, repository/branch/preview metadata, and cost/revenue ledger.

## Build adapter
- Edge Function: `zoz-factory-build`, owner-authenticated and using server-only `ZOZ_FACTORY_GITHUB_TOKEN`.
- Preferred mode: supply an existing owner-controlled GitHub repository and base branch. The function checks repository access and push permission, creates a unique isolated `factory/<slug>-<suffix>` branch, and writes the scaffold under `factory-products/<slug>/`. It does not write to the base branch.
- New private repository creation remains an optional fallback and requires the GitHub token to have repository-creation permission.
- The browser only submits product ID and repository metadata; it never receives the GitHub token.
- A successful adapter response records the branch/workspace URL and build evidence. This is a scaffold build, not proof that domain workflows are production-ready.

## Lifecycle and release gates
Discovery → specification → build → test → staging → pilot → production. Each run records status and evidence. Quality gates cover requirements, security, tests, tenant isolation, backup/restore, staging acceptance and owner approval. The ledger tracks costs, revenue, refunds and assets.

## Safety boundary
Only the Supabase publishable key is used in the browser. No service-role key or GitHub credential is committed. Schema changes for the software factory remain in Preview; do not silently move them to production. No automatic public release or paid resource provisioning is enabled.

## Current blockers
- The previously configured GitHub token returned HTTP 403 for creating a new repository. Existing-repository mode avoids requiring that permission, but still needs `Contents: read/write` access to the selected repository. The Edge Function has not yet been invoked end-to-end after this code change.
- Build CI, generated app tests, integration tests and deployment are not claimed complete until the PR checks and adapter execution succeed.
- FieldOps remains in pilot until security, backup/restore and owner commercial approval gates are evidenced.

## FieldOps production gates
- Requirements, tenant isolation, core CRUD test evidence and staging acceptance are recorded as passed.
- Security is pending: Supabase Auth leaked-password protection is disabled; production SMTP/Auth redirect configuration, staff invitations and independent security review remain open.
- Backup/restore is pending: no completed isolated restore drill has been recorded.
- Owner commercial approval is pending: keep FieldOps in pilot until the previously approved pricing/terms are explicitly reconfirmed in the factory record.

# ZOZ Software Factory

Owner-only product lifecycle dashboard backed by ZOZ Pro Supabase Preview.

## Current implementation
- UI: `software-factory.html`.
- Tables: `zoz_software_products`, `zoz_software_runs`, `zoz_software_quality_gates`, `zoz_software_ledger`.
- RLS: authenticated owner-only policies; anonymous table privileges revoked.
- Initial product to track: ZOZ FieldOps in its separate repository and isolated Supabase Preview schema.

## Lifecycle
Discovery → specification → build → test → staging → pilot → production. Each run records a status and optional evidence. Quality gates cover requirements, security, tests, tenant isolation, backup/restore, staging acceptance and owner approval. The ledger tracks costs, revenue, refunds and assets.

## Safety boundary
Only the Supabase publishable key is used in the browser. No service-role key or third-party credentials are committed. Schema changes were applied to Preview only; production was not changed.

## Not yet automated
This release records and tracks product lifecycle work. It does not yet autonomously create repositories, provision cloud environments, run builds, execute integration tests, or deploy products. Those actions require least-privilege server-side adapters, CI verification and owner approval before use.

## Release gates
Do not mark FieldOps production-ready until two-tenant isolation, real login, customer/work-order/finance CRUD, backup/restore, security review, mobile PWA acceptance and staging customer acceptance have passed with evidence.

# MEHWAR customer app — current implementation status

This folder is an isolated customer-app integration foundation. It does not
replace the internal Node.js application or its Android Flow Bridge module.

## Implemented in this commit

- A typed, read-only TypeScript adapter for the existing Preview
  `zoz-tenant-workspace` Edge Function.
- Typed response models for tenant organizations, plans, services and tasks.
- Client-side UUID input validation before calling tenant-scoped actions.
- A safe Preview environment template containing no secret credentials.
- Documentation that identifies the exact verified actions and explicitly
  blocks unaudited agent mutations.

## Intentionally not generated yet

- React pages or replacement UI.
- Vite build configuration and dependency lockfile.
- PWA manifest/service worker and Android package.
- Database migrations or new Supabase functions.
- File upload/download, deliverables and notification integrations.
- Agent write methods.

The approved editable Stitch design source was not present in the audited
repository. Creating substitute screens from descriptive text would violate
the requirement to preserve the existing design exactly. The customer app's
React/PWA shell must be built after that source is added.

## Verification boundary

The Supabase Preview function and schema were inspected read-only. No
Production project was accessed or modified. The code in this folder has not
yet been run through a TypeScript build or end-to-end test because this folder
does not yet have a Vite package manifest or installed dependencies.

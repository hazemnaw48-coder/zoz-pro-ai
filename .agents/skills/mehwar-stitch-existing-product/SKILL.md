---
name: mehwar-stitch-existing-product
description: Continue the existing مِحور | MEHWAR product using the owner's existing Google Stitch project and Google AI Studio workspace. Use when importing/exporting Stitch screens, refining the current design, translating screens into the existing customer app, or returning AI Studio changes to GitHub. Never create a parallel product or replace the existing backend.
---

# MEHWAR — existing product design/build workflow

## Authority order
1. Existing MEHWAR product scope, tenant model and working Supabase integration.
2. Owner-approved existing Stitch project and its actual `DESIGN.md`, HTML and assets.
3. The current MEHWAR source code in `apps/mehwar/`.
4. This skill's seed descriptions, which must never override the original export.

## Mandatory first steps
- Inspect the current MEHWAR module and read `apps/mehwar/EXPORT-STATUS.md`.
- Inspect the existing Git branch and preserve its changes.
- Use Stitch MCP `list_projects` and `list_screens` to find the existing MEHWAR project.
- If there is more than one plausible Stitch project, show the candidates and ask the owner to identify the existing one. Never create a project as a guess.
- Export HTML, screenshot and real design-system metadata for each existing screen.
- Import the codebase into Google AI Studio under the Hazem Now company account only after identifying the current source.

## Design collaboration
- Use Stitch's design/edit/variant features on the existing project.
- Prefer targeted edits to approved screens; do not generate replacement pages from scratch.
- Use the official `stitch::code-to-design` skill to move existing app code into Stitch, and `stitch::react-components` to move approved screens back into existing React components.
- Treat screenshot-only exports as visual evidence, not editable source.
- Keep original exports, new variants and approved versions distinguishable.

## Implementation
- Continue within `apps/mehwar/`; do not scaffold a competing application.
- Preserve existing Supabase auth, tenant bootstrap, real organization/workspace IDs and `createAgentBridge`.
- Do not invent database tables, RPCs or Edge Functions.
- Respect server-side tenant membership and database RLS. Client UUID checks are not an authorization boundary.
- Keep unaudited writes, uploads, deliverables, notifications, payment flows and external actions disabled.
- Keep Arabic-first RTL and the customer identity مِحور | MEHWAR.
- Never show ZOZ Pro / ZOZ Group in customer screens.

## AI Studio and GitHub
- Use the Hazem Now Google account as primary; all other connected Google accounts are backups.
- Do not push AI Studio changes to the repo's default branch `main` (the internal monorepo).
- Export updated code as a ZIP or use a proven branch-targeted route; review changed paths and integrate only MEHWAR changes into the designated feature branch.
- Do not rename the repository, change the default branch, or edit deployment configuration to work around sync limitations.

## Acceptance
- Compare every screen against the original Stitch export.
- Verify RTL, mobile responsiveness, actual navigation and controls.
- Test auth/session restore and tenant bootstrap.
- Test real tasks/services against Preview and verify cross-tenant isolation.
- Run TypeScript checks, tests and production build.
- Do not claim PWA/APK/ZIP delivery until the artifact exists and has been verified.

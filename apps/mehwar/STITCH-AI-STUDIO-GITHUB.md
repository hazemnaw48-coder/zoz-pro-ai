# MEHWAR — Stitch → AI Studio → GitHub → Production workflow

## Purpose

Establish one repeatable pipeline for turning the approved Stitch design into a
maintainable customer product. GitHub is the source-of-truth for application code.
Stitch is the visual source-of-truth. Supabase Preview is the integration target
until the product passes acceptance.

## Verified Google workflow capabilities

Google documents that Stitch can export designs to AI Studio and Antigravity and
that Stitch provides an MCP server, SDK and agent skills. Stitch also supports
a portable `DESIGN.md` design-system handoff.

Google AI Studio Build mode documents GitHub import and two-way synchronization:
import a repository from the prompt's Add files (+) menu, or use Settings → GitHub
to link a repository. The GitHub panel supports pushing AI Studio edits and pulling
changes made in GitHub.

These are two connected product capabilities; this is not a claim that Stitch itself
currently has a native direct GitHub repository sync button.

## Safe working rules

- Current integration branch: `feat/mehwar-stitch-ai-studio`.
- Do not push AI Studio changes to `main` or a production branch.
- Do not merge to the internal platform or deploy publicly before review.
- The original Stitch export must be kept intact under `stitch-source/` and treated
  as the visual acceptance reference.
- Build React/Vite inside the dedicated MEHWAR app boundary only.
- Do not modify the root internal Node.js app, Android Flow Bridge, existing ZOZ
  services, or Supabase Production.
- Use only the Supabase Preview project for development:
  `https://vjnwojrqduoxhetutxrs.supabase.co`.
- Browser code may use only the Preview publishable/anon key. Never expose service-role,
  secret, database-password, or provider keys.
- Use the existing tenant API adapter and existing verified database model. Do not
  invent tables or RPCs.
- Keep agent mutations disabled until audit logging, owner approval, and tenant-IDOR
  tests are complete.

## Repeatable design-to-code procedure

### A. Freeze and export the approved Stitch design

1. Open the existing approved MEHWAR project in Google Stitch.
2. Confirm the approved nine-screen flow and the complete connected navigation.
3. Export the entire project, not only individual screenshots. Preserve every screen's
   source HTML, screenshots, assets and the original Stitch `DESIGN.md`.
4. Export the design to Google AI Studio when that option is available. Keep a local
   archive of the original export as an immutable reference.
5. Record the project URL/ID, export date, screen names and assets in
   `STITCH-SOURCE-MANIFEST.md`.

### B. Import into Google AI Studio

1. Open Google AI Studio Build mode under the product owner's selected Google account.
2. Use Add files (+) → Import from GitHub to import the designated MEHWAR codebase,
   or open the Stitch export in AI Studio using Stitch's export action.
3. Confirm the workspace is operating only on the customer app, not the internal
   platform source.
4. Open Settings → GitHub. Connect the designated repository and verify its repository
   name before any push.
5. Work on the dedicated feature branch only. If the UI does not let you select that
   branch, do not commit to the default/production branch; download the app ZIP and
   reconcile it in the safe feature branch instead.

### C. Implement without design drift

1. Copy the Stitch export to `stitch-source/` unchanged.
2. Translate the exported screens and reusable components into React + TypeScript + Vite.
3. Keep the supplied design tokens and assets; do not create substitute screens.
4. Implement the nine screen routes and navigation using the exact exported screen order.
5. Add real authentication, tenant bootstrap, organization/workspace selection and
   task/service reads through the verified adapter.
6. Add loading, error, empty and success states that use the approved visual language.
7. Only enable buttons where a working and authorized backend action exists.

### D. Verify before closing

- TypeScript typecheck passes.
- Production Vite build passes.
- All nine screens render in Arabic RTL and match Stitch reference captures.
- Every navigation link reaches the correct screen and back navigation works.
- Login/logout/session restore/password reset are tested.
- Tenant data is read only for the signed-in active organization.
- A cross-tenant access test proves another organization's records are not visible.
- PWA install, app icon, launch, update and offline fallback are tested on Android.
- No service-role or secret key appears in browser bundles.
- No public deployment, external message, publishing, payment or destructive action
  occurs without the required owner approval.
- Export a ZIP from the successful build and record the exact commit, test results,
  and artifact SHA-256 in the handoff report.

## AI Studio implementation prompt

Use this prompt after the original Stitch export has been imported:

> Continue the existing مِحور | MEHWAR customer product. First inspect the whole imported
> project, the original Stitch screen HTML, assets and DESIGN.md. Treat these as the
> visual source of truth. Rebuild the exact approved nine-screen flow as a production-
> quality React + TypeScript + Vite PWA, Arabic-first and completely RTL. Preserve every
> visual detail, text, color, font, component, spacing, responsive behavior and navigation
> pattern from the export. Do not redesign, simplify, invent missing screens, or replace
> supplied assets. Work only inside the dedicated MEHWAR app directory/repository. Keep
> the internal ZOZ system and all unrelated files unchanged. Use the existing Supabase
> Preview project and the verified `zoz-tenant-workspace` adapter for authenticated
> tenant bootstrap, services and real tasks. Respect existing RLS and server-side
> membership checks. Do not create database tables/functions, do not expose service-role
> credentials, and do not enable task mutations, uploads, deliverables, notifications or
> external integrations unless their secure backend path is already verified. Implement
> real routes, state, loading/error/empty states, keyboard/accessibility behavior, and
> responsive Android layouts. Add tests, run typecheck and production build, inspect the
> rendered screens against Stitch screenshots, and report every incomplete item honestly.
> Do not deploy or merge to a production branch.

## Current branch bootstrap

This branch is a safe working branch derived from
`feat/mehwar-customer-foundation`. It is intended for design import and implementation
review, not public release. The repository is currently a monorepo; do not give an
external builder broad write scope to unrelated internal folders. Prefer an isolated
MEHWAR-only GitHub repository/workspace before granting automated write access.

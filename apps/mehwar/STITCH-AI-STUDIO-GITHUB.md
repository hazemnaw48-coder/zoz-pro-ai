# MEHWAR — Continue the existing product through Stitch and Google AI Studio

## Product identity: do not create a second product

This work continues the company's **existing مِحور | MEHWAR product**.
It is not a new product, replacement application, parallel SaaS, or rebrand.

The goal is to modernize the visual design and complete the customer-facing
screens and interactions **on top of the existing MEHWAR product foundation**,
while preserving existing business logic, tenant data, Supabase integration,
authentication model, and company workspaces.

The original approved Stitch project is the design source of truth. Open and
continue that project; do not start a blank Stitch project or generate a
different substitute design.

### Preserve existing work

- Keep the existing MEHWAR identity, scope and product direction.
- Keep the existing Preview Supabase project and real tenant schema.
- Keep the current verified `zoz-tenant-workspace` integration and
  `createAgentBridge` adapter.
- Keep the existing customer foundation in `apps/mehwar/` and continue it.
- Retain all existing repo history, internal services, Android Flow Bridge,
  and production resources.
- Add/modernize screens, responsive layout, component quality, navigation,
  loading/error/empty states and working interactions; do not discard existing
  integrations to make a mockup.
- Do not create a competing app, duplicate business database, new tenant model,
  new Supabase project, or duplicate internal service.

## Primary Google account for this work

Use the company's **Hazem Now** Google account for Google AI Studio.
Other already-connected Google accounts are backup accounts only. Do not
switch accounts or create a second AI Studio workspace under another account
without the owner's instruction.

## Verified Stitch workflow

Google's current Stitch workflow supports bringing an existing codebase and
design files into its design context, and exporting designs to Google AI Studio
or Antigravity. Stitch also provides an agent-friendly `DESIGN.md` handoff.
Therefore use the original Stitch project as the visual reference, and use
existing MEHWAR source files as implementation context. Do not treat screenshots
or a newly generated visual as a replacement for editable source.

## GitHub safety constraint — do not attach the whole monorepo blindly

Current repository:
`hazemnaw48-coder/zoz-pro-ai`

Current safe development branch:
`feat/mehwar-stitch-ai-studio`

Repository default branch:
`main` (contains the wider internal ZOZ Pro monorepo).

Google AI Studio community guidance has indicated that GitHub sync can bind
to the repository default branch rather than an arbitrary feature branch.
Because this repository's default branch is the internal monorepo, do not
connect AI Studio to the root repository or allow an AI Studio push to `main`
without a separately verified, non-destructive route.

This does **not** mean creating a new MEHWAR product. It means keeping the
existing MEHWAR customer module under a tightly scoped code boundary for
design-tool access, or using a workflow that returns reviewed changes into
the existing feature branch. Do not create a parallel production app, duplicate
database or independent tenant system.

Do not change the repository default branch, rename the repository, delete
branches, or modify deployment settings to work around AI Studio limitations.

## Design-to-code procedure

### 1. Continue the existing Stitch project

1. Open the existing approved MEHWAR Stitch project.
2. Bring the current MEHWAR customer code and existing Stitch source/design
   files into the design context when the tool supports it.
3. Inspect the currently approved screens and navigation before changing
   anything.
4. Refine the screen layout and interaction design in place. Preserve the
   product's existing design language and the approved brand.
5. Export all editable screen/source assets and the actual Stitch `DESIGN.md`.
6. Keep the exact source export unchanged in the handoff archive and record
   its Stitch project URL/ID and export date.

### 2. Continue implementation in Google AI Studio

1. Use the Hazem Now company Google account.
2. Continue the existing MEHWAR development context; do not create a separate
   customer product or replace the backend with a generated demo.
3. Use only a repository/workspace boundary proven safe for this monorepo.
4. If AI Studio cannot target the existing feature branch without pushing to
   the default `main`, stop before linking/pushing. Export code and integrate
   it through the reviewed feature branch instead.
5. Before every push, inspect the complete changed-file list. Reject changes
   outside `apps/mehwar/` or the specifically approved shared design assets.

### 3. Implement the existing app, not a mockup

- Complete the MEHWAR React + TypeScript + Vite customer frontend in the
  existing MEHWAR scope.
- Preserve the design from the original Stitch export, not the provisional
  seed in `.stitch/DESIGN.md`.
- Preserve current auth, tenant bootstrap and real task/service reads.
- Respect actual organization/workspace IDs and server-side membership checks.
- Keep audit-incomplete writes, uploads, deliverables, notifications and
  external actions disabled until their backend authorization and tests exist.
- Keep customer UI brand-only: مِحور | MEHWAR. Never show ZOZ Pro or ZOZ Group.

### 4. Acceptance checks before closing

- All approved screens are implemented from the original export.
- Visual review compares the rendered screens against the Stitch source.
- RTL, responsive Android layout, keyboard/accessibility and navigation work.
- Login/session restore and tenant bootstrap work against Preview.
- The selected tenant's real tasks/services are displayed.
- Cross-tenant access tests pass.
- No service-role or secret key is present in browser output.
- TypeScript check, tests and production build pass.
- PWA install/update/offline fallback and Android device smoke tests pass.
- A ZIP is generated from the successful build and its commit/hash is recorded.
- No Production deployment or database change occurs without a separate release gate.

## Prompt for the existing project

> Continue the existing مِحور | MEHWAR customer product. This is not a request
> to create a new product, a second app, or a fresh SaaS demo. Inspect the
> existing customer app foundation, its API adapter, current Supabase Preview
> integration and the original approved Stitch project. Keep and improve this
> same product. Use the original Stitch export as the visual source of truth:
> modernize and complete its existing screens while preserving brand identity,
> page hierarchy, responsive behavior, RTL and existing working integrations.
> Do not delete or replace existing business logic, tenant isolation, auth,
> database schema, or backend functions. Work only in the MEHWAR customer code
> boundary and only on the reviewed feature branch. Never push changes to the
> monorepo default branch. Connect the existing Supabase Preview data using the
> verified tenant adapter. Do not invent demo data, tables, pricing, integrations,
> or capabilities. Do not expose service-role credentials. Keep unaudited
> mutations and unverified uploads/notifications disabled. Add real routes and
> interactions, typecheck, test, build, visually compare with Stitch, and report
> incomplete work honestly. Do not deploy or merge to Production.

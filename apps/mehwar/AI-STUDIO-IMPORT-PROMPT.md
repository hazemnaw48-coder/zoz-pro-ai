# Google AI Studio prompt — continue the existing MEHWAR product

You are working on our existing company product **مِحور | MEHWAR**. This is
not a request to create a new product, an independent SaaS, a duplicate app,
a new database, or an empty login/workspace mockup.

## Work context

The existing source is the MEHWAR customer module under `apps/mehwar/` in
the ZOZ Pro monorepo. Its backend is the existing Supabase Preview project and
its verified tenant integration is the existing `zoz-tenant-workspace`
Edge Function via `createAgentBridge`.

The visual source of truth is our **already-approved existing Google Stitch
project**. Do not create a new Stitch project or replace it with a generated
design. Import the current Stitch screen source, HTML, assets, screenshot
references and real `DESIGN.md` export before implementing UI changes.

## Your role

Act as our UI/UX designer and full-stack implementation assistant:
1. Inspect the existing code and report what already works.
2. Inspect the original Stitch screens and design system.
3. Propose a screen-by-screen modernization plan that preserves the current
   product direction and its existing functionality.
4. Refine the existing Stitch screens in place; use targeted edits and variants
   for review, not a fresh project.
5. Export the real HTML/assets and translate the approved screens into the
   existing MEHWAR React application.
6. Connect each screen to real existing APIs only after inspecting the actual
   API contract. Never substitute fake metrics or fake customer data.
7. Run typecheck, tests and production build, then report exact evidence.

## Product boundaries

- Customer brand: مِحور | MEHWAR; tagline: منصة تشغيل وإدارة الأعمال.
- Do not show ZOZ Pro or ZOZ Group to customers.
- Arabic-first; fully RTL; mobile-first Android and responsive web.
- Preserve the company's existing business model, tenant separation, auth,
  organizations, workspaces and Supabase tables/RPCs/Edge Functions.
- Use the existing Preview URL from the current `.env.example`. Never change
  the Production project.
- Use only the public/publishable key in browser code. Never expose service-role
  keys, access tokens, API keys or other secrets.
- The current task/service read adapter is read-only. Do not invent mutation
  endpoints; keep uploads, deliverables, notifications, payments and external
  actions disabled unless a verified secure backend implementation exists.
- Keep all work under the MEHWAR module unless a specific shared file change is
  justified and reported.
- Do not push to the monorepo default branch. Export a ZIP and let the owner
  review the file diff before changes return to the safe MEHWAR feature branch.

## Screens to preserve/complete

Use the actual Stitch project's screen inventory as the definitive list and
navigation order. Do not invent replacement screens. The intended product areas
already established are: welcome/auth, onboarding/company setup, home dashboard,
services, service request and attachments, tasks, task details, deliverables,
subscription/usage, notifications/support, and company profile/settings.

## Required output

Return the complete modified project files, not screenshots-only. Include:
- the original Stitch export and manifest,
- editable React + TypeScript components,
- navigation and interactions,
- loading, error, empty and success states,
- real API integration references,
- test and build results,
- a list of any unimplemented feature and its exact backend dependency.

Do not call the product complete until the app builds and the real tenant
journey has been tested.

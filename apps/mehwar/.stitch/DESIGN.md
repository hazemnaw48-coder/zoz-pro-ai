# مِحور | MEHWAR — Design System Handoff

> Purpose: a shared, agent-readable design contract for Stitch, Google AI Studio,
> Antigravity and the React implementation. This is a **seed specification**
> based on the approved MEHWAR brand direction already recorded by the product
> owner. It is not a replacement for Stitch's exported project `DESIGN.md`.
> When the original Stitch export is supplied, preserve it and reconcile any
> differences with this file rather than guessing.

## Product identity

- Customer-facing name: مِحور | MEHWAR
- Arabic tagline: منصة تشغيل وإدارة الأعمال
- Product type: multi-tenant SaaS for business operations
- Audience: Arabic-first businesses and their teams
- Customer UI must never display ZOZ Pro or ZOZ Group.

## Confirmed visual direction

- Layout: mobile-first, Arabic-first, complete RTL.
- Theme: light.
- Primary navy: `#0F172A`.
- Teal accent: `#0D9488`.
- Typography direction: IBM Plex Sans Arabic or Cairo. Use the exact font files/weights
  from the Stitch export when available; do not silently substitute a different visual style.
- Feel: premium, modern, clear, trustworthy business software.
- Controls must be readable, accessible and usable on small Android screens.

## Non-negotiable design preservation rules

1. Stitch export is the visual source of truth. Do not reinterpret, redesign, simplify,
   or replace its screens when translating them to React.
2. Preserve component geometry, screen hierarchy, spacing, typography, colors, icon style,
   shadows, border radii, responsive behavior and RTL alignment from the export.
3. Keep the supplied Arabic labels and copy. Do not translate customer-facing UI into English.
4. Implement actual navigation and state without changing the approved visual appearance.
5. Where a design element cannot map directly to a working control, preserve its appearance
   and implement the interaction behind it.
6. Do not add invented KPI values, customer data, integrations, pricing or capabilities.
   Use real Preview responses or clearly marked empty/loading states.
7. Do not present placeholders, screenshots, or a static HTML prototype as the working app.

## Functional product boundary

The intended product includes authenticated company workspaces, tenant isolation,
services, requests, tasks, deliverables, subscriptions, notifications, support,
and company settings. Only features backed by verified APIs and safe storage policies
may be enabled. Unimplemented actions must be visibly disabled or clearly explained.

## Design tokens still to extract from Stitch

The following must be copied from the actual project export, not estimated:
- All font families, weights and type scale.
- Full color palette and semantic states.
- Spacing, sizing and responsive breakpoints.
- Radius, border, shadow and elevation tokens.
- Icons and image assets.
- Component variants and screen-specific layout details.

## Source provenance

Record the Stitch project URL or project ID, export date, and screen inventory in
`STITCH-SOURCE-MANIFEST.md` when the approved export becomes available.

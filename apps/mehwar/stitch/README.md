# MEHWAR Stitch Workbench

This is an integration workspace for the **existing company MEHWAR product**.
It is not another app, product, tenant system or database.

## What it provides

- Connect to the owner's existing Google Stitch account through the official
  `@google/stitch-sdk`.
- List existing Stitch projects and their screens without creating anything.
- Export HTML and screenshots from a selected existing project into
  `apps/mehwar/.stitch/source/<project-id>/`.
- Edit one specifically named existing screen and save a review copy under
  `apps/mehwar/.stitch/iterations/<project-id>/`.
- Keep Stitch output as the design source of truth; reviewed code changes return
  to the existing MEHWAR feature branch.

## Connect Stitch once

1. Open the existing Stitch project with the **Hazem Now company Google account**.
2. Complete Google's official Stitch MCP setup and obtain either its Stitch API
   key or an OAuth access token and Google Cloud project ID.
3. Copy this directory's `.env.example` to `.env.local`.
4. Put the credentials in `.env.local` only. Never commit it, paste secrets
   into prompts, or place them in browser code.
5. Install the pinned SDK:

   ```bash
   cd apps/mehwar/stitch
   npm install
   ```

## Read the existing Stitch workspace

```bash
npm run projects
```

This lists accessible projects and screen IDs. It is read-only. Select the
existing MEHWAR project from that output; do not create a new Stitch project.

## Export the existing design to real files

```bash
npm run export -- --project-id <EXISTING_STITCH_PROJECT_ID>
```

The script downloads every listed screen's HTML and screenshot and writes a
`STITCH-SOURCE-MANIFEST.json`. Review the manifest and screen files before
changing React components. These are real files, not screenshots-only previews.

## Refine an existing screen

Use Stitch's design editor/agent or run:

```bash
npm run edit -- --project-id <EXISTING_STITCH_PROJECT_ID> \
  --screen-id <EXISTING_SCREEN_ID> \
  --prompt "Refine the existing screen without changing the approved MEHWAR identity or navigation."
```

This calls the edit operation on the named existing screen. The updated HTML
and screenshot are saved for review; no project or duplicate screen is created.

## Move existing MEHWAR code into Stitch

Use Google's official `stitch::code-to-design` skill from
`google-labs-code/stitch-skills`. It chains:
1. extraction of self-contained HTML from the actual running/build app,
2. extraction of a design system from the real React/CSS source, then
3. upload of the HTML and design system into the existing Stitch project.

This is the reverse direction: Stitch can inspect the actual implementation
and then refine it. Do not upload a generic mockup or an invented screen.

## Use Google AI Studio

1. Open Build mode with the company's Hazem Now Google account.
2. Import the existing MEHWAR source files / verified ZIP. Do not start a blank
   product or choose an App Gallery template.
3. Use the prompt in `../AI-STUDIO-IMPORT-PROMPT.md`.
4. Work only on the imported MEHWAR customer code. Never replace the existing
   Supabase tenant model or internal ZOZ systems.
5. Download the updated ZIP, compare the changed files, and return reviewed
   changes to `feat/mehwar-stitch-ai-studio`.

AI Studio's current docs describe GitHub import and two-way sync. However,
this repository's default branch is the internal monorepo `main`; this
workbench does not authorize AI Studio to push to that branch. Use ZIP
round-trip / reviewed branch commits until a safe branch-targeted sync is
verified in the actual AI Studio account.

## Credentials and safety

- Use Hazem Now as the primary Stitch / AI Studio account; other Google
  accounts remain backups.
- No credentials belong in Git, `.env.example`, source code, screenshots or
  prompts.
- Only edit/export the existing Stitch project after selecting its exact
  project and screen IDs.
- Keep any Stitch design edit for review before implementing in the app.
- This workbench does not deploy, touch Supabase, or modify Production.

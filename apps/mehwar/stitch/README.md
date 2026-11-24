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

**Account split is intentional:** use **ZOZ Hazem** for the existing Stitch
project. Use **Hazem Now** only for Google AI Studio. Do not switch the Stitch
project to Hazem Now or create a replacement Stitch project.

### Official CLI authentication (preferred)

The current official `@google/stitch` CLI supports Google OAuth PKCE and stores
its refreshed credentials in the local CLI configuration. Version 0.13.0 was
installed and its command interface checked in the MEHWAR cloud workbench.

```bash
npm install -g @google/stitch@0.13.0
stitch login
stitch status
stitch find projects --limit 20 --json
```

**Important for phone continuation:** run the login flow inside the persistent
MEHWAR cloud workbench, not only in the borrowed computer's local terminal.
Otherwise OAuth credentials remain on the borrowed computer and the cloud
workbench cannot use them after it is returned. The browser-based login must
complete in the same remote workspace whose filesystem stores the CLI
credentials. Never paste an OAuth token, API key or password into ChatGPT.

### SDK / API-key alternative

If Canvas actions require an API key, copy this directory's `.env.example` to
`.env.local`, then put `STITCH_API_KEY` or the supported `STITCH_ACCESS_TOKEN`
there in the cloud workbench only. Keep `.env.local` out of Git. Do not put
Stitch credentials in browser code, a public Vercel deployment, or an AI Studio
prompt.

Install the pinned project SDK:

```bash
cd apps/mehwar/stitch
npm ci
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

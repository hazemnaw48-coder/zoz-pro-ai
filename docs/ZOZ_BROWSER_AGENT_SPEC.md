# ZOZ Browser Agent — local browser execution design

## Purpose
Provide a phone-local, owner-visible browser workspace for supported external workflows. It complements official APIs and Android intents; it does not bypass a platform's security, quotas, consent, or automation policy.

## Architecture
- Browser runs on the Android device and keeps website sessions in the device's browser/WebView storage.
- Browser sessions, cookies, passwords, and MFA material never leave the device.
- ZOZ server sends typed tasks, not arbitrary JavaScript or arbitrary click coordinates.
- Each capability is bound to an explicit origin allowlist, task schema, expiry, and owner.
- Browser returns structured results and screenshots/evidence only when the user has explicitly permitted the relevant page capture.
- The browser bridge exposes a narrow set of methods; visited pages cannot invoke native methods unless the exact origin and operation are authorized.

## Execution levels
1. Level 0 — open URL, navigation, share sheet, file picker: default.
2. Level 1 — read page title/text and detect a known page state: site-specific allowlist.
3. Level 2 — fill a known form field or prepare a draft: explicit task schema and visible preview.
4. Level 3 — submit, upload, publish, change account settings, or commit a purchase: explicit owner approval immediately before action.
5. Prohibited — bypass MFA/CAPTCHA, scrape credentials/cookies, defeat paywalls or rate limits, hide automation, impersonate a human, or run unrestricted scripts.

## Google Flow
- Use the official signed-in Flow app or website on the owner's device.
- Agent can prepare prompts, shot order, aspect ratio, and a production brief.
- The first implementation transfers prompts through clipboard/share and opens Flow.
- Autonomous generation is not claimed until a supported integration exists and a real device test proves it.
- Flow's own plan, model access, and generation quotas still apply.

## Amazon KDP
- Agent can draft manuscript, cover brief, metadata, categories, keywords, and validate package files.
- Browser can open KDP and prepare a reviewable submission checklist.
- No credentials are read or stored by the agent.
- Final upload/submit, price, rights, tax, payment, and publication declarations require owner confirmation.
- Direct API automation is only enabled if Amazon provides a supported authorized interface for the specific operation.

## Acceptance tests
- Session remains on-device and does not appear in network payloads or logs.
- Unlisted origins cannot access the native bridge.
- CAPTCHA/MFA pages stop automation and return control to the owner.
- External submission is blocked until an approval token for the exact action is supplied.
- The browser can be paused and its site data cleared by the owner.

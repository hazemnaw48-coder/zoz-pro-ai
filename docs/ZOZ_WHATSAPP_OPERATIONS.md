# ZOZ WhatsApp Operations Agent

## Scope
First-party ZOZ Business inbox for the existing WhatsApp Business number +20 12 22748475. This is separate from WhatsApp numbers owned by ZOZ AfterSales tenants. Each tenant must connect and own its own number and customer data.

## Safety defaults
- Preview-first. Production database and WhatsApp number are not changed by this branch.
- The connected WhatsApp Business app number is never disconnected, re-registered, or migrated by this code.
- The channel defaults to `draft_only`, `emergency_stop=true`, and `is_enabled=false`.
- Free mode sends only plain service text within the 24-hour customer service window. Meta's current published 2026 rate model provides 1,000 free service messages per business phone number per month; the implementation uses a conservative cap of 900 and pauses after it. Confirm current Meta billing terms before production use.
- No marketing, authentication, or utility template sends are enabled in free mode. Existing templates are synced read-only; never create duplicates or delete/archive existing templates.
- Opt-out, excluded contacts, high-risk topics, prices, discounts, contracts, complaints, payments, security messages, and ambiguous requests cannot be auto-sent.
- Credentials remain in Supabase Edge Function Secrets. No tokens are committed or placed in browser code.

## Components
- `zoz_whatsapp_channels`: the ZOZ Business channel and operational mode.
- `zoz_whatsapp_contacts`, `zoz_whatsapp_conversations`, `zoz_whatsapp_messages`: contacts and inbox history.
- `zoz_whatsapp_templates`: read-only metadata for existing Meta templates.
- `zoz_whatsapp_webhook_events`: signed, idempotent webhook ledger.
- `zoz_whatsapp_outbox`: drafts, approved replies, delivery results.
- `zoz_whatsapp_monthly_usage`: atomic monthly free-message quota.
- `zoz_whatsapp_knowledge`: owner-approved company facts.
- `zoz_whatsapp_audit`: actor/action history.
- `zoz-whatsapp-control`: Meta webhook, owner inbox actions, template sync, guarded free service reply.
- `whatsapp-center.html`: owner inbox and controls.

## Edge Function secrets required before connecting Meta
- `META_WHATSAPP_VERIFY_TOKEN`: random webhook verification secret.
- `META_WHATSAPP_APP_SECRET`: Meta App Secret, used to validate X-Hub-Signature-256.
- `META_WHATSAPP_ACCESS_TOKEN`: long-lived system-user token with minimum WhatsApp scopes.
- `META_WHATSAPP_WABA_ID`: WhatsApp Business Account ID.
- `META_GRAPH_API_VERSION`: supported Graph API version verified in Meta App Dashboard.
- Supabase supplies its own URL and service/auth keys; `ZOZ_OWNER_EMAIL` identifies the owner.
Never paste Meta access tokens into chat, GitHub, or the browser.

## Preserve the current WhatsApp Business app
Complete Meta's official WhatsApp Business App Coexistence flow using the existing number and an eligible Embedded Signup/partner route. Keep the current Peach connection active until Meta confirms the same number can be used by both app and API. Do not scan-link, disconnect, re-register, or migrate the number during development. Save the resulting Phone Number ID and WABA ID in the owner page; the Phone Number ID is stored in the channel record. Configure the remaining secrets in Supabase Function Secrets. Verify the Meta webhook before enabling the channel.

## Free operating policy
- `off`: inbox only.
- `draft_only`: classify inbound messages and create Arabic reply drafts; owner sends them manually in the open service window.
- `safe_auto`: automatically reply only to greeting/basic company-introduction messages, only in the open 24-hour window, for non-excluded and non-opted-out contacts, and below the conservative 900 monthly free service-message cap.
- The sender does not attempt any template or out-of-window message in free mode.
- Marketing opt-in is never inferred from a saved contact. No cold marketing or broadcasts.

## Validation
Run `node --test tests/zoz-whatsapp-policy.test.mjs`. The Preview Edge Function is deployed with `verify_jwt=false` only because it contains both a Meta webhook signature check and owner JWT verification in code. Health checks never send a message.

## Production gate
Do not merge/deploy to production until the same-number coexistence route is confirmed, the owner has entered Meta secrets in Preview, webhook verification succeeds, inbound messages are stored idempotently, delivery statuses reconcile, and one owner-controlled test recipient confirms the end-to-end reply. No real customer is a test recipient.
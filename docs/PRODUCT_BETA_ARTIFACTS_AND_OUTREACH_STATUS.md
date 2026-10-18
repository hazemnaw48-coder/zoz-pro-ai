# Product Beta Artifacts & Customer Outreach Status

**Snapshot:** 2026-10-18  
**Project:** ZOZ Pro — digital product opportunity validation  
**Branch:** `feature/ZP-023-digital-product-opportunity-validation`  
**Current status:** Working local beta files generated; customer interviews and paid demand are not yet validated.

## Working prototype artifacts

The beta files were generated for hands-on validation. They are currently available as conversation-generated files, not yet committed as binary assets to this repository:

- `ZOZ_Creator_Rights_Revenue_Kit_BETA.xlsx`
- `ZOZ_Creator_Rights_Revenue_Quick_Start.docx`
- `ZOZ_Creator_Rights_Revenue_README.txt`

Workbook sheets: Start Here, Asset Register, Usage Observation Log, Invoice Tracker, Quote Builder, Next Actions, Message Templates. Example records are fictional. The workbook includes dropdowns and date/invoice formulas. No macros, external API calls, payment processing, automatic monitoring or automatic messaging are included.

## Fresh qualitative signal (not representative demand)

Public UGC creator discussions observed during research include:
- A creator asking how to respond to a brand request for unlimited usage instead of periodic paid usage renewal: https://www.reddit.com/r/UGCcreators/comments/1wq5jyf/ugc_unlimited_usage_rights_question/
- A discussion about contract scope expanding to paid usage, raw footage, exclusivity and unclear end dates: https://www.reddit.com/r/UGCcreators/comments/1vsxwef/are_ugc_contracts_getting_more_demanding_or_am_i/
- A creator asking how to price organic vs paid usage and a full rights buyout: https://www.reddit.com/r/UGCcreators/comments/1u30stm/pricing_help_for_usage_rights/
- An Egyptian/MENA UGC marketplace describing a flow where businesses discover creators and continue on WhatsApp after an introduction: https://ugen.online/ and https://ugen.online/terms

These are public, self-selected anecdotes and product descriptions, not customer interviews, representative data, endorsements or proof of purchase intent.

## Contact-channel decision

WhatsApp Business Cloud is available as a Make module, but this team's module inspection returned no existing WhatsApp Business Cloud connection. A Make authorization request was created for the owner's WhatsApp Business account:
- Request ID: `0a720eda-112e-4e76-95dc-89f4d846533b`
- Authorization link: https://eu1.make.com/3210491/credentials-requests/inbox?requestId=0a720eda-112e-4e76-95dc-89f4d846533b
- Status at creation: pending

No message has been sent. After the owner authorizes the connection, verify the sender and permissions. For research outreach, contact only a small, relevant set of creators through public business contact routes where research invitations are appropriate, respect platform rules and opt-out, and do not bulk-message or scrape contacts. WhatsApp's policy/consent requirements and the 24-hour customer-service window may require an approved template for a business-initiated conversation. Do not send until recipient and message are reviewed and the connection is confirmed.

Gmail was discoverable as a Make module, but the user's Gmail connector is disabled by admin in the current ChatGPT plugin directory and no Gmail connection was found in the inspected Make module spec. Do not claim Gmail is connected.

## Next gates

1. Owner completes WhatsApp authorization.
2. Verify the WhatsApp sender and whether the account can send an approved template to a business-initiated contact.
3. Prepare a short, non-promotional research invitation and a list of eligible public/opt-in contact routes.
4. Send only after reviewing the recipient list and template; log sent/reply/opt-out states.
5. Complete 15 qualified interviews and record anonymized evidence.
6. Build no additional software until the consistent problem and competitive gap pass the agreed thresholds.
7. Run the free prototype with 5–8 testers, then a no-payment willingness-to-pay test.
8. Decide go/revise/stop. No payment, paid ads, paid services, or production deploy is enabled.

## Non-negotiable boundaries

- Existing ZOZ Pro repository only; target Cloud Run + Supabase path.
- No new project; no Vercel repair path.
- No payment activation, paid ads, bulk messaging, unsolicited mass email, or paid provider usage without explicit approval.
- Do not upload customer contracts, private data, credentials, or phone lists into the workbook/repository.

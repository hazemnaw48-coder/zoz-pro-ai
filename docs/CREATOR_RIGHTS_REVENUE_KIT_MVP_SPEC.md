# MVP Specification — Creator Rights & Revenue Kit

**Stage:** Draft specification for validation; not yet approved for paid launch.  
**Date:** 2026-10-18  
**Product format:** Downloadable spreadsheet (Excel + Google Sheets compatibility), quick-start PDF, editable follow-up templates.  
**Audience:** UGC creators with existing paid collaborations and licensed content.

## One-sentence promise

Keep track of the usage terms agreed for each creator asset, the next licence review date, the evidence recorded, and the invoice follow-up—without a new monthly software subscription.

Do not promise automatic enforcement, automatic takedowns, guaranteed payment, legal protection or income growth.

## Why this is narrower than existing tracker products

Public marketplace listings already cover generic brand pipelines, rate calculators, rights expiry, invoices and creator dashboards. A product that merely adds those tabs would be a clone. The hypothesis to validate is whether creators need an **evidence-to-action workflow** that ties the written scope for each asset to (a) a review of public use, when visible, (b) a documented observation record, and (c) a clear next action for clarification, renewal or payment follow-up.

If interviews reveal no unmet gap compared with current trackers or rights-tracking SaaS, do not build this product.

## Deliverable file set

1. Creator-Rights-Revenue-Kit.xlsx — portable workbook with no macros and no external API calls.
2. Quick-Start.pdf — setup, how to enter terms exactly as written, how to log an observation, and the limits of the workbook.
3. Message-Templates.docx or editable text file — neutral scope-clarification, approaching-expiry, invoice-due, and observed-use-after-window messages.
4. Sample-Workflow.pdf — fictional example from agreement → recorded rights → review date → invoice state → next action.
5. README.txt — software compatibility, licensing, support boundary, version, and no-legal-advice disclaimer.

## Workbook structure

### Tab 1 — Start here
- Plain-language usage guide, owner-defined currency, date format, status definitions.
- Explicit reminder: record the written agreement, not assumptions; delivery date and licence start date may differ.
- A fictional worked record that is easy to delete.

### Tab 2 — Asset & licence register
- Unique asset ID; brand/client; campaign; asset location; public post/ad URL if already available.
- Contract/document link or filename reference (the workbook must not embed confidential contract text).
- Use type: organic, paid, whitelisting/partnership/Spark Ads, other.
- Platforms/channels, territory, licence start date, licence end date/duration, exclusivity, raw-footage/derivative scope, usage restrictions, approval owner and status.
- Formula fields: days remaining and review status (not checked / upcoming / due / past date / needs human review).
- The dates and scope must come from the owner's signed agreement; no automatic legal interpretation.

### Tab 3 — Usage observation log
- Asset ID; public ad/library URL or ad ID; platform; date/time observed; screenshot/evidence file path/link; brief factual observation; checked by; next review date.
- Only public, lawfully accessible evidence. No scraping, account bypass or credential collection.
- If a licence window appears to have ended, record the observation as “needs review”; do not automatically label it an infringement.

### Tab 4 — Invoice & follow-up
- Deal/asset ID; invoice reference; amount/currency; terms as recorded; issue date; due date; received date; days overdue; follow-up date; status.
- Neutral, staged follow-up prompts; no automatic messages or payment collection.

### Tab 5 — Custom quote worksheet
- Creator-defined base fee and configurable line items (deliverables, usage period, additional channels, raw footage, revisions, rush work, exclusivity or whitelisting, if applicable).
- Shows arithmetic only; no universal “standard rate” claims and no default multiplier presented as professional advice.

### Tab 6 — Next-action board
- Review this week; licence dates needing review; invoices due/overdue; observation records requiring human review.
- Next action and owner; no notifications unless imported/configured separately by the user.

## Quality checklist

- Works in current Excel and Google Sheets without macros; formulas are documented and tested.
- Dates remain correct across locale settings; users can set currency and date format.
- Dropdown values and formulas are protected from accidental overwrite where feasible.
- Contains only synthetic sample data and no copied proprietary template assets.
- Includes examples for an organic-only post, paid usage with a defined window, and an invoice pending.
- Every rights claim includes the instruction to consult the actual agreement and seek qualified advice for disputes.
- No promises about recovering money or removing an ad.

## Test before release

- Five to eight qualified creators use the workbook with at least one real (their own) asset/deal; do not ask them to upload contracts or sensitive data to us.
- At least four complete the workflow; at least three use it more than once; at least three independently point to the evidence-to-action distinction as useful.
- Test price statements (US$19 vs US$29) without taking payments.
- If the kit is perceived as a duplicate of existing sheets or subscription software, revise or stop.

## Release boundary

No storefront, payment processor, collection account, paid ad, external outreach or production deployment is included in this specification. Paid launch requires a new explicit owner decision after the validation gates pass.


## Current artifact and validation status — 2026-10-18
A working beta workbook and quick-start guide have been created in the active ChatGPT work session for free usability validation. They are not yet a paid release and have not been validated with customers. Outreach research and an English opt-in invitation are documented in `docs/PRODUCT_CUSTOMER_OUTREACH_LOG.md`. WhatsApp Business connection authorization is pending; no message has been sent and no customer response is claimed.

# ZOZ Pro — Global Digital Product Opportunity: Evidence Review & Test Plan

**Research snapshot:** 2026-10-18  
**Decision status:** Recommended low-cost prototype hypothesis; demand and willingness to pay are NOT validated. No product launch or full software investment approved.  
**Target:** Global, English-first, independent UGC creators who already receive paid brand collaborations.  
**Project boundary:** Existing ZOZ Pro repository and Cloud Run + Supabase path. No new project, Vercel repair path, payment activation, paid ads, external outreach, or paid provider usage without explicit owner approval.

## Executive decision

**Do not build another generic content planner or broad creator operating system first.** Marketplace evidence shows many content calendars and UGC deal trackers, with a wide range of low prices and near-identical feature lists. The better first hypothesis to test is a narrower, one-time downloadable **Creator Rights & Revenue Kit**: a practical workbook and action guide to record what usage rights were granted for each UGC asset, track invoice due dates and rights expiry, document public evidence of continuing ad use when it is visible, and prepare a disciplined renewal or payment follow-up.

This is the best *prototype candidate* from this research, not a validated winner. It should be tested against real creator experiences before building a polished bundle or any software. The differentiator must be the end-to-end evidence and next-action process—not simply adding another rights-expiry column to an existing spreadsheet.

## Why this problem merits testing

1. **CreatorIQ, State of Creator Compensation (2026-01-21):** reports $32.6B estimated global creator-marketing market value for 2025; aggregate creator payments grew 59% year over year, but the top 10% of creators received 62% of payments in 2025. The same report describes deal revenue as episodic and unpredictable. This supports a commercially significant market but also warns against targeting hobbyists or assuming a typical creator has budget.  
   Source: https://www.creatoriq.com/press/releases/state-of-creator-compensation-
2. **CreatorIQ, Creator-Powered Funnel (2026-06-10):** among 100 US/UK brand and agency marketing leaders surveyed, 92% used creator content in paid media, creator content represented 44% of paid-media creative assets on average, and 54% named securing usage rights as a barrier to scaling creator content. This is a direct signal that rights administration matters in paid-media workflows, although it is a brand/agency survey—not proof that creators will buy this kit.  
   Source: https://www.creatoriq.com/press/releases/creator-powered-funnel-report-2026
3. **CreatorIQ, State of Creator Marketing 2026–2027 (2026-09-30):** identifies integration of workflows and systems as a major operating challenge while creator marketing budgets continue to grow. This adds context for process-control products; it still does not validate the proposed consumer product.  
   Source: https://www.creatoriq.com/white-papers/state-of-creator-marketing-trends-2027
4. **Recent creator discussions:** several public UGC community posts describe confusion about unlimited/paid usage, expired ads, and late invoices. These are qualitative, self-selected community anecdotes with small vote counts—not representative survey evidence. They are useful for drafting interview questions, not for estimating market size.  
   Examples: https://www.reddit.com/r/UGCcreators/comments/1wcgl7p/how_i_stopped_letting_brands_run_my_ugc_ads_past/ ; https://www.reddit.com/r/UGCcreators/comments/1sfqqky/help_add_usage_outside_the_agreed_timeframe/ ; https://www.reddit.com/r/UGCcreators/comments/1wq5jyf/ugc_unlimited_usage_rights_question/

## Competitor evidence (observed listings, 2026-10-18)

| Alternative observed | Public price / signal | What is already covered | Implication |
|---|---|---|---|
| FounderStudios, UGC Creator Brand Deal Tracker (Etsy, UK edition) | Regionalized price shown around US$25.29 at observation; 12 tabs; listing itself had no reviews; shop had 2.3K sales and 280 shop reviews overall | Deal and pitch pipelines, deliverables, invoice/payment tracking, rights/exclusivity, rate calculator, CRM, expenses | Serious direct competition; shop-wide sales are not proof the individual listing sells |
| UGC Creator Airtable Template (Etsy) | US$7.99 | Brand deals, payments, content planning | Low-price substitute |
| UGC Creator Notion Template (Etsy) | US$11.14, listing reported 1 sale/no reviews at observation | Deals, invoices, income, pitch templates | New listings exist, but exact demand is unclear |
| UGC Creator Notion Tracker (Etsy) | US$21.29 listing; 4.5-star listing rating displayed in search | Deals, deadlines, income, pitching | Similar positioning already present |
| Creator tracker spreadsheets on Etsy | Search results included several listings around US$3–$12; others were higher | Follow-ups, rates, deal and income tracking | Basic tracking is highly commoditized |
| Fayedtion, Brand Deal Tracker for UGC Creators (Gumroad) | US$39+; one rating on the product at observation | Lead-to-paid deal pipeline, samples, content, invoices, creator profile | Shows sellers test higher price points, but public product-level purchase evidence is weak |
| Proofspringdigital, UGC Creator Brand Deal Operating System (Gumroad) | A$119 one-time was shown in the listing copy | Deal flow, scopes, rights, pricing and creator operations | Premium positioning exists; the page did not establish meaningful sales volume |
| sproutUGC usage-rights feature | Public SaaS offering | Licence terms, rights windows, renewal prompts | Direct software substitute; a spreadsheet-only rights alert is not unique |
| UGC Rights Tracker | Public SaaS offering with a no-card trial and licence-expiry alerts | Rights permission and expiry tracking, including paid ad/whitelisting workflows | Another direct substitute; a new product must avoid copying basic functionality only |
| TheGoodiesLab general social-content planner (Etsy) | US$10 sale price at observation, 24 product reviews; shop had 1.6K sales overall | Multi-platform calendar, content ideas, assets, analytics | General creator planning is already well supplied; shop-wide sales must not be attributed to this one product |

Representative source links:
- https://www.etsy.com/listing/4518943446/ugc-creator-brand-deal-tracker-uk
- https://www.etsy.com/listing/1837749623/ugc-creator-airtable-template-brand-deal
- https://www.etsy.com/listing/4504409384/ugc-creator-notion-template-content
- https://www.etsy.com/listing/4494833551/ugc-creator-notion-template-brand-deals
- https://fayedinua.gumroad.com/l/brand-deal-tracker-ugc-creator-os
- https://proofspringdigital.gumroad.com/l/ugc-creator-brand-deal-operating-system
- https://www.sproutugc.com/software/usage-rights-tracker
- https://www.ugcrightstracker.com/
- https://www.etsy.com/listing/1607881109/social-media-content-planner-template

**Conclusion from the competition review:** there is a visible market category and strong feature overlap, but no public evidence here establishes sales velocity for the specific proposed product. The generic “creator OS” and generic “UGC brand deal tracker” should be treated as saturated/price-competitive. A focused Rights & Revenue Kit is worth a small validation test only if interviewees confirm that existing trackers and tools do not solve the *evidence-to-action* workflow they need.

## Shortlist and hypothesis scores

Scores are 1–5, with weights: pain/frequency 25%, buyer accessibility 20%, differentiation 20%, repeat use 20%, low-cost testability 15%. Scores are hypotheses to guide tests, not observed sales or demand.

| Candidate | Pain | Reach | Differentiation | Repeat use | Low-cost test | Weighted score | Decision |
|---|---:|---:|---:|---:|---:|---:|---|
| **Creator Rights & Revenue Kit** — per-asset rights register, invoice tracking, evidence log and renewal/follow-up workflow | 5 | 3 | 3 | 4 | 5 | **4.00** | Prototype only after interviews; validate evidence-to-action gap |
| Full UGC Brand Deal OS / CRM spreadsheet | 5 | 3 | 2 | 5 | 4 | 3.85 | Crowded; do not clone existing listings |
| General Creator Publishing Operations Kit | 4 | 4 | 1 | 3 | 5 | 3.35 | Deprioritize due commoditization |
| Generic AI prompt/script pack | 3 | 5 | 1 | 2 | 5 | 3.10 | Deprioritize: easy to copy and price pressure |

## Recommended product concept

**Provisional name:** Creator Rights & Revenue Kit — UGC Usage & Payment Control Workbook.  
**Ideal buyer hypothesis:** an English-speaking UGC creator who has completed at least 2–3 paid collaborations, has licensed or been asked to license content for brand use, and is responsible for their own invoices and follow-ups. Target active creators, not casual hobbyists.

**Customer job:** know what use was agreed for each asset, when the rights window ends, whether an invoice is overdue, what evidence exists, and what specific next step to take—without paying for a new SaaS subscription.

The product must not promise guaranteed fees, takedowns, legal protection or income. It is an administrative and evidence-organizing aid, not legal advice.

## MVP scope (deliverable digital files, not a SaaS rebuild)

- Editable Excel/Google Sheets workbook with fictional sample data; no private/customer data.
- Asset/rights register with explicit source fields from the agreement: asset, brand/campaign, channels, organic vs paid use, whitelisting/partnership/Spark Ads if applicable, licence start/end date, territory, exclusivity, raw footage/derivatives, evidence/document link, renewal owner and status.
- Invoice and cash-collection sheet with due dates, terms as entered by the creator, amount, received date and follow-up state.
- Public-evidence log: public ad/library link or ad ID, observation date, screenshot/location link, and a neutral status (not checked / observed / needs review). No automated scraping or unsolicited contact.
- Next-action playbook: verify the written agreement, check the relevant public ad library when available, record observations, ask for a clarification/renewal, and seek qualified advice for a dispute. Expiry of a licence does not itself stop an ad from running.
- Configurable quote worksheet: users enter their own base rate and add-ons; no universal “standard rates” are hard-coded.
- Four editable communication templates: scope clarification, approaching expiry, overdue invoice, and asking about observed use after a documented licence window.
- Quick-start PDF and one worked fictional example. State clearly: not legal, tax, or accounting advice; no guaranteed collection or enforcement outcome.

Do NOT build email-alert software, monitoring automation, contracts, payments, or a subscription before validation. Existing ZOZ Pro's product tracker is the place to record the idea and its status; reuse it and the current Cloud Run + Supabase architecture only if later engineering is justified.

## Test gates before investment

### Gate A — problem interviews (15 qualified people)
Recruit UGC creators with paid deals and rights-based usage, if/when the owner approves outreach. Ask about a real recent deal, where the licence term lives, how they distinguish delivery date from rights-start date, how they learn an ad is still live, invoice follow-up, existing tools and consequences. Do not start with “Would you buy my kit?”
- Pass to prototype if at least 8/15 experienced a recent rights-scope/expiry/payment follow-up problem, at least 5/15 currently use a manual workaround or can show a consequence, and at least 3/15 volunteer to test a prototype.
- If not, stop or change the target problem.

### Gate B — competitive gap interviews
Show the competitor feature matrix above. Ask what users already have and what remains unresolved. Pass only if at least 5/15 independently identify the same evidence-to-action gap and at least 3 can explain how solving it changes their workflow. If existing tools solve it satisfactorily, do not build a clone.

### Gate C — no-payment prototype
Make one spreadsheet prototype with three fictional deal records and a short setup guide. Give it to 5–8 volunteer testers, at no charge.
- Pass if at least 4 of 5 testers complete a real workflow, at least 3 use it on multiple live assets/deals, and at least 3 independently point to the evidence-to-action distinction as useful.
- Capture setup time, missed or unclear fields, use of evidence log, and whether the tool changes the next action taken.

### Gate D — no-payment purchase-intent test
Only after the earlier gates pass, create a simple landing page with a waitlist or interview-request CTA—not checkout. Target 100 qualified visits through owner-approved organic channels. An 8% qualified response is a provisional signal only; low traffic means inconclusive. Seek at least 5 follow-up conversations and 3 explicit, reasoned indications of willingness to pay US$19–$29 for a useful v1. Stated intention alone is not a sale.

## Price and unit-economics hypothesis

- Test US$19 beta pricing against US$29 proposed standard price after validation. Do not activate a sale now. A US$39+ bundle is not justified until user evidence and a real differentiator support it.
- Gumroad's current official direct-sale pricing is 10% + $0.50 per transaction, plus card processing listed as 2.9% + $0.30; Discover sales are 30%. At a $29 direct card sale, the simple estimated remainder is about $24.46 before refunds, FX, taxes outside the platform's handling, support and acquisition time. Approximately 41 such sales would yield ~$1,000 before those other costs; this is arithmetic, not a forecast.
- Gumroad's payout help page lists Egypt for local EGP bank payouts, but requires identity/account verification and a $100 minimum payout. Direct sales require us to find qualified buyers; do not rely on Discover initially, as it has eligibility requirements and a 30% fee.
- Etsy offers marketplace discovery, but Egyptian shops require Payoneer for Etsy Payments; the official fee page lists a $0.20 listing fee, a 6.5% transaction fee, and Egypt payment-processing at 6.5% + $0.30 USD, with a possible shop setup fee depending on onboarding. Do not open, configure, or pay for either store until validation and owner approval.
- Official sources: https://gumroad.com/pricing ; https://gumroad.com/help/article/13-getting-paid ; https://gumroad.com/help/article/79-gumroad-discover ; https://help.etsy.com/hc/en-us/articles/115015710408-Countries-Eligible-for-Etsy-Payments ; https://help.etsy.com/hc/en-us/articles/115014483627-What-are-the-Fees-and-Taxes-for-Selling-on-Etsy ; https://help.etsy.com/hc/en-gb/articles/115015628847-What-are-Payment-Processing-Fees-for-Selling-on-Etsy

## Go-to-market reality

The main risk is not file production; it is access to qualified buyers and differentiation. ZOZ Pro's existing Egyptology channel is not evidence of an audience of English-speaking UGC creators, so do not assume that channel is a viable sales funnel. Use creator communities, creator educators, or organic content only after the owner approves outreach and channel choices. No paid ads or external outreach has been activated.

## Decision rules

- **Proceed to paid productization:** gates A–D pass and the product solves a gap not adequately covered by the competing sheets/software.
- **Revise the offer:** rights tracking matters but interviewees prefer a different deliverable (for example an ad-usage evidence playbook or invoice follow-up kit).
- **Stop:** existing tools solve the problem, respondents do not use the prototype repeatedly, or buyers have no credible willingness-to-pay signal after two positioning iterations.
- **Consider recurring software only later:** repeated use and ongoing need are observed, with users explicitly asking for automation; estimate support and operating costs before scoping.
- Do not infer sales from market size, general AI usage, listings, favourites, likes or hypothetical interest.

## Execution backlog

1. [ ] Mark Creator Rights & Revenue Kit as the leading test hypothesis in ZOZ Pro's digital-product tracker (do not mark validated).
2. [ ] Complete the 15-interview guide and owner-approved recruitment plan.
3. [ ] Interview qualified creators and record anonymized findings.
4. [ ] Review at least 8 direct substitutes using the competitive gap questions.
5. [ ] Build the fictional-data workbook only if Gates A and B pass.
6. [ ] Run the no-payment user prototype test.
7. [ ] Run the no-payment waitlist/intent test and log conversion source.
8. [ ] Make a documented go/revise/stop decision.
9. [ ] Only after the owner approves a paid launch, verify payout onboarding and fee economics, then prepare the sale listing; no payment has been activated yet.

## Release and project boundary

- Repository: hazemnaw48-coder/zoz-pro-ai.
- Target architecture remains Cloud Run + Supabase; no new project, no Vercel repair path.
- No production deploy, checkout, billing, external outreach, paid ads, purchase or paid provider usage was activated by this research.
- **Final status:** public evidence supports a problem worth testing and a market with existing spend, but direct demand for this exact kit is not proven. Recommendation: small, no-payment validation first; do not invest in full software or inventory yet.

# ZOZ AfterSales — First Commercial Product & Cairo Discovery

**Product status:** pilot candidate / not generally available.
**Target market:** HVAC and air-conditioning maintenance providers in Cairo and Greater Cairo.
**Commercial goal:** first 5 discovery interviews, 3 real workflow pilots, and 1 paying external customer. These are targets, not results.

## Product positioning

ZOZ AfterSales is a service-operations workspace for HVAC maintenance teams. It connects customer requests, work orders, technician assignment, appointment scheduling, job evidence, service history, repeat-fault tracking, and job economics.

It is NOT differentiated merely by generic work orders, WhatsApp notifications, or AI labels. Competitors already advertise field-service scheduling, technician dispatch, maintenance contracts, asset tracking, GPS, and messaging. Our differentiation hypothesis is a reliable closed-loop service record that reduces lost requests and repeat visits, and makes the cost and outcome of each visit visible.

## First pilot segment

Prioritize small and mid-sized HVAC maintenance providers with:
- Several active technicians (validate actual number in discovery).
- Both reactive service calls and recurring/annual maintenance visits.
- Customer requests and technician coordination currently spread across WhatsApp, calls, and spreadsheets.
- A manager/owner who can approve a pilot and subscription.

Do not assume company size, software pain, or willingness to pay from public website copy alone.

## Publicly sourced prospect list

These are researched prospects, not confirmed buyers, not contacted, and not opted in to marketing.

### First-wave discovery prospects

| Priority | Company | Public evidence / fit hypothesis | Public contact |
|---|---|---|---|
| A | Al Badr Air Conditioning & Maintenance (البدر لأعمال التكييف والصيانة) | Official site describes Cairo/Giza coverage, central AC service for companies, annual contracts, customer visits and quotations. Verify size and current workflow. | 01096611182 / 01113813965; info@syantok.com; Hadayek El Maadi. [Website](https://syantok.com/) |
| A | Pure Cool | Official site describes home/company/factory/hospital/school service and periodic/annual maintenance contracts. Verify technician team and request volume. | 01004160008 / 01126833022; purecool.egy@gmail.com; Basateen El Sharqia. [Website](https://purecool-egy.com/) |
| A | El-Rafai Cool (الرفاعي كول) | Official site describes 15 years in central/split AC, cold rooms and maintenance, with direct service-request path and technical support channels. | 01150003870; support 01111984609 / 01098984047; Maadi. [Website](https://elrafaicool.com/ar) |
| A | Cool Fix (كوول فيكس) | Official service page describes periodic contracts for commercial/residential facilities and central AC across Cairo districts. | +20 10 6539 4376; info@cool-fix.com; New Cairo. [Website](https://cool-fix.com/services/central-ac-maintenance) |
| A | Master Line | Official site describes central AC/heating, periodic maintenance and after-sales service across Cairo/Giza/New Cairo/October/Zayed. | 01014984006 / 01026314500; info@masterlineeg.com; Nasr City. [Website](https://masterlineeg.com/) |
| B | Air Tech for Air Condition | Public business listing identifies a Cairo HVAC contractor; verify identity, team size and maintenance contracts. | +20 12 0116 2511; Al Abageyah / Mokattam. |
| B | Starcool Air Conditioning | Public business listing identifies HVAC contractor in Nasr City; verify identity, service scope and technician count. | +20 11 1664 1557; Nasr City. |

### Strategic benchmark / larger operators

| Company | Why benchmark | Public contact |
|---|---|---|
| PROXIMA-EG | Official site reports active maintenance contracts, asset registers, scheduled maintenance and reporting. Likely more mature; benchmark rather than assume pilot fit. | +20 10 6048 9562; Heliopolis. [Website](https://www.proxima-eg.com/) |
| EGY COOL | Institutional/commercial maintenance contracts, projects for factories/companies and multiple branches. Useful for multi-site workflow discovery. | 01118881226 / 01017022005 / 01142157633; info@egycoolac.com; 6 October. [Website](https://egycoolac.com/en/home/) |
| El Shora Cooling Solutions (الشورى) | Maintenance-contract offer includes VRF/VRV, chillers, AHUs, unit registers, scheduled visits, readings and written reports. Strong benchmark. | +20 2 3691 4695; WhatsApp +20 110 057 4656; 6 October. [Website](https://www.el-shora.com/hvac-maintenance-contracts-egypt) |
| Abo El Futoh Group | HVAC, refrigeration, ventilation and electromechanical maintenance with engineers, supervisors and technicians. | +20 2 2561 0999 / +20 120 089 8888; info@aboelfutoh.com; New Cairo. [Website](https://aboelfutoh.com/) |

## Competitor reality

Review the current offers before every sales cycle:
- [Montra ERP](https://erp.montralift.com/en)
- [KHIDMERA](https://khidmera.com/eg/en/service-business/)
- [Omni Field](https://omnifield.africa/locations/egypt)
- [Prosas](https://prosas-erp.com/en)
- [MatixFSM](https://matixerp.com/fsm/)

These products already claim overlapping field-service, maintenance, scheduling, dispatch, asset or communication functions. Do not claim these generic features are unique. Maintain a dated feature/price matrix and record what each company actually demonstrates.

## Discovery interview — learn before pitching

1. Walk through the last 10 service requests, from first customer contact to closed job. Where was each recorded?
2. How is a technician assigned? How do you know they received and accepted the job?
3. How many appointments were missed or delayed last month? How are repeat faults and second visits counted?
4. How do you find the service history, model/serial number, warranty and parts used for an asset?
5. How are annual/periodic maintenance visits planned and proven as completed?
6. How do you calculate job cost after technician time, transport, parts and repeat visits?
7. What would need to improve for you to pay for a system monthly? Who approves the purchase?
8. May we run a limited pilot with one team/service area and measure the baseline against the result?

Record specific examples and numbers; do not convert guesses into facts.

## First offer hypothesis

A guided 14-day pilot for one team / one service area:
- Register customers and equipment/service history.
- Create a work order with type, priority, address and appointment.
- Assign a technician and prepare a structured WhatsApp task message for a human to review/send.
- Track status and job report.
- Link repeat visits to the original fault.
- Review an operations summary with acknowledgement, on-time arrival, repeat visits and closure time.

Do not promise automatic WhatsApp API delivery, automatic technician dispatch, AI diagnosis, GPS tracking, or warranty intelligence until implemented, provider-authorized, and tested.

## Product development sequence

1. Improve existing FieldOps work-order form using existing schema fields: service_type, priority, scheduled_at, service_address, customer_report, technician_report.
2. Add manual WhatsApp handoff: generate a clear Arabic task message and open the device's WhatsApp share/deep link only after a human clicks. Do not claim sent/delivered/read/accepted.
3. Add tenant-owned WhatsApp Business provider integration only after each customer authorizes its own number, templates, webhooks, opt-in and cost.
4. Add equipment/asset register, warranty and maintenance contract visits.
5. Add repeat-fault linking, job profitability and technician quality evidence.
6. Add advisory dispatch/diagnosis after sufficient validated data; human approval remains for assignment changes.

## Separate WhatsApp identities

- ZOZ-owned WhatsApp Business: ZOZ's B2B prospecting, product offers, demo follow-up, subscription sales and ZOZ customer support.
- Each AfterSales tenant's own authorized WhatsApp Business number: that tenant's communications with its customers and technicians.
- Strictly isolate contacts, consent, numbers, templates, credentials, conversations, webhooks and message history. No tenant uses the ZOZ sales number for its work orders.

## Compliance and outreach controls

- Publicly listed contact details are not marketing consent.
- This prospect list starts in state `researched`, not `consented`.
- Before WhatsApp marketing, verify documented opt-in and approved template/category; honor opt-out immediately.
- No bulk outreach, scraping, automated calls, or messages sent as part of research.
- No prospect has been contacted by creating this document.

## Funnel and success measures

`researched -> contact_verified -> permission_confirmed -> discovery_scheduled -> interviewed -> pilot_proposed -> pilot_active -> paid -> won/lost`

Measure baseline and post-pilot:
- Work-order acknowledgement time.
- On-time arrival rate.
- First-time-fix rate.
- Repeat visits for same asset/fault within 30 days.
- Time to close a job.
- Admin handling time per job.
- Job contribution after labor, transport and parts.
- Customer satisfaction / complaint rate.

A pilot is not revenue. A paid customer is only recorded after external payment is actually received and verified.

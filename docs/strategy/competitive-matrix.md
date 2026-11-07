# Competitive Matrix (decision-oriented)

**As of:** 2026-11-07 (Session A2, one-session timebox). Every claim is labelled **V** = Verified (source in §Sources) or **A** = Assumption (training knowledge or inference, re-verify before quoting externally). The Turkish Insider research report was **not** used as a source.

## 1. Who we are actually up against for Kitapyurdu/Lilyana-sized buyers

| Vendor | Positioning | Relevance to our ICP | Evidence |
|---|---|---|---|
| **Insider One** | "Agentic" customer engagement platform: native CDP, cross-channel journeys, personalization, AI agents (Agent One). Rebranded from Insider in Dec 2025. Acquired MindBehind (2023) and Bluecore (2026). 2,000+ customers. Pricing is MAU-based, with implementation and support included; list sites show "from £1,000/month". G2 users report ~3 months to implement. | Primary reference. Turkish origin, enterprise-leaning. Likely too expensive and heavy for Lilyana; Kitapyurdu-sized retailers may already be prospects or customers. | V (yespress, Gartner, insiderone.com TCO page, GetApp/SoftwareAdvice, G2) |
| **Related Digital (euro.message)** | Istanbul-based marketing cloud: CDP, journeys, email, personalization, gamification, recommendations. Case studies include **D&R** (bookseller), **idefix** (online bookstore, web push), n11, FLO. | **The most direct incumbent for Kitapyurdu** — its two closest competitors are Related Digital references. | V (cbinsights, cuspera) |
| **Netmera** | Turkish CEP: push, email, SMS, WhatsApp, in-app, CDP, journeys. Processes Turkish data on servers in Türkiye for KVKK. | Direct local competitor; sets the data-residency bar. | V (netmera.com) |
| **Klaviyo** | "B2C CRM" for e-commerce (Shopify-centric). Billed by active profiles: Free ≤250, Email from $20/mo, Email+SMS from $35/mo. | Price and UX anchor for mid-market e-commerce. Weak on Turkish SMS/İYS (A). | V (pricing summaries May–July 2026) |
| Braze | Enterprise CEP, real-time journeys (Canvas), strong mobile. | Too expensive for our ICP (A). | A |
| Customer.io | Developer-friendly journeys, event-driven, transparent mid-market tiers. | Design reference for API and journey semantics (A). | A |
| Iterable / Bloomreach | Enterprise cross-channel; Bloomreach adds commerce search. | Not a realistic competitor for our first buyers (A). | A |
| Twilio Segment/Engage | CDP + audiences on top of Twilio messaging. | Reference for event spec (track/identify) only (A). | A |
| Salesforce Marketing Cloud | Enterprise suite. | Out of ICP (A). | A |

## 2. Capability matrix

Maturity labels for the "Messign Current" column come from `docs/quality/feature-maturity-matrix.md`.

| Capability | Insider One | Best-in-class ref | Messign Current (maturity) | Messign Target (90d / 12m) | Priority | Why it exists (one sentence) |
|---|---|---|---|---|---|---|
| Customer profiles + identifiers | Native CDP (V) | Segment identify / Insider upsert (A) | Dead | 90d: profiles, external-ID-primary identifiers, inactive history / 12m: anonymous→known merge | **P0** | Every Kitapyurdu journey starts with knowing who the customer is. |
| Server-side event ingestion | Yes (A) | Segment track spec (A) | Dead | 90d: authenticated upsert+track API, dedup, CSV import / 12m: JS snippet, platform connectors | **P0** | Cart/order events are the triggers of the first use case. |
| Consent per channel+purpose, İYS sync | Yes, Turkish origin (A) | Netmera / Related Digital local (A) | Dead | 90d: consent ledger, fail-closed gate, instant opt-out, İYS sync with tenant credentials / 12m: consent capture widgets | **P0** | Sending commercial messages without İYS consent is illegal (V, see compliance doc). |
| Journey orchestration | Architect (V) | Braze Canvas / Customer.io (A) | Partial (internal-event drafts only) | 90d: versioned journeys, event/API triggers, delay, wait-until, branch, exit, re-entry, holdout / 12m: visual builder | **P0** | Abandoned cart is a journey, and its ROI proof needs a holdout group. |
| Email delivery via tenant ESP | Yes (V: 12+ channels) | Klaviyo (V) | Simulated | 90d: one ESP adapter, tenant domain, bounces/complaints, List-Unsubscribe / 12m: second ESP | **P0** | Email is the only channel with no external paperwork blocking the pilot. |
| Email design + templates | Yes (A) | Klaviyo / Unlayer (A) | **Real** (Unlayer, starters, golden tests) | 90d: personalization variables + e-commerce starters / 12m: product blocks from catalog | P1 | Already built; reuse it rather than rebuild. |
| AI content assistance with approval | Sirius AI / Agent One, autonomous framing (V) | Insider (V) | **Real** (Lucy gatekeepers + approval queue) | 90d: AI drafts journey email copy with human approval / 12m: subject-line testing | P1 | Saves the marketer time without autonomous sending (principle 7). |
| Segmentation | Yes (A) | Klaviyo (A) | Simulated | 90d: rule-based segments on attributes/events / 12m: predictive | P1 | Win-back and occasion flows need audiences. |
| SMS (Turkey, domestic route) | Yes (V: G2 SMS grid leader) | Local CEPs (A) | Dead | 90d: mock + Alaris adapter once docs exist / 12m: live on tenant's account, multi-route | P1 (blocked externally) | Turkish e-commerce relies on SMS and it is Hamza's edge, but the account and başlık are external. |
| WhatsApp (Cloud API, tenant WABA) | Yes (V: G2 WhatsApp grid) | Insider / Netmera (V) | Dead | 90d: adapter if Meta verification lands / 12m: live, template management | P1 | In Türkiye a utility template costs about $0.0009 and a marketing template about $0.0109, among the cheapest rates worldwide (V). |
| Delivery status / DLR ingestion | Yes (A) | — | Simulated | 90d: signed webhooks, normalized status events / 12m: route-level delivery analytics | **P0** | No delivery truth means no analytics and no suppression of bounces. |
| Per-message cost tracking + budget caps | Bundled MAU pricing (V) | — | Dead | 90d: cost ledger per message (BYO rates) + per-tenant caps / 12m: route cost comparison | P1 | Transparent economics is a differentiation hypothesis. |
| Analytics (funnel + holdout uplift) | Yes (A) | Klaviyo revenue attribution (A) | Partial (aggregates) | 90d: per-step funnel, delivered/opened/clicked, conversions vs holdout / 12m: revenue attribution dashboards | **P0** | The pilot must prove revenue uplift, not opens. |
| Web/app push, in-app, on-site personalization, recommendations, search | Yes (V) | Insider / Bloomreach (V/A) | Dead | 90d: — / 12m: web push maybe | Ignore | No real customer need yet; enterprise surface area. |
| Warehouse zero-copy, identity graph | Snowflake zero-copy, Bluecore identity graph (V) | — | Dead | Ignore | Ignore | Enterprise complexity theater for our ICP (principle 1). |
| Autonomous agents | Agent One (V) | — | Partial (Dora) | 90d: none sending autonomously / 12m: suggestions only | Ignore | Principle 7 forbids autonomous sending. |
| Data residency in Türkiye | Unknown (A) | Netmera, Türkiye servers (V) | Unknown (Railway/Neon region) | 90d: decide region **[LC]** / 12m: TR-hosted option | P1 | Turkish buyers and KVKK cross-border rules make this a sales question (V). |

## 3. Conclusions

**Table stakes for our ICP (must have to be considered):**
1. Profiles + server-side events + CSV import.
2. İYS-aware consent with instant opt-out — table stakes in Türkiye, **not** a differentiator (local incumbents already do this).
3. Email journeys: abandoned cart, win-back, triggered by events, with frequency caps and quiet hours.
4. SMS on a domestic route with the tenant's own başlık.
5. Delivery and revenue analytics with a holdout group.

**Where we can plausibly differentiate (all hypotheses until a buyer confirms):**
1. **Transparent, low-friction economics.** Buyers keep their own operator/ESP/WABA accounts, Messign shows per-message cost at operator rates with no markup, and charges a flat SaaS fee. Insider bundles costs into MAU pricing (V), and incumbents often resell SMS (A).
2. **Weeks, not months, to first journey** for mid-market. G2 reports ~3 months for Insider (V); a narrow product with one connector can be faster (A).
3. **A2P operational depth.** Domestic-route awareness, başlık and İYS readiness checks, DLR/route analytics, deliverability advice from someone who runs wholesale SMS. Real expertise, but **only sellable once SMS is live** (A).

**What we ignore (12 months):** on-site personalization, recommendations, search, web/app push SDKs, RCS, warehouse federation, identity graph, autonomous agents, conversational commerce, multi-brand enterprise features.

**Pushback recorded:** "Turkish compliance built in" is table stakes, not a moat. And the idea that the A2P background lets Messign win on SMS price is invalid near-term, because with BYO accounts the tenant pays the operator directly.

## Sources
- [Insider One profile and timeline (yespress)](https://yespress.io/insider-one.md)
- [Insider One on Gartner Peer Insights](https://www.gartner.com/reviews/market/multichannel-marketing-hubs/vendor/insider-one/product/insider)
- [Insider One vs Bloomreach TCO (insiderone.com)](https://insiderone.com/insider-one-vs-bloomreach-pricing-tco/)
- [Insider One pricing on G2](https://www.g2.com/products/insider-one/pricing) · [Software Advice](https://www.softwareadvice.com/product/471891-InOne/)
- [Insider One G2 Fall 2026 (insiderone.com)](https://insiderone.com/news/insider-one-leads-g2-fall-2026-reports/)
- [Related Digital / euro.message (CB Insights)](https://www.cbinsights.com/company/euromessage) · [Case studies (Cuspera)](https://cuspera.com/products/rmc-email-marketing-x-16189)
- [Netmera](https://netmera.com/?p=38353)
- [Klaviyo pricing 2026 (emailtooltester)](https://emailtooltester.com/en/reviews/klaviyo/pricing) · [Klaviyo pricing (automationatlas)](https://automationatlas.io/answers/klaviyo-pricing-explained-2026/)
- [WhatsApp pricing (Meta developers)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) · [Turkey rates (mavibot)](https://mavibot.ai/posts/whatsapp-business-api-pricing-message-categories-guide)

# Market Positioning (master-prompt §5 Q3, Q7, Q9)

**As of:** 2026-11-07 (Session A2). Status: **proposed**. Evidence in `competitive-matrix.md`. **H** = hypothesis, **V** = verified.

## Q3 — Initial wedge

**Recommendation: mid-market Turkish e-commerce engagement — journeys on the tenant's own channels, with consent enforced by the system and transparent per-message economics.** The A2P layer is a planned second step, not the wedge.

| Option | For | Against | Verdict |
|---|---|---|---|
| **Mid-market e-commerce engagement** | Both design partners are Turkish e-commerce. Clear first use case (cart abandonment). Measurable ROI. | Crowded (Insider, Related Digital, Netmera, Klaviyo). | **Choose** — the customers are already here. Differentiate on speed and economics. |
| A2P-driven engagement (messaging cost/deliverability + automation) | Hamza's real edge and distribution. | SMS is externally blocked. With BYO accounts there is no spread. Would lead with a channel we cannot ship in 90 days. | **Second layer at 6–12 months**, once SMS is live for Kitapyurdu. |
| AI-assisted engagement | Lucy exists. AI is the market narrative. | Insider already sells "agentic" (V). AI alone is not a buying reason for a mid-market e-commerce team without data and journeys underneath. | **Feature, not wedge.** |
| Developer-first messaging API | Clean architecture story. | Competes with Twilio, Infobip and others. The design partners are marketers, not developers. | Reject. |
| Enterprise omnichannel | Biggest deals. | Solo founder, 30 sessions, no entity, no SOC 2. | Reject. |

**ICP (12 months):** Turkish B2C e-commerce companies with roughly 50k–2M customer profiles and a CRM/e-commerce marketing team of 1–10 people, either running a custom or local e-commerce platform or already on a local CEP/ESP, and sending SMS under their own başlık. **Anti-ICP:** enterprises needing SSO/SOC 2/on-site personalization; anyone wanting us to send under Messign's name.

**Positioning statement (draft, H):** *"For Turkish e-commerce teams who want Insider-level journeys without an Insider-level contract: Messign connects your customer data, enforces İYS consent on every message, and runs AI-drafted, human-approved journeys over your own email, SMS and WhatsApp accounts — and shows what each message cost and earned."*

## Q7 — Differentiation vs Insider (sellable in 6–12 months)

| Claim | Status | How we would verify |
|---|---|---|
| Transparent economics: BYO accounts, cost per message shown at operator/Meta rates, flat SaaS fee | **H** — Insider uses MAU-based all-inclusive pricing (V), so the contrast is real. Whether buyers value transparency over bundling is unknown. | Ask both design partners what they pay today and how it is billed. |
| Time to first live journey in weeks | **H** — G2 users report ~3 months for Insider (V). Insider counters with included onboarding (V). | Measure Kitapyurdu: kickoff → first live journey. Target ≤ 4 weeks once data access is granted. |
| A2P depth: domestic routes, başlık/İYS readiness, DLR/route analytics, deliverability advice | **H, and unsellable until SMS is live.** The expertise is real; the product is not built. | Kitapyurdu SMS go-live; compare delivery rates and cost per delivered SMS before/after. |
| Turkish compliance built in | **Not a differentiator** — Related Digital, Netmera and Insider are Turkish incumbents (V). It is table stakes. | — |
| Simpler UX for small teams | **H, weak** — everyone claims this. | Usability sessions with Lilyana's team. |
| AI that saves marketer time under human control | **H** — the market leans "autonomous" (V: Insider Agent One). "Human-approved" may resonate with risk-averse teams, or read as less capable. | Pilot feedback. |
| Data hosted in Türkiye | **Parity at best** — Netmera already offers it (V). Required to compete, not to win. | Decide in week 2 **[LC]**. |

**Verified market gaps today: none.** Every differentiator above is a hypothesis to test with Kitapyurdu and Lilyana. The strongest candidates are economics and speed.

## Q9 — What can realistically be sold in 6–12 months (H, clearly labelled)

| Horizon | What | To whom | Price shape (H) |
|---|---|---|---|
| Month 3–4 | Pilot: cart abandonment on email, consent-enforced, with holdout reporting | Kitapyurdu (design partner) | Free or nominal pilot. In exchange: data access, weekly feedback, case-study rights, a written LOI to convert on agreed uplift. |
| Month 4–6 | + occasion reminders, win-back; + SMS on the tenant's Alaris account once başlık/İYS are ready | Kitapyurdu, Lilyana | First invoices **require the Messign entity**. |
| Month 6–12 | Productized "Engage Core": profiles/events/consent, 5 journey templates, email + SMS + WhatsApp on BYO accounts, AI copy with approval, holdout analytics | 5–10 Turkish mid-market e-commerce companies via Hamza's A2P network (operators, aggregators, their enterprise clients) | **H:** flat monthly SaaS fee by active-profile tier, roughly **€300–1,500/month**, messaging at cost on the tenant's accounts. Anchors: Klaviyo charges $20–35/month at 500 profiles and scales steeply (V); Insider's "from £1,000/month" list price and MAU model (V). Validate with buyers before publishing. |
| Month 12+ | Optional managed messaging (resale) — only if the Q6 triggers are met | Tenants wanting one bill | SaaS fee + transparent per-message markup. |

**Revenue reality check:** at €300–1,500/month, 10 tenants ≈ €36k–180k ARR. That is a viable wedge for a solo founder, not a venture-scale business. The A2P layer (managed messaging, route optimization) is where the economics could expand later.

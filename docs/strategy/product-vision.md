# Product Vision & Strategic Decisions (master-prompt §5)

**As of:** 2026-11-07 (Session A2). Status: **proposed — awaiting Hamza's approval** (see `docs/roadmap/decisions-pending.md`). Wedge, differentiation and pricing are in `market-positioning.md`.

## The vision in one paragraph
Messign becomes the customer engagement platform a Turkish mid-market e-commerce team can start using in weeks. The tenant's customer data and events flow in, consent is enforced by the system rather than by policy, and AI-drafted, human-approved journeys go out on the tenant's **own** email, SMS and WhatsApp accounts, with every message's cost and outcome visible. **Insider One is the reference, not the target.** We win on focus, speed to the first journey, and transparent economics — not on breadth.

**Scope check (master-prompt §1, "say so in one sentence"):** "Insider-like engagement platform plus messaging layer, global" is too broad for 30 sessions. For 90 days it is **one journey type on one channel for one tenant, built on foundations that are correct for many tenants and channels.**

---

## Q1 — The identity tension: what happens to each non-engagement module

**Recommendation: freeze by default, remove only dead code and repo clutter, extract nothing now.** Freeze means the code stays, routes and nav are hidden behind a product-surface flag, and nothing new is built on it. Bug fixes are allowed only if they block the engagement product.

| Module | Decision | Reason |
|---|---|---|
| Lucy — content pipeline, gatekeepers, approval queue, brand profile/product truth | **Keep in product** | It is the content layer of the engagement product (Q2). |
| Lucy — Unlayer designer, templates, image generation (creative) | **Keep in product** | Real and tested; email is the first channel. |
| Lucy — social publishing (LinkedIn/X/Instagram/blog), competitor intelligence, CEO/command-center dashboards, landing pages, popups, batch atomization | **Freeze** | B2B content marketing, not customer engagement. The publisher cron must default OFF (ADR-004). |
| Dora (v1 + v2 brain, tool registry, HITL actions) | **Keep the HITL actions and AI gateway; freeze the Dora chat assistant and its insights/briefings** | Approval and audit machinery is reusable. A cross-module CEO assistant has no customer. |
| Auth, admin (users/roles), notifications, Socket.io, webhooks | **Keep** | Platform infrastructure. |
| CRM (Ares) | **Freeze** | B2B pipeline shape. Do not reuse for shoppers (ADR-005). |
| Finance (Neo), Support (Luna), HR/Recruitment (Asia), Executive, OKR, Heart, Assets, Contracts | **Freeze** | No engagement customer. No harm to velocity while hidden. |
| Team chat, projects/tasks/sprints, bounties, showcase, gamification (XP, badges, leaderboard, game, duels) | **Freeze** | Company-OS-only. |
| Knowledge Hub (in-server) | **Freeze** | Possibly useful later as a help center. Not now. |
| Time tracking (`dal/time`) | **Remove** | Dead: no routes, no UI. |
| `knowledge-hub/`, `knowledge-hub.zip/`, root dumps, ComfyUI/Python scripts, RLS "unblock" SQL | **Remove** | Clutter and safety hazards (`docs/quality/technical-debt.md` §4). |
| `/api/seed/*` routes | **Remove from production builds** | A customer-facing API must not expose them. |
| Extract (separate repo/package) | **None in 90 days** | Extraction costs sessions and buys nothing for the pilot. Revisit at 12 months if the Company OS gets its own buyer. |

Your default ("freeze, not delete") holds. The only deletions are code that is already dead or that creates risk.

## Q2 — Lucy Content Studio

**Recommendation: Lucy is the content layer of the engagement product. The separate Content Studio track is paused, and its 14-part spec is not executed as written.**

What survives, folded into the engagement roadmap:
- Brand profile, product truth and glossary as AI grounding (exists).
- Gatekeepers: truth, brand voice and compliance scan (exists). Add an İYS-content check later (e.g. commercial message must include opt-out instructions).
- Approval tiers and the approval queue. In the engagement product: **a journey version cannot be activated, and AI-drafted copy cannot be used, without approval** (principle 7).
- Email templates + Unlayer + e-commerce starters (exists: `d2cAbandonedCartRecovery.json`, gift and loyalty starters).
- Multi-candidate generation (A1 refuted) becomes a 12-month item: subject-line and copy variants for A/B tests.

What does not survive in 90 days: ~30 new tables, 9 screens, multi-channel social publishing, learning loops and calibration beyond the existing snapshots, the 9-session Content Studio plan. Any Content Studio part that does not serve journeys stays in the backlog.

## Q4 — First use case

**Recommendation: logged-in cart abandonment for Kitapyurdu, on email, with a holdout group.** Lilyana's occasion reminders come second, on the same engine.

| Candidate | Value proof speed | Infra needed | Verdict |
|---|---|---|---|
| Order/shipping notifications | Low. The tenant already sends these; replacing them adds risk without measurable uplift. | Order events, transactional sending | Not first. Later, as a WhatsApp utility use case (very cheap in Türkiye). |
| **Cart abandonment (known customers)** | **High.** Revenue uplift vs holdout is directly measurable within weeks. | Profile + cart/checkout/order events, delay, exit-on-purchase, consent gate, email | **First.** |
| Win-back | Medium. Needs months of history and a slow measurement cycle. | Order history import, segments | Third. |
| Occasion reminders (Lilyana: birthdays, anniversaries, Mother's/Valentine's Day) | High for Lilyana, but seasonal | Date attributes + date-relative trigger | **Second, on the same engine** (one extra trigger type). |
| Back-in-stock / new release (books) | Medium | Catalog and inventory feed | 12 months. |

Why logged-in only: anonymous abandonment needs a web SDK, cookie identity and merge logic. The journey and consent gate are identical, so excluding anonymous carts costs little and avoids identity-graph work. **Measurement:** 10% randomized holdout per enrollment; KPI = conversion rate and revenue per enrolled customer within 72h, treated vs holdout.

**Update 2026-11-07 (Q-A: no tenant action until business start).** Cart abandonment stays the flagship journey for the demo and for the ROI story, but it runs on simulated events. At business start, a tenant that still won't integrate goes live on **imported-data journeys first**: win-back and new-release for the bookstore (segments over order history), occasion reminders for the florist (date trigger). Real-time cart abandonment switches on when the tenant agrees to send events. The engine supports both from day one (WP-36, WP-25).

## Q5 — First channel

**Recommendation (unchanged): email first; real sends only to allow-listed test inboxes until business start. Build SMS and WhatsApp adapters against the mock and DLR simulator now, and turn each on when its paperwork completes. Do not launch SMS-first.**

- **Email:** the adapter seam already exists. External needs are tenant-owned: ESP account plus SPF/DKIM/DMARC on the tenant's domain, typically days of work. Marketing email still needs İYS consent (6563 covers e-mail).
- **SMS:** blocked on the Alaris account (in Kitapyurdu's name), BTK başlık approval and İYS readiness — external timelines. **New constraint:** abandoned-cart SMS contains a link, and Turkish operators block A2P SMS with URLs sent from abroad. The route must therefore be **domestic through a BTK-licensed operator** (V; compliance doc §1). **Confirmed 2026-11-07:** the Alaris-based platform can terminate on a domestic Turkish route.
- **WhatsApp:** tenant Meta business verification plus WABA and template approval. Economics in Türkiye are attractive: about $0.0109 per marketing template and about $0.0009 per utility template (V; Meta pricing updates quarterly). Start the tenant's Meta verification in week 1, in parallel.

## Q6 — Messaging commercial model

**Recommendation: (a) BYO-account for the next 12 months; (c) hybrid only after the trigger conditions below.**

- **Near-term (0–6 months): BYO.** The tenant contracts and pays the provider directly (Alaris-based platform, ESP, Meta). Messign charges a SaaS fee. Messign never touches message money, which matches "tenant is the sender" and needs no entity to *build* (an entity is needed to *invoice*).
- **12-month: still BYO by default, plus an optional "managed messaging" add-on.** Only when all of these are true: a Messign entity exists; a reseller/wholesale contract with the SMS platform exists; the İYS/BTK role of Messign as intermediary is legally confirmed; at least 3 paying tenants ask for consolidated billing.
- **Consequence for the planned wallet/spread code:** **do not build a wallet or spread.** Build a **cost ledger** instead: each message records a provider cost estimate from the tenant's configured rate card (later from DLR/billing data where the provider supplies it). Add **per-tenant budget caps** enforced by the send gate. This same ledger becomes the margin ledger if resale ever starts, so nothing is thrown away.

## Q8 — What we explicitly do NOT build in the first 90 days

Web/app SDKs, anonymous identity merge, identity graph, visual drag-and-drop journey canvas (a form-based builder ships instead), on-site personalization, recommendations, search, web/mobile push, RCS, in-app messages, A/B testing beyond the holdout, predictive segments, warehouse connectors, Shopify/Ticimax/ikas connectors (decided after we learn the tenants' platforms), Paddle billing, a wallet or SMS spread, multi-region deployment, SSO/SAML, autonomous AI sending, any new Company-OS feature, the Lucy Content Studio spec as written, a Messign-owned İYS integration, and owned carrier/SMPP infrastructure.

## Q3, Q7, Q9
See `market-positioning.md`.

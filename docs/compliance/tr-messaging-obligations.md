# Türkiye Messaging Obligations — Engineering vs Legal/Operational

**As of:** 2026-11-07 (Session A2). **Not legal advice.** Messign makes **no compliance claim** (KVKK, GDPR, İYS, ISO, SOC 2). This document separates *technical controls Messign builds* from *obligations someone else must fulfil*. Anything marked **[LC]** requires legal confirmation before the pilot.

## 0. Role model (ground truth, master-prompt §2.3)

| Party | İYS / 6563 role | KVKK role | Owns |
|---|---|---|---|
| Tenant (Kitapyurdu, Lilyana) | **Hizmet sağlayıcı** (service provider, sender) | **Veri sorumlusu** (controller) | Legal entity, İYS registration + brand code, BTK sender ID (başlık), messaging/ESP/WABA accounts, consent texts, privacy notice |
| Messign | Software used by the tenant. Whether Messign is an **aracı hizmet sağlayıcı** (intermediary) under 6563 when it triggers sends is **[LC]**. Design as if it were (strictest reading). | **Veri işleyen** (processor) | Technical controls, processor agreement (needs a Messign entity), sub-processor list |
| Messaging provider (Alaris-based platform / operator, ESP, Meta) | Usually an intermediary / operator | Sub-processor of the tenant or of Messign, depending on contract **[LC]** | Delivery, operator rules |

## 1. Verified rules that drive engineering

| Rule | What it means for the code | Source |
|---|---|---|
| Commercial electronic messages may not be sent to recipients without consent in İYS. | Fail-closed consent check before every **commercial** send. | Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik, Art. 5(3), via lexpera.com.tr |
| Consent can be obtained in writing, by any electronic means, or via İYS. Opt-in must not be pre-ticked. Consent cannot be a condition of the sale. If consent is not obtained via İYS, the sender has to prove it. | Store consent **evidence** (source, timestamp, text version, IP/channel) for consents not captured in İYS. | Same regulation, Art. 7(1), (8), (9), (10) |
| An intermediary that starts a send on the sender's instruction must check İYS for consent first and must not send to recipients without consent. It must not send for senders not registered in İYS. | Send gate checks (a) tenant İYS registration recorded, (b) per-recipient consent state. A tenant without recorded İYS registration cannot send commercial messages. | Amending regulation (Art. 11 aracı hizmet sağlayıcı), lexpera.com.tr; turmob.org.tr Official Gazette PDF |
| Opt-outs must be honoured within **3 business days**, and opt-outs received by the sender must be reported to İYS within 3 business days. | Opt-out takes effect **immediately** in Messign (stricter than the law); İYS sync job with SLA monitoring. | Regulation Art. 9(6), via alomaliye.com; hukukcularevi.com |
| Records must be kept for **10 years**. | Consent/opt-out/send ledgers are append-only, retained ≥10y (separately from erasable profile attributes) **[LC on erasure interplay]**. | hukukcularevi.com summary of 6563 obligations |
| Messages sent to fulfil a legal duty to inform do not need prior consent. | Hard `purpose` flag per message: `transactional` vs `marketing`. Transactional bypasses consent but **never** suppression for hard opt-outs of that channel; content review required **[LC on order/cargo/abandoned-cart classification]**. | parasut.com İYS summary |
| İYS integrators must be authorized by the Ministry. | Messign does **not** become an İYS integrator. The tenant uses its own İYS API credentials (or its own authorized integrator); Messign stores them per tenant. | Tebliğ on İYS integrators (18.09.2024), lexpera.com.tr |
| A2P alphanumeric sender names: 3–11 characters. Operators block A2P SMS/MMS **with URLs** sent **from abroad** to Turkish subscribers. A sender name may not use someone else's brand. | Sender ID validation 3–11 chars. **SMS with links (e.g. abandoned cart) must use a domestic route via a BTK-licensed operator; an international aggregator route will be blocked.** Route capability flag `domestic_tr`. | teknoblog.com, tgrthaber.com (BTK 2025/2026), btk.gov.tr PDF |
| KVKK Art. 9 (since 1 Jun 2024): explicit consent no longer works as a basis for cross-border transfer (transition ended 1 Sep 2024). Without an adequacy decision, use appropriate safeguards (standard contracts, BCR). Standard contracts must be notified to the KVKK Authority within 5 business days. Four standard-contract sets exist (controller→processor is Set 2). 2026 fines for missing notification: TRY 90,308–1,806,377. | **Hosting region is a product decision.** Any processing outside Türkiye (Railway/Neon/ESP/LLM regions) is a transfer by the tenant to Messign or sub-processors. | hukukcularevi.com; kvkk.gov.tr announcement 7938; cottgroup.com |

## 2. Responsibility table (master-prompt §9)

| Item | Engineering (Messign builds) | Legal / operational (owner) |
|---|---|---|
| İYS | `engage.consents` per channel (sms, email, call; whatsapp separate) × purpose; evidence fields; fail-closed gate; immediate local opt-out; İYS sync job (pull consents + push opt-outs) using **tenant's** İYS credentials; marketing vs transactional flag; tenant İYS readiness record (brand code) required for any commercial send | **Tenant:** İYS registration, brand code, consent texts, deciding message classification. **Messign:** confirm whether it is an intermediary **[LC]** |
| BTK sender ID (başlık) | Per-tenant sender ID config; 3–11 char validation; tie each SMS account to approved başlık; domestic-route capability | **Tenant via provider/operator:** başlık application, documents (unvan), approval |
| KVKK | Processor-grade controls: RLS tenant isolation, encrypted credentials, access audit (hash-chained), export, erasure, retention jobs, data inventory doc, sub-processor list, **no personal data sent to LLMs** (design rule) | **Messign + tenant:** processor agreement (DPA) — **requires a Messign legal entity [LC]**; tenant's privacy notice/VERBİS; **cross-border standard contract + KVKK notification if hosting/sub-processors are abroad [LC]** |
| Provider / operator contracts | Traffic-type flags (transactional/marketing/OTP); test vs live accounts; global + per-tenant send gate; per-message cost ledger; DLR verification | **Tenant:** Alaris/ESP/WABA account contracts and terms. **Hamza:** written notice to provider before live technical tests (test ladder step 4) |
| Email (6563 applies to e-mail too) | Same consent gate for marketing email; List-Unsubscribe + one-click; bounce/complaint suppression; tenant-authenticated domain (SPF/DKIM/DMARC) | **Tenant:** domain DNS, ESP account |
| WhatsApp | Template category stored (marketing/utility/authentication); WhatsApp opt-in tracked separately; quality-rating monitoring | **Tenant:** Meta business verification, WABA, phone number, template approval; Meta's own opt-in policy |

## 3. Open legal questions (blockers marked ★)

1. ★ **Processor agreement without a Messign entity.** Can Kitapyurdu put real customer personal data into Messign before Messign exists as a legal person? If Hamza acts personally as processor, what are the liability and contract implications? **[LC]** — this is likely on the critical path to the pilot.
2. ★ **Hosting region.** Recommendation: keep production engagement data in an EU region at minimum, and evaluate a Türkiye-hosted Postgres before the pilot. Netmera markets Türkiye-hosted processing for KVKK (netmera.com), so Turkish buyers will ask. **[LC]**
3. Is Messign an *aracı hizmet sağlayıcı* under 6563 when tenant-configured journeys trigger sends through tenant accounts? **[LC]**
4. Classification of abandoned-cart, back-in-stock and occasion-reminder messages: commercial (consent required) — assumed **yes** for all three. Order/shipping notifications: assumed transactional. **[LC]**
5. Retention conflict: 10-year message records vs KVKK erasure requests. Proposed: erase profile PII, keep pseudonymised ledger rows plus the consent record. **[LC]**
6. Sub-processors (ESP, Meta, LLM providers, Railway/Neon): which transfers need standard contracts, and who notifies? **[LC]**

## 4. Design rules that follow (binding for all engagement code)

- R-1 **No send without a gate decision row.** Every attempted send writes a `send_decisions` row (allow/deny + reasons) before any provider call.
- R-2 **Fail closed** on unknown consent, unknown purpose, missing tenant readiness, missing credential, gate unreachable.
- R-3 **Opt-out is instant and global per channel** for that tenant; it never waits for İYS sync.
- R-4 **Messign never holds a platform-wide messaging credential in production.**
- R-5 **No personal data in LLM prompts.** AI works on templates, segment definitions and aggregate metrics. Personalization happens at render time, outside the LLM.
- R-6 **Append-only ledgers** for consent changes, send decisions, messages and status events. Profile attributes stay erasable.

## Sources
- [Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik (lexpera)](https://www.lexpera.com.tr/mevzuat/yonetmelikler/ticari-iletisim-ve-ticari-elektronik-iletiler-hakkinda-yonetmelik)
- [Yönetmelik değişikliği — aracı hizmet sağlayıcı (lexpera)](https://www.lexpera.com.tr/resmi-gazete/metin/ticari-iletisim-ve-ticari-elektronik-iletiler-hakkinda-yonetmelikte-degisiklik-yapilmasina-dair-1/1)
- [Official Gazette 30998 (turmob)](https://www.turmob.org.tr/arsiv/mbs/resmigazete/30998-30998-1.pdf)
- [İYS entegratörleri tebliği (lexpera)](https://www.lexpera.com.tr/mevzuat/tebligler/ticari-elektronik-ileti-yonetim-sistemi-entegratorleri-hakkinda-teblig-1)
- [Ticari elektronik ileti ve cezalar (hukukcularevi)](https://hukukcularevi.com/ticari-elektronik-ileti-iys-izin-6563-reklam/)
- [İYS hakkında (paraşüt)](https://www.parasut.com/blog/ileti-yonetim-sistemi-hakkinda-bilmeniz-gerekenler)
- [BTK linkli SMS kısıtlaması (teknoblog)](https://www.teknoblog.com/btk-850-li-sms-spam-arama-ve-linkli-mesajlara-sinir-koydu/)
- [BTK düzenlemesi (tgrthaber)](https://www.tgrthaber.com/gundem/bakan-uraloglu-duyurdu-rahatsiz-edici-smsler-iletilemeyecek-3291965)
- [KVKK standart sözleşmeler duyurusu](https://www.kvkk.gov.tr/Icerik/7938/Standart-Sozlesmeler-ve-Baglayici-Sirket-Kurallarina-Iliskin-Dokumanlar-Hakkinda-Kamuoyu-Duyurusu)
- [Yurt dışı aktarım ve bulut (hukukcularevi)](https://hukukcularevi.com/danismanlik/veri-merkezi-bulut-hizmet-sozlesmeleri-veri-lokalizasyonu/)
- [Standart sözleşme bildirim yaptırımları (cottgroup)](https://www.cottgroup.com/en/component/zoo/item/standart-sozlesme-bildirim-yukumlulugu-ve-yaptirimlari)
- [Netmera — KVKK data residency](https://netmera.com/?p=38353)

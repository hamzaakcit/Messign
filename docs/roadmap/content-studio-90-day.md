# Content studio — Instagram and offer track

**As of:** 2026-11-12. **Status:** draft. CS-D2 and CS-D3 were approved 2026-11-12 (partial approval; reel is a cover still plus storyboard).

This is the surviving content layer from product-vision Q2 (D-12). It does **not** execute the paused 14-part Lucy Content Studio spec. It is a parallel track to `90-day-roadmap.md`. Engage work packages (WP-01…) stay the default session. Pick a CS package only when that evening is for this track. One package is one session. Drop P1 packages first if capacity is tight.

**Who it is for.** Messign’s own org and each e-commerce client org, on the same screens. Kitapyurdu-style bookstore and Lilyana-style florist are the two synthetic tenants. No real customer personal data in prompts or fixtures.

**Day-90 outcome (13 CS sessions, not 13 calendar weeks on top of Engage).**

1. Create an **offer** from that tenant’s brand profile and product truth.
2. Produce an **Instagram** child: feed, carousel (max 5), story, or reel **cover plus storyboard**. Not a video file.
3. Produce an **email** child for the same offer. Commercial email cannot be approved without an opt-out instruction.
4. Store a **journey template reference** on the email child. Engage renders and sends later, through the send gate. This studio does not message customers.
5. Approve per child. Schedule the Instagram row. Instagram publish stays mock unless `SEND_MODE` allows it and that org has a token.

## Out of scope

Generated video. Instagram Reels upload. WhatsApp send. Live multi-tenant Meta apps. New Company-OS features. Autonomous posting. The 14-part Content Studio spec, its extra tables, and its nine screens.

## Defaults (change only the pending decisions)

| ID | Default | Owner |
|---|---|---|
| CS-D1 | Parent is a `marketing_content` row with `content_type=offer`. Children use existing `parent_content_id`. | Technical, taken |
| CS-D2 | Approval is per child. Approving email does not approve Instagram. | Approved 2026-11-12 |
| CS-D3 | `reel_cover` is a still plus a storyboard (hook, 3–6 shots, on-screen text, caption, audio note). No video bytes in this track. | Approved 2026-11-12 |
| CS-D4 | Instagram live publish follows the Engage send gate. Unset `SEND_MODE` stays mock. The studio never calls the legacy publisher cron. | Already decided (D-01 / WP-01) |
| CS-D5 | Language comes from the brand profile. | Technical, taken |

## Object model

| Thing | Where | Rule |
|---|---|---|
| Offer | `marketing_content`, `content_type=offer` | Intent, language, dates, claims. No recipient list |
| Instagram child | `marketing_content`, `channel=instagram`, `parent_content_id` set | Format on the row: `feed`, `carousel`, `story`, `reel_cover` |
| Email child | `marketing_content`, `channel=email`, same parent | Unlayer design, subject, preheader |
| Journey binding | Field on the email child (`journey_template_ref`) | Becomes Engage `message.template_id` when WP-14 and WP-15 exist |
| Reel package | JSON on the reel child | Cover URL plus storyboard fields |

### Recipes

| Recipe | Instagram | Email |
|---|---|---|
| Product drop | Required | Required |
| Occasion | Optional (default on) | Required |
| Cart reminder | Not created | Required |

A cart reminder is a private message. A public Instagram post is a different recipe and must be chosen explicitly.

## How this meets Engage

```
Offer (brand + product truth + intent, no customer PII)
  ├─ Instagram stills (feed, carousel, story, reel cover)
  ├─ Email template (Unlayer) → journey message step
  └─ later: WhatsApp template text, reel video file
Journey executor
  └─ render template + that customer's attributes only at send
```

Organic Instagram is not an İYS commercial electronic message. The email or SMS for the same offer is. Subject, product, and discount must match the offer facts. Gatekeepers already exist (`productTruthValidator`, `brandVoiceChecker`, `complianceScanner`). `runContentAtomizationAfterApproval` is a stub that logs X and LinkedIn jobs. CS-07 replaces that with the recipe’s real children or does not call it.

AI may draft. AI may not send, change audiences, or spend. No personal data in prompts (target-state §F, compliance R-5).

## Dependencies on the Engage backlog

| CS work | Needs | If missing |
|---|---|---|
| Two-org dogfood | WP-04 | Test with the org id marketing tests already pass. Do not add a second real tenant on the legacy superuser pool (D-07) |
| "Ready for journey" that renders | WP-14 | Store `journey_template_ref` only. Label: Engage will render this |
| Activation | WP-15 | No activate button in the studio |
| Proof it does not send | WP-11 | CS-12 asserts the adapter mock branch |
| Per-tenant AI cap | WP-23 | Until then, carousel max 5 and no unbounded regen loop |

CS-01 through CS-08 use today’s marketing tables. Do not block them on the journey engine. Do block any control that claims to message customers.

## Sequence

| # | Package | Pri | Outcome |
|---|---|---|---|
| 1 | CS-01 Offer parent and status | P0 | Offer id, children list, org isolation test |
| 2 | CS-02 One Instagram studio | P0 | Pipeline and command center share one component |
| 3 | CS-03 Guided create from Lucy | P0 | Modal creates offer + IG child and opens the studio |
| 4 | CS-04 Format persisted | P0 | First image uses feed 1:1 or story/reel 9:16 |
| 5 | CS-05 E-commerce prompt pack | P0 | 10 golden briefs; fake discount fails truth gate |
| 6 | CS-06 Email child | P0 | Same offer drafts the journey email |
| 7 | CS-07 Three recipes | P0 | Cart creates no Instagram row |
| 8 | CS-08 Approval per child | P0 | Queue deep-links to the right child |
| 9 | CS-09 Carousel and caption variants | P1 | Regen one slide; sixth slide rejected |
| 10 | CS-10 Journey binding | P0 | Email row has `journey_template_ref`; no provider call |
| 11 | CS-11 Reel storyboard | P0 | Parser returns cover plus 3 shots |
| 12 | CS-12 Schedule and publish modes | P0 | Unset send mode cannot hit Graph API |
| 13 | CS-13 Second tenant checklist | P1 | Florist fixture does not contain Messign product names |
| 14 | CS-14 Dogfood and one E2E | P1 | Script run; top 5 annoyances listed |
| 15 | CS-15 Buffer | P0 | Only those annoyances |

---

## CS-01 — Offer parent and status

**Objective.** An offer is a persisted parent. Instagram and email are children. The UI can show "email not started."

**Build.** `content_type=offer`. Create and list offers for the caller’s org only. Children via `parent_content_id` (`server/src/dal/marketing/content.ts` already has it). Child status for the offer header: `missing`, `draft`, `in_review`, `approved`. Read the live content columns before adding any. Prefer existing metadata for `instagram_format` and `journey_template_ref` until CS-04 and CS-10, unless a column is cheap and already in the migration baseline.

**Acceptance.** Org A cannot read org B’s offer. Create returns an id. Children list is empty.

**Tests.** Server test on the DAL or route with two org ids.

## CS-02 — One Instagram studio component

**Objective.** Pipeline slide-over and command center render one component.

**Build.** `client/src/pages/marketing/components/instagram/` taking a content id. Bring in carousel preview from `cockpit/InstagramPreview.tsx`, and regenerate, style presets, reference upload, and Kontext edit from `InstagramCockpit.tsx`. Mount it from `components/ContentDetailPanel.tsx` and `cockpit/ContentDetailPanel.tsx` when `channel=instagram`. Thin `InstagramCockpit.tsx` only after those actions exist on the new component.

**Acceptance.** Both parents render the studio. Regen still calls `regenerateContentImage`. `carousel_images.length > 1` shows slides.

**Tests.** Client test with mocked `marketingAPI`.

## CS-03 — Guided create from Lucy

**Objective.** Instagram AI creates the offer, the Instagram child, and opens the studio on that child.

**Build.** Extend `InstagramAgentPromptModal` with brand, recipe, and format. Create the two rows, then the existing orchestrator path that persists Instagram drafts (`marketingAgentOrchestrator`). Open the pipeline with that content selected. Status strip: brief, strategist, gatekeepers, image, saved. Failures show the pipeline error, not only a toast.

**Acceptance.** Mocked agent: modal submit yields an Instagram child whose parent is the offer, and the studio shows that id.

## CS-04 — Format is stored and used for the first image

**Objective.** Story and reel cover are 9:16 on the first generation, not only on a later regenerate.

**Build.** Persist `instagram_format`. `buildInstagramAgentMessage` already states aspect ratio. Thread it through `runInstagramImageGeneration` / `buildInstagramFeedT2iPrompt` the same way `ContentDetailPanel` passes `aspect_ratio` on regenerate. Reel still asks for a cover frame (`instagramChannelSpec`), not a video.

**Acceptance.** Server test: `story` → 9:16, `feed` → 1:1. Reload shows the saved format.

## CS-05 — E-commerce prompt pack

**Objective.** Bookstore and florist briefs do not collapse into a generic office scene. Language follows the brand.

**Build.** Recipe addendum next to `INSTAGRAM_CHANNEL_SPEC`, selected inside `buildChannelSpecsBlock` for Instagram. Rules: product must match product truth, no invented discount, link in bio, Turkish or English from the brand profile. Fixtures: five book, five flower. Assert the image prompt mentions the product and place.

**Acceptance.** Ten fixtures pass. A "50% off" claim absent from product truth fails the truth gate.

## CS-06 — Email child from the same offer

**Objective.** One action drafts the journey email from the offer and brand, not from the Instagram caption alone.

**Build.** Offer action "Draft journey email" uses the existing email strategist and Unlayer path (`ContentEmailSection`). New row: `channel=email`, `parent_content_id` = offer. Compliance scan blocks approval when the body has no opt-out instruction. Subject, price, and product name match the offer. Do not call `creative:repurpose_content` for this (channel spec already forbids that for net-new email).

**Acceptance.** Product-drop offer has two children. Email without an unsubscribe line cannot be approved. Instagram is not required to contain one.

## CS-07 — Three recipes

**Objective.** Create only the children the recipe allows.

**Build.** Product drop: both slots. Occasion: email plus optional Instagram, default on. Cart: email only, with copy that a public post is a different recipe. `runContentAtomizationAfterApproval` either enqueues those children or is not called. Remove the stub that always queues five X posts and a LinkedIn post.

**Acceptance.** Cart recipe creates zero Instagram rows. Product drop creates one Instagram and one email.

## CS-08 — Approval per child

**Objective.** The queue opens the child that was submitted. Approving one child does not approve the other. Depends on CS-D2. If the founder rejects partial approval, this package becomes "offer approves only when every required child is clean" and the acceptance criteria flip.

**Build.** Deep link from the existing approval queue into the studio or the email builder. Offer header shows child state. No second queue.

**Acceptance.** Approving the email leaves Instagram in draft. The queue item selects that content id.

## CS-09 — Carousel and caption variants (P1)

**Objective.** Regen one slide, regen all (max 5), apply a caption variant onto `body`.

**Build.** `instagramContentWorkflow` already patches slide 0. Add a slide index. Move the cockpit variant grid into the studio. Intelligence panel "apply variant" writes `body`.

**Acceptance.** Regen slide 2 does not replace slide 1. A sixth slide is rejected.

## CS-10 — Journey binding, no send

**Objective.** The email child names the template a journey step will use.

**Build.** Save `journey_template_ref` (offer id + `email`). Studio label "Ready for journey." Subtitle until WP-14: this screen does not send. No new send path in `instagramAdapter` or the email publisher.

**Acceptance.** The email row has the ref. No test calls a provider. A draft prompt that includes an email address or phone number fails the PII check.

## CS-11 — Reel storyboard

**Objective.** Format `reel_cover` stores a package beside the cover image. Depends on CS-D3.

**Build.** Hook, three to six shots, on-screen lines, caption, audio note. Strategist emits a block parsed like `[IMAGE_PROMPT]`. Studio: cover on the left, shots on the right. Export copies text and image URLs. No video API.

**Acceptance.** Parser test returns a cover prompt plus three shots. Studio shows them after reload.

## CS-12 — Schedule and publish modes

**Objective.** Instagram can be scheduled. Publish state is explicit.

**Build.** Calendar thumb and format badge for Instagram children. Email child shows the subject and is not published to a network. Instagram control: Draft, Scheduled, Test publish. Test publish hits Graph only when `SEND_MODE` allows it. Otherwise the mock permalink from `instagramAdapter`. The button says mock or live.

**Acceptance.** Unset send mode does not call Graph. The test covers the adapter mock branch.

## CS-13 — Second tenant checklist (P1)

**Objective.** A client org does not inherit Messign’s brand.

**Build.** Setup panel: brand profile, three product-truth rows, language, Instagram handle, publish allowed (default no), recipes enabled. Complete it for Messign and for the synthetic florist. This is the content slice of Engage WP-33, not a second onboarding kit.

**Acceptance.** A florist prompt fixture fails if a Messign product name appears.

## CS-14 — Dogfood and one E2E (P1)

**Objective.** The demo script is repeatable.

**Script (about ten minutes).** Messign product drop. Florist occasion. Bookstore cart email with no Instagram row.

**Build.** One Playwright spec with image generation mocked: modal, studio shows caption, regen control, email child exists. Record the top five annoyances as the CS-15 list.

**Acceptance.** Script run once per tenant. Five items written down.

## CS-15 — Buffer

Fixed 2026-11-12. Only these five, from the CS-14 dogfood. No new channel.

1. The Instagram modal footer sits outside the viewport once the occasion checkbox is on. The page does not scroll Send into view.
2. A fresh browser sits on Loading until dev auto-login finishes. The login form is not the start of the script.
3. There is no tenant switch. Messign, the florist, and the bookstore are three recipes on one login.
4. Image generation is not mockable in the product. The script has to intercept the network or it waits on the image provider.
5. The offer is not on the board. After send, one child opens. The email child is not shown beside the post, and Test publish is still on the post when publish is off.

The modal scrolls and pins Send. Dev sign-in leaves the login form usable. The content tenant switch covers Messign, Lilyana, and Kitapyurdu. Mock image is on by default and `IMAGE_GEN_MODE=mock` does the same. The open post lists its email sibling, and Test publish is hidden while that tenant's publish flag is off.

## After this track

| Step | What | Starts when |
|---|---|---|
| Keyframes | One still per storyboard shot, same Fal path, cap 6 | CS-11 has been used on real offers |
| Clips | Image-to-video adapter beside `imageService`, per-org cap | A tenant asks for Reels and a vendor is chosen |
| Reels upload | Separate from the image container in `instagramAdapter`, behind the send gate | Tenant token and a public video URL |
| WhatsApp child | Text on the offer; the tenant submits the template to Meta | WP-27 and a tenant WABA |

Utility messages (order shipped) stay out of this studio.

## Code map (starting points, not a redesign)

| Area | Path |
|---|---|
| Lucy entry | `client/src/pages/marketing/components/InstagramAgentPromptModal.tsx`, `lib/buildInstagramAgentMessage.ts` |
| Studio today | `components/InstagramCockpit.tsx`, `components/ContentDetailPanel.tsx`, `cockpit/InstagramPreview.tsx`, `cockpit/ContentDetailPanel.tsx` |
| Channel rules | `server/src/modules/marketing/prompts/instagramChannelSpec.ts` |
| Image pipeline | `server/src/services/marketing/workflows/instagramImagePipeline.ts`, `instagramContentWorkflow.ts` |
| Agent persist | `server/src/services/ai/marketing/marketingAgentOrchestrator.ts` |
| Atomization stub | `server/src/services/ai/marketing/contentAtomizationBatch.ts` |
| Publish | `server/src/services/marketing/publishing/adapters/instagramAdapter.ts` |

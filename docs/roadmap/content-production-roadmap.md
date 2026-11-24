# Content production — offer sheet, format packages, Fal stills

**As of:** 2026-11-14. **Status:** in progress. CP-01 through CP-11 are done. Follows the finished studio track (`content-studio-90-day.md`). Does not lift the pause on the 14-part Lucy Content Studio spec (D-12).

**Who it is for.** The same screens as today: Messign, a bookstore tenant, and a florist tenant. Kitapyurdu-style titles and Lilyana-style bouquets are the fixtures. No customer name, email, or phone in a prompt or an image prompt.

**Outcome.** A person fills an offer sheet from that org’s truth rows. Lucy writes only inside that sheet. Each format saves a package. Instagram stills call Fal with a body that model actually accepts, and we keep the prompt and seed Fal returns. A missing product, a missing place on Instagram, a discount that is not an approved claim, or a returned image prompt that dropped the product never publishes. The email repeats the same product and price. A scheduled Instagram row can still publish, because `SEND_MODE` is live. The sheet is what keeps that post specific.

Engage stays the default session list. WP-02 is still next unless this track is chosen for the evening. One package is one session.

## Out of scope

Generated video. Reels upload. New channels. A/B copy. Autonomous posting. A new table or new columns while WP-03 is blocked. Fine-tuning a Fal model. Training on tenant photos. Customer personal data. Cart creating an Instagram row. Changing the send gate. `publishAllowed` on the three fixtures stays false. Studio share with a saved org connection stays the explicit Instagram opt-in.

## Defaults

| ID | Default |
|---|---|
| CP-D1 | The sheet is a labeled block in `user_brief`. The first line stays the human intent. |
| CP-D2 | Product, price, and place live in `marketing_product_truth.description` as labels, until a migration is allowed. `feature_name` is the product name. Sellable rows use `status = shipped`. |
| CP-D3 | A discount or percent exists only as a `marketing_approved_claims` row whose `context_tags` include `truth:<id>`. |
| CP-D4 | Gates run before the copy model and before Fal. The post-draft truth gate stays as a second pass. |
| CP-D5 | Language stays on the brand profile. |
| CP-D6 | Instagram stills use Flux Pro. A reference photo, or a shop still with a full sheet, uses Flux Pro Ultra. Flux Dev keeps guidance and steps. Pro and Ultra do not. |
| CP-D7 | The Fal prompt is a scene line. It is not the offer sheet. Price, claim, audience, and dates stay out of the image. |

## The sheet

Stored on the offer. Children copy the fields they need. Parser: `server/src/services/marketing/offerSheet.ts`.

```
Window drop for the novel on the counter this week.

product: Kürk Mantolu Madonna
truth_id: <uuid>
place: Karaköy kitapçı vitrini
price: ₺189
claim: Bu hafta vitrinde
claim_id: <uuid or empty>
audience: Shoppers passing the window
window: 2026-11-16..2026-11-22
language: tr
```

| Field | Required when | Source |
|---|---|---|
| Intent line | Always | Typed |
| `product`, `truth_id` | Always | Picked row. `feature_name` must match `product`. |
| `place` | Instagram is in the recipe | Label inside that row’s description, or typed only if the row has no place |
| `price` | The copy mentions money | Label inside the description. Empty means the copy has no price. |
| `claim`, `claim_id` | The copy has a discount, percent, or superlative | `marketing_approved_claims` |
| `audience` | Occasion and cart | A segment phrase. Never a person. |
| `window` | Occasion and cart | Inclusive dates |
| `language` | Always | Brand profile, copied onto the sheet |

Truth row description shape:

```
A novel in the shop window.
price: ₺189
place: Karaköy kitapçı vitrini
```

Kitapyurdu fixtures replace “Roman”, “Çocuk kitabı”, and “Defter” with three named titles. Lilyana fixtures keep three bouquets and gain a price and a place each. Messign’s rows stay features, with no price.

## Format packages

| Format | Saved package |
|---|---|
| Feed | One Fal still. Scene prompt contains `product` and `place` and a square frame. Caption under 2,200 characters. CTA “Link in bio”. One alt line. |
| Carousel | Up to 5 slides: `{ index, role, claim, prompt, image_url }`. Roles: cover, product, detail, proof, close. |
| Story | 3–5 frames, 9:16, each with on-screen text. Caption optional. |
| Reel | Existing `ReelPackage`: cover prompt, hook, 3–6 shots, on-screen line, caption, audio note. Cover still only. |
| Email | `SUBJECT`, `PREVIEW`, body, the sheet’s product and price, `Unsubscribe: {{unsubscribe_url}}`. |

## Fal contract

Sources: [FLUX 1.1 Pro](https://fal.ai/models/fal-ai/flux-pro/v1.1/api), [FLUX 1.1 Pro Ultra](https://fal.ai/models/fal-ai/flux-pro/v1.1-ultra/api), [Flux Dev](https://fal.ai/models/fal-ai/flux/dev/api). Fal does not return a quality score. The fields we can keep are `prompt`, `seed`, `width`, `height`, `has_nsfw_concepts`, and the request id.

Instagram text-to-image today calls `fal-ai/flux-pro/v1.1` and also sends guidance `3.75`, `50` steps, and a long negative prompt. Pro’s schema has none of those. A validation error retries without them, so the negative list never arrives. The direct prompt path is on by default, and a non-empty `user_brief` replaces the image prompt for up to 1,200 characters. A sheet in that field would be sent whole, and Pro would try to paint the price and the claim. CP-04 stops that. CP-11 changes the request body.

**Pro**, no reference photo. `enhance_prompt` is false when the scene already names the product and the place.

```json
{
  "prompt": "Photorealistic photograph of the novel Kürk Mantolu Madonna standing in the Karaköy kitapçı vitrini, paper cover and glass reflections visible, natural daylight, sharp focus on the book, square 1:1 frame. No letters, numbers, prices, logos, or watermarks painted into the image.",
  "image_size": { "width": 1080, "height": 1080 },
  "num_images": 1,
  "output_format": "jpeg",
  "safety_tolerance": "2",
  "enhance_prompt": false,
  "seed": 18402331
}
```

Story and reel cover use `1080` by `1920`. If Pro rejects that size, snap to a size the error names, or to `square_hd` / `portrait_16_9`. Do not reuse the retry that only strips extra fields and sends the same size again.

**Ultra** for a shop still or a reference photo. Ultra takes `aspect_ratio`, not `image_size`. `raw` is the less-processed photograph switch. `image_prompt_strength` runs from 0 to 1. The documented default is `0.1`. Try `0.15`, `0.4`, and `0.7` on one bookstore still and one florist still in CP-10, and keep the strength where the product is recognizable and the place is still visible. Kontext stays the path for an edit instruction.

| Goes in the Fal prompt | Stays out |
|---|---|
| Product name, materials, and the place | `price`, currency, percents |
| “Photorealistic photograph”, light, and the frame line | The claim, hashtags, “link in bio” |
| “No letters, numbers, logos, or watermarks” | Audience, dates, and the opt-out line |
| One reference URL on Ultra, when a photo was uploaded | The whole `user_brief` block |

`enhance_prompt: true` only when the visual note is a short line and the sheet has no product yet. If the returned `prompt` drops the product or the place, call once more with `enhance_prompt: false`. If it is still missing, fail the package. If `has_nsfw_concepts` contains true, do not attach the image.

Flux Dev may still send guidance and steps. Set `acceleration` to `none`. Do not copy those fields onto Pro or Ultra.

## Gates

All of these refuse before a model call, except the last two, which refuse the saved image.

| Gate | Fails when |
|---|---|
| Product bound | `truth_id` is missing, or the row is another org, or `feature_name` differs from `product`. |
| Place bound | The recipe includes Instagram and `place` is empty. |
| Claim bound | The sheet or later draft contains a percent, “off”, or “indirim”, and `claim_id` is empty. |
| Numbers | Caption or email contains an amount other than `price` or the approved claim text. |
| Foreign product | Draft or sheet names another org’s product. |
| PII | An email address or phone number in the sheet or brief. |
| Shape | Carousel over 5. Reel shots outside 3–6. Email missing an opt-out line. |
| Fal prompt | The scene sent to Fal contains a price, a percent, or the whole sheet. |
| Returned prompt | Fal’s `prompt` does not contain `product` and `place` after the one allowed retry. |
| NSFW | `has_nsfw_concepts` contains true. |

## Sequence

Eleven sessions. If an evening is short, drop CP-07 first, then CP-09. CP-01 through CP-04 and CP-11 are the floor. CP-10 is the proof, and it includes the two strength tries.

### CP-01 — Sheet parser

**Status.** Done 2026-11-13.

**Objective.** An offer can store and return the labeled sheet.

**Build.** `offerSheet.ts` next to `offerRecipes.ts`. Read and write `user_brief`. Keep the intent line. Round-trip the fields. Unknown labels are ignored. Tags stay `recipe:*` and `ig_format:*`. No UI.

**Acceptance.** Parse then serialize returns the same fields. A sentence-only brief returns an empty sheet plus that sentence. A phone number in `audience` is a parse error. A window whose end is before its start is a parse error.

**Tests.** `server/src/__tests__/modules/marketing/offerSheet.test.ts`.

### CP-02 — Merchant truth rows

**Status.** Done 2026-11-13.

**Objective.** A picker can load this org’s sellable products, with price and place.

**Build.** A reader over `marketing_product_truth` and `marketing_approved_claims` for the caller’s org only. Parse `price:` and `place:` from `description`. Three named Kitapyurdu titles and three Lilyana bouquets in the tenant setup module. `status = shipped` may be picked. `internal_only` and `deprecated` stay hidden. No new columns.

**Acceptance.** Org A cannot read org B’s rows. Lilyana’s list has no Messign product name. A row without `price:` returns an empty price. A claim tagged `truth:<id>` attaches to that row.

**Tests.** Tenant isolation. Florist sheet has no “Dora”. Description label parser.

### CP-03 — Gates before the model

**Status.** Done 2026-11-13. `offerProductionGate` runs in both `executeContentWorkflow` paths before the generation loop. A sentence with no labels is unchanged. A sheet, or an explicit `product_drop` recipe, stops when `truth_id` is missing, the passed row does not match, or a percent / “off” / “indirim” has an empty `claim_id`. The caller passes the org’s truth row; this package does not query the table. Studio still sends a raw topic until CP-09, so that path is not blocked yet.

**Objective.** A product drop with no truth row, or a discount with no claim, never calls copy or Fal.

**Build.** One function over the sheet, the recipe, and the org’s truth row. Call it from Instagram create and from `executeContentWorkflow` before `generateResponse`. Reasons name the field.

**Acceptance.** No `truth_id` does not call the generation mock. “50% off” with an empty `claim_id` does not call it. A complete sheet with no discount calls generation once.

**Tests.** Workflow test with injected generation.

### CP-04 — Scene from the sheet

**Status.** Done 2026-11-13. A brief with `product` or `place` becomes a still of that product, the truth-row materials, and the place. The raw brief and a bland image prompt are not the scene. Price, claim, audience, and dates stay out. A bookstore or florist place adds that shop line. Lucy’s prompt gets the same facts, and caption language follows the sheet. A brief with no product or place still uses the cleaned image prompt.

**Objective.** Lucy and Fal receive the product and the place. The raw brief is not the image scene.

**Build.** Pass the sheet into the strategist context. `buildDirectInstagramFalPrompt` stops preferring `userBrief` over the image prompt. The scene is built from `product`, materials, and `place`, plus the realism lines and the frame line. Price, claim, audience, and dates are omitted. The bookstore or florist addendum attaches from the truth row. Caption language comes from `language`.

**Acceptance.** A bland topic still produces a scene that contains the product and the place and does not contain `₺` or the claim text.

**Tests.** Prompt-builder unit test. No live Fal call.

### CP-11 — Fal request and response

**Status.** Done 2026-11-13. Pro sends the Pro body: no guidance, steps, or negative prompt. Ultra sends `aspect_ratio` and no `image_size`, `raw` on a shop still, and `image_url` when a reference photo is present. A reference photo selects Ultra. Kontext stays on the regenerate-edit path. `enhance_prompt` is false when the scene names a product. A returned prompt that drops the product or the place is retried once, then the still is not saved. An unsafe flag does not attach an image. A Pro size error snaps to a multiple of 64. Dev keeps guidance and steps, with `acceleration: "none"`. The returned prompt, seed, size, and request flags are stored on `image_generation_metadata`.

**Objective.** Pro and Ultra are called with their own schemas. We store what Fal used.

**Build.** Split the subscribe input. Pro: the body in the Fal contract, no guidance, steps, or negative prompt. Ultra: `aspect_ratio`, `raw` for a shop still, optional `image_url`. Reference photo selects Ultra. Kontext stays for edit instructions. `enhance_prompt` false when the scene has a product. Persist response prompt, seed, size, NSFW flag, and the request flags on `image_generation_metadata`. If the returned prompt drops the product or the place, one retry with enhancement off. NSFW does not attach. Size 422 snaps. Dev-only fields stay on Dev, with `acceleration: "none"`.

**Acceptance.** The Pro unit-test body has no guidance, steps, or negative prompt. The Ultra body has `aspect_ratio` and no `image_size`. A stubbed response prompt missing the product triggers one retry and then a package failure. A reference photo selects Ultra.

**Tests.** Input-builder tests. One retry test with a stubbed client. No live Fal call in CI.

**Depends on.** CP-04.

### CP-05 — Feed package

**Status.** Done 2026-11-13. After Fal, a labeled feed sheet is saved only when the returned prompt still names the product and the place, the frame is square, the caption is under 2,200 characters, says “Link in bio”, has no raw URL, and does not add a second price. Alt text from `[ALT_TEXT]` stays on `visual_description`. Regen of a sheet sends that same scene, not the new prompt. A plain topic with no product or place still saves. Story and reel skip this check.

**Objective.** A feed draft is saved only when the still matches the sheet.

**Build.** After Fal, require the returned prompt to contain `product` and `place`, and the frame line to be square. Caption under 2,200 characters, “Link in bio”, no raw URL, no second price. Persist alt text from `[ALT_TEXT]` where a field already exists. Regen sends the same scene.

**Acceptance.** A returned prompt missing the place fails. A caption that adds a second price fails. A matching still and caption pass.

**Tests.** Package checker. One orchestrator test with a stubbed Fal result.

### CP-06 — Carousel roles

**Status.** Done 2026-11-14. Each stored slide has a role and a claim. Roles, in order, are cover, product, detail, proof, and close. A carousel stops at five slides. Regenerating one slide leaves the other URLs in place. Each slide prompt names the product, and the still uses the Pro request (no reference photo). A returned prompt that omits the product does not replace the slide.

**Objective.** Each slide has a role and a claim. Regenerating one slide does not replace the others.

**Build.** Extend the stored slide (`index`, `image_url`, `prompt`) with `role` and `claim`. Roles in order: cover, product, detail, proof, close. Each slide uses the CP-11 Pro body. Reject a sixth slide. Reject a returned prompt that omits the product.

**Acceptance.** Regen of slide 2 leaves slide 1’s URL. Five slides, five prompts, each containing the product name.

**Tests.** Existing carousel regen test plus roles.

### CP-07 — Story frames and reel shots

**Status.** Done 2026-11-14. A story saves 3 to 5 on-screen lines at 9:16. A reel pre-fills from the sheet: the product is in shot 1, the place is in the cover prompt, and a claim becomes the hook. The cover request is 9:16 at 1080x1920. Two shots do not save. A five-shot list round-trips. The export lists the cover URL, hook, shots, caption, and audio. No video file.

**Objective.** A person can edit the shot list. The cover still uses the Fal contract. No video file.

**Build.** Story: 3–5 frames of on-screen text, 9:16. Reel: pre-fill `ReelPackage` from the sheet (product in shot 1, place in the cover prompt, claim as the hook when a claim exists). Cover image uses CP-11 with a 9:16 size or `aspect_ratio`. Two shots do not save. Export text still lists cover URL, hook, shots, caption, and audio.

**Acceptance.** A two-shot reel does not save. A five-shot list round-trips. The cover request is 9:16. No video bytes.

**Tests.** Extend `reelStoryboard.test.ts`. One test that the cover prompt contains the product.

### CP-08 — Email from the sheet

**Status.** Done 2026-11-14. The email subject is the offer title. The preview is the claim, or the intent line when the claim is empty. Product and window are copied from the sheet. `price: ₺189` writes one price line. An empty price writes none, even when the intent mentions ₺1. The Instagram caption is not in the body. A cart reminder still creates no Instagram row, still says a public post is a different recipe, and still keeps the opt-out line.

**Objective.** The email uses the sheet’s product, price, claim, and window. It does not scrape a price out of the brief, and it does not copy the Instagram caption.

**Build.** `journeyEmailCreateInput` takes the parsed sheet. `SUBJECT` from the offer title. `PREVIEW` from the claim, or the intent line when the claim is empty. A price line only when `price` is set. Cart still says a public post is a different recipe and still creates no Instagram row. Opt-out line stays.

**Acceptance.** `price: ₺189` produces one price line. An empty price produces none, even if the intent sentence contains “₺1”. The Instagram caption is not a substring of the email body. Cart creates zero Instagram rows.

**Tests.** Extend `journeyEmailDraft.test.ts` and the cart recipe test.

### CP-09 — Studio sheet

**Status.** Done 2026-11-14. The create form has a product picker. A picked row fills price and place. Price and claim stay read-only. A product drop with no product does not start, and the error names `product`. Occasion keeps the Instagram checkbox. Cart hides format and place. A reference photo is marked Ultra. The detail panel shows the sheet, the scene sent to Fal, and the prompt Fal returned. The saved brief is the sheet, and a fixture product resolves to a truth row for the gate.

**Objective.** The create form and the detail panel show the fields, the Fal scene, and the returned prompt.

**Build.** On `InstagramAgentPromptModal`, add the picker, place, and read-only price and claim. Keep topic, recipe, format, tone, reference photo, and mock image. Mock image stays off by default. The detail panel shows the sheet, the scene sent to Fal, and the prompt Fal returned. A gate error names the field. Occasion keeps the Instagram checkbox. Cart hides format and place.

**Acceptance.** A product drop with no picked product does not start the pipeline. A picked row fills price and place. A reference photo is marked as the Ultra path. Cart hides the format control. Client tests mock the API.

**Tests.** Modal test: empty product blocks submit. Detail test: sheet product and returned prompt are visible.

### CP-10 — Two real drafts

**Status.** Done 2026-11-14. Bookstore offer `34c309d2-7dc9-425c-ab67-a7b8e90f4e51` and florist offer `b6a42c85-2cc5-4b06-916d-f29e9db2cc10` are drafts. Neither is scheduled. Bookstore is a square Flux Pro still. Florist tried Ultra at 0.15, 0.4, and 0.7 against the Pro still of the same bouquet. **0.7 kept the bouquet.** No strength kept a shop counter: the reference frame had no counter. The saved florist still is the 0.7 try. Both emails use the sheet price and an unsubscribe line. Stored Fal prompts name the product and the place and do not contain the price. Metadata has a seed and a request id.

Five things that were still awkward:

1. The bookstore still showed a crowned woman and flowers, not the book in the window.
2. Book spines carried broken lettering.
3. The daisy bouquet came back as a large pink flower.
4. Ultra at 0.15 painted a shop sign with broken text.
5. Ultra at 0.4 painted poster lettering on the shop glass. Remote image storage could not be reached, so the files are on this machine.

**Objective.** One bookstore feed and one florist occasion go through the sheet, the gates, Fal, and the studio. Publish stays a human action.

**Build.** Bookstore: named title, place, price, no discount, Turkish caption, square Pro still, email with the same price and an opt-out. Florist: bouquet, place, date window, and one Ultra try with a reference photo at `0.15`, `0.4`, and `0.7`. Record which strength kept the bouquet and the counter. Record the five things that were still awkward. Do not auto-schedule.

**Acceptance.** Both offers have a `truth_id`. The stored Fal prompt contains the product and the place and does not contain the price. Metadata has seed and request id. The email price matches the sheet. No new channel. No video.

**Tests.** CP-03, CP-08, and CP-11 cover the gates. This session is the manual pass, the strength note, and a line in `weekly-progress.md`.

## What this does not change

Engage WP-02 through WP-34 stay the default sessions. Journey rendering stays WP-14. The send gate stays WP-11. Per-tenant AI caps stay WP-23. Reel video stays on the post-90 list until a tenant asks. New truth columns wait for the schema baseline (WP-03).

## Risks

`SEND_MODE=live` and the publisher cron are on. A scheduled Instagram row will publish. CP-03 stops a labeled sheet or an explicit product drop that has no truth row or an unapproved discount. CP-09 sends the sheet from the studio. A fixture product whose id matches the content tenant passes that gate. CP-11 sends Pro and Ultra the bodies those models accept. Fal is the image path. Do not treat Gemini as a fallback while it returns a billing error. The three fixture setups still have `publishAllowed: false`. Messign’s saved Instagram connection is a separate opt-in and is unchanged.

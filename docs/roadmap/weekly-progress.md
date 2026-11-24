# Weekly Progress

Append one entry per session: date · session · WP · done · remaining · next · blockers. Newest on top.

## 2026-11-24 · Marketing UX UX-01: delete and hide
- **Done:** The unreachable marketing files are deleted: the old cockpit panels (14 of 16; `InstagramPreview` and `Va2DiagnosticsPanel` stay), the approval-queue and leads pages, the Instagram prompt modal, `InstagramConnect`, the old Lucy drawer, the campaigns section, unused barrels, and the tests that only covered them. Eight of those files had uncommitted edits or were untracked. They are in `git stash` as "UX-01 backup: uncommitted edits in unreachable marketing files deleted 2026-11-24". Fake controls removed: email Send in the email panel and the builder, the Publish rocket, Auto-schedule on the detail and in the calendar list. The pipeline now runs only two real moves: draft→review submits a content card; review→ready approves an approval card. Any other drop shows one line, for example "Posts go live from the calendar, not by dragging.", and changes nothing (`lib/boardMoves.ts`, with a test). Campaign Edit (no handler) is gone. The duplicate "Build email layout" banner is gone; the same draft is still built automatically once per session, and the sparkle button stays. The Unlayer env-var intro is gone from every builder header. The missing-project-ID warning shows in dev only. Builder's image Generate was not a visible No-op; it is never registered without a callback, so it needed no change. The Kitapyurdu shop-switch test now waits up to 5 s for the lazy panel. Client typecheck is clean. 482 client tests pass, in two parallel runs and one serial run. In the browser: dragging a draft to Live shows the calendar message and the counts stay. A LinkedIn draft shows only Schedule. New Email shows no setup text. Calendar list view has no Auto. Not clicked: review→ready on real data, because it would approve dev content. Nothing is committed.
- **Next:** founder decisions (Lucy composer channel tiles; Instagram test publish versus `SEND_MODE`), then Phase 2 docs: design principles, ADR-010, target IA, UX roadmap.
- **Blockers:** none for docs. Main still holds uncommitted MC work mixed with these changes.

## 2026-11-24 · Marketing UX: frozen screens removed from the UI
- **Done:** The founder decided to remove the frozen marketing screens instead of hiding them. Intel, Brand & social, Funnel, Campaigns & lab, Lucy sandbox, and the CEO dashboard are gone from the client. Their old URLs redirect to `/marketing`. Builder offers Email and Documents only; `/marketing/pages` and `/marketing/popups` redirect to Builder. The offer detail no longer has Atomize to channels. The calendar no longer has the funnel strip. Marketing no longer fetches command-center or funnel data. The command palette's "Marketing > Campaigns" is gone and "New Campaign" became "New Offer". The two dashboard to-dos now point at offers and the calendar. All backend routes are unchanged (ADR-001: delete UI only). Client typecheck is clean. 515 client tests pass when run serially. In the parallel run, "closes Dora when the shop changes to Kitapyurdu" timed out after 1 s waiting for the lazy offer panel; it passes alone. In the browser, More and the tab bar show Pipeline, Calendar, and Builder. `/marketing/intelligence`, `/sandbox`, and `/campaigns` land on `/marketing`. Builder shows All, Email, and Documents. Offer and content detail open. Nothing is committed: `main` already holds uncommitted MC work in the same files.
- **Next:** UX-01 rest: delete the 38 unreachable files and remove the six Mock and three No-op controls (`docs/ux/control-audit.md`).
- **Blockers:** founder answers on the approval-queue page, the Lucy composer's LinkedIn/X/blog/ads tiles, and Instagram test publish versus `SEND_MODE`.

## 2026-11-24 · Marketing UX UX-A (reconnaissance, docs only)
- **Done:** `docs/ux/` has the master prompt, inventory, control audit, duplication map, and copy audit. 38 of 182 marketing files (≈ 6,900 LOC) are unreachable. Six controls are Mock: email Send, drag to Live, the Publish rocket, two Auto-schedule buttons, and builder Send. Three are No-op: campaign Edit, drag review→ready on a content card, and Generate image in the builder. The home's More menu and the workspace tab bar both link to five frozen screens. Reachable explanatory copy is about 535 words. The trace was static; nothing was click-tested. No application code changed.
- **Next:** decide how UX work relates to the marketing-counter track, then UX-01 (delete and hide). Phase 2 docs (design principles, ADR-010, target IA, UX roadmap) are not written.
- **Blockers:** founder answers on the approval queue page, the composer channel tiles, and Instagram test publish versus `SEND_MODE`.

## 2026-11-14 · Marketing counter MC-06
- **Done:** The picture step keeps look, frame, and the Ultra reference warning. The scene line is the sentence Fal receives. Regenerating an offer uses the look saved on that offer, even when the request asks for another. Client and server tests passed. Dora’s offer was opened in the browser. Regenerate was not clicked.
- **Next:** MC-07. The journey email sits on the offer: subject, product, price, window, unsubscribe. The builder is only for layout.
- **Blockers:** none for MC-07. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Marketing counter MC-05
- **Done:** An empty shop is a card with New offer. A failed list shows the error and Try again. Switching shop clears a product that is not on that list, including the shot lines, and returns to Product. An open offer that is not on the new shop closes. Kitapyurdu shows Kürk Mantolu Madonna and not Dora. Client tests passed. The switch was checked in the browser without saving.
- **Next:** MC-06. Picture step keeps look, frame, reference, and regenerate. The scene line matches the Fal sentence.
- **Blockers:** none for MC-06. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Marketing counter MC-04
- **Done:** The home and the offer use one paper background and one white card. The still is the large part of the card. The home has no violet glow, paper-plane burst, or zeroed stats. Pipeline and the other rooms were left as they were. Client tests passed. The counter and Dora’s offer were checked in the browser.
- **Next:** MC-05. Empty, error, and tenant-switch states. Switching shop clears a product that is not on that list.
- **Blockers:** none for MC-05. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Marketing counter MC-03
- **Done:** Opening an offer from the counter shows the product, the still, and the caption. The score, hashtag tools, timing tools, and the Instagram access-token field are off that screen. Publish stays off, with no share button. Client tests passed. Dora’s offer was opened in the browser: the still and caption were on the panel.
- **Next:** MC-04. Shop-window theme on the home and the offer. One background, one card, the still large.
- **Blockers:** none for MC-04. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Marketing counter MC-02
- **Done:** New offer is five steps at `/marketing/offer/new`: product, picture, words, preview, Looks good. A product drop cannot leave Product without a product. Cart skips the picture. Looks good saves a draft and does not schedule, post, or ask Lucy. The Instagram create modal is no longer opened from the counter or from Lucy. Client tests passed. The page was walked in the browser through Looks good without saving.
- **Next:** MC-03. The content slide-over opens this same offer. Token, score, hashtags, and timing leave it.
- **Blockers:** none for MC-03. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Marketing counter MC-01
- **Done:** `/marketing` is the shop counter. It lists offers for the selected shop, with the still, price, and step. Lucy stays closed until Ask Lucy. More still opens pipeline, calendar, builder, intel, brand, funnel, campaigns, and sandbox, unchanged. New offer opens the existing form and was closed without sending. Kitapyurdu shows Kürk Mantolu Madonna. Lilyana shows Papatya buketi. Messign shows Dora and does not show the book. Client tests passed.
- **Next:** MC-02. New offer becomes five steps, and the create modal stops being the way in.
- **Blockers:** none for MC-02. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Marketing counter roadmap
- **Done:** The 120-day shop-counter plan is in `docs/roadmap/marketing-counter-120-day.md`. Every current marketing tab has a fate. Eighteen packages, MC-01 through MC-17, are on the backlog. The home becomes an offer list. Lucy becomes a drawer. The create modal and the content detail become one offer page. Calendar, builder, brand, campaigns, and intel are later rooms. Sandbox and the old redirects leave the nav. No screen was rebuilt in this session.
- **Next:** Engage WP-02. The first counter session, if this track is chosen, is MC-01.
- **Blockers:** none on the document. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Still look on the form
- **Done:** The create form has a Look menu with all ten image looks: photoreal, modern noir, vibrant lifestyle, minimal flat-lay, editorial, product spotlight, team culture, data visualization, seasonal, and phone camera. The scene sentence opens with the chosen look, and that look is the style sent with the still. An empty look stays photoreal. “AI” in a materials line stays capitalized. Regenerate offers the same ten looks. Sheet and scene tests passed. No new Fal call.
- **Next:** Engage WP-02.
- **Blockers:** none on this package. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Aim the still from the form
- **Done:** The offer sheet now keeps `materials`, `in_frame`, and `keep_out`. Those lines do not open the truth gate. The Fal scene leads with the physical object, names the product as the title, then the shop, then the shot lines. A price or a claim in those lines is dropped. An empty materials line still falls back to the truth-row prose. The create form is Offer, Picture, and Copy. The live scene line matches the sentence Fal receives. A picked book fills materials, place, and price, and the visual box becomes caption direction. Cart hides the picture block. A product drop with no product still does not start. Sheet, scene, modal, and detail tests passed. Client and server typechecks are clean. No new Fal call, schedule, or publish.
- **Next:** Engage WP-02.
- **Blockers:** none on this package. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Content production: two real drafts
- **Done:** CP-10. Bookstore offer `34c309d2-7dc9-425c-ab67-a7b8e90f4e51` is a square Flux Pro still of Kürk Mantolu Madonna at Karaköy kitapçı vitrini, with a Turkish caption, sheet price ₺189, and an unsubscribe line on the email. Florist offer `b6a42c85-2cc5-4b06-916d-f29e9db2cc10` is Papatya buketi at Nişantaşı çiçekçi tezgahı, window 2026-11-16..2026-11-22, email price ₺450. Ultra reference strengths 0.15, 0.4, and 0.7 were tried. **0.7 kept the bouquet.** No strength kept a shop counter, because the reference frame had none. The saved florist still is the 0.7 try. Both offers have a truth id. Stored Fal prompts name the product and the place and do not contain the price. Each still has a seed and a Fal request id. Nothing was scheduled or published. Awkward: the book still became a crowned woman among flowers; book spines had broken lettering; the daisy became a large pink flower; 0.15 painted a broken shop sign; 0.4 painted poster text. Remote storage was unreachable, so the files are local.
- **Next:** Engage WP-02. This content-production track is through CP-11.
- **Blockers:** none on this package. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Content production: studio sheet
- **Done:** CP-09. The create form picks a product from the content tenant. A picked row fills price and place. Price and claim stay read-only. A product drop with no product does not start, and the error names the product field. Occasion keeps the Instagram checkbox. Cart hides format and place. A reference photo is marked as the Ultra path. The detail panel shows the sheet, the scene sent to Fal, and the prompt Fal returned. The saved brief is the sheet. A matching fixture id passes the offer gate. Client tests passed. Server typecheck is clean.
- **Next:** CP-10 (two real drafts) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Content production: email from the sheet
- **Done:** CP-08. The journey email is built from the parsed sheet. Subject is the offer title. Preview is the claim, or the intent when the claim is empty. Product and window are copied when they are set. A filled price writes one price line. An empty price writes none, even when the intent mentions ₺1. The Instagram caption is not in the body. A cart reminder still creates no Instagram row and keeps the opt-out line. Email and cart tests passed. Server typecheck is clean.
- **Next:** CP-09 (studio sheet) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. Studio still saves a raw topic until CP-09. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Content production: story and reel
- **Done:** CP-07. A story saves 3 to 5 on-screen lines at 9:16. A reel pre-fills from the sheet: shot 1 names the product, the cover prompt names the product and the place, and a claim becomes the hook. The cover request is 9:16 at 1080x1920. Two shots do not save. Five shots round-trip. The export lists the cover URL, hook, shots, caption, and audio. No video file. Reel tests passed. Server typecheck is clean.
- **Next:** CP-08 (email from the sheet) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. Studio still saves a raw topic until CP-09. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Content production: carousel roles
- **Done:** CP-06. Each carousel slide stores a role and a claim. The roles are cover, product, detail, proof, and close. Five role prompts each name the product and leave the price out. A sixth slide is rejected. Regenerating one slide leaves the other image URLs in place. Slides use the Pro still request. A returned prompt that omits the product does not replace the slide. Carousel tests passed. Server typecheck is clean.
- **Next:** CP-07 (story frames and reel shots) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. Studio still saves a raw topic until CP-09. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-14 · Content production: feed package
- **Done:** CP-05. A labeled feed sheet is saved only when Fal’s returned prompt still names the product and the place, the frame is square, and the caption stays under 2,200 characters with “Link in bio”, no raw URL, and no second price. A dropped place does not save the image. Regen sends the sheet scene again. Alt text from `[ALT_TEXT]` stays on `visual_description`. A plain topic still saves. Story and reel skip this check. Package tests passed. Server typecheck is clean.
- **Next:** CP-06 (carousel roles) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. Studio still saves a raw topic until CP-09. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-13 · Content production: Fal Pro and Ultra
- **Done:** CP-11. Flux Pro requests omit guidance, steps, and the negative prompt. Ultra requests use `aspect_ratio` and never `image_size`. A reference photo selects Ultra and sends `image_url`. A shop still sets `raw`. A product in the scene turns enhancement off. A returned prompt that drops the product or the place is retried once and then rejected. An unsafe flag does not attach an image. A Pro size error snaps onto a multiple of 64. Flux Dev keeps guidance and steps, with `acceleration: "none"`. Returned prompt, seed, size, and request flags are stored on the image metadata. Kontext remains the edit path. Fal tests passed. Server typecheck is clean. No live Fal call.
- **Next:** CP-05 (feed package checks the prompt Fal returned) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. Studio still saves a raw topic until CP-09, so that create path has no product or place for the scene check. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-13 · Content production: scene from the sheet
- **Done:** CP-04. `buildDirectInstagramFalPrompt` builds the still from the product, the truth-row materials, and the place. A bland topic and the raw sheet are not the scene. The prompt has no price, claim, audience, or dates. A bookstore or florist place adds that shop line. Lucy’s system prompt gets the same facts, and the caption language follows the sheet. A brief with no product or place still uses the cleaned image prompt. Prompt-builder, feed, and strategist tests passed. Server typecheck is clean. No live Fal call.
- **Next:** CP-11 (Fal Pro and Ultra request bodies) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. Studio still saves a raw topic until CP-09, so that create path has no product or place for the scene. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-13 · Content production: offer gate
- **Done:** CP-03. `offerProductionGate` runs in the content workflow and the marketing orchestrator before the generation loop, so a blocked sheet never calls copy or Fal. A sentence with no labels still generates. A product drop with no `truth_id`, a truth id whose passed row does not match, or “50% off” / “indirim” with an empty `claim_id` returns failed with attempts 0. A complete sheet with no discount generates once. Workflow tests: 6 passed. Server typecheck is clean.
- **Next:** CP-04 (scene from the sheet) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. The studio still saves a raw topic until CP-09, so that create path is not gated yet. The caller must pass the truth row; this package does not load it. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-13 · Content production: merchant truth
- **Done:** CP-02. `listMerchantTruthProducts` reads one organization’s `marketing_product_truth` and approved claims. `internal_only` and `deprecated` stay hidden. `price:` and `place:` come out of the description; a row without a price label has an empty price. A claim tagged `truth:<id>` attaches only to that row. Kitapyurdu’s three rows are named titles. Lilyana’s bouquets now have a price and a place, and still do not name Dora.
- **Next:** CP-03 (gates before copy and Fal) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. The picker UI is CP-09. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-13 · Content production: offer sheet
- **Done:** The roadmap is in `docs/roadmap/content-production-roadmap.md`, including the Fal Pro and Ultra request rules. CP-01 parses and writes the labeled sheet in `user_brief`. A sentence with no labels stays intent only. An unknown label is ignored. A phone number in the audience and a window that ends before it starts are parse errors.
- **Next:** CP-02 (merchant truth rows) if staying on this track; otherwise Engage WP-02.
- **Blockers:** none on this package. WP-03 still needs a schema-only dump before any new columns.

## 2026-11-13 · Engage: safety and CI baseline
- **Done:** WP-01. Server typecheck is clean. CI uses Node 22 and runs the client and server unit suites. Email, LinkedIn, X, and blog stay on mock unless `SEND_MODE` is exactly `live`. The publisher cron stays off unless `MARKETING_PUBLISHER_ENABLED=1`. The server no longer accepts `X-User-Id` as a login. `db:verify-rls` prints the connecting role’s bypass status, then checks rows as `messign_app` (or `RLS_VERIFY_ROLE`). A studio Instagram share with saved credentials still posts when `SEND_MODE` is unset.
- **Next:** WP-02 (repo cleanup, `PRODUCT_SURFACE`, CLAUDE.md, README).
- **Blockers:** WP-03 still needs a schema-only dump (`pg_dump -s`).

## 2026-11-12 · Content studio: buffer
- **Done:** The five dogfood annoyances. The Instagram modal keeps Send on screen. A fresh browser shows the login form while dev sign-in runs. The modal can draft as Messign, Lilyana, or Kitapyurdu. Mock image skips the provider. The email child sits beside the post, and Test publish stays hidden while publish is off.
- **Next:** Engage WP-01. This track has no further package.
- **Blockers:** none on this track.

## 2026-11-12 · Content studio: dogfood script
- **Done:** One Playwright spec runs the Messign product drop, the florist occasion, and the bookstore cart email. Image generation is mocked. The studio shows the caption and the regen control, and the cart creates no Instagram row. The five annoyances are written under CS-15.
- **Next:** CS-15 (only those five). Otherwise Engage WP-01.
- **Blockers:** none on this track.

## 2026-11-12 · Content studio: second-tenant checklist
- **Done:** Messign and the synthetic florist each have a brand, a language, an Instagram handle, three product-truth rows, and the three recipes. Publish stays off. A florist prompt that names Dora fails before the model runs.
- **Next:** CS-14 (dogfood script and one mocked Playwright path) if staying on this track; otherwise Engage WP-01.
- **Blockers:** none on this track.

## 2026-11-12 · Content studio: partial approval and reel storyboard
- **Done:** CS-D2 is approved. Approving an email child leaves the Instagram child in draft, and the queue opens that content id. The offer header shows each child’s state. CS-D3 is approved. A reel is a cover still plus a storyboard (hook, three to six shots, on-screen lines, caption, audio note). The studio shows that package after reload. Copy exports the text and image URL. No video API.
- **Next:** CS-13 (second-tenant brand checklist) if staying on this track; otherwise Engage WP-01.
- **Blockers:** none on this track. CS-01 and CS-03 checks are closed.

## 2026-11-12 · Content studio: close CS-01 and CS-03
- **Done:** Offer reads and updates include the caller’s organization, so another org cannot load the offer. A new offer returns an id and an empty child list. Lucy’s Instagram send opens the studio on the Instagram child of that offer.
- **Next:** CS-08 stays blocked on CS-D2. CS-11 stays blocked on CS-D3. CS-13 (second-tenant brand checklist) is the next package if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending.

## 2026-11-12 · Content studio: schedule and test publish
- **Done:** Instagram calendar cells show a thumb and a format badge. The email child shows its subject and is not published to a network. Instagram controls are Draft, Scheduled, and Test publish. The button says mock or live. Unset `SEND_MODE` returns the adapter mock permalink and does not call Graph.
- **Next:** CS-08 stays blocked on CS-D2. CS-11 stays blocked on CS-D3. CS-13 (second-tenant brand checklist) is the next package if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending. CS-01 org-isolation test and CS-03 mocked-agent acceptance are still open.

## 2026-11-12 · Content studio: journey binding
- **Done:** The journey email stores `journey_template_ref` as `{offerId}:email`. The email screen says Ready for journey and that this screen does not send. A draft prompt with an email address or a phone number is refused. No provider is called.
- **Next:** CS-11 stays blocked on CS-D3. CS-12 (schedule and publish modes) is the next unblocked package if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending. CS-01 org-isolation test and CS-03 mocked-agent acceptance are still open.

## 2026-11-12 · Content studio: carousel slide regen
- **Done:** Regenerating a carousel slide updates that slide only. The hero stays slide 1 unless that slide is the one being regenerated. A sixth slide is rejected. Image variants sit in the shared studio, and choosing a caption variant still writes the post body.
- **Next:** CS-08 stays blocked on CS-D2. CS-10 (journey binding, no send) is the next unblocked critical-path package if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending. CS-01 org-isolation test and CS-03 mocked-agent acceptance are still open.

## 2026-11-12 · Content studio: three recipes
- **Done:** Product drop creates one Instagram post and one journey email. Occasion creates the email and, by default, the post. Cart creates the email only and says a public post is a different recipe. Approval no longer queues five X posts and a LinkedIn post.
- **Next:** CS-08 is blocked on CS-D2 (partial approval). CS-09 (carousel per slide) is the next unblocked package if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending. CS-01 org-isolation test and CS-03 mocked-agent acceptance are still open.

## 2026-11-12 · Content studio: journey email child
- **Done:** "Draft journey email" on an offer's Instagram post creates an email child of the offer. The draft uses the offer title and brief (product name and price when the brief states one) and an unsubscribe line. It does not copy the Instagram caption. Email review is blocked without an opt-out. Instagram review is not.
- **Next:** CS-07 (recipes: product drop, occasion, cart with no Instagram) if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending. CS-01 org-isolation test and CS-03 mocked-agent acceptance are still open.

## 2026-11-12 · Content studio: e-commerce prompt pack
- **Done:** Bookstore and florist Instagram briefs select an addendum: name the product and the place, no generic office, no invented discount, link in bio, caption language from the brand profile. Ten fixtures pass. A "50% off" claim missing from product truth fails the truth gate before the model is called.
- **Next:** CS-06 (email child from the same offer) if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending. CS-01 org-isolation test and CS-03 mocked-agent acceptance are still open.

## 2026-11-12 · Content studio: format on the first image
- **Done:** The `ig_format` tag written at create is the saved format. The first Instagram image uses it: story and reel cover are 9:16 (1080×1920), feed is 1:1 (1080×1080). Reloading the post restores that format. A later regenerate can still override it.
- **Next:** CS-05 (e-commerce prompt pack) if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending.

## 2026-11-12 · Content studio: one Instagram studio
- **Done:** Pipeline slide-over and command center both render `InstagramStudio` (journey strip, carousel preview, regen / reference / photo edit). Carousel with more than one slide shows slide controls. Regen still goes through `regenerateContentImage`.
- **Next:** CS-04 (format drives the first image) if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending.

## 2026-11-12 · Content studio: one Instagram path
- **Done:** Lucy home and the create menu both open the same Instagram brief. The visual note is optional. The content panel shows Writing → Image → Review → Ready, polls while Lucy is working, hides the email tools on Instagram, and offers labeled Looks good / Schedule / Publish actions.
- **Next:** CS-02 (one studio component) if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending.

## 2026-11-12 · Content studio: pin Lucy to an existing Instagram draft
- **Done:** Guided Instagram send creates an offer (`content_type=offer`, hidden from the pipeline) and an Instagram child, then posts `marketingContentId` on `/api/v2/ai/answer`. The marketing flow passes that id into `executeContentWorkflow` so Lucy updates the same row. The content panel opens immediately and refetches when SSE metadata returns the id.
- **Not in this slice:** unified Instagram studio (CS-02), stored aspect ratio on first image (CS-04), email child.
- **Next:** CS-02 if staying on this track; otherwise Engage WP-01.
- **Blockers:** CS-D2 and CS-D3 still pending.

## 2026-11-12 · Content studio roadmap drafted
- **Done:** `docs/roadmap/content-studio-90-day.md` (CS-01…CS-15). Backlog section added. Engage WP rows unchanged. Pointer in `90-day-roadmap.md`. CS-D2 and CS-D3 left pending.
- **Defaults taken:** offer parent is `marketing_content` (`content_type=offer`); language from brand profile; Instagram publish follows `SEND_MODE`.
- **Next:** Engage WP-01 unless this track is chosen, in which case CS-01. Founder still needs to accept or reject CS-D2 and CS-D3 before CS-08 and CS-11.
- **Blockers:** none for the doc. CS-11 blocked on CS-D3 only when that package starts.

## 2026-11-07 · Founder decisions recorded
- **Approved:** D-01, D-02, D-09, D-10, D-11 (10%), D-12. **Pending:** D-03 (entity), D-04 (hosting). D-05 = sandbox testing only. D-08 = default pilot design added to the roadmap. Kitapyurdu/Lilyana are prospects only.
- **D-07 finding:** the production app connects as `postgres` SUPERUSER/BYPASSRLS, so RLS is ignored at runtime (R1 confirmed). `reimbursement_requests` RLS was enabled on Railway (no runtime effect under superuser). ADR-002 amended: engage gets a dedicated non-bypass role and its own pool. ADRs 001–009 accepted.
- **Still needed:** a schema-only dump (`pg_dump -s`) for WP-03; D-06 clarification (Related Digital).
- **Next:** WP-01.

## 2026-11-07 · Session A2 addendum (founder answers)
- **Answers:** Kitapyurdu has no CEP (greenfield). Neither Kitapyurdu nor Lilyana will take any action until the business officially starts; build on mock data and a test setup. The Alaris platform supports a domestic TR route.
- **Plan changed to v2:** 90-day goal = pilot-ready on business start day (synthetic tenants, allow-listed test recipients only, no real personal data). Added WP-35 (erasure/export, moved out of WP-09), WP-36 (segments + scheduled trigger, P0). WP-09 now includes the synthetic generator. WP-33/34 became onboarding kit + business-start dry run. Tenant-side dependencies moved to a business-start list (B1–B8).
- **Next:** WP-01 after D-01 approval.

## 2026-11-07 · Session A2 (strategy & plan, docs only)
- **Done:** web-verified competitive matrix; strategy answers (product-vision, market-positioning); TR obligations doc; target architecture; ADR-001…009; 90-day roadmap; backlog; decisions-pending; CLAUDE.md pointer.
- **Key findings:** Turkish operators block A2P SMS with links from abroad, so SMS needs a domestic route. Local incumbents (Related Digital, Netmera) already cover İYS, and Netmera offers TR hosting, so compliance is table stakes. Related Digital's references include idefix and D&R, Kitapyurdu's closest competitors.
- **Remaining:** founder decisions D-01…D-12.
- **Next:** WP-01 (Week 1, S1) after D-01 approval.
- **Blockers:** D-07 (live DB dump) for WP-03.

## 2026-11-07 · Session A1 (reconnaissance, read-only)
- **Done:** current-state.md, feature-maturity-matrix.md, risk-register.md, technical-debt.md; master prompt saved to `docs/strategy/master-prompt.md`.
- **Test baseline:** server 906 pass / 3 env-dependent fail / 9 skipped (123 files); client 557 pass (98 files); server `tsc` 1 error (`services/ai/gateway.ts:83`); client `tsc` clean.
- **Next:** Session A2.

# Sprint 3 Report

## Part 1: Image Generation

- **Dev fallback implemented:** YES — `IMAGE_GEN_DEV_FALLBACK=true` or `1` triggers an immediate return in `generateImage()` with a `placehold.co` URL (prompt snippet in `text=`). Optional `IMAGE_GEN_PLACEHOLDER_URL` still overrides the whole URL.
- **`generateImage` in `executeContentWorkflow`:** ALREADY_WIRED — `marketingContentWorkflow.ts` calls `generateImage` after gatekeepers pass for Instagram when `imagePrompt` exists.
- **Instagram `image_url` in DB (with dev fallback):** YES — when fallback is on, URL is persisted on the content row.
- **Server console:** `[IMG] Dev fallback — returning placeholder for: <content_id>` on explicit dev fallback; implicit no-backend path still logs `[imageService] Dev placeholder image (workflow continues)`.

## Part 2: Regenerate Endpoint

- **Endpoint:** EXISTS — `POST /api/marketing/content/:id/regenerate-image` (see `server/src/routes/marketing/content.ts`), delegates to `regenerateImageForContent`.
- **Curl test:** Run locally with auth (Bearer or cookie). Body: `{ "image_prompt": "…" }` (min 10 chars). Optional: `style_preset` or `style` (alias).
- **Frontend:** `marketingAPI.regenerateContentImage` → `ContentDetailPanel` “Regenerate image” flow — already wired.

## Part 3: Instagram Preview

- **`InstagramPreview`:** Renders in cockpit `ContentDetailPanel` when `channel === 'instagram'`.
- **Content API:** `image_url` / `image_prompt` mapped in DAL and `ContentItem` in `marketingApi.ts`.
- **Placeholder:** Empty `imageUrl` shows prompt text or a short “No image” message.

## Part 4: Browser Tests (developer)

| Test | Status |
|------|--------|
| A — LinkedIn lifecycle | NOT_YET_RUN |
| B — Instagram + image | NOT_YET_RUN |
| C — Rejection | NOT_YET_RUN |
| D — Campaign analysis (no new content) | NOT_YET_RUN |
| E — Navigation / tabs | NOT_YET_RUN |

Run the checklist in `Downloads/CURSOR_SPRINT_3.md` (Part 4) after `IMAGE_GEN_DEV_FALLBACK=true` and server restart.

## Files changed

- `server/src/services/marketing/publishing/imageService.ts` — dev fallback first, `buildDevPlaceholderImageUrl`, dynamic placeholders
- `server/src/routes/marketing/content.ts` — min 10 char prompt; `style` alias; `success: false` on validation errors
- `server/src/__tests__/modules/marketing/imageService.test.ts` — dev fallback test
- `server/.env.example` — Sprint 3 env docs
- `server/.env` — `IMAGE_GEN_DEV_FALLBACK=true` (local dev)
- `client/src/pages/marketing/components/cockpit/InstagramPreview.tsx` — empty-state copy

## TypeScript

- Server: PASS  
- Client: PASS  

## Issues / deferred

- **Part 4** is manual browser verification only.
- Remove or set `IMAGE_GEN_DEV_FALLBACK=false` when using real LiteLLM/Gemini/OpenAI image backends.

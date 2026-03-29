# Change a Fal model safely (Lucy / marketing)

Use this checklist whenever you bump `FAL_*` model ids or change Fal subscribe inputs.

## 1. Schema preflight (MCP)

1. Run Fal MCP **`search_fal`** for the target model id (or open the model’s API page on fal.ai).
2. Confirm **required** and **optional** input fields, defaults, and **response shape** (`images` vs `image`, nested `output`).
3. Note limits: `prompt` length, `negative_prompt` length, `output_format` enum, safety field name (`safety_tolerance` vs `enable_safety_checker`).

## 2. Env (staging first)

1. Update `server/.env` (staging): set the relevant `FAL_*` variable from the [model matrix](./fal-model-matrix.md).
2. Cross-check `server/.env.example` comments if you add a new variable.

## 3. Automated tests

```bash
cd server && npm run test:agents -- --run src/__tests__/modules/marketing/falImageGeneration.test.ts src/__tests__/modules/marketing/falKontextEdit.test.ts
```

```bash
cd server && npm run type-check
```

## 4. Manual smoke (staging)

- **Instagram T2I**: Command Center Instagram content → generate / regenerate (expect `instagram_feed` path / Instagram model).
- **Kontext**: Upload reference → AI photo edit (`FAL_IMAGE_EDIT_MODEL`).
- **Paper-plane overlay**: `POST /api/marketing/overlay-assets/generate` with `effect: paper_plane` (transparent PNG path when `overlay_paper_plane` is used).

## 5. Deploy

1. Merge after green CI and smoke.
2. Production env: same `FAL_*` updates; watch server logs for `[falImageGeneration]`, `[falKontext]`, and `[falUsage]` lines.

## Upgrade `@fal-ai/client`

1. Pin a tested version in `server/package.json` (exact version recommended after validation).
2. Re-run tests above; Fal may change `subscribe` result shapes — adjust `extractFalResultImageUrl` / telemetry if needed.
3. Repeat manual smoke.

See also: [fal-model-matrix.md](./fal-model-matrix.md).

## Cost / observability

On successful Fal text-to-image, the server logs `[falUsage]` with `org_id`, `content_id`, `model`, `buffer_bytes`, and `overlay_paper_plane`. Point your log aggregator at these lines for per-org estimates, or use Fal’s dashboard for authoritative billing.

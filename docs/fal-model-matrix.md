# Fal model matrix (Lucy / marketing)

Source of truth for **parameter shapes** is Fal’s OpenAPI for each model. Before changing env or code, run the Fal MCP **`search_fal`** (or open `https://fal.ai/models/<model-id>/api`) and confirm required inputs, defaults, and response fields (`images[]` vs `image`, URL shape).

## Environment variables → model id

| Env | When used | Default / notes |
|-----|-----------|-----------------|
| `FAL_IMAGE_MODEL` | Generic T2I (`generateImage` default path) | `fal-ai/flux/dev` — legacy Flux Dev: `enable_safety_checker`, PNG unless Instagram/email/Pro-style model forces JPEG |
| `FAL_EMAIL_IMAGE_MODEL` | `email_campaign: true` | Falls back to `FAL_IMAGE_MODEL` if unset |
| `FAL_INSTAGRAM_IMAGE_MODEL` | `instagram_feed: true` | If unset, code uses `fal-ai/flux-pro/v1.1` |
| `FAL_OVERLAY_IMAGE_MODEL` | `overlay_paper_plane: true` (paper-plane VA2 overlays) | If unset, uses `FAL_IMAGE_MODEL` / default — prefer a model that supports **PNG with alpha** for transparent overlays |
| `FAL_IMAGE_EDIT_MODEL` | Kontext (`editMarketingPhoto`, `callFalKontextImageEdit`) | Default `fal-ai/flux-pro/kontext` |

## Request / response conventions (this repo)

| Flow | Subscribe input highlights | Result URL extraction |
|------|---------------------------|------------------------|
| T2I Flux Dev | `enable_safety_checker: true`, `output_format` png or jpeg per context | `extractFalResultImageUrl` on `result.data` |
| T2I Flux Pro / Flux 2–style | `safety_tolerance: '2'`, no `enable_safety_checker` | Same helper |
| Kontext | `image_url`, `prompt`, `output_format`, `safety_tolerance`, optional `aspect_ratio`, `num_inference_steps` | `images[0].url` or `image.url` via `extractFalResultImageUrl` |

## Negative prompt limits

- Merged negative from `mergeFalNegativePromptForRequest` is capped at **4000** characters total.
- The value passed into Flux subscribe input as `negative_prompt` is capped at **2000** characters (`buildFluxFalSubscribeInput`).

## Pointers

- Implementation: `server/src/services/marketing/publishing/imageService/falImageGeneration.ts`, `falKontextEdit.ts`
- Env samples: `server/.env.example` (Fal section)
- Safe change process: `docs/fal-model-change-runbook.md`

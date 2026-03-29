/**
 * User reference photo → Fal edit (default: FLUX Kontext; optional: Flux img2img via INSTAGRAM_REFERENCE_EDIT_BACKEND) → Supabase public URL.
 */
import type { ImageGenerationMetadata, ImageGenerationResult } from '../../../../dal/marketing/instagramTypes.js';
import { callFalKontextImageEdit, isRetryableFalKontextError } from './falKontextEdit.js';
import { callFalFluxImageToImageEdit } from './falFluxI2iEdit.js';
import { flattenKontextToOpaqueJpeg } from './kontextRasterNormalize.js';
import { buildAdditivePhotoEditPrompt } from './photoEditPrompt.js';
import { normalizeReferenceImageUrlForDownload, prepareReferenceImageDataUriForFal } from './falReferenceImage.js';
import { buildStorageKey, uploadToStorage } from './storage.js';
import { validateRasterImageBuffer } from './validation.js';

export interface EditMarketingPhotoInput {
  org_id: string;
  content_id: string;
  /** Public HTTPS URL (e.g. after upload to Supabase). */
  reference_image_url: string;
  /** Raw user or strategist instruction (layered with {@link buildAdditivePhotoEditPrompt}). */
  edit_instruction: string;
  /** Marketing style preset (e.g. photoreal) — extra prompt lines for Kontext. */
  style_preset?: string;
}

/** HTTPS, or http://localhost / 127.0.0.1 for local dev reference URLs. */
function isAllowedReferenceDownloadUrl(s: string): boolean {
  try {
    const u = new URL(s);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:') {
      const h = u.hostname.toLowerCase();
      return h === 'localhost' || h === '127.0.0.1';
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Kontext (default) vs Flux img2img — same FAL_KEY; img2img aligns with raw Flux Instagram T2I when you need it.
 * Set INSTAGRAM_REFERENCE_EDIT_BACKEND=flux_i2i
 */
function isFluxI2iReferenceEditBackend(): boolean {
  const v = process.env.INSTAGRAM_REFERENCE_EDIT_BACKEND?.trim().toLowerCase();
  return v === 'flux_i2i' || v === 'flux-image-to-image';
}

/**
 * Runs Kontext on a user-uploaded photo and uploads the composite to marketing storage.
 */
export async function editMarketingPhotoWithKontext(
  input: EditMarketingPhotoInput,
): Promise<ImageGenerationResult> {
  const startMs = Date.now();
  const refRaw = input.reference_image_url.trim();
  const ref = normalizeReferenceImageUrlForDownload(refRaw);
  const stylePreset = input.style_preset?.trim() || 'photoreal';

  const emptyMeta = (duration: number): ImageGenerationMetadata => ({
    model: 'fal/kontext',
    resolution: '1024x1024',
    retries: 0,
    generated_at: new Date().toISOString(),
    duration_ms: duration,
  });

  if (!ref || !isAllowedReferenceDownloadUrl(ref)) {
    return {
      success: false,
      image_url: null,
      storage_key: null,
      metadata: emptyMeta(Date.now() - startMs),
      error: 'reference_image_url must be HTTPS (or http://localhost in dev)',
    };
  }

  const prompt = buildAdditivePhotoEditPrompt(input.edit_instruction, { style_preset: stylePreset });
  if (prompt.length < 8) {
    return {
      success: false,
      image_url: null,
      storage_key: null,
      metadata: emptyMeta(Date.now() - startMs),
      error: 'Edit instruction is too short',
    };
  }

  let prepared: Awaited<ReturnType<typeof prepareReferenceImageDataUriForFal>>;
  try {
    prepared = await prepareReferenceImageDataUriForFal(ref);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[editMarketingPhoto] reference_prepare_failed', { content_id: input.content_id, message });
    return {
      success: false,
      image_url: null,
      storage_key: null,
      metadata: emptyMeta(Date.now() - startMs),
      error: message,
    };
  }

  try {
    const useI2i = isFluxI2iReferenceEditBackend();
    const { buffer: rawBuffer, modelLabel, kontext_aspect_ratio, enhance_prompt, falRequestId } = useI2i
      ? await (async () => {
          const r = await callFalFluxImageToImageEdit(prepared, prompt);
          return {
            buffer: r.buffer,
            modelLabel: r.modelLabel,
            kontext_aspect_ratio: 'n/a',
            enhance_prompt: false,
            falRequestId: r.falRequestId,
          };
        })()
      : await callFalKontextImageEdit(ref, prompt, { prepared });

    console.log('[editMarketingPhoto] fal_reference_edit', {
      content_id: input.content_id,
      style_preset: stylePreset,
      backend: useI2i ? 'flux_i2i' : 'kontext',
      kontext_aspect_ratio,
      enhance_prompt,
    });

    const rasterCheck = validateRasterImageBuffer(rawBuffer);
    if (!rasterCheck.ok) {
      return {
        success: false,
        image_url: null,
        storage_key: null,
        metadata: emptyMeta(Date.now() - startMs),
        error: rasterCheck.reason,
      };
    }

    /** Opaque JPEG avoids transparent PNG reading as “black” on dark UI; Fal may still return PNG. */
    const buffer = await flattenKontextToOpaqueJpeg(rawBuffer);
    const postCheck = validateRasterImageBuffer(buffer);
    if (!postCheck.ok) {
      return {
        success: false,
        image_url: null,
        storage_key: null,
        metadata: emptyMeta(Date.now() - startMs),
        error: postCheck.reason,
      };
    }

    const isJpeg = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8;
    const storageKey = buildStorageKey(input.org_id, input.content_id, isJpeg ? 'jpg' : 'png');
    let publicUrl: string;
    try {
      publicUrl = await uploadToStorage(buffer, storageKey, isJpeg ? 'image/jpeg' : 'image/png');
    } catch (uploadErr) {
      const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
      console.error('[editMarketingPhoto] Storage upload failed', { content_id: input.content_id, message: msg });
      return {
        success: false,
        image_url: null,
        storage_key: null,
        metadata: emptyMeta(Date.now() - startMs),
        error: `Storage upload failed: ${msg}`,
      };
    }

    const metadata: ImageGenerationMetadata = {
      model: modelLabel,
      resolution: '1024x1024',
      retries: 0,
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - startMs,
      storage_key: storageKey,
      image_backend: 'fal',
      ...(falRequestId ? { fal_request_id: falRequestId } : {}),
      edit_mode: useI2i ? 'flux_image_to_image' : 'flux_kontext',
      reference_image_url: refRaw,
      ...(useI2i
        ? {}
        : {
            kontext_aspect_ratio,
            kontext_enhance_prompt: enhance_prompt,
            kontext_style_preset: stylePreset,
          }),
    };

    return {
      success: true,
      image_url: publicUrl,
      storage_key: storageKey,
      metadata,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[editMarketingPhoto] Fal reference edit failed', { content_id: input.content_id, message });
    const friendly =
      isRetryableFalKontextError(message) || /Gateway Timeout/i.test(message)
        ? `${message}. Try again in a moment, or use a shorter edit instruction.`
        : message;
    return {
      success: false,
      image_url: null,
      storage_key: null,
      metadata: emptyMeta(Date.now() - startMs),
      error: friendly,
    };
  }
}

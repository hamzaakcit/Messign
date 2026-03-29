import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { generateImage } from '../../services/marketing/publishing/imageService.js';
import { inferMarketingImageErrorCode } from './marketingFalRouteErrors.js';

const router = Router();

const VALID_THEMES = [
  'executive', 'startup', 'luxury', 'minimal',
  'bold', 'nature', 'tech', 'warm',
] as const;
type ThemeName = (typeof VALID_THEMES)[number];

const THEME_PROMPTS: Record<ThemeName, string> = {
  executive:
    'Photorealistic 3D render of a paper airplane: crisp folded white paper, faint navy blue tint on wing edges, classic dart fold, slightly above-behind 45-degree view showing both wings and center crease, slight bank right, soft studio lighting, paper texture and fold shadows, fully transparent background, isolated subject only, no ground, no text',
  startup:
    'Photorealistic 3D render of a paper airplane: folded white paper, indigo-violet tinted edges, clean dart fold, above-behind 45-degree view, fold crease and wing panels visible, gentle bank right, cool blue studio lighting on folds, fully transparent background, isolated subject only, no ground, no text',
  luxury:
    'Photorealistic 3D render of a paper airplane: premium cream paper, gold foil accent on center fold, elegant dart shape, above-behind 45-degree view, elegant bank right, warm light with golden highlights on paper, fully transparent background, isolated subject only, no ground, no text',
  minimal:
    'Photorealistic 3D render of a paper airplane: pure white paper, minimal dart fold with sharp creases, above-behind 45-degree view, gentle turn right, soft diffused light and subtle underside shadow, fully transparent background, isolated subject only, no ground, no text',
  bold:
    'Photorealistic 3D render of a paper airplane: white paper, red-tinted wing tips and fold line, aggressive dart shape, above-behind 45-degree view, dynamic bank right, dramatic side lighting on folds, fully transparent background, isolated subject only, no ground, no text',
  nature:
    'Photorealistic 3D render of a paper airplane: off-white recycled paper, forest green tinted edges, classic dart fold, above-behind 45-degree view, bank right, natural daylight and paper grain, fully transparent background, isolated subject only, no ground, no text',
  tech:
    'Photorealistic 3D render of a paper airplane: white paper, subtle purple neon glow on fold edges, sleek dart, above-behind 45-degree view, bank right, dark studio with purple rim light, fully transparent background, isolated subject only, no ground, no text',
  warm:
    'Photorealistic 3D render of a paper airplane: warm cream paper, amber-orange tinted crease and wing edges, classic dart fold, above-behind 45-degree view, gentle bank right, golden hour warm light on texture, fully transparent background, isolated subject only, no ground, no text',
};

function isValidTheme(t: unknown): t is ThemeName {
  return typeof t === 'string' && VALID_THEMES.includes(t as ThemeName);
}

/**
 * Normalize optional brand hex for storage keys and prompt harmonization.
 */
function normalizeBrandHex(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  const m = t.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return undefined;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return h.toLowerCase();
}

function overlayStorageSuffix(brandHex: string | undefined): string {
  if (!brandHex) return '';
  return `-${brandHex}`;
}

function appendBrandHarmonizePrompt(base: string, brandHex: string | undefined): string {
  if (!brandHex) return base;
  return `${base} Harmonize subtle wing-edge and fold-line accents with brand color #${brandHex} (tint only — do not flood-fill).`;
}

/**
 * POST /overlay-assets/generate
 * Generate (or re-generate) an AI paper plane image for a given theme.
 */
router.post('/generate', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { theme, effect, skip_fal: skipFalBody, brand_primary_hex: brandBody } = req.body ?? {};
    const brandHex = normalizeBrandHex(brandBody);
    /**
     * Default false: use Fal (Flux) first when FAL_KEY is set — strong photorealistic output for overlays.
     * Set `skip_fal: true` to skip Fal and use Gemini/OpenAI first (default is Fal-first when FAL_KEY is set).
     */
    const skipFal = skipFalBody === true;

    if (effect !== 'paper_plane') {
      res.status(400).json({ error: 'Only paper_plane effect is supported' });
      return;
    }
    if (!isValidTheme(theme)) {
      res.status(400).json({ error: `Invalid theme. Must be one of: ${VALID_THEMES.join(', ')}` });
      return;
    }

    const user = req.reimbursementUser!;
    const orgId = req.organizationId ?? user.id;

    const result = await generateImage({
      org_id: orgId,
      content_id: `overlay-paper-plane-${theme}${overlayStorageSuffix(brandHex)}`,
      prompt: appendBrandHarmonizePrompt(THEME_PROMPTS[theme], brandHex),
      resolution: '1024x1024',
      overlay_paper_plane: true,
      ...(skipFal ? { skip_fal: true } : {}),
    });

    if (!result.success || !result.image_url) {
      const errMsg = result.error ?? 'Image generation failed';
      res.status(502).json({
        success: false,
        error: errMsg,
        error_code: inferMarketingImageErrorCode(errMsg),
        theme,
        image_url: null,
        cached: false,
      });
      return;
    }

    res.json({
      success: true,
      image_url: result.image_url,
      theme,
      cached: false,
      metadata: result.metadata,
    });
  } catch (err) {
    console.error('[overlayAssets] POST /generate error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: msg.slice(0, 500),
      error_code: inferMarketingImageErrorCode(msg),
    });
  }
});

/**
 * GET /:theme/paper-plane
 * Return the cached Supabase CDN URL for a theme's paper plane, or 404.
 */
router.get('/:theme/paper-plane', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { theme } = req.params;
    if (!isValidTheme(theme)) {
      res.status(400).json({ error: 'Invalid theme' });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const bucket = process.env.MARKETING_IMAGE_BUCKET?.trim() || 'marketing-images';

    if (!supabaseUrl) {
      res.status(404).json({ image_url: null });
      return;
    }

    const brandHex = normalizeBrandHex(
      typeof req.query?.brand_primary_hex === 'string' ? req.query.brand_primary_hex : undefined,
    );
    const orgId = req.organizationId ?? req.reimbursementUser?.id ?? 'shared';
    const storageKey = `${orgId}/instagram/overlay-paper-plane-${theme}${overlayStorageSuffix(brandHex)}`;
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${storageKey}`;

    try {
      const check = await fetch(publicUrl, { method: 'HEAD' });
      if (check.ok) {
        res.json({ image_url: publicUrl });
        return;
      }
    } catch {
      // storage check failed — treat as not cached
    }

    res.status(404).json({ image_url: null });
  } catch (err) {
    console.error('[overlayAssets] GET /:theme/paper-plane error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

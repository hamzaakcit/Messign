import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { generateImage } from '../../services/marketing/publishing/imageService.js';

const router = Router();

const VALID_THEMES = [
  'executive', 'startup', 'luxury', 'minimal',
  'bold', 'nature', 'tech', 'warm',
] as const;
type ThemeName = (typeof VALID_THEMES)[number];

const THEME_PROMPTS: Record<ThemeName, string> = {
  executive:
    'A 3D rendered paper airplane made from crisp folded white paper with a faint navy blue tint on the wing edges, classic dart fold shape, viewed from slightly above-behind at 45-degree angle showing both wing panels and the center crease, slight bank to the right, soft studio lighting revealing paper texture and fold shadows, transparent PNG background, 4K render quality, no ground, isolated paper plane only',
  startup:
    'A 3D rendered paper airplane made from folded white paper with subtle indigo-violet tinted edges, clean dart fold, viewed from slightly above-behind at 45-degree angle showing fold crease and wing panels, gentle banking to the right, modern studio lighting with cool blue tones highlighting paper folds, transparent PNG background, 4K render quality, no ground, isolated paper plane only',
  luxury:
    'A 3D rendered paper airplane made from premium cream-colored paper with gold foil accent along the center fold, elegant dart shape, viewed from slightly above-behind at 45-degree angle, elegant banking to the right, warm studio lighting with golden highlights on paper surface, transparent PNG background, 4K render quality, no ground, isolated paper plane only',
  minimal:
    'A 3D rendered paper airplane made from pure white paper, clean minimal dart fold with sharp creases, viewed from slightly above-behind at 45-degree angle, gentle turn to the right, soft diffused lighting showing subtle paper shadow on underside, transparent PNG background, 4K render quality, no ground, isolated paper plane only',
  bold:
    'A 3D rendered paper airplane made from white paper with red-tinted wing tips and fold line, sharp aggressive dart shape, viewed from slightly above-behind at 45-degree angle, dynamic banking to the right, dramatic side lighting with high contrast on paper folds, transparent PNG background, 4K render quality, no ground, isolated paper plane only',
  nature:
    'A 3D rendered paper airplane made from off-white recycled-looking paper with forest green tinted edges, classic dart fold, viewed from slightly above-behind at 45-degree angle, banking to the right, natural daylight showing paper grain texture, transparent PNG background, 4K render quality, no ground, isolated paper plane only',
  tech:
    'A 3D rendered paper airplane made from white paper with subtle purple neon glow along fold edges, sleek dart shape, viewed from slightly above-behind at 45-degree angle, banking to the right, dark studio with purple accent rim lighting on paper surfaces, transparent PNG background, 4K render quality, no ground, isolated paper plane only',
  warm:
    'A 3D rendered paper airplane made from warm cream paper with amber-orange tinted fold crease and wing edges, classic dart shape, viewed from slightly above-behind at 45-degree angle, gentle banking to the right, golden hour warm lighting on paper texture, transparent PNG background, 4K render quality, no ground, isolated paper plane only',
};

function isValidTheme(t: unknown): t is ThemeName {
  return typeof t === 'string' && VALID_THEMES.includes(t as ThemeName);
}

/**
 * POST /overlay-assets/generate
 * Generate (or re-generate) an AI paper plane image for a given theme.
 */
router.post('/generate', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { theme, effect } = req.body ?? {};

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
      content_id: `overlay-paper-plane-${theme}`,
      prompt: THEME_PROMPTS[theme],
      resolution: '1024x1024',
    });

    if (!result.success || !result.image_url) {
      res.status(502).json({
        error: result.error ?? 'Image generation failed',
        theme,
        image_url: null,
        cached: false,
      });
      return;
    }

    res.json({
      image_url: result.image_url,
      theme,
      cached: false,
    });
  } catch (err) {
    console.error('[overlayAssets] POST /generate error:', err);
    res.status(500).json({ error: 'Internal server error' });
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

    const orgId = req.organizationId ?? req.reimbursementUser?.id ?? 'shared';
    const storageKey = `${orgId}/instagram/overlay-paper-plane-${theme}`;
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

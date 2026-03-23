import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';
import { query } from '../../db/index.js';
import {
  createBrandProfile,
  getBrandProfile,
  listBrandProfiles,
  updateBrandProfile,
  deleteBrandProfile,
  setContentBrandProfile,
  getBrandProfileContentCounts,
} from '../../services/marketing/brandProfileService.js';

const router = Router();

// ── POST / — create brand profile ──

router.post(
  '/',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const ctx = buildCtx(req);
      const orgId = ctx.organizationId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization required' });
        return;
      }

      const { brand_name, brand_description, logo_url, tone_keywords, forbidden_words,
        required_disclaimers, voice_examples, style_guide_notes, color_palette,
        preferred_themes } = req.body || {};

      if (typeof brand_name !== 'string' || !brand_name.trim()) {
        res.status(400).json({ error: 'brand_name is required' });
        return;
      }

      const profile = await createBrandProfile({
        organizationId: orgId,
        brandName: brand_name,
        brandDescription: brand_description,
        logoUrl: logo_url,
        toneKeywords: tone_keywords,
        forbiddenWords: forbidden_words,
        requiredDisclaimers: required_disclaimers,
        voiceExamples: voice_examples,
        styleGuideNotes: style_guide_notes,
        colorPalette: color_palette,
        preferredThemes: preferred_themes,
        createdBy: ctx.userId,
      }, { query });

      res.status(201).json(profile);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('already exists')) {
        res.status(409).json({ error: message });
        return;
      }
      console.error('[brandProfileRoutes] POST / error:', err);
      res.status(500).json({ error: 'Failed to create brand profile' });
    }
  },
);

// ── GET / — list brand profiles ──

router.get(
  '/',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const ctx = buildCtx(req);
      const orgId = ctx.organizationId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization required' });
        return;
      }

      const includeInactive = req.query.include_inactive === 'true';
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
      const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

      const result = await listBrandProfiles(orgId, { includeInactive, limit, offset }, { query });
      res.json(result);
    } catch (err) {
      console.error('[brandProfileRoutes] GET / error:', err);
      res.status(500).json({ error: 'Failed to list brand profiles' });
    }
  },
);

// ── GET /stats — content counts per brand (must be before /:id) ──

router.get(
  '/stats',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const ctx = buildCtx(req);
      const orgId = ctx.organizationId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization required' });
        return;
      }

      const stats = await getBrandProfileContentCounts(orgId, { query });
      res.json({ stats });
    } catch (err) {
      console.error('[brandProfileRoutes] GET /stats error:', err);
      res.status(500).json({ error: 'Failed to get brand profile stats' });
    }
  },
);

// ── GET /:id — single brand profile ──

router.get(
  '/:id',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const profile = await getBrandProfile(req.params.id, { query });
      if (!profile) {
        res.status(404).json({ error: 'Brand profile not found' });
        return;
      }
      res.json(profile);
    } catch (err) {
      console.error('[brandProfileRoutes] GET /:id error:', err);
      res.status(500).json({ error: 'Failed to get brand profile' });
    }
  },
);

// ── PUT /:id — partial update ──

router.put(
  '/:id',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const { brand_name, brand_description, logo_url, tone_keywords, forbidden_words,
        required_disclaimers, voice_examples, style_guide_notes, color_palette,
        preferred_themes, active } = req.body || {};

      const profile = await updateBrandProfile(req.params.id, {
        brandName: brand_name,
        brandDescription: brand_description,
        logoUrl: logo_url,
        toneKeywords: tone_keywords,
        forbiddenWords: forbidden_words,
        requiredDisclaimers: required_disclaimers,
        voiceExamples: voice_examples,
        styleGuideNotes: style_guide_notes,
        colorPalette: color_palette,
        preferredThemes: preferred_themes,
        active,
      }, { query });

      if (!profile) {
        res.status(404).json({ error: 'Brand profile not found' });
        return;
      }
      res.json(profile);
    } catch (err) {
      console.error('[brandProfileRoutes] PUT /:id error:', err);
      res.status(500).json({ error: 'Failed to update brand profile' });
    }
  },
);

// ── DELETE /:id — soft-delete ──

router.delete(
  '/:id',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const deleted = await deleteBrandProfile(req.params.id, { query });
      if (!deleted) {
        res.status(404).json({ error: 'Brand profile not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[brandProfileRoutes] DELETE /:id error:', err);
      res.status(500).json({ error: 'Failed to delete brand profile' });
    }
  },
);

// ── POST /:id/associate — link content to brand profile ──

router.post(
  '/:id/associate',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const { content_id } = req.body || {};
      if (typeof content_id !== 'string' || !content_id.trim()) {
        res.status(400).json({ error: 'content_id is required' });
        return;
      }

      await setContentBrandProfile(content_id, req.params.id, { query });
      res.json({ success: true });
    } catch (err) {
      console.error('[brandProfileRoutes] POST /:id/associate error:', err);
      res.status(500).json({ error: 'Failed to associate brand profile' });
    }
  },
);

export default router;

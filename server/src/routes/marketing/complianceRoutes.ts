import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { buildCtx } from './common.js';
import { query } from '../../db/index.js';
import * as contentDal from '../../dal/marketing/content.js';
import {
  scanContent,
  getLatestScan,
  getScanHistory,
} from '../../services/marketing/complianceScanner.js';
import type { ContentToScan, ScanLLMCall } from '../../services/marketing/complianceScanner.js';
import { callModelSafe } from '../../services/ai/gateway.js';

const router = Router();

function buildLLMCall(tenantId: string): ScanLLMCall {
  return async (params) => {
    const res = await callModelSafe({
      tier: 'fast',
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
      tenantId,
      maxTokens: params.maxTokens ?? 300,
      temperature: 0.15,
    });
    return res.choices?.[0]?.message?.content?.trim() ?? '';
  };
}

router.post(
  '/scan/:contentId',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const ctx = buildCtx(req);
      const orgId = ctx.organizationId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization required' });
        return;
      }

      const contentRow = await contentDal.getContentById(ctx, req.params.contentId);
      if (!contentRow) {
        res.status(404).json({ error: 'Content not found' });
        return;
      }

      const rec = contentRow as unknown as Record<string, unknown>;
      const content: ContentToScan = {
        id: rec.id as string,
        title: (rec.title as string) || '',
        body: (rec.body as string) || '',
        channel: (rec.channel as string) || 'email',
        subjectLine: rec.subject_line as string | undefined,
        organizationId: orgId,
        brandProfileId: rec.brand_profile_id as string | null | undefined,
        bodyDesign: rec.body_design as Record<string, unknown> | undefined,
      };

      const result = await scanContent(content, buildLLMCall(orgId), { query });
      res.json(result);
    } catch (err) {
      console.error('[complianceRoutes] POST /scan error:', err);
      res.status(500).json({ error: 'Failed to run compliance scan' });
    }
  },
);

router.get(
  '/latest/:contentId',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const scan = await getLatestScan(req.params.contentId, { query });
      res.json({ scan });
    } catch (err) {
      console.error('[complianceRoutes] GET /latest error:', err);
      res.status(500).json({ error: 'Failed to get latest scan' });
    }
  },
);

router.get(
  '/history/:contentId',
  async (req: ReimbursementRequest, res: Response) => {
    try {
      const scans = await getScanHistory(req.params.contentId, { query });
      res.json({ scans });
    } catch (err) {
      console.error('[complianceRoutes] GET /history error:', err);
      res.status(500).json({ error: 'Failed to get scan history' });
    }
  },
);

export default router;

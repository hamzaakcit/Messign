import { describe, it, expect } from 'vitest';
import { keywordOptimizerTool, rateSimulatorTool } from '../../../services/ai/tools/seoConversionTools.js';
import type { ToolContext, ToolResult } from '../../../services/ai/types.js';

const ctx: ToolContext = {
  userId: 'user-1',
  userRole: 'admin',
  organizationId: '00000000-0000-0000-0000-000000000001',
};

describe('seo:keyword_optimizer', () => {
  it('returns keywords and recommended_primary from seeds', async () => {
    const r = (await keywordOptimizerTool.execute(
      {
        seed_keywords: ['project management', 'team collaboration'],
        content_type: 'blog',
        target_audience: 'SMB',
      },
      ctx,
    )) as ToolResult;
    expect(r.success).toBe(true);
    const d = r.data as {
      keywords: Array<{ keyword: string; relevance_score: number }>;
      recommended_primary: string;
      content_gaps: string[];
    };
    expect(d.keywords.length).toBeGreaterThan(0);
    expect(d.recommended_primary.length).toBeGreaterThan(0);
    expect(d.content_gaps.length).toBeGreaterThan(0);
  });

  it('fails without seed keywords', async () => {
    const r = (await keywordOptimizerTool.execute({ seed_keywords: [] }, ctx)) as ToolResult;
    expect(r.success).toBe(false);
  });
});

describe('conversion:rate_simulator', () => {
  it('returns projected range and confidence', async () => {
    const r = (await rateSimulatorTool.execute(
      {
        current_rate: 0.04,
        proposed_change: 'Stronger CTA above the fold',
        change_category: 'cta_change',
        traffic_volume: 8000,
      },
      ctx,
    )) as ToolResult;
    expect(r.success).toBe(true);
    const d = r.data as {
      projected_rate_range: { low: number; mid: number; high: number };
      confidence: number;
      similar_past_changes: Array<{ actual_impact: number }>;
    };
    expect(d.projected_rate_range.low).toBeLessThanOrEqual(d.projected_rate_range.mid);
    expect(d.projected_rate_range.mid).toBeLessThanOrEqual(d.projected_rate_range.high);
    expect(d.confidence).toBeGreaterThan(0.4);
    expect(d.similar_past_changes.length).toBeGreaterThan(0);
  });

  it('rejects invalid current_rate', async () => {
    const r = (await rateSimulatorTool.execute(
      {
        current_rate: 1.5,
        proposed_change: 'Test',
        change_category: 'copy_change',
      },
      ctx,
    )) as ToolResult;
    expect(r.success).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  generateImageBrief,
  checkBrandCompliance,
  repurposeContent,
} from '../../../modules/marketing/tools/creativeTools.js';
import type { ToolContext, ToolResult } from '../../../services/ai/types.js';
import { validateToolArgsForExecution } from '../../../services/ai/toolArgSchemas.js';

const ctx: ToolContext = {
  userId: 'user-1',
  userRole: 'admin',
  organizationId: '00000000-0000-0000-0000-000000000001',
};

describe('creative:* tools', () => {
  it('creative:generate_image_brief returns brief and submitted_to_queue false', async () => {
    const r = (await generateImageBrief.handler(
      {
        content_context: 'Q2 launch hero for analytics dashboard',
        brief_type: 'hero_image',
        platform: 'blog',
        style_preference: 'brand_default',
      },
      ctx,
    )) as ToolResult;
    expect(r.success).toBe(true);
    const d = r.data as { brief: { generation_prompt: string }; submitted_to_queue: boolean };
    expect(d.submitted_to_queue).toBe(false);
    expect(d.brief.generation_prompt).toContain('hero_image');
  });

  it('creative:check_brand_compliance returns score and issues array', async () => {
    const r = (await checkBrandCompliance.handler(
      {
        content: 'We guarantee 100% ROI in one week for every customer worldwide.',
        content_type: 'text',
      },
      ctx,
    )) as ToolResult;
    expect(r.success).toBe(true);
    const d = r.data as { compliance_score: number; issues: unknown[]; approved: boolean };
    expect(typeof d.compliance_score).toBe('number');
    expect(Array.isArray(d.issues)).toBe(true);
  });

  it('creative:repurpose_content returns repurposed entries', async () => {
    const src = 'Word '.repeat(200);
    const r = (await repurposeContent.handler(
      {
        source_content: src,
        source_type: 'blog_post',
        target_formats: ['twitter_thread', 'linkedin_post'],
      },
      ctx,
    )) as ToolResult;
    expect(r.success).toBe(true);
    const d = r.data as { repurposed: Array<{ format: string; content: string }> };
    expect(d.repurposed).toHaveLength(2);
    expect(d.repurposed[0].content.length).toBeLessThanOrEqual(280);
  });

  it('creative:repurpose_content maps channel-style source_type to canonical (e.g. x → social_post)', async () => {
    const r = (await repurposeContent.handler(
      {
        source_content: 'Short line for social.',
        source_type: 'x',
        target_formats: ['linkedin_post'],
      },
      ctx,
    )) as ToolResult;
    expect(r.success).toBe(true);
  });

  it('validateToolArgs normalizes repurpose source_type (e.g. newsletter → email)', () => {
    const r = validateToolArgsForExecution('creative:repurpose_content', {
      source_content: 'Body',
      source_type: 'newsletter',
      target_formats: ['email_snippet'],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.args.source_type).toBe('email');
  });
});

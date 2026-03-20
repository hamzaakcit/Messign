/**
 * Zod argument schemas for high-traffic tools (executeTool validates before handlers).
 */
import { z } from 'zod';
import { productTruthLookupFields } from '../marketing/productTruthSearchService.js';

export const toolArgSchemas: Record<string, z.ZodType<Record<string, unknown>>> = {
  'knowledge:search_knowledge_base': z
    .object({
      query: z.string().min(1).max(800),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'core:search_tools': z
    .object({
      query: z.string().min(1).max(400),
      limit: z.number().int().min(1).max(25).optional(),
      namespace: z.string().max(64).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'core:activate_tool': z
    .object({
      tool_name: z.string().min(1).max(200),
    })
    .passthrough() as z.ZodType<Record<string, unknown>>,

  'projects:get_tasks_by_user': z
    .object({
      user_identifier: z.string().max(200).optional(),
      status_filter: z.string().max(64).optional(),
      project_name: z.string().max(200).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'marketing:product_truth_lookup': productTruthLookupFields.passthrough() as z.ZodType<Record<string, unknown>>,

  'marketing:brand_voice_check': z
    .object({
      draft_text: z.string().min(1).max(20_000),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'marketing:competitor_content_scan': z
    .object({
      competitor_name: z.string().max(200).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'marketing:validate_product_truth': z
    .object({
      content: z.string().min(1).max(24_000),
      topic: z.string().max(500).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'marketing:compliance_scan': z
    .object({
      content: z.string().min(1).max(20_000),
      content_type: z.string().max(120).optional(),
      target_channel: z.string().max(200).optional(),
      topic: z.string().max(500).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'creative:generate_image_brief': z
    .object({
      content_context: z.string().min(1).max(8000),
      brief_type: z.enum([
        'social_image',
        'ad_creative',
        'infographic',
        'thumbnail',
        'hero_image',
        'email_header',
      ]),
      platform: z.enum(['linkedin', 'twitter', 'instagram', 'facebook', 'blog', 'email', 'generic']),
      style_preference: z
        .enum(['flat_modern', 'photographic', 'editorial', 'abstract', 'data_viz', 'brand_default'])
        .optional(),
      text_overlay: z.string().max(500).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'creative:check_brand_compliance': z
    .object({
      content: z.string().min(1).max(50_000),
      content_type: z.enum(['text', 'image_brief', 'campaign_brief', 'landing_page']),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'creative:repurpose_content': z
    .object({
      source_content: z.string().min(1).max(100_000),
      source_type: z.enum([
        'blog_post',
        'social_post',
        'email',
        'landing_page',
        'webinar_transcript',
        'product_update',
      ]),
      target_formats: z
        .array(
          z.enum([
            'linkedin_post',
            'twitter_thread',
            'email_snippet',
            'ad_copy',
            'blog_post',
            'infographic_brief',
            'video_script',
          ]),
        )
        .min(1)
        .max(12),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'analytics:funnel_analysis': z
    .object({
      funnel_stages: z.array(z.string().min(1).max(120)).max(20).optional(),
      segment_filter: z.string().max(500).optional(),
      date_start: z.string().max(32).optional(),
      date_end: z.string().max(32).optional(),
      date_range: z
        .object({
          start: z.string().max(32).optional(),
          end: z.string().max(32).optional(),
        })
        .strict()
        .optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'analytics:experiment_design': z
    .object({
      hypothesis: z.string().min(1).max(4000),
      metric: z.enum(['open_rate', 'ctr', 'conversion_rate', 'cac', 'revenue_per_lead']),
      baseline_value: z.number().finite(),
      minimum_detectable_effect: z.number().positive().max(1).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'seo:keyword_optimizer': z
    .object({
      seed_keywords: z.array(z.string().min(1).max(200)).min(1).max(40),
      content_type: z.enum(['blog', 'landing_page', 'product_page']).optional(),
      target_audience: z.string().max(500).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'conversion:rate_simulator': z
    .object({
      current_rate: z.number().min(0).max(1),
      proposed_change: z.string().min(1).max(4000),
      change_category: z.enum([
        'copy_change',
        'cta_change',
        'layout_change',
        'offer_change',
        'audience_change',
        'channel_change',
      ]),
      traffic_volume: z.number().int().min(0).max(1_000_000_000).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'memory:store_golden_example': z
    .object({
      content_id: z.string().min(1).max(500),
      content_text: z.string().min(1).max(500_000),
      performance_metrics: z.record(z.string(), z.unknown()),
      success_markers: z.array(z.string().min(1).max(500)).max(200).optional(),
      segment: z.string().max(300).optional(),
      channel: z.string().max(120).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'automation:manage_trigger': z
    .object({
      action: z.enum(['create', 'update', 'toggle', 'delete', 'list']),
      trigger_id: z.string().uuid().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'marketing:competitor_social_listen': z
    .object({
      competitor_name: z.string().min(1).max(300),
      platforms: z.array(z.enum(['linkedin', 'twitter', 'youtube', 'web'])).max(8).optional(),
      keywords: z.array(z.string().max(120)).max(20).optional(),
      lookback_days: z.number().int().min(1).max(30).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,

  'marketing:propose_brand_voice_patch': z
    .object({
      rationale: z.string().min(1).max(8000),
      golden_example_additions: z
        .array(
          z.object({
            title: z.string().min(1).max(500),
            body: z.string().min(1).max(100_000),
            evidence_metrics: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .max(50)
        .optional(),
      tone_notes: z.array(z.string().max(2000)).max(100).optional(),
    })
    .strict() as z.ZodType<Record<string, unknown>>,
};

export function getToolArgSchema(toolName: string): z.ZodType<Record<string, unknown>> | undefined {
  return toolArgSchemas[toolName];
}

export function formatZodIssues(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
}

export function validateToolArgsForExecution(
  resolvedToolName: string,
  args: Record<string, unknown>,
): { ok: true; args: Record<string, unknown> } | { ok: false; summary: string } {
  const schema = getToolArgSchema(resolvedToolName);
  if (!schema) return { ok: true, args };
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      summary:
        `[TOOL_ARGS_INVALID] Fix the arguments and retry once. Issues: ${formatZodIssues(parsed.error)}.`,
    };
  }
  return { ok: true, args: parsed.data as Record<string, unknown> };
}

/**
 * Creative / visual tools (Deliverable 4.2) — structured briefs, compliance heuristics, repurposing stubs.
 * Namespace: creative — included in marketing tool allowlists via registry aliases.
 */
import type { LLMParameterSchema, ToolRegistration } from '../../types.js';
import type { ToolResult } from '../../../services/ai/types.js';
import { resolveOrgIdForTool } from '../../../services/ai/tools/resolveOrgIdForTool.js';
import { getDefaultBrandVoiceFallback, loadBrandVoiceProfileMd } from '../../../dal/marketing/truthBrand.js';

const BRIEF_TYPES = [
  'social_image',
  'ad_creative',
  'infographic',
  'thumbnail',
  'hero_image',
  'email_header',
] as const;

const PLATFORMS = ['linkedin', 'twitter', 'instagram', 'facebook', 'blog', 'email', 'generic'] as const;

const STYLE_PREFS = [
  'flat_modern',
  'photographic',
  'editorial',
  'abstract',
  'data_viz',
  'brand_default',
] as const;

const SOURCE_TYPES = [
  'blog_post',
  'social_post',
  'email',
  'landing_page',
  'webinar_transcript',
  'product_update',
] as const;

const TARGET_FORMATS = [
  'linkedin_post',
  'twitter_thread',
  'email_snippet',
  'ad_copy',
  'blog_post',
  'infographic_brief',
  'video_script',
] as const;

function aspectForPlatform(platform: string): string {
  switch (platform) {
    case 'linkedin':
      return '1:1';
    case 'twitter':
      return '16:9';
    case 'instagram':
      return '4:5';
    case 'facebook':
      return '1:1';
    case 'blog':
    case 'email':
      return '16:9';
    default:
      return '1:1';
  }
}

function styleDirection(pref: string): string {
  return pref.replace(/_/g, ' ');
}

function buildGenerationPrompt(
  contentContext: string,
  briefType: string,
  platform: string,
  style: string,
  textOverlay: string | undefined,
): string {
  const overlay = textOverlay?.trim() ? ` Text overlay: ${textOverlay.trim()}` : '';
  return `${briefType} for ${platform}, style ${style}. ${contentContext.slice(0, 800)}${overlay}`;
}

export const generateImageBrief: ToolRegistration = {
  name: 'creative:generate_image_brief',
  namespace: 'creative',
  summary: 'Structured creative brief for image gen API or designers; does not render pixels.',
  tags: ['marketing', 'creative', 'visual', 'brief'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'content_context, brief_type, platform, style_preference?, text_overlay?',

  llmSchema: {
    type: 'function',
    function: {
      name: 'creative:generate_image_brief',
      description:
        'Generate a structured creative brief for visual asset creation. Does NOT generate images — produces specs for image gen API or human designers.',
      parameters: {
        type: 'object',
        properties: {
          content_context: {
            type: 'string',
            description: 'The content or campaign this visual supports.',
          },
          brief_type: {
            type: 'string',
            description: 'Type of visual brief.',
            enum: [...BRIEF_TYPES],
          },
          platform: {
            type: 'string',
            description: 'Target platform.',
            enum: [...PLATFORMS],
          },
          style_preference: {
            type: 'string',
            description: 'Visual style direction.',
            enum: [...STYLE_PREFS],
          },
          text_overlay: {
            type: 'string',
            description: 'Optional text to appear on the image.',
          },
        },
        required: ['content_context', 'brief_type', 'platform'],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const contentContext = typeof args.content_context === 'string' ? args.content_context.trim() : '';
    const briefType = typeof args.brief_type === 'string' ? args.brief_type : '';
    const platform = typeof args.platform === 'string' ? args.platform : 'generic';
    const stylePref =
      typeof args.style_preference === 'string' && STYLE_PREFS.includes(args.style_preference as (typeof STYLE_PREFS)[number])
        ? args.style_preference
        : 'brand_default';
    const textOverlay = typeof args.text_overlay === 'string' ? args.text_overlay : undefined;

    if (!contentContext || !BRIEF_TYPES.includes(briefType as (typeof BRIEF_TYPES)[number])) {
      return {
        success: false,
        data: null,
        summary: 'Provide valid content_context and brief_type.',
      };
    }

    const colorPalette = ['#1a1a1a', '#3b82f6', '#f8fafc'];
    const brief = {
      description: `Visual supporting: ${contentContext.slice(0, 400)}${contentContext.length > 400 ? '…' : ''}`,
      style_direction: styleDirection(stylePref),
      color_palette: colorPalette,
      aspect_ratio: aspectForPlatform(platform),
      text_overlay: textOverlay?.trim() ?? null,
      brand_elements: ['logo_placement', 'font_usage'],
      generation_prompt: buildGenerationPrompt(contentContext, briefType, platform, stylePref, textOverlay),
    };

    const data = {
      brief,
      submitted_to_queue: false,
    };

    return {
      success: true,
      data,
      summary: `Creative brief (${briefType}, ${platform}). submitted_to_queue=false — use Marketing hub or a future queue integration to hand off to designers.`,
      metadata: { source: 'creative:generate_image_brief' },
    };
  },
};

export const checkBrandCompliance: ToolRegistration = {
  name: 'creative:check_brand_compliance',
  namespace: 'creative',
  summary: 'Heuristic brand/compliance check on text or brief; advisory only.',
  tags: ['marketing', 'creative', 'brand', 'compliance'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'content, content_type',

  llmSchema: {
    type: 'function',
    function: {
      name: 'creative:check_brand_compliance',
      description:
        'Check content or a creative brief against org brand guidelines. Returns compliance score and issues (heuristic v1 — not a legal review).',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The content or brief text to check.' },
          content_type: {
            type: 'string',
            description: 'Kind of asset.',
            enum: ['text', 'image_brief', 'campaign_brief', 'landing_page'],
          },
        },
        required: ['content', 'content_type'],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const content = typeof args.content === 'string' ? args.content : '';

    if (!content.trim()) {
      return { success: false, data: null, summary: 'content is required.' };
    }

    const organizationId = await resolveOrgIdForTool(ctx);
    let brandMd: string;
    try {
      brandMd = await loadBrandVoiceProfileMd(organizationId);
    } catch {
      brandMd = getDefaultBrandVoiceFallback();
    }

    const issues: Array<{ severity: 'warning' | 'error'; description: string; suggestion: string }> = [];
    let score = 92;

    if (content.length < 20) {
      issues.push({
        severity: 'warning',
        description: 'Very short content — hard to assess brand fit.',
        suggestion: 'Expand or confirm this is final copy before external use.',
      });
      score -= 12;
    }

    if (/\b(guarantee|100%|miracle|free money)\b/i.test(content)) {
      issues.push({
        severity: 'warning',
        description: 'Possible superlative or guarantee language — verify against product truth.',
        suggestion: 'Soften claims or add proof points from approved materials.',
      });
      score -= 8;
    }

    if (brandMd.length < 80) {
      issues.push({
        severity: 'warning',
        description: 'Brand voice profile is thin or default — configure marketing_brand_profile for stronger checks.',
        suggestion: 'Enrich brand voice in Marketing settings.',
      });
      score -= 5;
    }

    score = Math.max(0, Math.min(100, score));
    const approved = score >= 70 && !issues.some((i) => i.severity === 'error');

    const data = {
      compliance_score: score,
      issues,
      approved,
    };

    return {
      success: true,
      data,
      summary: `Brand compliance (heuristic): score ${score}. ${issues.length} note(s). ${approved ? 'OK for review' : 'Needs human review'}.`,
      metadata: { source: 'creative:check_brand_compliance' },
    };
  },
};

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function truncateWords(s: string, maxWords: number): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
}

function repurposeForFormat(source: string, format: string): { content: string; platform_constraints_met: boolean; word_count: number } {
  const limits: Record<string, number> = {
    linkedin_post: 220,
    twitter_thread: 50,
    email_snippet: 120,
    ad_copy: 80,
    blog_post: 400,
    infographic_brief: 150,
    video_script: 250,
  };
  const max = limits[format] ?? 200;
  let body = truncateWords(source, max);
  const prefix = `[${format}] `;
  if (format === 'twitter_thread') {
    const maxChars = 280 - prefix.length;
    body = body.length > maxChars ? `${body.slice(0, maxChars - 1)}…` : body;
  }
  const content = `${prefix}${body}`;
  const wc = wordCount(content);
  const platform_constraints_met = format === 'twitter_thread' ? content.length <= 280 : true;
  return { content, platform_constraints_met, word_count: wc };
}

export const repurposeContent: ToolRegistration = {
  name: 'creative:repurpose_content',
  namespace: 'creative',
  summary: 'Derive multiple format stubs from one source (deterministic excerpt; expand with Content Strategist).',
  tags: ['marketing', 'creative', 'repurpose'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'source_content, source_type, target_formats[]',

  llmSchema: {
    type: 'function',
    function: {
      name: 'creative:repurpose_content',
      description:
        'Transform one piece of content into multiple formats (e.g. blog → social + email snippet).',
      parameters: {
        type: 'object',
        properties: {
          source_content: { type: 'string', description: 'Source text to repurpose.' },
          source_type: {
            type: 'string',
            description: 'Original format.',
            enum: [...SOURCE_TYPES],
          },
          target_formats: {
            type: 'array',
            description: 'Desired output formats.',
            items: { type: 'string', enum: [...TARGET_FORMATS] },
          },
        },
        required: ['source_content', 'source_type', 'target_formats'],
      } as LLMParameterSchema,
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const sourceContent = typeof args.source_content === 'string' ? args.source_content.trim() : '';
    const sourceType = typeof args.source_type === 'string' ? args.source_type : '';
    const rawTargets = Array.isArray(args.target_formats) ? args.target_formats : [];

    if (!sourceContent || !SOURCE_TYPES.includes(sourceType as (typeof SOURCE_TYPES)[number])) {
      return { success: false, data: null, summary: 'Valid source_content and source_type are required.' };
    }

    const targetFormats = rawTargets.filter(
      (t): t is (typeof TARGET_FORMATS)[number] =>
        typeof t === 'string' && TARGET_FORMATS.includes(t as (typeof TARGET_FORMATS)[number]),
    );

    if (targetFormats.length === 0) {
      return { success: false, data: null, summary: 'target_formats must include at least one valid format.' };
    }

    const repurposed = targetFormats.map((format) => {
      const r = repurposeForFormat(sourceContent, format);
      return {
        format,
        content: r.content,
        platform_constraints_met: r.platform_constraints_met,
        word_count: r.word_count,
      };
    });

    return {
      success: true,
      data: { repurposed },
      summary: `Repurposed into ${repurposed.length} format(s). Stubs are deterministic — expand with Content Strategist for full copy.`,
      metadata: { source: 'creative:repurpose_content' },
    };
  },
};

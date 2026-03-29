/**
 * Repurpose one marketing_content row into channel-specific variants (new rows + gatekeepers + approval).
 */
import type { CallerContext } from '../../../dal/types.js';
import * as contentDal from '../../../dal/marketing/content.js';
import { assignApproval } from '../../../controllers/marketingToolsController.js';
import { generateText } from '../gateway.js';
import { runProductTruthValidation } from './productTruthValidator.js';
import { runBrandVoiceCheck } from './brandVoiceChecker.js';
import { runComplianceScan } from './complianceScanner.js';
import { extractCaption, extractImagePrompt } from '../../../modules/marketing/prompts/instagramChannelSpec.js';
import { generateImage, enhanceImagePrompt } from '../../marketing/publishing/imageService.js';
import { runInstagramImageGeneration } from '../../marketing/workflows/instagramImagePipeline.js';

const CHANNEL_RULES: Record<string, string> = {
  linkedin: `Convert to a LinkedIn post:
- Professional, evidence-led tone
- Hook in the first 2 lines (before the fold)
- Short paragraphs with line breaks for scanability
- Clear CTA at the end
- Max 3,000 characters
- 2-4 relevant hashtags woven naturally (not a block)
- No emoji or max 1-2 if appropriate`,

  x: `Convert to a Twitter/X post or short thread:
- Punchy, one core idea per post
- Max 280 characters for a single post
- If content is too rich for one post, use a numbered thread (1/N format)
- Conversational but authoritative tone
- 1-2 hashtags maximum, only if highly relevant`,

  instagram: `Convert to an Instagram caption:
- Conversational, lifestyle-oriented hook in the first line
- Story or insight in the body (short paragraphs, line breaks)
- CTA before hashtags ("Save this", "Drop a comment", "Link in bio")
- Up to 5 emoji as visual anchors
- 10-15 hashtags in a block at the end
- Max 2,200 characters
- After the caption, include [IMAGE_PROMPT]...[/IMAGE_PROMPT] with a visual description for image generation`,

  email: `Convert to a marketing email:
- Subject line under 60 characters
- Preview text under 90 characters
- Warm opening; 2-3 key points; one primary CTA above the fold
- Under 300 words body
- No hashtags
- Format as: SUBJECT: ... / PREVIEW: ... / BODY: ...`,

  blog: `Convert to a blog post outline:
- SEO-friendly title with primary keyword
- H2/H3 structure; 800-1,500 words target
- Opening hook + keyword; sections with details; conclusion with CTA`,

  ad: `Convert to ad copy:
- Headline max 30 characters, benefit-led
- Description max 90 characters
- One strong CTA
- Format: VARIANT 1: Headline / Description / CTA (and 2 more variants)`,
};

export interface RepurposeInput {
  ctx: CallerContext;
  sourceContent: contentDal.Content;
  targetChannels: string[];
  styleHints: Record<string, string>;
}

export interface RepurposeVariantSummary {
  content_id: string;
  channel: string;
  status: string;
  title: string;
}

export interface RepurposeResult {
  variants: RepurposeVariantSummary[];
  errors: string[];
}

function normalizeChannelKey(c: string): string {
  const u = c.toLowerCase().trim();
  if (u === 'twitter') return 'x';
  return u;
}

function ruleKeyForChannel(normalized: string): string {
  if (CHANNEL_RULES[normalized]) return normalized;
  return 'linkedin';
}

function mapChannelToContentType(channel: string): string {
  const c = normalizeChannelKey(channel);
  const map: Record<string, string> = {
    linkedin: 'social',
    x: 'social',
    instagram: 'social',
    email: 'email',
    blog: 'blog',
    ad: 'ad',
  };
  return map[c] ?? 'social';
}

function generateVariantTitle(channel: string, sourceTitle: string): string {
  const n = normalizeChannelKey(channel);
  const prefix: Record<string, string> = {
    linkedin: 'LinkedIn',
    x: 'X',
    instagram: 'Instagram',
    email: 'Email',
    blog: 'Blog',
    ad: 'Ad',
  };
  return `${prefix[n] ?? channel} — ${sourceTitle}`.slice(0, 500);
}

async function generateVariantText(
  source: contentDal.Content,
  targetChannel: string,
  styleHint: string | undefined,
  tenantId: string,
): Promise<string> {
  const n = normalizeChannelKey(targetChannel);
  const rules = CHANNEL_RULES[ruleKeyForChannel(n)] ?? CHANNEL_RULES.linkedin;
  const body = (source.body ?? source.body_html ?? '').slice(0, 4000);
  const prompt = [
    '## TASK',
    `Repurpose the following ${source.channel ?? 'content'} piece for ${n}.`,
    '',
    '## SOURCE',
    `Title: ${source.title}`,
    `Channel: ${source.channel ?? 'unknown'}`,
    `Body:`,
    body,
    '',
    '## TARGET CHANNEL RULES',
    rules,
    styleHint ? `\n## STYLE HINT\n${styleHint}\n` : '',
    '## OUTPUT',
    `Write ONLY the ${n} version. No meta-commentary or preambles.`,
    'Start directly with the content.',
  ]
    .filter(Boolean)
    .join('\n');

  const text = await generateText({
    tier: 'complex',
    systemPrompt:
      'You are a senior content strategist. Repurpose content across channels: preserve the core message; adapt tone, length, and format.',
    prompt,
    tenantId,
    maxTokens: 8192,
    temperature: 0.35,
  });

  return text.trim();
}

export async function repurposeContent(input: RepurposeInput): Promise<RepurposeResult> {
  const { ctx, sourceContent, targetChannels, styleHints } = input;
  const orgId = ctx.organizationId;
  if (!orgId) {
    return { variants: [], errors: ['Organization context required'] };
  }

  const tenantId = orgId;
  const sourceNorm = normalizeChannelKey(sourceContent.channel ?? '');
  const variants: RepurposeVariantSummary[] = [];
  const errors: string[] = [];

  console.log('[REPURPOSE] Starting repurpose:', {
    sourceId: sourceContent.id,
    sourceChannel: sourceContent.channel,
    targetChannels,
  });

  for (const rawCh of targetChannels) {
    const channel = normalizeChannelKey(rawCh);
    try {
      if (!['linkedin', 'x', 'instagram', 'email', 'blog', 'ad'].includes(channel)) {
        errors.push(`${rawCh}: unsupported channel`);
        continue;
      }
      if (channel === sourceNorm) {
        console.log('[REPURPOSE] Skipping — same as source channel:', channel);
        continue;
      }

      console.log('[REPURPOSE] Generating variant for channel:', channel);

      const variantText = await generateVariantText(
        sourceContent,
        channel,
        styleHints[channel] ?? styleHints[rawCh],
        tenantId,
      );

      if (!variantText || variantText.length < 20) {
        errors.push(`${channel}: LLM returned empty or too-short content`);
        continue;
      }

      let body = variantText;
      let imagePrompt: string | null = null;
      if (channel === 'instagram') {
        imagePrompt = extractImagePrompt(variantText);
        body = extractCaption(variantText);
      }

      const title = generateVariantTitle(channel, sourceContent.title);

      const created = await contentDal.createContent(ctx, {
        title,
        content_type: mapChannelToContentType(channel),
        channel,
        status: 'draft',
        body,
        parent_content_id: sourceContent.id,
        user_brief: `Repurposed from content ${sourceContent.id} (${sourceContent.title})`,
        ...(channel === 'instagram' && imagePrompt
          ? { image_prompt: imagePrompt, visual_description: imagePrompt }
          : {}),
      });

      const contentId = created.id;

      const truthQuery = `repurpose_truth:${contentId}`;
      const brandQuery = `repurpose_brand:${contentId}`;
      const compQuery = `repurpose_compliance:${contentId}`;

      const [truth, brandVoice, compliance] = await Promise.all([
        runProductTruthValidation({
          organizationId: orgId,
          contentText: body,
          tenantId,
          userQuery: truthQuery,
        }),
        runBrandVoiceCheck({
          organizationId: orgId,
          contentText: body,
          tenantId,
          userQuery: brandQuery,
          targetChannel: channel,
        }),
        runComplianceScan({
          organizationId: orgId,
          contentText: body,
          tenantId,
          userQuery: compQuery,
          contentType: mapChannelToContentType(channel),
          targetChannel: channel,
          ...(channel === 'instagram' && imagePrompt
            ? { imagePrompt, visualDescription: imagePrompt }
            : {}),
        }),
      ]);

      const now = new Date().toISOString();
      await contentDal.updateContent(ctx, contentId, {
        truth_validation: truth as unknown as Record<string, unknown>,
        truth_validated_at: now,
        brand_voice_check: brandVoice as unknown as Record<string, unknown>,
        brand_voice_checked_at: now,
      });

      if (truth.verdict !== 'PASS') {
        await contentDal.updateContent(ctx, contentId, { status: 'draft' });
        variants.push({
          content_id: contentId,
          channel,
          status: 'draft',
          title,
        });
        console.log('[REPURPOSE] Gatekeepers: truth FAIL → draft', { contentId, channel });
        continue;
      }

      if (channel === 'instagram') {
        try {
          await runInstagramImageGeneration({
            orgId,
            contentId,
            rawDraft: variantText,
            caller: ctx,
            stylePreset: 'photoreal',
            intentContext: {
              title: sourceContent.title,
              userBrief: sourceContent.user_brief ?? null,
            },
          });
        } catch (e) {
          console.warn('[REPURPOSE] Image gen failed (non-fatal):', e instanceof Error ? e.message : e);
        }
      }

      const assigned = await assignApproval(ctx, {
        content_id: contentId,
        validation_scores: {
          truth_validation: truth as unknown as Record<string, unknown>,
          brand_voice_check: brandVoice as unknown as Record<string, unknown>,
          compliance_scan: compliance as unknown as Record<string, unknown>,
        },
      });

      if (!assigned.ok) {
        errors.push(`${channel}: ${assigned.error}`);
        await contentDal.updateContent(ctx, contentId, { status: 'draft' });
        variants.push({
          content_id: contentId,
          channel,
          status: 'draft',
          title,
        });
        continue;
      }

      const finalRow = await contentDal.getContentById(ctx, contentId);
      variants.push({
        content_id: contentId,
        channel,
        status: finalRow?.status ?? 'in_review',
        title,
      });

      console.log('[REPURPOSE] Content created:', { contentId, channel, status: finalRow?.status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[REPURPOSE] Failed for ${channel}:`, msg);
      errors.push(`${channel}: ${msg}`);
    }
  }

  console.log('[REPURPOSE] Complete:', {
    sourceId: sourceContent.id,
    variantsCreated: variants.length,
    errors: errors.length,
  });

  return { variants, errors };
}

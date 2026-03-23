/**
 * Phase 2 — Content Strategist one-shot generation + parallel Groq gatekeepers + truth retry + approval queue.
 *
 * - **Generation:** {@link generateResponse} with {@link LLM_TIER.COMPLEX} (Claude 3.5 Sonnet) and
 *   {@link buildMarketingContentStrategistPrompt}, plus {@link MOCK_PRODUCT_TRUTH_LOOKUP_TOOL_RESULT} so
 *   `marketing:product_truth_lookup` does not need a live tool round-trip.
 * - **Gatekeepers:** `Promise.all` over {@link runProductTruthValidation}, {@link runBrandVoiceCheck},
 *   {@link runComplianceScan}. Each uses `callModelSafe({ tier: 'fast' })` (Groq / fast JSON rubrics — same
 *   tier intent as {@link LLM_TIER.FAST} in `llmGateway`).
 */
import { generateResponse, LLM_TIER } from '../llmGateway.js';
import { assignApproval } from '../../../controllers/marketingToolsController.js';
import * as contentDal from '../../../dal/marketing/content.js';
import { getDefaultBrandVoiceFallback, getDefaultProductTruthFallback } from '../../../dal/marketing/truthBrand.js';
import type { CallerContext } from '../../../dal/types.js';
import { buildMarketingContentStrategistPrompt } from '../../../modules/marketing/prompts/marketingContentStrategistPrompt.js';
import {
  extractAltText,
  extractCaption,
  extractImagePrompts,
} from '../../../modules/marketing/prompts/instagramChannelSpec.js';
import { generateImage, enhanceImagePrompt } from '../../marketing/publishing/imageService.js';
import { parseInstagramDraft, runInstagramImageGeneration } from '../../marketing/workflows/instagramImagePipeline.js';
import { resolveCalibrationPrompt } from '../../marketing/calibrationResolver.js';
import { getBrandProfile, formatBrandProfileAsMd } from '../../marketing/brandProfileService.js';
import { query as dbQuery } from '../../../db/index.js';
import { runBrandVoiceCheck, type BrandVoiceCheckResult } from './brandVoiceChecker.js';
import { runComplianceScan, type ComplianceScanResult } from './complianceScanner.js';
import { runProductTruthValidation, type ProductTruthValidationResult } from './productTruthValidator.js';

const LOG = '[marketingContentWorkflow]';

/** Simulates `marketing:product_truth_lookup` so generation can run without tool execution. */
export const MOCK_PRODUCT_TRUTH_LOOKUP_TOOL_RESULT = `

---

## Simulated tool result: \`marketing:product_truth_lookup\`

\`\`\`json
{
  "ok": true,
  "snippets": [
    "Ground claims in the Product truth and Brand voice sections of your system prompt.",
    "Do not present internal-only modules (e.g. Finance/Ops) as generally available to customers."
  ]
}
\`\`\`
`;

export interface MarketingContentWorkflowContext {
  organizationId: string;
  tenantId: string;
  caller: CallerContext;
  userRole?: string;
  /** Existing row, or a new row is created */
  contentId?: string;
  title?: string;
  contentType?: string;
  channel?: string;
  /** Injected into strategist prompt (defaults: org-agnostic fallbacks) */
  productTruthMd?: string;
  brandVoiceMd?: string;
  /** Passed to truth + compliance validators (defaults: DB load per org) */
  productTruthContextMdOverride?: string;
  brandVoiceContextMdOverride?: string;
  /** Retries after a failed Product Truth verdict (default 2 → 3 generation attempts total). */
  maxTruthRetries?: number;
}

export type MarketingContentWorkflowResult =
  | {
      status: 'completed';
      contentId: string;
      draft: string;
      approvalId: string;
      attempts: number;
      truth: ProductTruthValidationResult;
      brandVoice: BrandVoiceCheckResult;
      compliance: ComplianceScanResult;
    }
  | {
      status: 'failed';
      reason: string;
      attempts: number;
      lastDraft?: string;
      lastTruth?: ProductTruthValidationResult;
    };

export interface MarketingContentWorkflowDeps {
  generateResponseFn?: typeof generateResponse;
  runProductTruthValidationFn?: typeof runProductTruthValidation;
  runBrandVoiceCheckFn?: typeof runBrandVoiceCheck;
  runComplianceScanFn?: typeof runComplianceScan;
  assignApprovalFn?: typeof assignApproval;
  createContentFn?: typeof contentDal.createContent;
  updateContentFn?: typeof contentDal.updateContent;
  getContentByIdFn?: typeof contentDal.getContentById;
}

function workflowQueryKey(kind: 'truth' | 'brand' | 'compliance', contentId: string): string {
  return `marketing_content_workflow:${kind}:${contentId}`;
}

async function generateDraft(
  brief: string,
  revisionBlock: string | undefined,
  ctx: MarketingContentWorkflowContext,
  gen: typeof generateResponse,
): Promise<string> {
  const productTruthMd = ctx.productTruthMd ?? getDefaultProductTruthFallback();
  const brandVoiceMd = ctx.brandVoiceMd ?? getDefaultBrandVoiceFallback();

  let calibrationText = '';
  try {
    const calibration = await resolveCalibrationPrompt(
      ctx.organizationId,
      ctx.channel,
      undefined,
    );
    calibrationText = calibration.text;
  } catch (err) {
    console.warn('[marketingContentWorkflow] Calibration resolve failed, continuing without:', err);
  }

  const systemPrompt = buildMarketingContentStrategistPrompt({
    userRole: ctx.userRole ?? 'marketing',
    productTruthMd,
    brandVoiceMd,
    channel: ctx.channel,
    calibrationText,
  });

  const userMessage = [brief, MOCK_PRODUCT_TRUTH_LOOKUP_TOOL_RESULT, revisionBlock].filter(Boolean).join('\n\n');

  const res = await gen({
    tier: LLM_TIER.COMPLEX,
    systemPrompt,
    userMessage,
    tenantId: ctx.tenantId,
    temperature: 0.35,
    maxTokens: 8192,
  });

  return res.content.trim();
}

/**
 * Run Content Strategist generation (Claude), parallel fast-tier gatekeepers, Product Truth retry loop, then approval queue.
 *
 * @param brief - User-facing content request
 * @param context - Org / tenant / caller + optional MD overrides
 */
export async function executeContentWorkflow(
  brief: string,
  context: MarketingContentWorkflowContext,
  deps?: MarketingContentWorkflowDeps,
): Promise<MarketingContentWorkflowResult> {
  const gen = deps?.generateResponseFn ?? generateResponse;
  const runTruth = deps?.runProductTruthValidationFn ?? runProductTruthValidation;
  const runBrand = deps?.runBrandVoiceCheckFn ?? runBrandVoiceCheck;
  const runComp = deps?.runComplianceScanFn ?? runComplianceScan;
  const assign = deps?.assignApprovalFn ?? assignApproval;
  const createContent = deps?.createContentFn ?? contentDal.createContent;
  const updateContent = deps?.updateContentFn ?? contentDal.updateContent;
  const getContentById = deps?.getContentByIdFn ?? contentDal.getContentById;

  const orgId = context.organizationId;
  const caller = context.caller;
  if (!orgId || !caller.organizationId) {
    return { status: 'failed', reason: 'Missing organization context', attempts: 0 };
  }

  const maxRetries = Math.max(0, Math.min(4, context.maxTruthRetries ?? 2));
  const maxAttempts = maxRetries + 1;

  let contentRow = context.contentId ? await getContentById(caller, context.contentId) : null;
  if (context.contentId && !contentRow) {
    return { status: 'failed', reason: 'Content not found', attempts: 0 };
  }
  if (!contentRow) {
    const userBriefLine = brief.includes('\n\n---\n')
      ? brief.split('\n\n---\n')[0].trim()
      : brief.trim();
    contentRow = await createContent(caller, {
      title: (context.title ?? 'AI draft').slice(0, 500),
      content_type: context.contentType ?? 'social',
      channel: context.channel ?? 'linkedin',
      status: 'draft',
      body: '',
      user_brief: userBriefLine.slice(0, 8000),
    });
  }

  const contentId = contentRow.id;
  let lastDraft = '';
  let lastTruth: ProductTruthValidationResult | undefined;

  const rowBrandProfileId = (contentRow as unknown as Record<string, unknown>).brand_profile_id as string | undefined;
  if (rowBrandProfileId && !context.brandVoiceMd) {
    try {
      const bp = await getBrandProfile(rowBrandProfileId, { query: dbQuery });
      if (bp) context = { ...context, brandVoiceMd: formatBrandProfileAsMd(bp) };
    } catch (err) {
      console.warn('[brand-isolation] Failed to load brand profile, using default', err);
    }
  }

  const normalizedChannel = (context.channel ?? contentRow.channel ?? '').toLowerCase().trim();
  const isInstagram = normalizedChannel === 'instagram';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const revisionBlock =
      attempt > 0 && lastTruth?.verdict === 'FAIL'
        ? `Your previous draft failed product truth validation for these reasons:\n${lastTruth.failed_reasons.map((r) => `- ${r}`).join('\n')}\n\nPlease revise the draft to fix these issues. Stay factual and aligned with product truth.`
        : undefined;

    const rawDraft = await generateDraft(brief, revisionBlock, context, gen);
    let draft = rawDraft.trim();
    let imagePrompt: string | null = null;
    let visualDesc: string | null = null;
    if (isInstagram) {
      const parsed = parseInstagramDraft(rawDraft);
      draft = parsed.caption || rawDraft.trim();
      imagePrompt = parsed.imagePrompt;
      visualDesc = parsed.visualDescription;
    }
    lastDraft = draft;
    if (!draft) {
      return {
        status: 'failed',
        reason: 'Content Strategist returned an empty draft',
        attempts: attempt + 1,
        lastDraft,
        lastTruth,
      };
    }

    await updateContent(caller, contentId, {
      body: draft,
      title: context.title ?? contentRow.title,
      channel: isInstagram ? 'instagram' : (context.channel ?? contentRow.channel ?? undefined),
      ...(isInstagram
        ? {
            image_prompt: imagePrompt,
            visual_description: visualDesc,
          }
        : {}),
    });

    const truthQuery = workflowQueryKey('truth', contentId);
    const brandQuery = workflowQueryKey('brand', contentId);
    const compQuery = workflowQueryKey('compliance', contentId);

    const [truth, brandVoice, compliance] = await Promise.all([
      runTruth({
        organizationId: orgId,
        contentText: draft,
        tenantId: context.tenantId,
        userQuery: truthQuery,
        productTruthContextMdOverride: context.productTruthContextMdOverride,
      }),
      runBrand({
        organizationId: orgId,
        contentText: draft,
        tenantId: context.tenantId,
        userQuery: brandQuery,
        brandVoiceContextMdOverride: context.brandVoiceContextMdOverride,
        targetChannel: normalizedChannel || 'linkedin',
      }),
      runComp({
        organizationId: orgId,
        contentText: draft,
        tenantId: context.tenantId,
        userQuery: compQuery,
        contentType: context.contentType ?? contentRow.content_type ?? 'social',
        targetChannel: normalizedChannel || 'linkedin',
        productTruthContextMdOverride: context.productTruthContextMdOverride,
        ...(isInstagram
          ? {
              imagePrompt,
              visualDescription: visualDesc,
            }
          : {}),
      }),
    ]);

    lastTruth = truth;

    if (truth.verdict === 'FAIL') {
      console.warn(`${LOG} product_truth_fail`, { attempt: attempt + 1, maxAttempts, reasons: truth.failed_reasons });
      if (attempt + 1 >= maxAttempts) {
        return {
          status: 'failed',
          reason: `Product truth still failing after ${maxAttempts} attempt(s): ${truth.failed_reasons.join('; ') || 'see checks'}`,
          attempts: attempt + 1,
          lastDraft: draft,
          lastTruth: truth,
        };
      }
      continue;
    }

    if (isInstagram) {
      const igResult = await runInstagramImageGeneration({
        orgId,
        contentId,
        rawDraft,
        caller,
        stylePreset: 'modern_noir',
      });
      console.log(`${LOG} instagram_image_gen`, {
        contentId,
        success: igResult.success,
        promptSource: igResult.promptSource,
        error: igResult.error,
      });
    }

    const assigned = await assign(caller, {
      content_id: contentId,
      validation_scores: {
        truth_validation: truth as unknown as Record<string, unknown>,
        brand_voice_check: brandVoice as unknown as Record<string, unknown>,
        compliance_scan: compliance as unknown as Record<string, unknown>,
      },
    });

    if (!assigned.ok) {
      return {
        status: 'failed',
        reason: assigned.error,
        attempts: attempt + 1,
        lastDraft: draft,
        lastTruth: truth,
      };
    }

    return {
      status: 'completed',
      contentId,
      draft,
      approvalId: assigned.data.approval_id,
      attempts: attempt + 1,
      truth,
      brandVoice,
      compliance,
    };
  }

  return { status: 'failed', reason: 'Workflow exited without result', attempts: maxAttempts, lastDraft, lastTruth };
}

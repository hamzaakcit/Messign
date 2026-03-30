/**
 * Marketing multi-agent orchestration: routing, Content Strategist + gatekeeper loop,
 * Campaign Manager with HITL pause, and approval-queue handoff.
 *
 * Composes {@link runMarketingRouteDecision} and {@link runMarketingMiniLoop} from
 * `marketingAgentFlow.ts` with explicit validation (Zod), retries, and telemetry.
 */
import { z } from 'zod';
import type { AgentContext, ToolObservation } from '../agents/types.js';
import type { DoraRequestContext } from '../dora/types.js';
import type { ToolContext } from '../types.js';
import type { ProgressStep } from '../v2/types.js';
import type { PendingActionSSEEvent } from '../actions/types.js';
import type { CallerContext } from '../../../dal/types.js';
import * as contentDal from '../../../dal/marketing/content.js';
import { assignApproval } from '../../../controllers/marketingToolsController.js';
import { loadMarketingTruthBrandLayers } from '../../../dal/marketing/truthBrand.js';
import { resolveOrgIdForTool } from '../tools/resolveOrgIdForTool.js';
import { resolveCalibrationPrompt } from '../../marketing/calibrationResolver.js';
import { buildMarketingContentStrategistPrompt } from '../../../modules/marketing/prompts/marketingContentStrategistPrompt.js';
import { getBrandProfile, formatBrandProfileAsMd } from '../../marketing/brandProfileService.js';
import { query as dbQuery } from '../../../db/index.js';
import { buildMarketingCampaignManagerPrompt } from '../../../modules/marketing/prompts/marketingCampaignManagerPrompt.js';
import { wrapSpecialistSystemPromptWithLucy } from '../../../modules/marketing/prompts/lucyPersona.js';
import {
  CAMPAIGN_TOOL_NAMES,
  CONTENT_TOOL_NAMES,
  marketingFlowSubagentOrder,
  parseMarketingRouteFromMessage,
  runMarketingMiniLoop,
  runMarketingRouteDecision,
  type MarketingRouteKind,
  type ParsedMarketingRoute,
} from './marketingAgentFlow.js';
import { runProductTruthValidation, type ProductTruthValidationResult } from './productTruthValidator.js';
import { runBrandVoiceCheck, type BrandVoiceCheckResult } from './brandVoiceChecker.js';
import { runComplianceScan, type ComplianceScanResult } from './complianceScanner.js';
import {
  extractAltText,
  extractCaption,
  extractImagePrompts,
  stripReferenceImageUrlBlock,
} from '../../../modules/marketing/prompts/instagramChannelSpec.js';
import { generateImage, enhanceImagePrompt } from '../../marketing/publishing/imageService.js';
import { parseInstagramDraft, runInstagramImageGeneration } from '../../marketing/workflows/instagramImagePipeline.js';
import { runContentAtomizationAfterApproval } from './contentAtomizationBatch.js';
import {
  checkCopyQualityForRetry,
  flattenEmailManifestForGatekeepers,
  looksLikeVa2EmailManifest,
  parseAndValidateEmailManifestDraft,
} from '../../marketing/validateEmailManifestDraft.js';

const LOG = '[marketingOrchestrator]';

/** If the user asks for Instagram (or includes [IMAGE_PROMPT]), persist `channel: instagram` for cockpit + image gen. */
export function inferChannelFromUserMessage(userMessage: string): string | undefined {
  const raw = userMessage.trim();
  if (!raw) return undefined;
  if (/\[IMAGE_PROMPT/i.test(raw)) return 'instagram';
  const lower = raw.toLowerCase();
  if (/\binstagram\b/.test(lower)) return 'instagram';
  if (/\binsta\b/.test(lower)) return 'instagram';
  if (/\big\b/.test(lower) && /\b(post|feed|story|reel|caption|carousel)\b/.test(lower)) return 'instagram';
  return undefined;
}

/**
 * Infer publishing channel for persisted marketing content (agent + orchestration).
 * Defaults to `linkedin` when the user does not specify a channel.
 */
export function inferMarketingContentChannel(userMessage: string): string {
  const ig = inferChannelFromUserMessage(userMessage);
  if (ig) return ig;
  const lower = userMessage.toLowerCase();
  if (/\blinkedin\b/.test(lower)) return 'linkedin';
  if (/\b(twitter|tweet)\b/.test(lower) || /\bx\s+post\b/.test(lower) || /(^|\s)x\s*\/\s*x\s+post/.test(lower))
    return 'x';
  if (
    /\b(email|e-mail|newsletter|mailing|edm|drip campaign|drip sequence|subscriber|subscribers|mailchimp|klaviyo|sendgrid)\b/.test(
      lower,
    )
  ) {
    return 'email';
  }
  if (/\b(blog|article|blog post)\b/.test(lower)) return 'blog';
  if (/\b(ad copy|advertisement|ppc|paid ad|display ad)\b/.test(lower)) return 'linkedin';
  return 'linkedin';
}

/** Maps inferred channel to `marketing_content.content_type`. */
export function contentTypeForMarketingChannel(channel: string): string {
  const c = channel.trim().toLowerCase();
  if (c === 'email') return 'email';
  if (c === 'blog') return 'blog';
  return 'social';
}

function log(step: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.log(`${LOG} ${step}`, detail);
  } else {
    console.log(`${LOG} ${step}`);
  }
}

/** Map legacy tool role strings to CallerContext.role for DAL / controllers */
export function legacyToolContextToCallerContext(legacy: ToolContext): CallerContext {
  const ur = (legacy.userRole || 'employee').toLowerCase();
  const role: CallerContext['role'] =
    ur === 'admin' || ur === 'system_admin'
      ? 'system_admin'
      : ur === 'finance' || ur === 'finance_admin'
        ? 'finance_admin'
        : ur === 'manager' || ur === 'dept_head' || ur === 'cpo'
          ? 'manager'
          : 'employee';
  return {
    userId: legacy.userId,
    userUuid: legacy.userUuid,
    role,
    organizationId: legacy.organizationId,
  };
}

// ── Zod: gatekeeper outputs (after existing parsers) — fail closed on bad shape ──

const productTruthParsedSchema = z
  .object({
    verdict: z.enum(['PASS', 'FAIL']),
    failed_reasons: z.array(z.string()),
  })
  .passthrough();

const brandVoiceParsedSchema = z
  .object({
    score: z.number(),
    passes: z.boolean(),
  })
  .passthrough();

const complianceParsedSchema = z
  .object({
    verdict: z.enum(['PASS', 'WARNING']),
    warnings: z.array(z.unknown()),
  })
  .passthrough();

function validateGatekeeperResult<T>(
  label: 'product_truth' | 'brand_voice' | 'compliance',
  raw: unknown,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): { ok: true; value: T } | { ok: false; error: string } {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const msg = r.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    log(`zod_reject_${label}`, { error: msg });
    return { ok: false, error: msg };
  }
  return { ok: true, value: r.data };
}

export interface MarketingOrchestrationContext {
  agentContext: AgentContext;
  doraCtx: DoraRequestContext;
  legacyContext: ToolContext;
  priorContext?: string;
  history?: Array<{ role: string; content: string }>;
  forceMarketingContext?: boolean;
  /** When set with {@link marketingRoute}, Lucy persona layers specialist system prompts. */
  applyLucyPersona?: boolean;
  /** Sub-orchestrator route for Lucy contextual behaviors (e.g. CONTENT_STRATEGIST). */
  marketingRoute?: MarketingRouteKind;
  onStreamChunk?: (text: string) => void;
  onProgress?: (step: ProgressStep) => void;
}

export interface ContentWorkflowBrief {
  userQuery: string;
  contentId?: string;
  title?: string;
  contentType?: string;
  channel?: string;
  campaignId?: string;
  /** Max generation attempts when Product Truth fails (default 3) */
  maxTruthRetries?: number;
}

export type ContentWorkflowResult =
  | {
      status: 'completed';
      contentId: string;
      draft: string;
      approvalId: string;
      attempts: number;
      truth: ProductTruthValidationResult;
      brandVoice: BrandVoiceCheckResult;
      compliance: ComplianceScanResult;
      toolObservations: ToolObservation[];
      toolsUsed: string[];
    }
  | {
      status: 'failed';
      /** Set when a `marketing_content` row exists but the workflow did not complete (e.g. validation or approval failure). */
      contentId?: string;
      reason: string;
      /** When set, the DB insert (e.g. RLS) failed before any row was created; frontend can show a specific message. */
      creationError?: string;
      attempts: number;
      lastDraft?: string;
      toolObservations: ToolObservation[];
      toolsUsed: string[];
    };

export type CampaignWorkflowResult =
  | {
      status: 'completed';
      message: string;
      pendingActions: PendingActionSSEEvent[];
      toolObservations: ToolObservation[];
      toolsUsed: string[];
    }
  | {
      status: 'awaiting_confirmation';
      message: string;
      pendingActions: PendingActionSSEEvent[];
      toolObservations: ToolObservation[];
      toolsUsed: string[];
    };

export type MarketingOrchestrationRunResult =
  | { kind: 'clarify'; question: string }
  | { kind: 'not_marketing'; message: string }
  | { kind: 'content'; result: ContentWorkflowResult }
  | { kind: 'campaign'; result: CampaignWorkflowResult }
  | {
      kind: 'both';
      campaign: CampaignWorkflowResult;
      /** Only when campaign completed with no pending confirmations */
      content?: ContentWorkflowResult;
      deferredReason?: string;
    };

/**
 * Entry: run Sub-Orchestrator routing (complex tier) on the user message.
 * Re-exported for tests that already use `parseMarketingRouteFromMessage` on raw messages.
 */
export async function routeMarketingRequest(
  userMessage: string,
  ctx: MarketingOrchestrationContext,
): Promise<ParsedMarketingRoute> {
  return runMarketingRouteDecision(
    userMessage,
    ctx.history ?? [],
    ctx.priorContext,
    ctx.agentContext.tenantId,
    ctx.forceMarketingContext ?? false,
    ctx.applyLucyPersona === true,
  );
}

async function buildContentStrategistLoopArgs(
  ctx: MarketingOrchestrationContext,
  userQuery: string,
  priorBlock?: string,
  channelOverride?: string,
  brandProfileId?: string,
) {
  const mergedCtx: ToolContext = {
    ...ctx.legacyContext,
    organizationId: ctx.legacyContext.organizationId ?? ctx.agentContext.organizationId ?? undefined,
  };
  const orgId = await resolveOrgIdForTool(mergedCtx);
  let { productTruthMd, brandVoiceMd } = await loadMarketingTruthBrandLayers(orgId);
  const channel = channelOverride?.trim() || inferMarketingContentChannel(userQuery);

  if (brandProfileId) {
    try {
      const bp = await getBrandProfile(brandProfileId, { query: dbQuery });
      if (bp) brandVoiceMd = formatBrandProfileAsMd(bp);
    } catch (err) {
      console.warn('[brand-isolation] Failed to load brand profile, using org default', err);
    }
  }

  let calibrationText = '';
  if (orgId) {
    try {
      const calibration = await resolveCalibrationPrompt(orgId, channel, undefined);
      calibrationText = calibration.text;
    } catch (err) {
      console.warn('[marketingOrchestrator] Calibration resolve failed, continuing without:', err);
    }
  }

  // 'standard' includes copywriting engine + brand voice (~6.3K tokens) — fits within
  // Anthropic's 30K tokens/min rate limit. 'full' adds subject lab + industry playbooks
  // (~17K tokens total) which exhausts the rate limit on back-to-back calls.
  const qualityTier = 'standard';
  const contentBase = buildMarketingContentStrategistPrompt({
    userRole: ctx.agentContext.userRole,
    productTruthMd,
    brandVoiceMd,
    channel,
    calibrationText,
    qualityTier,
  });
  const systemPrompt =
    ctx.applyLucyPersona === true && ctx.marketingRoute != null
      ? wrapSpecialistSystemPromptWithLucy(contentBase, {
          route: ctx.marketingRoute,
          channelInferred: channel,
          query: userQuery,
        })
      : contentBase;
  return {
    role: 'content' as const,
    systemPrompt,
    toolNames: CONTENT_TOOL_NAMES,
    query: userQuery,
    agentContext: ctx.agentContext,
    doraCtx: ctx.doraCtx,
    legacyContext: ctx.legacyContext,
    priorBlock,
    contentStrategist: true,
    channel,
  };
}

async function buildCampaignManagerLoopArgs(ctx: MarketingOrchestrationContext, userQuery: string, priorBlock?: string) {
  const channelInferred = inferMarketingContentChannel(userQuery);
  const campaignBase = buildMarketingCampaignManagerPrompt({ userRole: ctx.agentContext.userRole });
  const systemPrompt =
    ctx.applyLucyPersona === true && ctx.marketingRoute != null
      ? wrapSpecialistSystemPromptWithLucy(campaignBase, {
          route: ctx.marketingRoute,
          channelInferred,
          query: userQuery,
        })
      : campaignBase;
  return {
    role: 'campaign' as const,
    systemPrompt,
    toolNames: CAMPAIGN_TOOL_NAMES,
    query: userQuery,
    agentContext: ctx.agentContext,
    doraCtx: ctx.doraCtx,
    legacyContext: ctx.legacyContext,
    priorBlock,
    campaignManager: true,
  };
}

/**
 * Content Strategist draft → parallel Groq gatekeepers (fast tier via gateway) →
 * Product Truth retry loop → `assignApproval` when truth passes.
 */
export async function executeContentWorkflow(
  brief: ContentWorkflowBrief,
  ctx: MarketingOrchestrationContext,
): Promise<ContentWorkflowResult> {
  const caller = legacyToolContextToCallerContext(ctx.legacyContext);
  const orgId = caller.organizationId;
  const refStrip = stripReferenceImageUrlBlock(brief.userQuery);
  const effectiveUserQuery = refStrip.referenceUrl ? refStrip.cleaned : brief.userQuery;
  log('content_workflow_start', {
    channel: brief.channel,
    contentRowChannel: brief.contentId ? 'will-load' : 'new',
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY?.trim(),
    userQueryPreview: effectiveUserQuery.slice(0, 100),
  });
  const agentOutput = effectiveUserQuery;
  if (!orgId) {
    return {
      status: 'failed',
      reason: 'Missing organization context',
      attempts: 0,
      toolObservations: [],
      toolsUsed: [],
    };
  }

  const maxAttempts = Math.max(1, Math.min(5, brief.maxTruthRetries ?? 2));
  let contentRow =
    brief.contentId != null
      ? await contentDal.getContentById(caller, brief.contentId)
      : null;

  if (!contentRow && brief.contentId) {
    return {
      status: 'failed',
      reason: 'Content not found',
      attempts: 0,
      toolObservations: [],
      toolsUsed: [],
    };
  }

  let contentRowCreated = false;
  if (!contentRow) {
    log('content_create', { title: brief.title ?? 'AI draft' });
    try {
      contentRow = await contentDal.createContent(caller, {
        title: (brief.title ?? 'AI draft').slice(0, 500),
        content_type: brief.contentType ?? 'social',
        channel: brief.channel ?? 'linkedin',
        campaign_id: brief.campaignId,
        status: 'draft',
        body: '',
      });
      contentRowCreated = true;
    } catch (createErr) {
      const message = createErr instanceof Error ? createErr.message : String(createErr);
      const isRls = /row-level security|RLS|policy|violates.*policy/i.test(message);
      const creationError = isRls
        ? 'Database policy violation (RLS) blocked saving content. Check dev RLS scripts or use BYPASSRLS for the server role.'
        : message;
      console.error('[marketingOrchestrator] content create failed:', message);
      return {
        status: 'failed',
        reason: creationError,
        creationError,
        attempts: 0,
        toolObservations: [],
        toolsUsed: [],
      };
    }
  }

  const contentId = contentRow.id;
  if (contentRowCreated) {
  }
  if (refStrip.referenceUrl) {
    try {
      await contentDal.updateContent(caller, contentId, {
        reference_image_url: refStrip.referenceUrl,
      });
    } catch (e) {
      console.error('[marketingOrchestrator] reference_image_url update failed', e);
    }
  }
  const tenantId = ctx.agentContext.tenantId;
  const combinedToolObs: ToolObservation[] = [];
  const combinedTools: string[] = [];

  const channelForEmailPrior = (brief.channel ?? contentRow.channel ?? '').toLowerCase().trim();
  let emailPriorBlock: string | undefined;
  if (channelForEmailPrior === 'email') {
    try {
      const refs = await contentDal.listRecentEmailContentWithVisuals(caller, {
        limit: 8,
        excludeContentId: contentId,
      });
      if (refs.length > 0) {
        emailPriorBlock = [
          '## Reference — saved email designs in this workspace',
          'Match structure, tone, and CTA placement to the closest example when relevant. For full detail on a row, use tools `marketing:list_saved_email_designs` / `marketing:get_saved_email_design`.',
          ...refs.map(
            (r) =>
              `- **${r.title.replace(/\*/g, '')}** (\`id=${r.id}\`, status: ${r.status})${r.has_design ? ' [Unlayer design]' : r.has_html ? ' [HTML]' : ''}${r.excerpt ? `\n  excerpt: ${r.excerpt}` : ''}`,
          ),
        ].join('\n');
      }
    } catch (e) {
      console.warn('[marketingOrchestrator] email reference prefetch failed', e);
    }
  }

  let lastDraft = '';
  let lastTruth: ProductTruthValidationResult | null = null;
  let lastManifestErrors: string[] | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const revisionPrefix =
      attempt > 0 && lastTruth?.verdict === 'FAIL'
        ? `Your previous draft failed product truth validation. Reasons:\n${lastTruth.failed_reasons.map((r) => `- ${r}`).join('\n')}\n\nRevise the draft to fix these issues. Stay factual and aligned with product truth.\n\n---\n\n`
        : '';

    const manifestFixPrefix =
      attempt > 0 && lastManifestErrors?.length
        ? `Your previous VA2 DesignManifest JSON was invalid:\n${lastManifestErrors.map((e) => `- ${e}`).join('\n')}\n\nOutput a single valid JSON object with theme, subject, preheader, sections (array), and metadata.visual_density. Put JSON only in your reply (optionally in a \`\`\`json fence).\n\n---\n\n`
        : '';

    const userQuery = manifestFixPrefix + revisionPrefix + effectiveUserQuery;

    log('content_generation_attempt', { attempt: attempt + 1, maxAttempts, contentId });
    ctx.onProgress?.({ phase: 'generating', label: 'Generating content draft…', step: 3, maxSteps: 5, status: 'active' });

    const loopArgs = await buildContentStrategistLoopArgs(ctx, userQuery, emailPriorBlock, brief.channel ?? contentRow.channel ?? undefined, (contentRow as unknown as Record<string, unknown>).brand_profile_id as string | undefined);
    const mini = await runMarketingMiniLoop(loopArgs);
    combinedToolObs.push(...mini.toolObservations);
    combinedTools.push(...mini.toolsUsed);

    const draft = mini.content.trim();
    if (!draft) {
      log('content_generation_empty', { attempt });
      return {
        status: 'failed',
        contentId,
        reason: 'Content Strategist returned an empty draft',
        attempts: attempt + 1,
        lastDraft,
        toolObservations: combinedToolObs,
        toolsUsed: combinedTools,
      };
    }

    const channelKey = (brief.channel ?? contentRow.channel ?? 'linkedin').toLowerCase().trim();
    const isInstagram = channelKey === 'instagram';
    const isEmail = channelKey === 'email';

    let validationText = draft;
    let emailManifestForStorage: Record<string, unknown> | undefined;
    let imagePrompt: string | null = null;
    let visualDesc: string | null = null;
    if (isInstagram) {
      const igIntent = {
        title: brief.title ?? contentRow.title,
        userBrief: contentRow.user_brief ?? effectiveUserQuery ?? null,
      };
      const parsed = parseInstagramDraft(draft, igIntent);
      validationText = parsed.caption || draft;
      imagePrompt = parsed.imagePrompt;
      visualDesc = parsed.visualDescription;
    } else if (isEmail && looksLikeVa2EmailManifest(draft)) {
      const parsed = parseAndValidateEmailManifestDraft(draft);
      if (!parsed.ok) {
        lastManifestErrors = parsed.errors;
        lastDraft = draft;
        console.warn(`[marketingOrchestrator] VA2 manifest parse failed (attempt ${attempt + 1}):`, parsed.errors);
        if (attempt + 1 >= maxAttempts) {
          return {
            status: 'failed',
            contentId,
            reason: `Invalid VA2 email manifest: ${parsed.errors.join('; ')}`,
            attempts: attempt + 1,
            lastDraft,
            toolObservations: combinedToolObs,
            toolsUsed: combinedTools,
          };
        }
        continue;
      }
      // Copy quality gate — kill-list words and missing P.S. trigger retry
      const copyIssues = checkCopyQualityForRetry(parsed.manifest);
      if (copyIssues.length > 0 && attempt + 1 < maxAttempts) {
        console.warn(`[marketingOrchestrator] Copy quality issues (attempt ${attempt + 1}), retrying:`, copyIssues);
        lastManifestErrors = copyIssues;
        lastDraft = draft;
        continue;
      }
      validationText = flattenEmailManifestForGatekeepers(parsed.manifest);
      emailManifestForStorage = parsed.manifest;
      lastManifestErrors = undefined;
    } else if (isEmail) {
      // Draft is plain text, not VA2 JSON — force retry with explicit manifest instructions
      console.warn(`[marketingOrchestrator] Email draft is plain text (not VA2 JSON), attempt ${attempt + 1}. Draft preview: "${draft.slice(0, 120)}"`);
      lastManifestErrors = [
        'You output plain text instead of a VA2 Design Manifest JSON. For the email channel you MUST output a JSON object with: theme, subject, preheader, sections (array of {type, order, content}), and metadata. Put the JSON inside a ```json fence. Do NOT output prose paragraphs.',
      ];
      lastDraft = draft;
      if (attempt + 1 >= maxAttempts) {
        // Last attempt: try to use whatever we have rather than failing completely
        console.warn(`[marketingOrchestrator] All ${maxAttempts} attempts produced plain text for email. Storing as body only (no VA2 manifest).`);
        lastManifestErrors = undefined;
      } else {
        continue;
      }
    }

    lastDraft = isInstagram ? validationText : draft;

    await contentDal.updateContent(caller, contentId, {
      body: isInstagram ? validationText : draft,
      title: brief.title ?? contentRow.title,
      channel: isInstagram ? 'instagram' : (brief.channel ?? contentRow.channel ?? undefined),
      ...(isInstagram
        ? {
            image_prompt: imagePrompt,
            visual_description: visualDesc,
          }
        : {}),
      ...(isEmail && emailManifestForStorage
        ? {
            body_design: {
              va2_manifest: emailManifestForStorage,
            },
          }
        : {}),
    });

    const targetChannel = brief.channel ?? contentRow.channel ?? 'linkedin';

    ctx.onProgress?.({ phase: 'generating', label: 'Generating content draft…', step: 3, maxSteps: 5, status: 'completed' });
    ctx.onProgress?.({ phase: 'validating', label: 'Validating content…', step: 4, maxSteps: 5, status: 'active' });

    log('run_gatekeepers_parallel', { contentId, attempt: attempt + 1, isInstagram });
    const [truthRaw, brandRaw, compRaw] = await Promise.all([
      runProductTruthValidation({
        organizationId: orgId,
        contentText: validationText,
        tenantId,
        userQuery: `orchestrator_product_truth_${contentId}`,
      }),
      runBrandVoiceCheck({
        organizationId: orgId,
        contentText: validationText,
        tenantId,
        userQuery: `orchestrator_brand_${contentId}`,
        targetChannel,
      }),
      runComplianceScan({
        organizationId: orgId,
        contentText: validationText,
        tenantId,
        contentType: brief.contentType ?? contentRow.content_type ?? 'social',
        targetChannel,
        userQuery: `orchestrator_compliance_${contentId}`,
        ...(isInstagram
          ? {
              imagePrompt,
              visualDescription: visualDesc,
            }
          : {}),
      }),
    ]);

    const tv = validateGatekeeperResult('product_truth', truthRaw, productTruthParsedSchema);
    const bv = validateGatekeeperResult('brand_voice', brandRaw, brandVoiceParsedSchema);
    const cv = validateGatekeeperResult('compliance', compRaw, complianceParsedSchema);

    if (!tv.ok || !bv.ok || !cv.ok) {
      const err = [!tv.ok ? tv.error : '', !bv.ok ? bv.error : '', !cv.ok ? cv.error : ''].filter(Boolean).join(' | ');
      log('gatekeeper_zod_failed', { err });
      return {
        status: 'failed',
        contentId,
        reason: `Validator output failed schema check: ${err}`,
        attempts: attempt + 1,
        lastDraft,
        toolObservations: combinedToolObs,
        toolsUsed: combinedTools,
      };
    }

    lastTruth = truthRaw;

    if (truthRaw.verdict === 'FAIL') {
      log('product_truth_fail', {
        attempt: attempt + 1,
        failed_reasons: truthRaw.failed_reasons,
      });
      if (attempt + 1 >= maxAttempts) {
        return {
          status: 'failed',
          contentId,
          reason: `Product truth still failing after ${maxAttempts} attempts: ${truthRaw.failed_reasons.join('; ')}`,
          attempts: attempt + 1,
          lastDraft,
          toolObservations: combinedToolObs,
          toolsUsed: combinedTools,
        };
      }
      continue;
    }

    log('product_truth_pass', { attempt: attempt + 1 });
    ctx.onProgress?.({ phase: 'validating', label: 'Validating content…', step: 4, maxSteps: 5, status: 'completed' });

    if (isInstagram) {
      ctx.onProgress?.({ phase: 'images', label: 'Generating images…', step: 5, maxSteps: 6, status: 'active' });
      /** Uses `runInstagramImageGeneration` — all Instagram T2I paths set `instagram_feed: true` for FAL_INSTAGRAM_* routing. */
      const igResult = await runInstagramImageGeneration({
        orgId,
        contentId,
        rawDraft: draft,
        caller,
        stylePreset: 'photoreal',
        intentContext: {
          title: brief.title ?? contentRow.title,
          userBrief: contentRow.user_brief ?? effectiveUserQuery ?? null,
        },
      });
      log('instagram_image_gen', {
        success: igResult.success,
        promptSource: igResult.promptSource,
        imageUrl: igResult.imageUrl?.slice(0, 80),
        error: igResult.error,
      });
      ctx.onProgress?.({ phase: 'images', label: 'Generating images…', step: 5, maxSteps: 6, status: 'completed' });
    }

    ctx.onProgress?.({ phase: 'finalizing', label: 'Finalizing…', step: 5, maxSteps: 5, status: 'active' });

    const approvalPayload = {
      content_id: contentId,
      validation_scores: {
        truth_validation: truthRaw as unknown as Record<string, unknown>,
        brand_voice_check: brandRaw as unknown as Record<string, unknown>,
        compliance_scan: compRaw as unknown as Record<string, unknown>,
      },
    };

    const assigned = await assignApproval(caller, approvalPayload);
    if (!assigned.ok) {
      log('assign_approval_failed', { error: assigned.error });
      return {
        status: 'failed',
        contentId,
        reason: assigned.error,
        attempts: attempt + 1,
        lastDraft,
        toolObservations: combinedToolObs,
        toolsUsed: combinedTools,
      };
    }

    log('assign_approval_ok', { approvalId: assigned.data.approval_id, contentId });
    ctx.onProgress?.({ phase: 'finalizing', label: 'Finalizing…', step: 5, maxSteps: 5, status: 'completed' });

    try {
      const latest = await contentDal.getContentById(caller, contentId);
      void runContentAtomizationAfterApproval({
        contentId,
        organizationId: orgId,
        channel: targetChannel,
        heroImageUrl: latest?.image_url ?? null,
      }).catch((err) => console.warn(`${LOG} content_atomization_batch`, err));
    } catch (e) {
      console.warn(`${LOG} atomization prefetch skipped`, e);
    }

    const draftOut = isInstagram ? validationText : draft;
    return {
      status: 'completed',
      contentId,
      draft: draftOut,
      approvalId: assigned.data.approval_id,
      attempts: attempt + 1,
      truth: truthRaw,
      brandVoice: brandRaw,
      compliance: compRaw,
      toolObservations: combinedToolObs,
      toolsUsed: combinedTools,
    };
  }

  throw new Error(`${LOG} content workflow exited without result (bug)`);
}

/**
 * Campaign Manager: tool loop with synthesis; if any write is intercepted for HITL,
 * returns `awaiting_confirmation` so the client can show approval cards before continuing.
 */
export async function executeCampaignWorkflow(
  request: string,
  ctx: MarketingOrchestrationContext,
): Promise<CampaignWorkflowResult> {
  log('campaign_workflow_start', {});
  const loopArgs = await buildCampaignManagerLoopArgs(ctx, request);
  const mini = await runMarketingMiniLoop(loopArgs);
  const pending = mini.pendingActions ?? [];

  if (pending.length > 0) {
    log('campaign_hitl_pause', { pendingCount: pending.length });
    return {
      status: 'awaiting_confirmation',
      message: mini.content,
      pendingActions: pending,
      toolObservations: mini.toolObservations,
      toolsUsed: mini.toolsUsed,
    };
  }

  log('campaign_workflow_complete', { tools: mini.toolsUsed.length });
  return {
    status: 'completed',
    message: mini.content,
    pendingActions: [],
    toolObservations: mini.toolObservations,
    toolsUsed: mini.toolsUsed,
  };
}

/**
 * Full lifecycle: route → campaign / content / both with campaign-first ordering and
 * optional content step after campaign when no pending confirmations block it.
 */
export async function runMarketingOrchestration(
  userMessage: string,
  ctx: MarketingOrchestrationContext,
): Promise<MarketingOrchestrationRunResult> {
  const route = await routeMarketingRequest(userMessage, ctx);
  log('route_decision', { route: route.route });

  if (route.route === 'CLARIFY') {
    const q = route.clarifyQuestion?.trim() || 'Could you share a bit more about what you want to achieve?';
    ctx.onStreamChunk?.(q);
    return { kind: 'clarify', question: q };
  }

  if (route.route === 'NOT_MARKETING') {
    const msg =
      route.notMarketingMessage?.trim() ||
      'That sounds outside marketing. Open **Dora** from the sidebar for finance, HR, projects, and other workspace help.';
    ctx.onStreamChunk?.(msg);
    return { kind: 'not_marketing', message: msg };
  }

  const note = route.campaignContextNote ? `Note: ${route.campaignContextNote}\n\n` : '';
  const inferredChannel = inferMarketingContentChannel(note + userMessage);
  const brief: ContentWorkflowBrief = {
    userQuery: note + userMessage,
    title: undefined,
    channel: inferredChannel,
    contentType: contentTypeForMarketingChannel(inferredChannel),
  };

  const order = marketingFlowSubagentOrder(route.route as MarketingRouteKind);

  if (order.length === 0) {
    return { kind: 'not_marketing', message: 'Unexpected route — no sub-agent to run.' };
  }

  let campaignResult: CampaignWorkflowResult | undefined;
  let contentResult: ContentWorkflowResult | undefined;
  let deferredReason: string | undefined;

  for (const step of order) {
    if (step === 'campaign') {
      campaignResult = await executeCampaignWorkflow(note + userMessage, ctx);
      ctx.onStreamChunk?.(campaignResult.message);
      if (campaignResult.status === 'awaiting_confirmation') {
        deferredReason =
          'Campaign step proposed actions that need user confirmation; content generation was not started.';
        log('orchestration_defer_content', { reason: deferredReason });
        return {
          kind: 'both',
          campaign: campaignResult,
          ...(contentResult ? { content: contentResult } : {}),
          deferredReason,
        };
      }
    }
    if (step === 'content') {
      const prior =
        campaignResult?.status === 'completed'
          ? campaignResult.message
          : campaignResult?.message;
      const briefWithPrior: ContentWorkflowBrief = {
        ...brief,
        userQuery: prior ? `${brief.userQuery}\n\nContext from campaign planning:\n${prior}` : brief.userQuery,
      };
      contentResult = await executeContentWorkflow(briefWithPrior, ctx);
      if (contentResult.status === 'completed') {
        ctx.onStreamChunk?.(`\n\n${contentResult.draft.slice(0, 2000)}`);
      }
    }
  }

  if (route.route === 'CONTENT_STRATEGIST' && contentResult) {
    return { kind: 'content', result: contentResult };
  }
  if (route.route === 'CAMPAIGN_MANAGER' && campaignResult) {
    return { kind: 'campaign', result: campaignResult };
  }

  if (route.route === 'BOTH_CAMPAIGN_THEN_CONTENT' && campaignResult) {
    return {
      kind: 'both',
      campaign: campaignResult,
      ...(contentResult ? { content: contentResult } : {}),
      ...(deferredReason ? { deferredReason } : {}),
    };
  }

  return { kind: 'not_marketing', message: 'Orchestration finished without a result.' };
}

export { parseMarketingRouteFromMessage, marketingFlowSubagentOrder };

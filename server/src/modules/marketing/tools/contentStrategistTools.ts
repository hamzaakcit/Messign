/**
 * Content Strategist — lookup product truth, check brand voice (fast LLM), stub competitor scan.
 */
import type { LLMParameterSchema, ToolRegistration } from '../../types.js';
import type { ToolResult } from '../../../services/ai/types.js';
import { resolveOrgIdForTool } from '../../../services/ai/tools/resolveOrgIdForTool.js';
import {
  executeProductTruthLookup,
  formatProductTruthLookupMarkdown,
  productTruthLookupArgsSchema,
} from '../../../services/marketing/productTruthSearchService.js';
import { formatZodIssues } from '../../../services/ai/toolArgSchemas.js';
import { runProductTruthValidation } from '../../../services/ai/marketing/productTruthValidator.js';
import { runBrandVoiceCheck, formatBrandVoiceCheckSummary } from '../../../services/ai/marketing/brandVoiceChecker.js';
import {
  runComplianceScan,
  formatComplianceScanSummary,
} from '../../../services/ai/marketing/complianceScanner.js';

/** Re-exported for unit tests (parser contract). */
export { parseBrandVoiceCheckJson } from '../../../services/ai/marketing/brandVoiceChecker.js';
export { parseComplianceScanJson } from '../../../services/ai/marketing/complianceScanner.js';

export const productTruthLookup: ToolRegistration = {
  name: 'marketing:product_truth_lookup',
  namespace: 'marketing',
  summary: 'Compact product truth: features, claims, blocked patterns, glossary, optional competitors.',
  tags: ['marketing', 'content', 'product', 'truth'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints:
    'query: string (or topic), competitor?: string, content_type?: string, feature_keys?: string[], include_competitors?: boolean',

  llmSchema: {
    type: 'function',
    function: {
      name: 'marketing:product_truth_lookup',
      description:
        'Search verified product truth across features, approved claims, blocked claims, and competitor map (workspace-scoped). Call before drafting external-facing copy. Uses fuzzy + text search — pass a clear `query` topic.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Topic or feature to look up (e.g. gamification, task management).',
          },
          topic: {
            type: 'string',
            description: 'Legacy alias for `query` if only one string arg is used.',
          },
          competitor: {
            type: 'string',
            description: 'Optional: narrow competitor map to this competitor name (comparison flows).',
          },
          content_type: {
            type: 'string',
            description: 'Optional: e.g. blog, social, email — helps prioritize claims with matching context_tags.',
          },
          feature_keys: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional exact feature name filters (narrow product truth rows).',
          },
          include_competitors: {
            type: 'boolean',
            description: 'Include competitor map rows when not using a specific competitor filter (default true).',
          },
        },
        required: [],
      } as LLMParameterSchema,
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgIdForTool(ctx);
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };

    const parsed = productTruthLookupArgsSchema.safeParse({
      query: typeof args.query === 'string' ? args.query : undefined,
      topic: typeof args.topic === 'string' ? args.topic : undefined,
      competitor: typeof args.competitor === 'string' ? args.competitor : undefined,
      content_type: typeof args.content_type === 'string' ? args.content_type : undefined,
      feature_keys: Array.isArray(args.feature_keys)
        ? args.feature_keys.filter((x): x is string => typeof x === 'string')
        : undefined,
      include_competitors: typeof args.include_competitors === 'boolean' ? args.include_competitors : undefined,
    });
    if (!parsed.success) {
      return { success: false, data: null, summary: formatZodIssues(parsed.error) };
    }

    const raw = await executeProductTruthLookup(organizationId, parsed.data);

    const md = formatProductTruthLookupMarkdown(raw);
    const q = raw.searchQuery;
    return {
      success: true,
      data: {
        format: 'markdown',
        query: q,
        counts: {
          features: raw.features.length,
          approved_claims: raw.approvedClaims.length,
          blocked_claims: raw.blockedClaims.length,
          competitor_rows: raw.competitorRows.length,
        },
      },
      summary: md,
      metadata: { source: 'product_truth_search_service' },
    };
  },
};

export const brandVoiceCheck: ToolRegistration = {
  name: 'marketing:brand_voice_check',
  namespace: 'marketing',
  summary: 'Score draft against brand voice (fast model); dimension scores + strengths/improvements.',
  tags: ['marketing', 'content', 'brand'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'draft_text: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'marketing:brand_voice_check',
      description:
        'Evaluate draft copy against the org brand voice profile. Returns a 0–100 score, five dimension scores (0–20 each), strengths, improvements, and policy notes.',
      parameters: {
        type: 'object',
        properties: {
          draft_text: { type: 'string', description: 'The marketing draft to evaluate.' },
        },
        required: ['draft_text'],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgIdForTool(ctx);
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };

    const draftText = typeof args.draft_text === 'string' ? args.draft_text.trim() : '';
    if (!draftText) {
      return { success: false, data: null, summary: 'draft_text is required.' };
    }

    const parsed = await runBrandVoiceCheck({
      organizationId,
      contentText: draftText,
      tenantId: organizationId,
      userQuery: 'brand_voice_check',
    });
    const summaryLines = formatBrandVoiceCheckSummary(parsed);

    return {
      success: true,
      data: parsed,
      summary: summaryLines,
      metadata: { source: 'brand_voice_check' },
    };
  },
};

export const complianceScan: ToolRegistration = {
  name: 'marketing:compliance_scan',
  namespace: 'marketing',
  summary:
    'Advisory legal/regulatory/reputational scan (warnings only). Does not block — use after product truth passes for reviewer.',
  tags: ['marketing', 'content', 'compliance'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'content: string, content_type?: string, target_channel?: string, topic?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'marketing:compliance_scan',
      description:
        'Scan draft for compliance risks (superlatives, guarantees, competitor language, privacy/security claims, pricing in copy, email spam triggers, etc.). Returns PASS or WARNING with structured warnings for human review — never a hard block.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The marketing content to scan.' },
          content_type: {
            type: 'string',
            description: 'Format e.g. blog, social, email, ad, landing (default blog).',
          },
          target_channel: {
            type: 'string',
            description: 'Where it will be published e.g. LinkedIn, website, email.',
          },
          topic: { type: 'string', description: 'Optional topic to narrow org blocked-claims / truth context.' },
        },
        required: ['content'],
      } as LLMParameterSchema,
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgIdForTool(ctx);
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };

    const text = typeof args.content === 'string' ? args.content.trim() : '';
    if (!text) {
      return { success: false, data: null, summary: 'content is required.' };
    }
    const contentType =
      typeof args.content_type === 'string' && args.content_type.trim() ? args.content_type.trim() : 'blog';
    const targetChannel =
      typeof args.target_channel === 'string' && args.target_channel.trim()
        ? args.target_channel.trim()
        : 'unspecified';
    const topic = typeof args.topic === 'string' ? args.topic.trim() : undefined;

    const result = await runComplianceScan({
      organizationId,
      contentText: text,
      tenantId: organizationId,
      contentType,
      targetChannel,
      topic: topic || undefined,
      userQuery: 'compliance_scan',
    });

    return {
      success: true,
      data: result,
      summary: formatComplianceScanSummary(result),
      metadata: { source: 'compliance_scanner' },
    };
  },
};

export const validateProductTruth: ToolRegistration = {
  name: 'marketing:validate_product_truth',
  namespace: 'marketing',
  summary: 'Binary product-truth validation (PASS/FAIL) with structured checks against org truth data.',
  tags: ['marketing', 'content', 'validation', 'truth'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'content: string, topic?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'marketing:validate_product_truth',
      description:
        'Validate marketing copy against the org product truth sheet (features, claims, blocked patterns, glossary). Returns PASS or FAIL with reasons.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The marketing content to validate.' },
          topic: { type: 'string', description: 'Optional topic to narrow loaded truth context.' },
        },
        required: ['content'],
      } as LLMParameterSchema,
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgIdForTool(ctx);
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };

    const content = typeof args.content === 'string' ? args.content.trim() : '';
    if (!content) {
      return { success: false, data: null, summary: 'content is required.' };
    }
    const topic = typeof args.topic === 'string' ? args.topic.trim() : undefined;

    const result = await runProductTruthValidation({
      organizationId,
      contentText: content,
      tenantId: organizationId,
      topic: topic || undefined,
      userQuery: 'validate_product_truth',
    });

    const summaryLines = [
      `**Verdict:** ${result.verdict}`,
      result.failed_reasons.length > 0
        ? `**Issues:**\n${result.failed_reasons.map((r) => `- ${r}`).join('\n')}`
        : '_No failed reasons listed._',
      result.features_referenced.length > 0
        ? `**Features referenced:** ${result.features_referenced.join(', ')}`
        : '',
      result.metrics_found.length > 0 ? `**Metrics found:** ${result.metrics_found.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      success: true,
      data: result,
      summary: summaryLines,
      metadata: { source: 'product_truth_validator' },
    };
  },
};

export const competitorContentScan: ToolRegistration = {
  name: 'marketing:competitor_content_scan',
  namespace: 'marketing',
  summary: 'Stub: competitor web scan not available in workspace.',
  tags: ['marketing', 'content', 'competitor'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'competitor_name?: string',

  llmSchema: {
    type: 'function',
    function: {
      name: 'marketing:competitor_content_scan',
      description:
        'Intended to summarize competitor content from the web. Not available in this workspace — returns limitation notice.',
      parameters: {
        type: 'object',
        properties: {
          competitor_name: { type: 'string', description: 'Optional competitor or product name for context.' },
        },
        required: [],
      },
    },
  },

  handler: async (args): Promise<ToolResult> => {
    const name = typeof args.competitor_name === 'string' ? args.competitor_name.trim() : '';
    const label = name ? ` (“${name}”)` : '';
    const summary = `**Competitor content scan${label}** is not available inside this workspace yet.

Use **approved competitor points** from \`marketing:product_truth_lookup\` and manual research (official sites, filings, reviews) outside the assistant. Do not invent competitor claims.`;
    return {
      success: true,
      data: { available: false, competitor_name: name || null },
      summary,
      metadata: { source: 'stub' },
    };
  },
};

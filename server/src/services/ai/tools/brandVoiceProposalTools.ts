/**
 * marketing:propose_brand_voice_patch — HITL: persist proposal rows; does not mutate brand profile directly.
 */
import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';

const proposeBrandVoicePatchTool: Tool = {
  name: 'marketing:propose_brand_voice_patch',
  category: 'analytics',
  metadata: {
    namespace: 'marketing',
    name: 'propose_brand_voice_patch',
    summary: 'Propose golden-example / tone updates for human review (Learner or strategist).',
    tags: ['marketing', 'brand', 'hitl'],
    alwaysLoaded: false,
    parameterHints: 'rationale; golden_example_additions?, tone_notes?',
  },
  description: `Propose structured updates to brand voice and golden examples from analytics or Learner output.

Creates a pending review record — does **not** apply changes to live brand profile. Marketing admins merge approved rows into brand examples in the hub.`,

  parameters: {
    type: 'object',
    properties: {
      rationale: { type: 'string', description: 'Why these changes are suggested.' },
      golden_example_additions: {
        type: 'array',
        description: 'Optional golden examples to add after approval (title, body, evidence_metrics).',
        items: { type: 'object', description: 'One proposed golden example.', properties: {} },
      },
      tone_notes: { type: 'array', items: { type: 'string' }, description: 'Optional tone notes.' },
    },
    required: ['rationale'],
  },

  requiredRoles: ['admin', 'manager', 'cpo'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    const rationale = typeof args.rationale === 'string' ? args.rationale.trim() : '';
    if (!rationale) {
      return { success: false, data: null, summary: 'Provide rationale.' };
    }

    const additions = Array.isArray(args.golden_example_additions) ? args.golden_example_additions : [];
    const tone =
      Array.isArray(args.tone_notes) && args.tone_notes.length > 0
        ? args.tone_notes.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        : [];

    const trace = typeof context.traceId === 'string' ? context.traceId : null;

    try {
      const r = await query<{ id: string }>(
        `INSERT INTO marketing_brand_voice_proposals (organization_id, rationale, golden_example_additions, tone_notes, created_by_trace)
         VALUES ($1::uuid, $2, $3::jsonb, $4::text[], $5)
         RETURNING id::text`,
        [orgId, rationale, JSON.stringify(additions), tone, trace],
      );
      const proposal_id = r.rows[0]?.id ?? '';
      return {
        success: true,
        data: { proposal_id, status: 'pending' },
        summary: `Brand voice proposal ${proposal_id} recorded as pending review.`,
        metadata: { source: 'marketing:propose_brand_voice_patch', count: 1 },
      };
    } catch (e) {
      return {
        success: false,
        data: null,
        summary: e instanceof Error ? e.message : String(e),
        metadata: { source: 'marketing:propose_brand_voice_patch' },
      };
    }
  },
};

registerTool(proposeBrandVoicePatchTool);

export { proposeBrandVoicePatchTool };

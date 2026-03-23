/**
 * AI tools: list / fetch saved email designs (marketing_content with Unlayer/HTML).
 */
import type { ToolRegistration } from '../../types.js';
import type { ToolContext, ToolResult } from '../../../services/ai/types.js';
import { resolveOrgIdForTool } from '../../../services/ai/tools/resolveOrgIdForTool.js';
import * as contentDal from '../../../dal/marketing/content.js';
import type { CallerContext } from '../../../dal/types.js';

function buildCaller(ctx: ToolContext, organizationId: string): CallerContext {
  return {
    userId: ctx.userId,
    role: (ctx.userRole ?? 'employee') as CallerContext['role'],
    organizationId,
  };
}

/** Cheap style hints from Unlayer JSON (first few background colors found). */
export function extractStyleHintsFromBodyDesign(design: Record<string, unknown>, maxColors = 6): string[] {
  const colors = new Set<string>();
  const hex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;

  const walk = (v: unknown): void => {
    if (colors.size >= maxColors) return;
    if (v == null) return;
    if (typeof v === 'string') {
      let m: RegExpExecArray | null;
      const re = new RegExp(hex);
      while ((m = re.exec(v)) !== null && colors.size < maxColors) {
        colors.add(m[0].toLowerCase());
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (typeof v === 'object') {
      for (const k of Object.keys(v as object)) {
        walk((v as Record<string, unknown>)[k]);
      }
    }
  };

  walk(design);
  return [...colors].slice(0, maxColors);
}

export const listSavedEmailDesigns: ToolRegistration = {
  name: 'marketing:list_saved_email_designs',
  namespace: 'marketing',
  summary: 'List recent email content rows with saved Unlayer design or HTML (template reference).',
  tags: ['marketing', 'email', 'template', 'unlayer'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'limit?: number',

  llmSchema: {
    type: 'function',
    function: {
      name: 'marketing:list_saved_email_designs',
      description:
        'Lists saved email designs in this workspace (titles, ids, excerpts). Use before drafting to mirror structure/tone.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max rows (default 10, max 20).' },
        },
        required: [],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgIdForTool(ctx);
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const caller = buildCaller(ctx, organizationId);
    const rawLimit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? args.limit : 10;
    const limit = Math.min(20, Math.max(1, Math.floor(rawLimit)));
    const rows = await contentDal.listRecentEmailContentWithVisuals(caller, { limit });
    const data = rows.map((r) => ({
      content_id: r.id,
      title: r.title,
      status: r.status,
      updated_at: r.updated_at,
      excerpt: r.excerpt,
      has_unlayer_design: r.has_design,
      has_html: r.has_html,
    }));
    const summary =
      data.length === 0
        ? 'No saved email designs with HTML or Unlayer design in this workspace yet.'
        : data.map((d) => `- ${d.title} (${d.content_id}): ${d.excerpt.slice(0, 120)}${d.excerpt.length > 120 ? '…' : ''}`).join('\n');
    return {
      success: true,
      data,
      summary,
      metadata: { source: 'marketing:list_saved_email_designs', count: data.length },
    };
  },
};

export const getSavedEmailDesign: ToolRegistration = {
  name: 'marketing:get_saved_email_design',
  namespace: 'marketing',
  summary: 'Fetch one saved email by content id: excerpt + style color hints from Unlayer JSON.',
  tags: ['marketing', 'email', 'template', 'unlayer'],
  requiredRoles: ['manager', 'admin'],
  deferLoaded: true,
  parameterHints: 'content_id',

  llmSchema: {
    type: 'function',
    function: {
      name: 'marketing:get_saved_email_design',
      description:
        'Returns excerpt and lightweight color hints from a saved email row. Does not return full Unlayer JSON.',
      parameters: {
        type: 'object',
        properties: {
          content_id: { type: 'string', description: 'UUID of marketing_content row.' },
        },
        required: ['content_id'],
      },
    },
  },

  handler: async (args, ctx): Promise<ToolResult> => {
    const organizationId = await resolveOrgIdForTool(ctx);
    if (!organizationId) return { success: false, data: null, summary: 'Organization not found.' };
    const caller = buildCaller(ctx, organizationId);
    const contentId = typeof args.content_id === 'string' ? args.content_id.trim() : '';
    if (!contentId) {
      return { success: false, data: null, summary: 'content_id is required.' };
    }
    const row = await contentDal.getContentById(caller, contentId);
    if (!row) {
      return { success: false, data: null, summary: 'Content not found or access denied.' };
    }
    if ((row.channel ?? '').toLowerCase() !== 'email') {
      return { success: false, data: null, summary: 'This row is not an email channel asset.' };
    }
    const excerpt = contentDal.excerptFromEmailContent(row.body, row.body_html, 800);
    const styleHints = row.body_design ? extractStyleHintsFromBodyDesign(row.body_design) : [];
    const data = {
      content_id: row.id,
      title: row.title,
      status: row.status,
      updated_at: row.updated_at,
      excerpt,
      style_color_hints: styleHints,
      has_unlayer_design: !!(row.body_design && Object.keys(row.body_design).length > 0),
      has_html: !!(row.body_html && row.body_html.trim().length > 0),
    };
    return {
      success: true,
      data,
      summary: `${row.title}: ${excerpt.slice(0, 200)}${excerpt.length > 200 ? '…' : ''}`,
      metadata: { source: 'marketing:get_saved_email_design' },
    };
  },
};

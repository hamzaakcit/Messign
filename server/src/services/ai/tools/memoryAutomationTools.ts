/**
 * Deliverable 4.5 — memory:store_golden_example, automation:manage_trigger
 */
import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { resolveOrgIdForTool } from './resolveOrgIdForTool.js';

const LEARNER_TRACE_PREFIX = 'learner:';

function isLearnerInvocation(context: ToolContext): boolean {
  return typeof context.traceId === 'string' && context.traceId.startsWith(LEARNER_TRACE_PREFIX);
}

const storeGoldenExampleTool: Tool = {
  name: 'memory:store_golden_example',
  category: 'analytics',
  metadata: {
    namespace: 'memory',
    name: 'store_golden_example',
    summary: 'Persist a golden content example with metrics (Learner / batch only).',
    tags: ['memory', 'marketing', 'golden', 'learner'],
    alwaysLoaded: false,
    parameterHints: 'content_id, content_text, performance_metrics; success_markers?, segment?, channel?',
  },
  description: `Store a high-performing content piece as a golden example in marketing memory with performance markers.

Reserved for the nightly Learner / batch analysis pipeline — do not call from end-user chat. The handler rejects calls unless the request trace is tagged as a Learner job (traceId prefix "${LEARNER_TRACE_PREFIX}").

Returns memory_id and embedding_stored (false until the embedding pipeline is wired).`,

  parameters: {
    type: 'object',
    properties: {
      content_id: { type: 'string', description: 'Stable id for the content (e.g. marketing_content id or external key).' },
      content_text: { type: 'string', description: 'Full text of the winning content.' },
      performance_metrics: {
        type: 'object',
        description: 'Actual performance data (CTR, conversions, engagement) as key-value JSON.',
        properties: {},
      },
      success_markers: {
        type: 'array',
        description: 'What made this content work (from Learner extraction).',
        items: { type: 'string' },
      },
      segment: { type: 'string', description: 'ICP segment label.' },
      channel: { type: 'string', description: 'Channel (e.g. email, social).' },
    },
    required: ['content_id', 'content_text', 'performance_metrics'],
  },

  requiredRoles: [],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (!isLearnerInvocation(context) && process.env.NODE_ENV !== 'test') {
      return {
        success: false,
        data: null,
        summary:
          'memory:store_golden_example is reserved for Learner/batch jobs (traceId must start with learner:). Do not call from user conversations.',
        metadata: { source: 'memory:store_golden_example' },
      };
    }

    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    const contentId = typeof args.content_id === 'string' ? args.content_id.trim() : '';
    const contentText = typeof args.content_text === 'string' ? args.content_text.trim() : '';
    const pm = args.performance_metrics;
    const performance_metrics =
      pm && typeof pm === 'object' && !Array.isArray(pm) ? (pm as Record<string, unknown>) : null;

    if (!contentId || !contentText || !performance_metrics) {
      return {
        success: false,
        data: null,
        summary: 'Provide content_id, content_text, and performance_metrics (object).',
      };
    }

    const successMarkers =
      Array.isArray(args.success_markers) && args.success_markers.length > 0
        ? args.success_markers.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : [];
    const segment = typeof args.segment === 'string' ? args.segment.trim() : null;
    const channel = typeof args.channel === 'string' ? args.channel.trim() : null;

    const embedding_stored = false;

    try {
      const r = await query<{ id: string }>(
        `
        INSERT INTO marketing_golden_examples (
          organization_id, content_id, content_text, performance_metrics, success_markers, segment, channel, embedding_stored
        )
        VALUES ($1::uuid, $2, $3, $4::jsonb, $5::text[], $6, $7, $8)
        ON CONFLICT (organization_id, content_id) DO UPDATE SET
          content_text = EXCLUDED.content_text,
          performance_metrics = EXCLUDED.performance_metrics,
          success_markers = EXCLUDED.success_markers,
          segment = EXCLUDED.segment,
          channel = EXCLUDED.channel,
          embedding_stored = EXCLUDED.embedding_stored
        RETURNING id::text AS id
        `,
        [
          orgId,
          contentId,
          contentText,
          JSON.stringify(performance_metrics),
          successMarkers,
          segment,
          channel,
          embedding_stored,
        ],
      );
      const memory_id = r.rows[0]?.id ?? '';
      return {
        success: true,
        data: { memory_id, embedding_stored },
        summary: `Stored golden example ${memory_id}. Embedding not persisted yet (embedding_stored=false).`,
        metadata: { source: 'memory:store_golden_example', count: 1 },
      };
    } catch (e) {
      return {
        success: false,
        data: null,
        summary: `Failed to store golden example: ${e instanceof Error ? e.message : String(e)}`,
        metadata: { source: 'memory:store_golden_example' },
      };
    }
  },
};

type TriggerAction = 'create' | 'update' | 'toggle' | 'delete' | 'list';

const manageTriggerTool: Tool = {
  name: 'automation:manage_trigger',
  category: 'analytics',
  metadata: {
    namespace: 'automation',
    name: 'manage_trigger',
    summary: 'Create, update, toggle, delete, or list marketing automation triggers.',
    tags: ['automation', 'marketing', 'triggers'],
    alwaysLoaded: false,
    parameterHints: 'action; trigger_id for mutating ops; config for create/update',
  },
  description: `Create, update, toggle, delete, or list marketing automation triggers for the current organization.

Creating or changing triggers requires admin/manager (or equivalent) responsibility — verify role before action=create. List is read-only for authorized marketing roles.

Projections and side effects depend on the worker runtime; this tool only persists trigger definitions.`,

  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Operation to perform.',
        enum: ['create', 'update', 'toggle', 'delete', 'list'],
      },
      trigger_id: { type: 'string', description: 'Trigger UUID — required for update, toggle, delete.' },
      config: {
        type: 'object',
        description: 'Trigger definition for create/update.',
        properties: {
          name: { type: 'string', description: 'Human-readable name.' },
          trigger_type: {
            type: 'string',
            enum: ['schedule', 'event', 'threshold', 'webhook'],
            description: 'Trigger kind.',
          },
          trigger_config: {
            type: 'object',
            description: 'Type-specific JSON (cron, event_name, threshold, etc.).',
            properties: {},
          },
          actions: {
            type: 'array',
            description: 'Action steps (invoke_agent, call_rest, send_notification).',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['invoke_agent', 'call_rest', 'send_notification'],
                  description: 'Action type.',
                },
                config: { type: 'object', description: 'Opaque config for the action.', properties: {} },
              },
            },
          },
          hitl_mode: {
            type: 'string',
            enum: ['autopilot', 'draft_and_wait', 'escalation'],
            description: 'Human-in-the-loop mode.',
          },
          enabled: { type: 'boolean', description: 'Whether the trigger is active.' },
        },
      },
    },
    required: ['action'],
  },

  requiredRoles: ['admin', 'manager', 'cpo'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const orgId = await resolveOrgIdForTool(context);
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    const action = typeof args.action === 'string' ? (args.action.trim() as TriggerAction) : ('' as TriggerAction);
    const validActions: TriggerAction[] = ['create', 'update', 'toggle', 'delete', 'list'];
    if (!validActions.includes(action)) {
      return { success: false, data: null, summary: 'Provide a valid action (create|update|toggle|delete|list).' };
    }

    const triggerId = typeof args.trigger_id === 'string' ? args.trigger_id.trim() : '';
    const cfg = args.config && typeof args.config === 'object' && args.config !== null ? (args.config as Record<string, unknown>) : {};

    try {
      if (action === 'list') {
        const r = await query<{
          id: string;
          name: string;
          trigger_type: string;
          enabled: boolean;
          hitl_mode: string;
          created_at: string;
        }>(
          `SELECT id::text, name, trigger_type, enabled, hitl_mode, created_at::text
           FROM marketing_automation_triggers
           WHERE organization_id = $1::uuid
           ORDER BY created_at DESC`,
          [orgId],
        );
        return {
          success: true,
          data: { trigger_id: '', status: 'listed', triggers: r.rows },
          summary: `${r.rows.length} automation trigger(s) for this organization.`,
          metadata: { source: 'automation:manage_trigger', count: r.rows.length },
        };
      }

      if (!triggerId && action !== 'create') {
        return { success: false, data: null, summary: 'trigger_id is required for update, toggle, and delete.' };
      }

      if (action === 'create') {
        const name = typeof cfg.name === 'string' ? cfg.name.trim() : '';
        const trigger_type = typeof cfg.trigger_type === 'string' ? cfg.trigger_type.trim() : '';
        const okType = ['schedule', 'event', 'threshold', 'webhook'].includes(trigger_type);
        if (!name || !okType) {
          return {
            success: false,
            data: null,
            summary: 'create requires config.name and config.trigger_type (schedule|event|threshold|webhook).',
          };
        }
        const trigger_config =
          cfg.trigger_config && typeof cfg.trigger_config === 'object' && !Array.isArray(cfg.trigger_config)
            ? cfg.trigger_config
            : {};
        const actions = Array.isArray(cfg.actions) ? cfg.actions : [];
        const hitl_mode =
          typeof cfg.hitl_mode === 'string' && ['autopilot', 'draft_and_wait', 'escalation'].includes(cfg.hitl_mode)
            ? cfg.hitl_mode
            : 'draft_and_wait';
        const enabled = typeof cfg.enabled === 'boolean' ? cfg.enabled : true;

        const ins = await query<{ id: string }>(
          `INSERT INTO marketing_automation_triggers (
            organization_id, name, trigger_type, trigger_config, actions, hitl_mode, enabled
          ) VALUES ($1::uuid, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
          RETURNING id::text AS id`,
          [orgId, name, trigger_type, JSON.stringify(trigger_config), JSON.stringify(actions), hitl_mode, enabled],
        );
        const id = ins.rows[0]?.id ?? '';
        return {
          success: true,
          data: { trigger_id: id, status: 'created' },
          summary: `Created automation trigger ${id}.`,
          metadata: { source: 'automation:manage_trigger', count: 1 },
        };
      }

      if (action === 'update') {
        const sets: string[] = [];
        const params: unknown[] = [orgId, triggerId];
        let p = 3;
        if (typeof cfg.name === 'string') {
          sets.push(`name = $${p++}`);
          params.push(cfg.name.trim());
        }
        if (typeof cfg.trigger_type === 'string' && ['schedule', 'event', 'threshold', 'webhook'].includes(cfg.trigger_type)) {
          sets.push(`trigger_type = $${p++}`);
          params.push(cfg.trigger_type.trim());
        }
        if (cfg.trigger_config && typeof cfg.trigger_config === 'object' && !Array.isArray(cfg.trigger_config)) {
          sets.push(`trigger_config = $${p++}::jsonb`);
          params.push(JSON.stringify(cfg.trigger_config));
        }
        if (Array.isArray(cfg.actions)) {
          sets.push(`actions = $${p++}::jsonb`);
          params.push(JSON.stringify(cfg.actions));
        }
        if (typeof cfg.hitl_mode === 'string' && ['autopilot', 'draft_and_wait', 'escalation'].includes(cfg.hitl_mode)) {
          sets.push(`hitl_mode = $${p++}`);
          params.push(cfg.hitl_mode);
        }
        if (typeof cfg.enabled === 'boolean') {
          sets.push(`enabled = $${p++}`);
          params.push(cfg.enabled);
        }
        if (sets.length === 0) {
          return { success: false, data: null, summary: 'update requires at least one field in config to change.' };
        }
        sets.push('updated_at = NOW()');
        const sql = `UPDATE marketing_automation_triggers SET ${sets.join(', ')}
          WHERE organization_id = $1::uuid AND id = $2::uuid
          RETURNING id::text`;
        const r = await query<{ id: string }>(sql, params);
        if (!r.rowCount) {
          return { success: false, data: null, summary: 'Trigger not found for this organization.' };
        }
        return {
          success: true,
          data: { trigger_id: r.rows[0]!.id, status: 'updated' },
          summary: 'Automation trigger updated.',
          metadata: { source: 'automation:manage_trigger' },
        };
      }

      if (action === 'toggle') {
        if (typeof cfg.enabled === 'boolean') {
          const r = await query<{ id: string }>(
            `UPDATE marketing_automation_triggers SET enabled = $3, updated_at = NOW()
             WHERE organization_id = $1::uuid AND id = $2::uuid
             RETURNING id::text`,
            [orgId, triggerId, cfg.enabled],
          );
          if (!r.rowCount) {
            return { success: false, data: null, summary: 'Trigger not found for this organization.' };
          }
          return {
            success: true,
            data: { trigger_id: r.rows[0]!.id, status: cfg.enabled ? 'enabled' : 'disabled' },
            summary: `Trigger ${cfg.enabled ? 'enabled' : 'disabled'}.`,
            metadata: { source: 'automation:manage_trigger' },
          };
        }
        const r = await query<{ id: string; enabled: boolean }>(
          `UPDATE marketing_automation_triggers SET enabled = NOT enabled, updated_at = NOW()
           WHERE organization_id = $1::uuid AND id = $2::uuid
           RETURNING id::text, enabled`,
          [orgId, triggerId],
        );
        if (!r.rowCount) {
          return { success: false, data: null, summary: 'Trigger not found for this organization.' };
        }
        const en = r.rows[0]!.enabled;
        return {
          success: true,
          data: { trigger_id: r.rows[0]!.id, status: en ? 'enabled' : 'disabled' },
          summary: `Trigger toggled to ${en ? 'enabled' : 'disabled'}.`,
          metadata: { source: 'automation:manage_trigger' },
        };
      }

      if (action === 'delete') {
        const r = await query(
          `DELETE FROM marketing_automation_triggers WHERE organization_id = $1::uuid AND id = $2::uuid RETURNING id::text`,
          [orgId, triggerId],
        );
        if (!r.rowCount) {
          return { success: false, data: null, summary: 'Trigger not found for this organization.' };
        }
        return {
          success: true,
          data: { trigger_id: triggerId, status: 'deleted' },
          summary: 'Automation trigger deleted.',
          metadata: { source: 'automation:manage_trigger' },
        };
      }

      return { success: false, data: null, summary: 'Unsupported action.' };
    } catch (e) {
      return {
        success: false,
        data: null,
        summary: `automation:manage_trigger failed: ${e instanceof Error ? e.message : String(e)}`,
        metadata: { source: 'automation:manage_trigger' },
      };
    }
  },
};

registerTool(storeGoldenExampleTool);
registerTool(manageTriggerTool);

export { storeGoldenExampleTool, manageTriggerTool };

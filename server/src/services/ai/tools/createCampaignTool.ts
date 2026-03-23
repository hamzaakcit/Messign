/**
 * marketing:create_campaign — registered for LLM schemas (getLLMToolsForExactNames).
 * Dora marketing mini-loop uses interceptWriteAction for the same tool name; direct
 * activation (e.g. core:activate_tool) creates a pending action here.
 */
import { createPendingAction } from '../actions/actionStore.js';
import type { ActionDisplayField } from '../actions/types.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

function buildCampaignPreview(args: Record<string, unknown>): {
  description: string;
  displayFields: ActionDisplayField[];
  editableFields: string[];
  sanitizedPayload: Record<string, unknown>;
} {
  const rawBudget = args.budget;
  const budgetNum =
    typeof rawBudget === 'number' && Number.isFinite(rawBudget)
      ? rawBudget
      : typeof rawBudget === 'string'
        ? parseFloat(rawBudget.replace(/[^0-9.-]/g, '')) || 0
        : 0;
  const payload = {
    name: (args.name as string) || '',
    channel: (args.channel as string) || '',
    budget: budgetNum,
    startDate: (args.startDate as string) || '',
    description: (args.description as string) || '',
  };
  return {
    description: `Create campaign "${payload.name}" on ${payload.channel}`,
    displayFields: [
      { key: 'name', label: 'Name', type: 'text', value: payload.name, editable: true },
      { key: 'channel', label: 'Channel', type: 'text', value: payload.channel, editable: true },
      { key: 'budget', label: 'Budget', type: 'number', value: payload.budget, editable: true },
      { key: 'startDate', label: 'Start Date', type: 'date', value: payload.startDate, editable: true },
      { key: 'description', label: 'Description', type: 'textarea', value: payload.description, editable: true },
    ],
    editableFields: ['name', 'channel', 'budget', 'startDate', 'description'],
    sanitizedPayload: payload,
  };
}

const createCampaignTool: Tool = {
  name: 'marketing:create_campaign',
  category: 'analytics',
  metadata: {
    namespace: 'marketing',
    name: 'create_campaign',
    summary: 'Propose a new marketing campaign (HITL confirmation).',
    tags: ['marketing', 'campaign', 'hitl', 'write'],
    alwaysLoaded: false,
    parameterHints: 'name, channel, budget, startDate?, description?',
  },
  description: `[ACTION] Create a new marketing campaign. Requires confirmation in the Marketing hub or pending-actions flow before the row is persisted.`,

  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Campaign name.' },
      channel: { type: 'string', description: 'Primary campaign channel.' },
      budget: {
        description: 'Campaign budget amount (number or numeric string).',
        anyOf: [
          { type: 'number', description: 'Campaign budget amount.' },
          { type: 'string', description: 'Budget as a numeric string (e.g. "5000").' },
        ],
      },
      startDate: { type: 'string', description: 'Campaign start date (YYYY-MM-DD).' },
      description: { type: 'string', description: 'Campaign summary.' },
    },
    required: ['name', 'channel', 'budget'],
  },

  requiredRoles: ['admin', 'manager', 'dept_head', 'system_admin'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const preview = buildCampaignPreview(args);
    const originQuery =
      typeof context.traceId === 'string' && context.traceId.length > 0
        ? `marketing:create_campaign (trace ${context.traceId})`
        : 'marketing:create_campaign (direct tool activation)';

    const pending = await createPendingAction(
      context.userId,
      'marketing:create_campaign',
      preview.sanitizedPayload,
      preview.description,
      preview.displayFields,
      preview.editableFields,
      originQuery,
      {
        organizationId: context.organizationId ?? null,
        idempotencyKey: context.idempotencyKey ?? null,
      },
    );

    return {
      success: true,
      data: { actionProposed: true, token: pending.token },
      summary:
        `[ACTION PROPOSED — Awaiting user confirmation]\n` +
        `Action: ${preview.description}\n` +
        `The user can review and confirm this campaign in pending actions.`,
      metadata: { source: 'marketing:create_campaign', count: 0 },
    };
  },
};

registerTool(createCampaignTool);

export { createCampaignTool };

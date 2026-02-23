import type {
  WriteActionType,
  ActionDisplayField,
  PendingActionSSEEvent,
} from './types.js';
import type { ToolResult } from '../types.js';
import type { DoraRequestContext } from '../dora/types.js';
import { WRITE_TOOL_NAMES } from '../tools/writeDefinitions.js';
import { createPendingAction } from './actionStore.js';

export function isWriteTool(toolName: string): boolean {
  return WRITE_TOOL_NAMES.has(toolName);
}

function buildActionPreview(
  toolName: string,
  args: Record<string, unknown>,
  ctx: DoraRequestContext,
): {
  description: string;
  displayFields: ActionDisplayField[];
  editableFields: string[];
  sanitizedPayload: Record<string, unknown>;
} {
  switch (toolName) {
    case 'create_task': {
      const assignee = args.assignee === 'me' ? ctx.user.userName : (args.assignee as string) || ctx.user.userName;

      const payload = {
        title: (args.title as string) || 'New Task',
        description: (args.description as string) || '',
        project_name: (args.project_name as string) || '',
        assignee,
        priority: (args.priority as string) || 'medium',
        due_date: (args.due_date as string) || '',
        mp_reward: (args.mp_reward as number) || 10,
      };

      return {
        description: `Create task "${payload.title}" in ${payload.project_name}, assigned to ${payload.assignee}`,
        displayFields: [
          { key: 'title',        label: 'Task Title',  type: 'text',     value: payload.title,        editable: true },
          { key: 'description',  label: 'Description', type: 'textarea', value: payload.description,  editable: true },
          { key: 'project_name', label: 'Project',     type: 'text',     value: payload.project_name, editable: true },
          { key: 'assignee',     label: 'Assigned To', type: 'text',     value: payload.assignee,     editable: true },
          {
            key: 'priority', label: 'Priority', type: 'select', value: payload.priority, editable: true,
            options: [
              { label: 'Low', value: 'low' },
              { label: 'Medium', value: 'medium' },
              { label: 'High', value: 'high' },
              { label: 'Urgent', value: 'urgent' },
            ],
          },
          { key: 'due_date',  label: 'Due Date',  type: 'date',   value: payload.due_date,  editable: true },
          { key: 'mp_reward', label: 'MP Reward', type: 'number', value: payload.mp_reward, editable: true },
        ],
        editableFields: ['title', 'description', 'project_name', 'assignee', 'priority', 'due_date', 'mp_reward'],
        sanitizedPayload: payload,
      };
    }

    case 'update_task_status': {
      const payload = {
        task_title: (args.task_title as string) || '',
        new_status: (args.new_status as string) || 'done',
      };

      return {
        description: `Update task "${payload.task_title}" status to ${payload.new_status}`,
        displayFields: [
          { key: 'task_title', label: 'Task', type: 'readonly', value: payload.task_title, editable: false },
          {
            key: 'new_status', label: 'New Status', type: 'select', value: payload.new_status, editable: true,
            options: [
              { label: 'In Progress', value: 'in_progress' },
              { label: 'Review', value: 'review' },
              { label: 'Done', value: 'done' },
              { label: 'Blocked', value: 'blocked' },
            ],
          },
        ],
        editableFields: ['new_status'],
        sanitizedPayload: payload,
      };
    }

    case 'update_task': {
      const payload = {
        task_id: (args.task_id as string) || '',
        due_date: (args.due_date as string) || '',
        title: (args.title as string) || '',
        description: (args.description as string) || '',
        priority: (args.priority as string) || '',
        status: (args.status as string) || '',
      };

      const parts: string[] = [];
      if (payload.due_date) parts.push(`due date to ${payload.due_date}`);
      if (payload.title) parts.push(`title to "${payload.title}"`);
      if (payload.priority) parts.push(`priority to ${payload.priority}`);
      if (payload.status) parts.push(`status to ${payload.status}`);
      const description = parts.length > 0
        ? `Update task ${payload.task_id}: ${parts.join(', ')}`
        : `Update task ${payload.task_id}`;

      const displayFields: ActionDisplayField[] = [
        { key: 'task_id', label: 'Task ID', type: 'readonly', value: payload.task_id, editable: false },
        { key: 'due_date', label: 'Due Date', type: 'date', value: payload.due_date, editable: true },
        { key: 'title', label: 'Title', type: 'text', value: payload.title, editable: true },
        {
          key: 'priority', label: 'Priority', type: 'select', value: payload.priority || '', editable: true,
          options: [
            { label: 'Low', value: 'low' },
            { label: 'Medium', value: 'medium' },
            { label: 'High', value: 'high' },
            { label: 'Urgent', value: 'urgent' },
            { label: 'Critical', value: 'critical' },
          ],
        },
        {
          key: 'status', label: 'Status', type: 'select', value: payload.status || '', editable: true,
          options: [
            { label: 'To Do', value: 'todo' },
            { label: 'In Progress', value: 'in_progress' },
            { label: 'Blocked', value: 'blocked' },
            { label: 'Done', value: 'done' },
          ],
        },
      ];

      return {
        description,
        displayFields,
        editableFields: ['due_date', 'title', 'description', 'priority', 'status'],
        sanitizedPayload: payload,
      };
    }

    case 'draft_invoice': {
      const payload = {
        client_name: (args.client_name as string) || '',
        amount: (args.amount as number) || 0,
        description: (args.description as string) || '',
        due_date: (args.due_date as string) || '',
      };

      return {
        description: `Draft invoice for ${payload.client_name}: $${payload.amount.toLocaleString()}`,
        displayFields: [
          { key: 'client_name', label: 'Client',      type: 'text',     value: payload.client_name, editable: true },
          { key: 'amount',      label: 'Amount ($)',   type: 'number',   value: payload.amount,      editable: true },
          { key: 'description', label: 'Description',  type: 'textarea', value: payload.description, editable: true },
          { key: 'due_date',    label: 'Due Date',     type: 'date',     value: payload.due_date,    editable: true },
        ],
        editableFields: ['client_name', 'amount', 'description', 'due_date'],
        sanitizedPayload: payload,
      };
    }

    case 'send_chat_message': {
      const payload = {
        channel: (args.channel as string) || 'general',
        message: (args.message as string) || '',
      };

      return {
        description: `Send message to #${payload.channel}`,
        displayFields: [
          { key: 'channel', label: 'Channel', type: 'text',     value: payload.channel, editable: true },
          { key: 'message', label: 'Message', type: 'textarea', value: payload.message, editable: true },
        ],
        editableFields: ['channel', 'message'],
        sanitizedPayload: payload,
      };
    }

    case 'send_reminder': {
      const recipient = args.recipient === 'me' ? ctx.user.userName : (args.recipient as string) || '';

      const payload = {
        recipient,
        message: (args.message as string) || '',
        send_at: (args.send_at as string) || 'now',
      };

      return {
        description: `Send reminder to ${payload.recipient}: "${payload.message.substring(0, 50)}..."`,
        displayFields: [
          { key: 'recipient', label: 'To',      type: 'text',     value: payload.recipient, editable: true },
          { key: 'message',   label: 'Message', type: 'textarea', value: payload.message,   editable: true },
          { key: 'send_at',   label: 'Send At', type: 'text',     value: payload.send_at,   editable: true },
        ],
        editableFields: ['recipient', 'message', 'send_at'],
        sanitizedPayload: payload,
      };
    }

    default: {
      return {
        description: `Execute ${toolName} action`,
        displayFields: Object.entries(args).map(([key, value]) => ({
          key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          type: 'text' as const,
          value,
          editable: true,
        })),
        editableFields: Object.keys(args),
        sanitizedPayload: args,
      };
    }
  }
}

/**
 * Intercepts a write tool call and creates a pending action instead of executing it.
 * Returns a ToolResult for the orchestrator and an SSE event for the frontend.
 */
export async function interceptWriteAction(
  toolName: string,
  args: Record<string, unknown>,
  ctx: DoraRequestContext,
  originQuery: string,
): Promise<{
  toolResult: ToolResult;
  sseEvent: PendingActionSSEEvent;
}> {
  const startTime = Date.now();

  const preview = buildActionPreview(toolName, args, ctx);

  const pendingAction = await createPendingAction(
    ctx.user.userId,
    toolName as WriteActionType,
    preview.sanitizedPayload,
    preview.description,
    preview.displayFields,
    preview.editableFields,
    originQuery,
  );

  const toolResult: ToolResult = {
    success: true,
    data: { actionProposed: true, token: pendingAction.token },
    summary:
      `[ACTION PROPOSED — Awaiting user confirmation]\n` +
      `Action: ${preview.description}\n` +
      `The user will see a confirmation card and can edit the details before approving. ` +
      `Tell the user you've drafted this action and ask them to review it below.`,
    metadata: {
      source: 'action_interceptor',
      count: 0,
    },
  };

  const sseEvent: PendingActionSSEEvent = {
    type: 'pending_action',
    content: {
      token: pendingAction.token,
      actionType: pendingAction.actionType,
      description: pendingAction.description,
      displayFields: pendingAction.displayFields,
      editableFields: pendingAction.editableFields,
      expiresAt: pendingAction.expiresAt,
      payload: pendingAction.payload,
    },
  };

  console.log(
    `[ActionInterceptor] Intercepted ${toolName} → pending action ${pendingAction.token.substring(0, 8)}... (${Date.now() - startTime}ms)`,
  );

  return { toolResult, sseEvent };
}

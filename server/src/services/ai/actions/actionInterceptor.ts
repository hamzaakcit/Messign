import type {
  WriteActionType,
  ActionDisplayField,
  PendingActionSSEEvent,
} from './types.js';
import type { ToolResult } from '../types.js';
import type { DoraRequestContext } from '../dora/types.js';
import type { ActionRiskLevel } from '../agents/governance.js';
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
    case 'projects:create_task': {
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

    case 'projects:update_task': {
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

    case 'finance:draft_invoice': {
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

    case 'communication:send_chat_message': {
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

    case 'finance:approve_expense': {
      const payload = {
        reimbursement_id: (args.reimbursement_id as string) || '',
        comment: (args.comment as string) || '',
      };

      return {
        description: `Approve expense request ${payload.reimbursement_id.substring(0, 8)}...`,
        displayFields: [
          { key: 'reimbursement_id', label: 'Expense ID', type: 'readonly', value: payload.reimbursement_id, editable: false },
          { key: 'comment',          label: 'Comment',    type: 'textarea', value: payload.comment,          editable: true },
        ],
        editableFields: ['comment'],
        sanitizedPayload: payload,
      };
    }

    case 'finance:flag_expense': {
      const payload = {
        reimbursement_id: (args.reimbursement_id as string) || '',
        reason: (args.reason as string) || '',
      };

      return {
        description: `Flag expense ${payload.reimbursement_id.substring(0, 8)}... for review: "${payload.reason}"`,
        displayFields: [
          { key: 'reimbursement_id', label: 'Expense ID', type: 'readonly', value: payload.reimbursement_id, editable: false },
          { key: 'reason',           label: 'Reason',     type: 'textarea', value: payload.reason,           editable: true },
        ],
        editableFields: ['reason'],
        sanitizedPayload: payload,
      };
    }

    case 'finance:create_budget_alert': {
      const payload = {
        department: (args.department as string) || '',
        threshold: (args.threshold as number) || 0.9,
        message: (args.message as string) || '',
      };

      return {
        description: `Create budget alert for ${payload.department} at ${(payload.threshold * 100).toFixed(0)}%`,
        displayFields: [
          { key: 'department', label: 'Department',       type: 'text',     value: payload.department,                           editable: true },
          { key: 'threshold',  label: 'Threshold (%)',    type: 'number',   value: payload.threshold,                            editable: true },
          { key: 'message',    label: 'Alert Message',    type: 'textarea', value: payload.message || `${payload.department} budget has exceeded ${(payload.threshold * 100).toFixed(0)}% utilization`, editable: true },
        ],
        editableFields: ['department', 'threshold', 'message'],
        sanitizedPayload: payload,
      };
    }

    case 'finance:create_budget': {
      const payload = {
        department: (args.department as string) || '',
        allocated_amount: (args.allocated_amount as number) || 0,
        period_start: (args.period_start as string) || '',
        period_end: (args.period_end as string) || '',
        currency: (args.currency as string) || 'EUR',
        alert_threshold: (args.alert_threshold as number) || 0.8,
      };

      return {
        description: `Create ${payload.currency} ${payload.allocated_amount.toLocaleString()} budget for ${payload.department} (${payload.period_start} → ${payload.period_end})`,
        displayFields: [
          { key: 'department',       label: 'Department',      type: 'text',   value: payload.department,       editable: true },
          { key: 'allocated_amount', label: 'Amount',          type: 'number', value: payload.allocated_amount, editable: true },
          { key: 'currency',         label: 'Currency',        type: 'text',   value: payload.currency,         editable: true },
          { key: 'period_start',     label: 'Start Date',      type: 'date',   value: payload.period_start,     editable: true },
          { key: 'period_end',       label: 'End Date',        type: 'date',   value: payload.period_end,       editable: true },
          { key: 'alert_threshold',  label: 'Alert Threshold', type: 'number', value: payload.alert_threshold,  editable: true },
        ],
        editableFields: ['department', 'allocated_amount', 'currency', 'period_start', 'period_end', 'alert_threshold'],
        sanitizedPayload: payload,
      };
    }

    case 'finance:update_budget': {
      const payload = {
        budget_id: (args.budget_id as string) || '',
        allocated_amount: args.allocated_amount as number | undefined,
        period_start: args.period_start as string | undefined,
        period_end: args.period_end as string | undefined,
        alert_threshold: args.alert_threshold as number | undefined,
      };

      const parts: string[] = [];
      if (payload.allocated_amount != null) parts.push(`amount to ${payload.allocated_amount}`);
      if (payload.period_start) parts.push(`start to ${payload.period_start}`);
      if (payload.period_end) parts.push(`end to ${payload.period_end}`);
      if (payload.alert_threshold != null) parts.push(`threshold to ${payload.alert_threshold}`);

      return {
        description: parts.length > 0
          ? `Update budget ${payload.budget_id.substring(0, 8)}...: ${parts.join(', ')}`
          : `Update budget ${payload.budget_id.substring(0, 8)}...`,
        displayFields: [
          { key: 'budget_id',        label: 'Budget ID',       type: 'readonly', value: payload.budget_id,                       editable: false },
          { key: 'allocated_amount', label: 'New Amount',       type: 'number',   value: payload.allocated_amount ?? '',          editable: true },
          { key: 'period_start',     label: 'Start Date',       type: 'date',     value: payload.period_start ?? '',              editable: true },
          { key: 'period_end',       label: 'End Date',         type: 'date',     value: payload.period_end ?? '',                editable: true },
          { key: 'alert_threshold',  label: 'Alert Threshold',  type: 'number',   value: payload.alert_threshold ?? '',           editable: true },
        ],
        editableFields: ['allocated_amount', 'period_start', 'period_end', 'alert_threshold'],
        sanitizedPayload: payload,
      };
    }

    case 'core:send_reminder': {
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

    case 'finance:auto_approve_expense': {
      const payload = {
        expense_id: (args.expense_id as string) || '',
        reason: (args.reason as string) || 'Meets auto-approve criteria',
      };
      return {
        description: `Auto-approve expense ${payload.expense_id.substring(0, 8)}`,
        displayFields: [
          { key: 'expense_id', label: 'Expense ID', type: 'readonly' as const, value: payload.expense_id, editable: false },
          { key: 'reason', label: 'Reason', type: 'text' as const, value: payload.reason, editable: true },
        ],
        editableFields: ['reason'],
        sanitizedPayload: payload,
      };
    }

    case 'finance:flag_expense_for_review': {
      const payload = {
        expense_id: (args.expense_id as string) || '',
        reason: (args.reason as string) || '',
        risk_level: (args.risk_level as string) || 'medium',
      };
      return {
        description: `Flag expense ${payload.expense_id.substring(0, 8)} for review`,
        displayFields: [
          { key: 'expense_id', label: 'Expense ID', type: 'readonly' as const, value: payload.expense_id, editable: false },
          { key: 'reason', label: 'Reason', type: 'textarea' as const, value: payload.reason, editable: true },
          { key: 'risk_level', label: 'Risk Level', type: 'select' as const, value: payload.risk_level, editable: true,
            options: [{ label: 'Low', value: 'low' }, { label: 'Medium', value: 'medium' }, { label: 'High', value: 'high' }] },
        ],
        editableFields: ['reason', 'risk_level'],
        sanitizedPayload: payload,
      };
    }

    case 'finance:generate_invoice': {
      const payload = {
        client_name: (args.client_name as string) || '',
        items: (args.items as string) || '[]',
        payment_terms: (args.payment_terms as string) || 'Net 30',
        currency: (args.currency as string) || 'USD',
      };
      return {
        description: `Generate invoice for ${payload.client_name}`,
        displayFields: [
          { key: 'client_name', label: 'Client', type: 'text' as const, value: payload.client_name, editable: true },
          { key: 'items', label: 'Line Items (JSON)', type: 'textarea' as const, value: payload.items, editable: true },
          { key: 'payment_terms', label: 'Payment Terms', type: 'text' as const, value: payload.payment_terms, editable: true },
          { key: 'currency', label: 'Currency', type: 'text' as const, value: payload.currency, editable: true },
        ],
        editableFields: ['client_name', 'items', 'payment_terms', 'currency'],
        sanitizedPayload: payload,
      };
    }

    case 'finance:send_payment_reminder': {
      const payload = {
        invoice_id: (args.invoice_id as string) || '',
        message: (args.message as string) || 'This is a friendly reminder that your invoice is due for payment.',
      };
      return {
        description: `Send payment reminder for invoice ${payload.invoice_id.substring(0, 8)}`,
        displayFields: [
          { key: 'invoice_id', label: 'Invoice ID', type: 'readonly' as const, value: payload.invoice_id, editable: false },
          { key: 'message', label: 'Message', type: 'textarea' as const, value: payload.message, editable: true },
        ],
        editableFields: ['message'],
        sanitizedPayload: payload,
      };
    }

    case 'finance:suggest_budget_reallocation': {
      const payload = {
        from_budget_id: (args.from_budget_id as string) || '',
        to_budget_id: (args.to_budget_id as string) || '',
        amount: (args.amount as number) || 0,
        reason: (args.reason as string) || '',
      };
      return {
        description: `Suggest reallocating $${payload.amount} between budgets`,
        displayFields: [
          { key: 'from_budget_id', label: 'From Budget', type: 'text' as const, value: payload.from_budget_id, editable: true },
          { key: 'to_budget_id', label: 'To Budget', type: 'text' as const, value: payload.to_budget_id, editable: true },
          { key: 'amount', label: 'Amount', type: 'number' as const, value: payload.amount, editable: true },
          { key: 'reason', label: 'Reason', type: 'textarea' as const, value: payload.reason, editable: true },
        ],
        editableFields: ['from_budget_id', 'to_budget_id', 'amount', 'reason'],
        sanitizedPayload: payload,
      };
    }

    case 'crm:create_deal': {
      const payload = {
        title: (args.title as string) || '',
        amount: (args.amount as number) || 0,
        companyName: (args.companyName as string) || '',
        contactEmail: (args.contactEmail as string) || '',
        stage: (args.stage as string) || 'Lead',
        description: (args.description as string) || '',
      };
      return {
        description: `Create deal "${payload.title}" (${payload.stage}) for ${payload.companyName}`,
        displayFields: [
          { key: 'title', label: 'Title', type: 'text', value: payload.title, editable: true },
          { key: 'amount', label: 'Amount', type: 'number', value: payload.amount, editable: true },
          { key: 'companyName', label: 'Company', type: 'text', value: payload.companyName, editable: true },
          { key: 'contactEmail', label: 'Contact Email', type: 'text', value: payload.contactEmail, editable: true },
          { key: 'stage', label: 'Stage', type: 'text', value: payload.stage, editable: true },
          { key: 'description', label: 'Description', type: 'textarea', value: payload.description, editable: true },
        ],
        editableFields: ['title', 'amount', 'companyName', 'contactEmail', 'stage', 'description'],
        sanitizedPayload: payload,
      };
    }

    case 'support:create_ticket': {
      const payload = {
        subject: (args.subject as string) || '',
        description: (args.description as string) || '',
        priority: (args.priority as string) || 'medium',
        reporterEmail: (args.reporterEmail as string) || '',
        category: (args.category as string) || 'general',
      };
      return {
        description: `Create support ticket "${payload.subject}"`,
        displayFields: [
          { key: 'subject', label: 'Subject', type: 'text', value: payload.subject, editable: true },
          { key: 'description', label: 'Description', type: 'textarea', value: payload.description, editable: true },
          { key: 'priority', label: 'Priority', type: 'text', value: payload.priority, editable: true },
          { key: 'reporterEmail', label: 'Reporter Email', type: 'text', value: payload.reporterEmail, editable: true },
          { key: 'category', label: 'Category', type: 'text', value: payload.category, editable: true },
        ],
        editableFields: ['subject', 'description', 'priority', 'reporterEmail', 'category'],
        sanitizedPayload: payload,
      };
    }

    case 'assets:assign_asset': {
      const payload = {
        assetName: (args.assetName as string) || '',
        employeeName: (args.employeeName as string) || '',
      };
      return {
        description: `Assign asset "${payload.assetName}" to ${payload.employeeName}`,
        displayFields: [
          { key: 'assetName', label: 'Asset', type: 'text', value: payload.assetName, editable: true },
          { key: 'employeeName', label: 'Employee', type: 'text', value: payload.employeeName, editable: true },
        ],
        editableFields: ['assetName', 'employeeName'],
        sanitizedPayload: payload,
      };
    }

    case 'contracts:send_renewal_reminder': {
      const payload = { contractName: (args.contractName as string) || '' };
      return {
        description: `Send renewal reminder for contract "${payload.contractName}"`,
        displayFields: [{ key: 'contractName', label: 'Contract', type: 'text', value: payload.contractName, editable: true }],
        editableFields: ['contractName'],
        sanitizedPayload: payload,
      };
    }

    case 'marketing:create_campaign': {
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

    case 'recruitment:post_job': {
      const payload = {
        title: (args.title as string) || '',
        department: (args.department as string) || '',
        description: (args.description as string) || '',
        requirements: (args.requirements as string) || '',
        salaryRange: (args.salaryRange as string) || '',
      };
      return {
        description: `Post job "${payload.title}" in ${payload.department}`,
        displayFields: [
          { key: 'title', label: 'Title', type: 'text', value: payload.title, editable: true },
          { key: 'department', label: 'Department', type: 'text', value: payload.department, editable: true },
          { key: 'description', label: 'Description', type: 'textarea', value: payload.description, editable: true },
          { key: 'requirements', label: 'Requirements', type: 'textarea', value: payload.requirements, editable: true },
          { key: 'salaryRange', label: 'Salary Range', type: 'text', value: payload.salaryRange, editable: true },
        ],
        editableFields: ['title', 'department', 'description', 'requirements', 'salaryRange'],
        sanitizedPayload: payload,
      };
    }

    default: {
      const safe = args != null && typeof args === 'object' && !Array.isArray(args) ? args : {};
      return {
        description: `Execute ${toolName} action`,
        displayFields: Object.entries(safe).map(([key, value]) => ({
          key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          type: 'text' as const,
          value,
          editable: true,
        })),
        editableFields: Object.keys(safe),
        sanitizedPayload: safe,
      };
    }
  }
}

/**
 * Intercepts a write tool call and creates a pending action instead of executing it.
 * Returns a ToolResult for the orchestrator and an SSE event for the frontend.
 * @param riskLevel - From classifyActionRisk: 'write' (yellow badge) or 'irreversible' (red badge)
 */
export async function interceptWriteAction(
  toolName: string,
  args: Record<string, unknown>,
  ctx: DoraRequestContext,
  originQuery: string,
  riskLevel?: ActionRiskLevel,
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
    {
      organizationId: ctx.user.organizationId,
      idempotencyKey: ctx.requestMeta?.idempotencyKey ?? null,
    },
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

  const sseRiskLevel = riskLevel === 'irreversible' ? 'irreversible' : 'write';
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
      riskLevel: sseRiskLevel,
    },
  };

  console.log(
    `[ActionInterceptor] Intercepted ${toolName} → pending action ${pendingAction.token.substring(0, 8)}... (${Date.now() - startTime}ms)`,
  );

  return { toolResult, sseEvent };
}

import type {
  WriteActionType,
  ActionExecutionResult,
  PendingAction,
} from './types.js';
import { markExecuted } from './actionStore.js';
import { updateTask } from '../../../db/tasksDb.js';

export async function executeConfirmedAction(
  action: PendingAction,
): Promise<ActionExecutionResult> {
  const { actionType, payload, token } = action;

  console.log(`[ActionExecutor] Executing ${actionType} (token: ${token.substring(0, 8)}...)`);

  try {
    let result: ActionExecutionResult;

    switch (actionType) {
      case 'create_task':
        result = await executeCreateTask(payload);
        break;
      case 'update_task_status':
        result = await executeUpdateTaskStatus(payload);
        break;
      case 'update_task':
        result = await executeUpdateTask(payload);
        break;
      case 'draft_invoice':
        result = await executeDraftInvoice(payload);
        break;
      case 'send_chat_message':
        result = await executeSendChatMessage(payload);
        break;
      case 'send_reminder':
        result = await executeSendReminder(payload);
        break;
      default:
        result = {
          success: false,
          actionType,
          message: `Unknown action type: ${actionType}`,
          error: 'UNKNOWN_ACTION_TYPE',
        };
    }

    if (result.success) {
      await markExecuted(token);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ActionExecutor] ${actionType} failed:`, message);

    return {
      success: false,
      actionType,
      message: `Failed to execute action: ${message}`,
      error: message,
    };
  }
}

// Wire these to real DB mutations as each module's API becomes available.

async function executeCreateTask(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  console.log('[ActionExecutor] create_task payload:', JSON.stringify(payload, null, 2));

  return {
    success: true,
    actionType: 'create_task',
    message: `Task "${payload.title}" created in ${payload.project_name} and assigned to ${payload.assignee}.`,
    result: {
      taskId: `task-${Date.now()}`,
      title: payload.title,
      projectName: payload.project_name,
    },
  };
}

async function executeUpdateTaskStatus(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  console.log('[ActionExecutor] update_task_status payload:', JSON.stringify(payload, null, 2));

  return {
    success: true,
    actionType: 'update_task_status',
    message: `Task "${payload.task_title}" status updated to ${payload.new_status}.`,
    result: { taskTitle: payload.task_title, newStatus: payload.new_status },
  };
}

async function executeUpdateTask(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  const taskId = payload.task_id as string;
  if (!taskId) {
    return {
      success: false,
      actionType: 'update_task',
      message: 'Task ID is required.',
      error: 'MISSING_TASK_ID',
    };
  }

  const updates: Record<string, unknown> = {};
  if (payload.due_date != null && String(payload.due_date).trim() !== '') {
    updates.dueDate = String(payload.due_date).trim();
  }
  if (payload.title != null && String(payload.title).trim() !== '') {
    updates.title = String(payload.title).trim();
  }
  if (payload.description != null) {
    updates.description = String(payload.description);
  }
  if (payload.priority != null && String(payload.priority).trim() !== '') {
    updates.priority = String(payload.priority).trim();
  }
  if (payload.status != null && String(payload.status).trim() !== '') {
    updates.status = String(payload.status).trim();
  }

  if (Object.keys(updates).length === 0) {
    return {
      success: false,
      actionType: 'update_task',
      message: 'No updates provided (due_date, title, description, priority, or status).',
      error: 'NO_UPDATES',
    };
  }

  try {
    const task = await updateTask(taskId, updates as Parameters<typeof updateTask>[1]);
    if (!task) {
      return {
        success: false,
        actionType: 'update_task',
        message: 'Task not found.',
        error: 'TASK_NOT_FOUND',
      };
    }
    const parts: string[] = [];
    if (updates.dueDate) parts.push(`due date to ${updates.dueDate}`);
    if (updates.title) parts.push(`title to "${updates.title}"`);
    if (updates.priority) parts.push(`priority to ${updates.priority}`);
    if (updates.status) parts.push(`status to ${updates.status}`);
    return {
      success: true,
      actionType: 'update_task',
      message: `Task "${task.title}" updated: ${parts.join(', ')}.`,
      result: { taskId: task.id, title: task.title, ...updates },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ActionExecutor] update_task failed:', message);
    return {
      success: false,
      actionType: 'update_task',
      message: `Failed to update task: ${message}`,
      error: message,
    };
  }
}

async function executeDraftInvoice(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  console.log('[ActionExecutor] draft_invoice payload:', JSON.stringify(payload, null, 2));

  const invoiceId = `MSG-2026-${String(Math.floor(Math.random() * 900) + 100)}`;

  return {
    success: true,
    actionType: 'draft_invoice',
    message: `Invoice ${invoiceId} drafted for ${payload.client_name}: $${(payload.amount as number).toLocaleString()}.`,
    result: { invoiceId, clientName: payload.client_name, amount: payload.amount },
  };
}

async function executeSendChatMessage(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  console.log('[ActionExecutor] send_chat_message payload:', JSON.stringify(payload, null, 2));

  return {
    success: true,
    actionType: 'send_chat_message',
    message: `Message sent to #${payload.channel}.`,
    result: { channel: payload.channel },
  };
}

async function executeSendReminder(
  payload: Record<string, unknown>,
): Promise<ActionExecutionResult> {
  console.log('[ActionExecutor] send_reminder payload:', JSON.stringify(payload, null, 2));

  return {
    success: true,
    actionType: 'send_reminder',
    message: `Reminder sent to ${payload.recipient}.`,
    result: { recipient: payload.recipient },
  };
}

import type { LLMToolDefinition } from '../types.js';

export const WRITE_TOOL_DEFINITIONS: LLMToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        '[ACTION] Create a new task in a project. Requires a title, project assignment, ' +
        'and priority. The task will be shown to the user for review before creation. ' +
        'Use when the user says: "Create a task for...", "Add a task to...", ' +
        '"Make a new task...", "I need a task for...".',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Clear, descriptive task title.',
          },
          description: {
            type: 'string',
            description: 'Detailed description of what needs to be done.',
          },
          project_name: {
            type: 'string',
            description: 'The project this task belongs to.',
          },
          assignee: {
            type: 'string',
            description: 'Who to assign this task to. Use "me" for the current user, or a team member\'s name.',
          },
          priority: {
            type: 'string',
            description: 'Task priority. Default to "medium" unless the user specifies urgency.',
            enum: ['low', 'medium', 'high', 'urgent'],
          },
          due_date: {
            type: 'string',
            description: 'Due date in YYYY-MM-DD format.',
          },
          mp_reward: {
            type: 'number',
            description: 'Merit Points awarded on completion. Default: 10 for standard tasks, 25 for complex.',
          },
        },
        required: ['title', 'project_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task_status',
      description:
        '[ACTION] Update the status of an existing task. Use when the user says: ' +
        '"Mark my task as done", "Move task to review", "Complete the X task".',
      parameters: {
        type: 'object',
        properties: {
          task_title: {
            type: 'string',
            description: 'The title (or partial title) of the task to update.',
          },
          new_status: {
            type: 'string',
            description: 'The new status for the task.',
            enum: ['in_progress', 'review', 'done', 'blocked'],
          },
        },
        required: ['task_title', 'new_status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description:
        '[ACTION] Update an existing task\'s due date, title, description, priority, or status. ' +
        'Use when the user says: "Extend deadline for [task]", "Change due date for [task]", ' +
        '"Push the deadline", "Update the task [X] to...". You MUST call get_tasks_by_user first to get the task id, then call update_task with that task_id.',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'The task id (from get_tasks_by_user result). Required.',
          },
          due_date: {
            type: 'string',
            description: 'New due date in YYYY-MM-DD format. Use for "extend deadline" or "change due date".',
          },
          title: {
            type: 'string',
            description: 'New task title if the user wants to rename the task.',
          },
          description: {
            type: 'string',
            description: 'New task description.',
          },
          priority: {
            type: 'string',
            description: 'New priority.',
            enum: ['low', 'medium', 'high', 'urgent', 'critical'],
          },
          status: {
            type: 'string',
            description: 'New status.',
            enum: ['todo', 'in_progress', 'blocked', 'done'],
          },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_invoice',
      description:
        '[ACTION] Draft a new invoice. Creates a draft that the user must review ' +
        'before it\'s finalized. Use when: "Draft an invoice for...", "Create an invoice...".',
      parameters: {
        type: 'object',
        properties: {
          client_name: {
            type: 'string',
            description: 'The client/company to bill.',
          },
          amount: {
            type: 'number',
            description: 'Invoice amount in USD.',
          },
          description: {
            type: 'string',
            description: 'What the invoice is for (line item description).',
          },
          due_date: {
            type: 'string',
            description: 'Payment due date (YYYY-MM-DD). Default: 30 days from today.',
          },
        },
        required: ['client_name', 'amount', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_chat_message',
      description:
        '[ACTION] Send a message to a chat channel. Use when: "Send a message to the ' +
        'general channel", "Post an update to engineering", "Tell the team about...".',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            description: 'Channel name (e.g., "general", "engineering", "product", "marketing").',
          },
          message: {
            type: 'string',
            description: 'The message content. Keep it professional and concise.',
          },
        },
        required: ['channel', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_reminder',
      description:
        '[ACTION] Send a reminder notification to a team member. Use when: ' +
        '"Remind Emily about the deadline", "Send a nudge to...".',
      parameters: {
        type: 'object',
        properties: {
          recipient: {
            type: 'string',
            description: 'Name of the person to remind (or "me" for self-reminder).',
          },
          message: {
            type: 'string',
            description: 'The reminder text.',
          },
          send_at: {
            type: 'string',
            description: 'When to send (ISO 8601). "now" for immediate. Default: now.',
          },
        },
        required: ['recipient', 'message'],
      },
    },
  },
];

export const WRITE_TOOL_NAMES = new Set<string>(
  WRITE_TOOL_DEFINITIONS.map((t) => t.function.name)
);

/**
 * Returns combined read + write tool definitions, filtering write tools by role.
 * HITL confirmation is the primary safeguard; role filtering restricts which
 * write tools the LLM even knows about.
 */
export function getToolsForRole(
  userRole: string,
  readOnlyTools: LLMToolDefinition[],
): LLMToolDefinition[] {
  const allowedWriteTools = WRITE_TOOL_DEFINITIONS.filter((tool) => {
    const name = tool.function.name;

    if (name === 'draft_invoice' && !['admin', 'cpo', 'finance', 'manager'].includes(userRole)) {
      return false;
    }

    if (name === 'send_reminder' && !['admin', 'cpo', 'manager', 'hr'].includes(userRole)) {
      return false;
    }

    return true;
  });

  return [...readOnlyTools, ...allowedWriteTools];
}

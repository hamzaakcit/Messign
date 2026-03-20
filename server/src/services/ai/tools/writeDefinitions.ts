import type { LLMToolDefinition } from '../types.js';

export const WRITE_TOOL_DEFINITIONS: LLMToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'projects:create_task',
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
      name: 'projects:update_task_status',
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
      name: 'projects:update_task',
      description:
        '[ACTION] Update an existing task\'s due date, title, description, priority, or status. ' +
        'Use when the user says: "Extend deadline for [task]", "Change due date for [task]", ' +
        '"Push the deadline", "Update the task [X] to...". You MUST call projects:get_tasks_by_user first to get the task id, then call projects:update_task with that task_id.',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'The task id (from projects:get_tasks_by_user result). Required.',
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
      name: 'finance:draft_invoice',
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
      name: 'communication:send_chat_message',
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
      name: 'core:send_reminder',
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
  {
    type: 'function',
    function: {
      name: 'finance:approve_expense',
      description:
        '[ACTION] Approve a reimbursement expense request. Moves the expense to the next approval stage. ' +
        'Only managers, finance, and admins can approve. Use when: ' +
        '"Approve that expense", "Approve the travel reimbursement from Emily".',
      parameters: {
        type: 'object',
        properties: {
          reimbursement_id: {
            type: 'string',
            description: 'The reimbursement request ID to approve.',
          },
          comment: {
            type: 'string',
            description: 'Optional approval comment or note.',
          },
        },
        required: ['reimbursement_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finance:flag_expense',
      description:
        '[ACTION] Flag a suspicious or unusual expense for review. Adds a review flag and notifies the submitter\'s manager. ' +
        'Use when: "Flag this expense", "This expense looks suspicious", "Mark the receipt for review".',
      parameters: {
        type: 'object',
        properties: {
          reimbursement_id: {
            type: 'string',
            description: 'The reimbursement request ID to flag.',
          },
          reason: {
            type: 'string',
            description: 'Why this expense is being flagged (e.g., "Unusual amount", "Missing receipt", "Duplicate submission").',
          },
        },
        required: ['reimbursement_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finance:create_budget_alert',
      description:
        '[ACTION] Create a budget threshold alert for a department. Sends a notification when budget usage crosses the threshold. ' +
        'Use when: "Alert me when engineering hits 90% budget", "Set up a budget warning".',
      parameters: {
        type: 'object',
        properties: {
          department: {
            type: 'string',
            description: 'Department to monitor.',
          },
          threshold: {
            type: 'number',
            description: 'Fraction (0-1) at which to trigger the alert. E.g., 0.9 = 90%.',
          },
          message: {
            type: 'string',
            description: 'Custom alert message.',
          },
        },
        required: ['department', 'threshold'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finance:create_budget',
      description:
        '[ACTION] Create a new department budget with allocated amount and date range. ' +
        'Only admins and finance can create budgets. Use when: ' +
        '"Create a budget for engineering", "Set Q1 budget for marketing".',
      parameters: {
        type: 'object',
        properties: {
          department: {
            type: 'string',
            description: 'The department this budget is for (e.g., "Engineering", "Marketing").',
          },
          allocated_amount: {
            type: 'number',
            description: 'Total budget amount allocated.',
          },
          period_start: {
            type: 'string',
            description: 'Budget period start date (YYYY-MM-DD).',
          },
          period_end: {
            type: 'string',
            description: 'Budget period end date (YYYY-MM-DD).',
          },
          currency: {
            type: 'string',
            description: 'Currency code (default: EUR).',
          },
          alert_threshold: {
            type: 'number',
            description: 'Fraction (0-1) at which to trigger alerts. Default: 0.80 (80%).',
          },
        },
        required: ['department', 'allocated_amount', 'period_start', 'period_end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finance:update_budget',
      description:
        '[ACTION] Update an existing budget\'s amount, dates, or alert threshold. ' +
        'Use when: "Increase the engineering budget", "Change Q1 budget to...".',
      parameters: {
        type: 'object',
        properties: {
          budget_id: {
            type: 'string',
            description: 'The budget ID to update (from get_budget_status result).',
          },
          allocated_amount: {
            type: 'number',
            description: 'New allocated amount.',
          },
          period_start: {
            type: 'string',
            description: 'New period start (YYYY-MM-DD).',
          },
          period_end: {
            type: 'string',
            description: 'New period end (YYYY-MM-DD).',
          },
          alert_threshold: {
            type: 'number',
            description: 'New alert threshold (0-1).',
          },
        },
        required: ['budget_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finance:auto_approve_expense',
      description:
        '[ACTION] Automatically approve an expense that meets all policy criteria. ' +
        'Only for expenses under the auto-approve threshold with high AI confidence.',
      parameters: {
        type: 'object',
        properties: {
          expense_id: { type: 'string', description: 'The expense ID to auto-approve.' },
          reason: { type: 'string', description: 'Reason for auto-approval.' },
        },
        required: ['expense_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finance:flag_expense_for_review',
      description:
        '[ACTION] Flag an expense for manual review due to policy violations, anomalies, or risk factors.',
      parameters: {
        type: 'object',
        properties: {
          expense_id: { type: 'string', description: 'The expense ID to flag.' },
          reason: { type: 'string', description: 'Why this expense needs review.' },
          risk_level: { type: 'string', description: 'Risk severity.', enum: ['low', 'medium', 'high'] },
        },
        required: ['expense_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finance:generate_invoice',
      description:
        '[ACTION] Generate a draft invoice for a client. Specify the client name, line items, and payment terms.',
      parameters: {
        type: 'object',
        properties: {
          client_name: { type: 'string', description: 'Client or company name.' },
          items: { type: 'string', description: 'JSON array of line items [{description, quantity, unit_price}].' },
          payment_terms: { type: 'string', description: 'Payment terms e.g. "Net 30".' },
          currency: { type: 'string', description: 'Currency code. Default: USD.' },
        },
        required: ['client_name', 'items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finance:send_payment_reminder',
      description:
        '[ACTION] Send a payment reminder for an overdue invoice. Creates a notification for the responsible party.',
      parameters: {
        type: 'object',
        properties: {
          invoice_id: { type: 'string', description: 'The invoice ID to send reminder for.' },
          message: { type: 'string', description: 'Custom reminder message.' },
        },
        required: ['invoice_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finance:suggest_budget_reallocation',
      description:
        '[ACTION] Suggest moving budget from an under-utilized category to an over-utilized one.',
      parameters: {
        type: 'object',
        properties: {
          from_budget_id: { type: 'string', description: 'Source budget to move funds from.' },
          to_budget_id: { type: 'string', description: 'Target budget to move funds to.' },
          amount: { type: 'number', description: 'Amount to reallocate.' },
          reason: { type: 'string', description: 'Reason for reallocation.' },
        },
        required: ['from_budget_id', 'to_budget_id', 'amount', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crm:create_deal',
      description: '[ACTION] Create a new deal in the Sales CRM pipeline.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Deal title.' },
          amount: { type: 'number', description: 'Deal amount.' },
          companyName: { type: 'string', description: 'Company name (fuzzy match).' },
          contactEmail: { type: 'string', description: 'Primary contact email.' },
          stage: { type: 'string', description: 'Pipeline stage.', default: 'Lead' },
          description: { type: 'string', description: 'Deal description.' },
        },
        required: ['title', 'amount', 'companyName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'support:create_ticket',
      description: '[ACTION] Create a new support ticket.',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Ticket subject line.' },
          description: { type: 'string', description: 'Ticket details and customer context.' },
          priority: { type: 'string', description: 'Ticket urgency level.', enum: ['low', 'medium', 'high', 'critical'] },
          reporterEmail: { type: 'string', description: 'Reporter email address.' },
          category: { type: 'string', description: 'Ticket category.' },
        },
        required: ['subject', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'assets:assign_asset',
      description: '[ACTION] Assign an asset or equipment to an employee.',
      parameters: {
        type: 'object',
        properties: {
          assetName: { type: 'string', description: 'Asset name for fuzzy matching.' },
          employeeName: { type: 'string', description: 'Employee full name for fuzzy matching.' },
        },
        required: ['assetName', 'employeeName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'contracts:send_renewal_reminder',
      description: '[ACTION] Send a renewal reminder for an expiring contract.',
      parameters: {
        type: 'object',
        properties: {
          contractName: { type: 'string', description: 'Contract title for fuzzy match.' },
        },
        required: ['contractName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'marketing:create_campaign',
      description: '[ACTION] Create a new marketing campaign.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Campaign name.' },
          channel: { type: 'string', description: 'Primary campaign channel.' },
          budget: { type: 'number', description: 'Campaign budget amount.' },
          startDate: { type: 'string', description: 'Campaign start date (YYYY-MM-DD).' },
          description: { type: 'string', description: 'Campaign summary.' },
        },
        required: ['name', 'channel', 'budget'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'marketing:propose_brand_voice_patch',
      description:
        '[ACTION] Propose golden-example / brand voice updates for admin review. Does not apply changes until approved in the Marketing hub.',
      parameters: {
        type: 'object',
        properties: {
          rationale: { type: 'string', description: 'Why these changes are suggested.' },
        },
        required: ['rationale'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recruitment:post_job',
      description: '[ACTION] Post a new job opening.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Job title.' },
          department: { type: 'string', description: 'Hiring department.' },
          description: { type: 'string', description: 'Job description.' },
          requirements: { type: 'string', description: 'Comma-separated requirements.' },
          salaryRange: { type: 'string', description: 'Salary range text.' },
        },
        required: ['title', 'department', 'description'],
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

    if (name === 'finance:draft_invoice' && !['admin', 'cpo', 'finance', 'manager'].includes(userRole)) {
      return false;
    }

    if (name === 'core:send_reminder' && !['admin', 'cpo', 'manager', 'hr'].includes(userRole)) {
      return false;
    }

    if ((name === 'finance:create_budget' || name === 'finance:update_budget') && !['admin', 'finance'].includes(userRole)) {
      return false;
    }

    if (name === 'finance:approve_expense' && !['admin', 'finance', 'manager'].includes(userRole)) {
      return false;
    }

    if (name === 'finance:flag_expense' && !['admin', 'finance', 'manager', 'hr'].includes(userRole)) {
      return false;
    }

    if (name === 'finance:create_budget_alert' && !['admin', 'finance', 'manager'].includes(userRole)) {
      return false;
    }

    if (name === 'finance:auto_approve_expense' && !['admin', 'finance'].includes(userRole)) {
      return false;
    }

    if (name === 'finance:flag_expense_for_review' && !['admin', 'finance', 'manager'].includes(userRole)) {
      return false;
    }

    if (name === 'finance:generate_invoice' && !['admin', 'finance'].includes(userRole)) {
      return false;
    }

    if (name === 'finance:send_payment_reminder' && !['admin', 'finance'].includes(userRole)) {
      return false;
    }

    if (name === 'finance:suggest_budget_reallocation' && !['admin', 'finance'].includes(userRole)) {
      return false;
    }

    if (name === 'crm:create_deal' && !['admin', 'manager', 'dept_head', 'system_admin'].includes(userRole)) {
      return false;
    }

    if (name === 'support:create_ticket' && !['admin', 'manager', 'member', 'dept_head', 'system_admin'].includes(userRole)) {
      return false;
    }

    if (name === 'assets:assign_asset' && !['admin', 'manager', 'dept_head', 'system_admin'].includes(userRole)) {
      return false;
    }

    if (name === 'contracts:send_renewal_reminder' && !['admin', 'manager', 'dept_head', 'system_admin'].includes(userRole)) {
      return false;
    }

    if (name === 'marketing:create_campaign' && !['admin', 'manager', 'dept_head', 'system_admin'].includes(userRole)) {
      return false;
    }

    if (name === 'marketing:propose_brand_voice_patch' && !['admin', 'manager', 'cpo', 'dept_head', 'system_admin'].includes(userRole)) {
      return false;
    }

    if (name === 'recruitment:post_job' && !['admin', 'manager', 'dept_head', 'system_admin'].includes(userRole)) {
      return false;
    }

    return true;
  });

  return [...readOnlyTools, ...allowedWriteTools];
}

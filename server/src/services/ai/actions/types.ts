export type WriteActionType =
  | 'projects:create_task'
  | 'projects:update_task_status'
  | 'projects:update_task'
  | 'finance:draft_invoice'
  | 'communication:send_chat_message'
  | 'core:send_reminder'
  | 'finance:approve_expense'
  | 'finance:flag_expense'
  | 'finance:create_budget_alert'
  | 'finance:create_budget'
  | 'finance:update_budget'
  | 'finance:auto_approve_expense'
  | 'finance:flag_expense_for_review'
  | 'finance:generate_invoice'
  | 'finance:send_payment_reminder'
  | 'finance:suggest_budget_reallocation'
  | 'crm:create_deal'
  | 'support:create_ticket'
  | 'assets:assign_asset'
  | 'contracts:send_renewal_reminder'
  | 'marketing:create_campaign'
  | 'recruitment:post_job';

export interface PendingAction {
  token: string;
  actionType: WriteActionType;
  payload: Record<string, unknown>;
  description: string;
  displayFields: ActionDisplayField[];
  editableFields: string[];
  userId: string;
  expiresAt: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'executed';
  createdAt: string;
  originQuery: string;
}

export interface ActionDisplayField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'date' | 'number' | 'readonly';
  value: unknown;
  options?: Array<{ label: string; value: string }>;
  editable: boolean;
}

export interface PendingActionSSEEvent {
  type: 'pending_action';
  content: {
    token: string;
    actionType: WriteActionType;
    description: string;
    displayFields: ActionDisplayField[];
    editableFields: string[];
    expiresAt: string;
    payload: Record<string, unknown>;
  };
}

export interface ConfirmActionRequest {
  actionToken: string;
  payload: Record<string, unknown>;
}

export interface ActionExecutionResult {
  success: boolean;
  actionType: WriteActionType;
  message: string;
  result?: Record<string, unknown>;
  error?: string;
}

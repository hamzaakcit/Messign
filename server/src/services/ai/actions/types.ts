export type WriteActionType =
  | 'create_task'
  | 'update_task_status'
  | 'update_task'
  | 'draft_invoice'
  | 'send_chat_message'
  | 'send_reminder';

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

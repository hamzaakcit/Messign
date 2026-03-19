/**
 * Act mode: offer a confirmation payload before executing mutation-style requests.
 */

export interface ActConfirmationPayload {
  type: 'confirmation';
  action: string;
  params: Record<string, unknown>;
  message: string;
}

export function inferActConfirmation(
  query: string,
  clientIntent: string,
): ActConfirmationPayload | null {
  const q = query.toLowerCase();
  const intent = clientIntent.toLowerCase();

  if (
    /\b(create|draft|new|generate)\b[\s\S]{0,40}\binvoice\b/.test(q) ||
    /\binvoice\b[\s\S]{0,20}\b(for|to)\b/.test(q) ||
    intent.includes('draft_invoice')
  ) {
    return {
      type: 'confirmation',
      action: 'create_invoice',
      params: { intent: clientIntent || null, query },
      message: `Create invoice as requested: "${query.slice(0, 160)}${query.length > 160 ? '…' : ''}"?`,
    };
  }

  if (/\bassign\b[\s\S]{0,30}\btask\b|\breassign\b[\s\S]{0,20}\btask\b/.test(q)) {
    return {
      type: 'confirmation',
      action: 'assign_task',
      params: { intent: clientIntent || null, query },
      message: `Assign or reassign tasks as requested: "${query.slice(0, 160)}${query.length > 160 ? '…' : ''}"?`,
    };
  }

  if (/\b(create|add|open|new)\s+task\b/.test(q)) {
    return {
      type: 'confirmation',
      action: 'create_task',
      params: { intent: clientIntent || null, query },
      message: `Create task: "${query.slice(0, 160)}${query.length > 160 ? '…' : ''}"?`,
    };
  }

  return null;
}

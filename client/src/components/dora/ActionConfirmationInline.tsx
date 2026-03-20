import { useState } from 'react';
import type { DoraPendingActionContent } from '@/types/knowledge-hub/ai';

export interface ActionConfirmationInlineProps {
  action: DoraPendingActionContent;
  onConfirm: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}

/**
 * Inline HITL card for SSE `pending_action` events (token-based flow).
 * Shared by FloatingWidget and DoraPage (via AIMessageBubble).
 */
export function ActionConfirmationInline({
  action,
  onConfirm,
  onCancel,
}: ActionConfirmationInlineProps) {
  const [editedPayload, setEditedPayload] = useState<Record<string, unknown>>(
    () => ({ ...action.payload }),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payloadExpanded, setPayloadExpanded] = useState(false);

  const handleFieldChange = (key: string, value: unknown) => {
    setEditedPayload((prev) => ({ ...prev, [key]: value }));
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    await onConfirm(editedPayload);
    setIsSubmitting(false);
  };

  const typeIcons: Record<string, string> = {
    create_task: '✅',
    update_task_status: '🔄',
    draft_invoice: '💰',
    send_chat_message: '💬',
    send_reminder: '🔔',
  };

  const isIrreversible = action.riskLevel === 'irreversible';
  const riskBadge = isIrreversible ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-500/40">
      This action cannot be undone
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/40">
      Dora wants to modify data
    </span>
  );

  return (
    <div
      className={`mt-3 rounded-lg border p-3 ${isIrreversible ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-sm">{typeIcons[action.actionType] || '⚡'}</span>
        <span className="text-xs font-medium text-amber-400">Action: Review & Confirm</span>
        {riskBadge}
      </div>

      <p className="text-xs text-gray-300 mb-2.5">{action.description}</p>

      <div className="mb-2.5">
        <button
          type="button"
          className="text-[10px] text-gray-500 hover:text-gray-400 cursor-pointer"
          onClick={() => setPayloadExpanded((v) => !v)}
        >
          {payloadExpanded ? 'Hide' : 'Show'} full payload
        </button>
        {payloadExpanded && (
          <pre className="mt-1 p-2 rounded bg-gray-900/80 text-[10px] text-gray-400 overflow-x-auto max-h-32 overflow-y-auto">
            {JSON.stringify(action.payload, null, 2)}
          </pre>
        )}
      </div>

      <div className="space-y-2">
        {action.displayFields.map((field) => (
          <div key={field.key}>
            <label className="text-[10px] text-gray-500 block mb-0.5">{field.label}</label>

            {field.type === 'readonly' ? (
              <p className="text-xs text-gray-300">{String(field.value)}</p>
            ) : field.type === 'textarea' ? (
              <textarea
                value={String(editedPayload[field.key] || '')}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                disabled={!field.editable}
                className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5
                         text-gray-200 resize-none outline-none focus:border-blue-500
                         disabled:opacity-50 disabled:cursor-not-allowed"
                rows={2}
              />
            ) : field.type === 'select' ? (
              <select
                value={String(editedPayload[field.key] || '')}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                disabled={!field.editable}
                className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5
                         text-gray-200 outline-none focus:border-blue-500
                         disabled:opacity-50"
              >
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                value={String(editedPayload[field.key] || '')}
                onChange={(e) =>
                  handleFieldChange(
                    field.key,
                    field.type === 'number' ? Number(e.target.value) : e.target.value,
                  )
                }
                disabled={!field.editable}
                className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5
                         text-gray-200 outline-none focus:border-blue-500
                         disabled:opacity-50 disabled:cursor-not-allowed"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="flex-1 text-xs py-1.5 rounded-lg bg-blue-600 text-white font-medium
                   hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Executing...' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 text-xs py-1.5 rounded-lg bg-gray-700 text-gray-300
                   hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>

      <p className="text-[9px] text-gray-600 mt-1.5 text-center">
        This action expires in 15 minutes.
      </p>
    </div>
  );
}

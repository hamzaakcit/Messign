import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DoraPendingActionContent } from '@/types/knowledge-hub/ai';

export interface ActionConfirmationInlineProps {
  action: DoraPendingActionContent;
  onConfirm: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}

const typeIcons: Record<string, string> = {
  create_task: '✅',
  update_task_status: '🔄',
  draft_invoice: '💰',
  send_chat_message: '💬',
  send_reminder: '🔔',
};

/**
 * Inline HITL for SSE `pending_action` — glass chrome, left accent, progressive disclosure.
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);

  const handleFieldChange = (key: string, value: unknown) => {
    setEditedPayload((prev) => ({ ...prev, [key]: value }));
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    await onConfirm(editedPayload);
    setIsSubmitting(false);
  };

  const isIrreversible = action.riskLevel === 'irreversible';
  const accent = isIrreversible ? 'var(--dora-danger, #ef4444)' : 'var(--dora-warning, #f59e0b)';
  const icon = typeIcons[action.actionType] || '⚡';

  return (
    <div
      role="region"
      aria-label={`Dora suggested action: ${action.actionType.replace(/_/g, ' ')}`}
      className="mt-3 dora-glass dora-fade-up overflow-hidden"
      style={{ borderRadius: 'var(--dora-r-card, 14px)' }}
    >
      <div
        className="flex gap-3 py-3 pl-3 pr-3"
        style={{
          borderLeft: `4px solid ${accent}`,
        }}
      >
        <span className="text-base shrink-0 pt-0.5" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1 dora-font">
          <p className="text-xs font-medium m-0 mb-1" style={{ color: 'var(--dora-text-1, #f1f5f9)' }}>
            {isIrreversible
              ? 'Dora is ready to run an irreversible change'
              : 'Dora suggested a change'}
          </p>
          {isIrreversible && (
            <p className="text-[11px] m-0 mb-2" style={{ color: 'var(--dora-chat-text-tertiary, #a8b9ce)' }}>
              This cannot be undone. Review carefully before confirming.
            </p>
          )}
          <p className="text-xs m-0 mb-3 leading-relaxed dora-chat-text-secondary">{action.description}</p>

          <div className="flex flex-wrap gap-2 mb-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-app-text bg-sky-600/90 hover:bg-sky-500 disabled:opacity-50 transition-colors dora-focus-ring"
            >
              {isSubmitting ? 'Working…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="rounded-lg px-3 py-1.5 text-xs font-medium border border-white/15 bg-white/5 dora-chat-text-secondary hover:text-app-text hover:bg-white/10 disabled:opacity-50 transition-colors dora-focus-ring"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => setEditorOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium dora-chat-text-tertiary hover:text-app-text transition-colors dora-focus-ring"
              aria-expanded={editorOpen}
            >
              {editorOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
              Edit details
            </button>
          </div>

          {editorOpen && (
            <div className="space-y-2 pt-1 border-t border-white/10">
              {action.displayFields.map((field) => (
                <div key={field.key}>
                  <label className="text-[10px] dora-chat-text-tertiary block mb-0.5">{field.label}</label>

                  {field.type === 'readonly' ? (
                    <p className="text-xs dora-chat-text-secondary m-0">{String(field.value)}</p>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      value={String(editedPayload[field.key] || '')}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      disabled={!field.editable}
                      className="w-full text-xs rounded-lg border border-white/10 bg-app-bg/80 px-2 py-1.5 text-gray-200 resize-none dora-focus-ring
                               disabled:opacity-50 disabled:cursor-not-allowed"
                      rows={2}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      value={String(editedPayload[field.key] || '')}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      disabled={!field.editable}
                      className="w-full text-xs rounded-lg border border-white/10 bg-app-bg/80 px-2 py-1.5 text-gray-200 dora-focus-ring disabled:opacity-50"
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
                      className="w-full text-xs rounded-lg border border-white/10 bg-app-bg/80 px-2 py-1.5 text-gray-200 dora-focus-ring
                               disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  )}
                </div>
              ))}

              <div className="pt-1">
                <button
                  type="button"
                  className="text-[10px] dora-chat-text-tertiary hover:dora-chat-text-secondary dora-focus-ring rounded px-0.5 -mx-0.5"
                  onClick={() => setRawOpen((v) => !v)}
                  aria-expanded={rawOpen}
                >
                  {rawOpen ? 'Hide' : 'Show'} raw payload
                </button>
                {rawOpen && (
                  <pre className="mt-1 p-2 rounded-lg border border-white/10 text-[10px] dora-mono dora-chat-text-secondary overflow-x-auto max-h-28 overflow-y-auto">
                    {JSON.stringify(action.payload, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}

          <p className="text-[9px] dora-chat-text-tertiary m-0 mt-2 text-center">
            Expires in 15 minutes if left open.
          </p>
        </div>
      </div>
    </div>
  );
}

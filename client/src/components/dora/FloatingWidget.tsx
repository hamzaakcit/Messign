import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useWidgetContext } from '@/hooks/useWidgetContext';
import { INTENT_ICON_MAP } from '@/components/knowledge-hub/ai/AISuggestionChips';
import { useAuthStore } from '@/stores/authStore';
import { getAccessToken } from '@/lib/authToken';
import { API_ORIGIN } from '@/lib/api';
import { DoraSidebarLogo, DoraChatAvatar, PilotPlaneSVG } from './DoraPilot';

interface PendingActionContent {
  token: string;
  actionType: string;
  description: string;
  displayFields: Array<{
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'date' | 'number' | 'readonly';
    value: unknown;
    options?: Array<{ label: string; value: string }>;
    editable: boolean;
  }>;
  editableFields: string[];
  expiresAt: string;
  payload: Record<string, unknown>;
  riskLevel?: 'write' | 'irreversible';
}

interface SpecialistInfo {
  module: string;
  displayName: string;
  icon: string;
}

interface WidgetMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  specialist?: SpecialistInfo | null;
  pendingAction?: PendingActionContent | null;
  actionStatus?: 'pending' | 'confirmed' | 'cancelled' | 'executed';
  metadata?: {
    toolsUsed: string[];
    dataPoints: number;
    responseTimeMs: number;
    steps?: number;
    specialist?: string | null;
    specialistDisplayName?: string | null;
    specialistIcon?: string | null;
  };
}

type WidgetState = 'collapsed' | 'expanded';

export function FloatingWidget() {
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role || 'employee';
  const userName = user?.name?.split(' ')[0] || 'there';

  const [widgetState, setWidgetState] = useState<WidgetState>('collapsed');
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [responseMode, setResponseMode] = useState<'concise' | 'detailed' | 'search'>('concise');
  const conciseMode = responseMode !== 'detailed';
  const [sessionId] = useState(() => crypto.randomUUID());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { widgetContext, suggestions, entityLabel } = useWidgetContext(userRole);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (widgetState === 'expanded') {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [widgetState]);

  const sendMessage = useCallback(async (text: string, intentId?: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: WidgetMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    const assistantMsg: WidgetMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev.slice(-48), userMsg, assistantMsg]);
    setInputValue('');
    setIsStreaming(true);

    const history = messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const token = getAccessToken();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch(`${API_ORIGIN}/api/knowledge-hub/ai/answer`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: text.trim(),
          intent: intentId || undefined,
          history,
          concise: conciseMode,
          currentPath: widgetContext.currentPath,
          sessionId,
          searchMode: responseMode === 'search',
          widgetContext: {
            module: widgetContext.currentModule,
            entity: widgetContext.viewingEntity,
            routeParams: widgetContext.routeParams,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      if (response.headers.get('X-Response-Mode') === 'instant') {
        const body = (await response.json()) as {
          text: string;
          metadata?: {
            toolsUsed?: string[];
            dataPoints?: number;
            responseTimeMs?: number;
            steps?: number;
            specialist?: string | null;
            specialistDisplayName?: string | null;
            specialistIcon?: string | null;
          };
        };
        const meta = body.metadata;
        const specialist =
          meta?.specialist && typeof meta.specialist === 'string'
            ? {
                module: meta.specialist,
                displayName: meta.specialistDisplayName ?? meta.specialist,
                icon: meta.specialistIcon ?? '✨',
              }
            : null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content: body.text || '',
                  specialist: specialist ?? m.specialist,
                  metadata: meta
                    ? {
                        toolsUsed: meta.toolsUsed ?? [],
                        dataPoints: meta.dataPoints ?? 0,
                        responseTimeMs: meta.responseTimeMs ?? 0,
                        steps: meta.steps,
                        specialist: meta.specialist ?? null,
                        specialistDisplayName: meta.specialistDisplayName ?? null,
                        specialistIcon: meta.specialistIcon ?? null,
                      }
                    : m.metadata,
                  isStreaming: false,
                }
              : m
          )
        );
        return;
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case 'text':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + event.content }
                      : m
                  )
                );
                break;

              case 'specialist':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          specialist: {
                            module: event.module ?? '',
                            displayName: event.displayName ?? event.module ?? '',
                            icon: event.icon ?? '✨',
                          },
                        }
                      : m
                  )
                );
                break;

              case 'pending_action':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, pendingAction: event.content, actionStatus: 'pending' }
                      : m
                  )
                );
                break;

              case 'metadata':
                setMessages((prev) => {
                  const meta = event.content as WidgetMessage['metadata'];
                  const specialist = meta?.specialist
                    ? {
                        module: meta.specialist,
                        displayName: meta.specialistDisplayName ?? meta.specialist,
                        icon: meta.specialistIcon ?? '✨',
                      }
                    : null;
                  return prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, metadata: meta, specialist: specialist ?? m.specialist }
                      : m
                  );
                });
                break;

              case 'error':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: event.message || 'Something went wrong.', isStreaming: false }
                      : m
                  )
                );
                break;

              case 'done':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, isStreaming: false } : m
                  )
                );
                break;
            }
          } catch {
            // skip malformed SSE events
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: "I'm having trouble connecting right now. Please try again.", isStreaming: false }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [isStreaming, messages, conciseMode, responseMode, widgetContext, sessionId]);

  const handleConfirmAction = useCallback(async (
    messageId: string,
    actionToken: string,
    payload: Record<string, unknown>,
  ) => {
    try {
      const token = getAccessToken();
      const response = await fetch(`${API_ORIGIN}/api/ai/actions/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ actionToken, payload }),
      });

      const result = await response.json();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                actionStatus: result.success ? 'executed' : 'pending',
                content: m.content + (result.success
                  ? `\n\n✅ ${result.message}`
                  : `\n\n❌ ${result.message || 'Action failed. Please try again.'}`),
              }
            : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: m.content + '\n\n❌ Failed to execute action. Please try again.' }
            : m
        )
      );
    }
  }, []);

  const handleCancelAction = useCallback(async (
    messageId: string,
    actionToken: string,
  ) => {
    try {
      const token = getAccessToken();
      await fetch(`${API_ORIGIN}/api/ai/actions/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ actionToken }),
      });
    } catch {
      // cancellation is best-effort
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, actionStatus: 'cancelled' } : m
      )
    );
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const handleSuggestionClick = (query: string, intentId?: string) => {
    sendMessage(query, intentId);
  };

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setWidgetState((prev) => (prev === 'collapsed' ? 'expanded' : 'collapsed'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (widgetState === 'collapsed') {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <DoraSidebarLogo size={30} onClick={() => setWidgetState('expanded')} />
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-[400px] h-[600px] max-h-[80vh]
                 rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl shadow-black/40
                 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      role="dialog"
      aria-label="Dora AI Assistant"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <DoraChatAvatar size={26} isThinking={isStreaming} />
          <div>
            <h2 className="text-sm font-semibold text-white leading-tight">Dora</h2>
            {entityLabel && (
              <p className="text-[11px] text-gray-400 leading-tight">{entityLabel}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {(['concise', 'detailed', 'search'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setResponseMode(mode)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors capitalize ${
                responseMode === mode
                  ? mode === 'search'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-blue-500/20 text-blue-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {mode === 'search' ? 'Web' : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}

          <button
            onClick={() => setWidgetState('collapsed')}
            className="w-7 h-7 rounded-lg flex items-center justify-center
                       text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label="Close assistant"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="mb-3" style={{ animation: 'dp-breathe 4s ease-in-out infinite' }}>
              <PilotPlaneSVG size={48} showGoggleGlint />
            </div>
            <p className="text-sm text-white font-medium mb-1">
              Hey {userName}! I'm Dora.
            </p>
            <p className="text-xs text-gray-400 mb-4">
              I can access company data, create tasks, draft invoices, and more.
            </p>

            <div className="flex flex-wrap gap-1.5 justify-center">
              {suggestions.map((chip, i) => {
                const Icon = chip.icon ? INTENT_ICON_MAP[chip.icon] : null;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    title={chip.query}
                    onClick={() => handleSuggestionClick(chip.query, chip.id)}
                    style={{
                      animation: 'dora-wchip-in 0.35s ease-out forwards',
                      animationDelay: `${i * 50}ms`,
                      opacity: 0,
                    }}
                    className="text-xs px-4 py-2 rounded-full border border-gray-700 inline-flex items-center gap-1
                           text-gray-300 hover:border-blue-500 hover:text-blue-400 hover:scale-[1.02]
                           hover:bg-blue-500/5 transition-all duration-200"
                  >
                    {Icon && <Icon size={12} className="opacity-70 shrink-0" />}
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <style>{`
              @keyframes dora-wchip-in {
                from { opacity: 0; transform: translateY(4px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                }`}
              >
                {msg.role === 'assistant' && msg.specialist && (
                  <div className="mb-1 text-[10px] text-gray-500">
                    {msg.specialist.icon} {msg.specialist.displayName} Specialist
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">
                  {msg.content}
                  {msg.isStreaming && (
                    <span className="inline-block w-1.5 h-4 bg-blue-400 ml-0.5 animate-pulse rounded-sm" />
                  )}
                </div>

                {msg.pendingAction && msg.actionStatus === 'pending' && (
                  <ActionConfirmationInline
                    action={msg.pendingAction}
                    onConfirm={(payload) => handleConfirmAction(msg.id, msg.pendingAction!.token, payload)}
                    onCancel={() => handleCancelAction(msg.id, msg.pendingAction!.token)}
                  />
                )}

                {msg.actionStatus === 'cancelled' && (
                  <p className="text-xs text-gray-500 mt-2 italic">Action cancelled.</p>
                )}

                {msg.metadata && !msg.isStreaming && (
                  <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-gray-700/50 text-[10px] text-gray-500">
                    <span>{msg.metadata.responseTimeMs}ms</span>
                    <span>·</span>
                    <span>{msg.metadata.dataPoints} data points</span>
                    {msg.metadata.steps && msg.metadata.steps > 1 && (
                      <>
                        <span>·</span>
                        <span>{msg.metadata.steps} steps</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion chips (compact, when chat has messages) */}
      {messages.length > 0 && !isStreaming && (
        <div className="px-4 pb-1 flex gap-1 overflow-x-auto scrollbar-hide">
          {suggestions.map((chip) => (
            <button
              key={chip.id}
              type="button"
              title={chip.query}
              onClick={() => handleSuggestionClick(chip.query, chip.id)}
              className="text-[10px] px-3 py-1.5 rounded-full border border-gray-700/50
                       text-gray-400 hover:text-blue-400 hover:border-blue-500/50
                       whitespace-nowrap transition-all duration-200 flex-shrink-0 hover:scale-[1.02]"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-gray-800">
        <div className="flex items-end gap-2 bg-gray-800 rounded-xl px-3 py-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Dora anything..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500
                     resize-none outline-none max-h-24 leading-relaxed"
            disabled={isStreaming}
          />

          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="w-8 h-8 flex items-center justify-center rounded-lg
                       bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors flex-shrink-0"
              aria-label="Stop"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => sendMessage(inputValue)}
              disabled={!inputValue.trim()}
              className="w-8 h-8 flex items-center justify-center rounded-lg
                       bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30
                       disabled:cursor-not-allowed transition-colors flex-shrink-0"
              aria-label="Send"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 7h12M8 2l5 5-5 5" />
              </svg>
            </button>
          )}
        </div>

        <p className="text-[9px] text-gray-600 text-center mt-1.5">
          Dora uses company data. Verify critical decisions. ⌘J to toggle.
        </p>
      </div>
    </div>
  );
}

interface ActionConfirmationInlineProps {
  action: PendingActionContent;
  onConfirm: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}

function ActionConfirmationInline({
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
    <div className={`mt-3 rounded-lg border p-3 ${isIrreversible ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
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
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                value={String(editedPayload[field.key] || '')}
                onChange={(e) => handleFieldChange(
                  field.key,
                  field.type === 'number' ? Number(e.target.value) : e.target.value,
                )}
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
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="flex-1 text-xs py-1.5 rounded-lg bg-blue-600 text-white font-medium
                   hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Executing...' : 'Confirm'}
        </button>
        <button
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

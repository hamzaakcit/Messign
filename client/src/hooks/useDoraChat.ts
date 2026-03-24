/**
 * Dora v2 — POST /api/v2/ai/answer (SSE `{ type, data }`).
 * Return shape matches useAIChat for drop-in use behind VITE_DORA_V2.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type {
  AIMessage,
  AIResponseMetadata,
  AISourceDocument,
  AIChartPayload,
  AITablePayload,
  AIWidgetPayload,
  SpecialistInfo,
  DoraPendingActionContent,
} from '@/types/knowledge-hub/ai';
import { getAccessToken } from '@/lib/authToken';
import { API_ORIGIN, assertNotHtmlApiResponse } from '@/lib/api';
import { khAIFeedbackAPI } from '@/lib/knowledge-hub/api';
import { resolveIntent } from '@/shared/intents/resolver';
import type { UseAIChatOptions, SendMessageOptions, UseAIChatReturn } from '@/hooks/knowledge-hub/useAIChat';
import { formatAiHttpError } from '@/utils/aiHttpError';

const V2_ANSWER_URL = `${API_ORIGIN}/api/v2/ai/answer`;

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseSseJsonLine(line: string): Record<string, unknown> | null {
  const t = line.trim().replace(/^\uFEFF/, '');
  if (!t.startsWith('data:')) return null;
  const jsonStr = t.slice(5).trimStart();
  if (!jsonStr || jsonStr === '[DONE]') return null;
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** EOF may leave multiple `data: {...}` lines in the buffer without a trailing newline. */
function parseAllSseJsonLines(block: string, handler: (ev: Record<string, unknown>) => void): void {
  for (const line of block.split('\n')) {
    const ev = parseSseJsonLine(line);
    if (ev && typeof ev.type === 'string') handler(ev);
  }
}

/** v2 `{ type, data }` plus optional legacy `content` / `message` */
function eventTextChunk(event: Record<string, unknown>): string {
  if (typeof event.data === 'string') return event.data;
  if (typeof event.content === 'string') return event.content;
  return '';
}

export function useDoraChat(options: UseAIChatOptions = {}): UseAIChatReturn {
  const {
    maxHistory = 50,
    initialMessages,
    onMessagesChange,
    initialInteractionMode = 'ask',
    onIntentResolved,
    marketingAgentMode: defaultMarketingAgentMode,
  } = options;

  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;
  const onIntentResolvedRef = useRef(onIntentResolved);
  onIntentResolvedRef.current = onIntentResolved;

  const [messages, setMessages] = useState<AIMessage[]>(initialMessages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState(initialInteractionMode);

  const conciseMode = interactionMode === 'ask';
  const setConciseMode = useCallback((value: boolean) => {
    setInteractionMode(value ? 'ask' : 'analyze');
  }, []);

  const sessionId = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    onMessagesChangeRef.current?.(messages);
  }, [messages]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<AIMessage[]>([]);
  messagesRef.current = messages;
  const sendInFlightRef = useRef(false);

  /** Batches rapid setMessages calls into a single React render per animation frame. */
  const pendingUpdateRef = useRef<((prev: AIMessage[]) => AIMessage[]) | null>(null);
  const rafIdRef = useRef<number>(0);
  const batchedSetMessages = useCallback(
    (updater: (prev: AIMessage[]) => AIMessage[]) => {
      const prev = pendingUpdateRef.current;
      pendingUpdateRef.current = prev
        ? (msgs) => updater(prev(msgs))
        : updater;
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = 0;
          const fn = pendingUpdateRef.current;
          pendingUpdateRef.current = null;
          if (fn) setMessages(fn);
        });
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (query: string, sendOpts?: SendMessageOptions) => {
      if (!query.trim() || isLoading || sendInFlightRef.current) return;

      sendInFlightRef.current = true;
      setError(null);
      setIsLoading(true);

      const trimmed = query.trim();
      const resolved = !sendOpts?.intentId ? resolveIntent(trimmed) : null;
      const effectiveIntentId =
        sendOpts?.intentId ?? (resolved?.handler ? resolved.id : undefined);
      if (effectiveIntentId && !sendOpts?.intentId) {
        onIntentResolvedRef.current?.(effectiveIntentId);
      }

      const userMessage: AIMessage = {
        id: generateMessageId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
        ...(effectiveIntentId ? { intentId: effectiveIntentId } : {}),
      };

      const assistantMessage: AIMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
        feedback: null,
      };

      const prevMessages = messagesRef.current;
      setMessages((prev) => {
        const next = sendOpts?.skipUserMessage
          ? [...prev, assistantMessage]
          : [...prev, userMessage, assistantMessage];
        return next.slice(-maxHistory);
      });

      const history = prevMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      abortControllerRef.current = new AbortController();

      let assistantFinalized = false;
      try {
        const token = getAccessToken();
        const response = await fetch(V2_ANSWER_URL, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            query: trimmed,
            intent: effectiveIntentId || undefined,
            history,
            mode: interactionMode,
            concise: interactionMode === 'ask',
            currentPath: typeof window !== 'undefined' ? window.location.pathname : '',
            sessionId,
            searchMode: false,
            ...(defaultMarketingAgentMode === true || sendOpts?.marketingAgentMode === true
              ? { marketingAgentMode: true }
              : {}),
            ...(sendOpts?.confirmed === true && sendOpts?.confirmation
              ? {
                  confirmed: true,
                  confirmation: {
                    action: sendOpts.confirmation.action,
                    params: sendOpts.confirmation.params,
                  },
                }
              : {}),
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(await formatAiHttpError(response));
        }

        assertNotHtmlApiResponse(response);

        if (!response.body) {
          throw new Error('No response body (SSE not supported)');
        }

        setIsStreaming(true);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let accumulatedText = '';
        let accumulatedSources: AISourceDocument[] = [];
        let accumulatedMetadata: AIResponseMetadata | undefined;
        let accumulatedChartData: AIChartPayload | undefined;
        let accumulatedTableData: AITablePayload | undefined;
        let accumulatedWidgets: AIWidgetPayload[] = [];
        let accumulatedSpecialist: SpecialistInfo | null = null;
        let accumulatedPendingAction: DoraPendingActionContent | undefined;
        /** Avoid double finalization: `done` already applies the same snapshot; post-loop is only for streams that close without `done`. */
        let sawDoneEvent = false;

        const handleSseEvent = (event: Record<string, unknown>) => {
          switch (event.type) {
            case 'text': {
              let chunk = eventTextChunk(event);
              if (chunk) {
                if (accumulatedText.startsWith('_') && accumulatedText.includes('…_')) {
                  const sep = accumulatedText.indexOf('\n\n');
                  if (sep !== -1) accumulatedText = accumulatedText.slice(sep + 2);
                }
                accumulatedText += chunk;
              }
              batchedSetMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id ? { ...m, content: accumulatedText } : m,
                ),
              );
              break;
            }

            case 'notice': {
              const note =
                (typeof event.data === 'string' ? event.data : (event.content as string)) ?? '';
              if (note) {
                const prefix = accumulatedText ? '\n\n' : '';
                accumulatedText += `${prefix}⚠️ ${note}`;
                batchedSetMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id ? { ...m, content: accumulatedText } : m,
                  ),
                );
              }
              break;
            }

            case 'progress': {
              const d = event.data as
                | { step?: number; maxSteps?: number; phase?: string; tool?: string }
                | undefined;
              if (!d || accumulatedText.trim().length > 0) break;
              const hint = `_${d.phase ?? 'Working'}${d.step != null ? ` (${d.step}/${d.maxSteps ?? '?'})` : ''}${d.tool ? ` · ${d.tool}` : ''}…_`;
              accumulatedText = `${hint}\n\n`;
              batchedSetMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id ? { ...m, content: accumulatedText } : m,
                ),
              );
              break;
            }

            case 'specialist':
              accumulatedSpecialist = {
                module: (event.module as string) ?? '',
                displayName: (event.displayName as string) ?? (event.module as string) ?? '',
                icon: (event.icon as string) ?? '✨',
              };
              batchedSetMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id ? { ...m, specialist: accumulatedSpecialist } : m,
                ),
              );
              break;

            case 'sources': {
              const raw = event.data ?? event.documents ?? event.content;
              accumulatedSources = (Array.isArray(raw) ? raw : []) as AISourceDocument[];
              break;
            }

            case 'metadata': {
              const meta = (event.data ?? event.content) as AIResponseMetadata;
              accumulatedMetadata = meta;
              if (meta?.specialist && !accumulatedSpecialist) {
                accumulatedSpecialist = {
                  module: meta.specialist,
                  displayName: meta.specialistDisplayName ?? meta.specialist,
                  icon: meta.specialistIcon ?? '✨',
                };
                batchedSetMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id ? { ...m, specialist: accumulatedSpecialist } : m,
                  ),
                );
              }
              break;
            }

            case 'chart_data':
              accumulatedChartData = (event.data ?? event.content) as AIChartPayload;
              break;

            case 'table_data':
              accumulatedTableData = (event.data ?? event.content) as AITablePayload;
              break;

            case 'widget_data': {
              const pack = (event.data ?? event.content) as
                | AIWidgetPayload
                | { widgets?: AIWidgetPayload[] };
              if (pack && typeof pack === 'object' && 'widgets' in pack && pack.widgets?.length) {
                accumulatedWidgets.push(...pack.widgets);
              } else if (pack && typeof pack === 'object' && 'widgetType' in pack) {
                accumulatedWidgets.push(pack as AIWidgetPayload);
              }
              batchedSetMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id ? { ...m, widgets: [...accumulatedWidgets] } : m,
                ),
              );
              break;
            }

            case 'pending_action': {
              const raw = (event.data ?? event.content) as DoraPendingActionContent;
              accumulatedPendingAction = raw;
              batchedSetMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id
                    ? { ...m, pendingAction: raw, actionStatus: 'pending' }
                    : m,
                ),
              );
              break;
            }

            case 'error': {
              assistantFinalized = true;
              const ed = event.data as { message?: string } | undefined;
              const errMsg =
                (ed && typeof ed.message === 'string' && ed.message) ||
                (typeof event.message === 'string' ? event.message : null) ||
                (typeof event.content === 'string' ? event.content : null) ||
                'Unknown error';
              accumulatedText = errMsg;
              setError(errMsg);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id ? { ...m, content: errMsg, isStreaming: false } : m,
                ),
              );
              break;
            }

            case 'done':
              assistantFinalized = true;
              sawDoneEvent = true;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id
                    ? {
                        ...m,
                        content: accumulatedText || m.content,
                        specialist: accumulatedSpecialist ?? m.specialist,
                        sources: accumulatedSources.length > 0 ? accumulatedSources : undefined,
                        metadata: accumulatedMetadata,
                        chartData: accumulatedChartData,
                        tableData: accumulatedTableData,
                        widgets: accumulatedWidgets.length > 0 ? accumulatedWidgets : undefined,
                        pendingAction: accumulatedPendingAction ?? m.pendingAction,
                        actionStatus:
                          accumulatedPendingAction ?? m.pendingAction
                            ? (m.actionStatus ?? 'pending')
                            : undefined,
                        isStreaming: false,
                      }
                    : m,
                ),
              );
              break;

            default:
              break;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (value) {
            buffer += decoder.decode(value, { stream: true });
          }
          if (done) {
            buffer += decoder.decode(new Uint8Array(), { stream: false });
          }

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const event = parseSseJsonLine(line);
            if (!event || typeof event.type !== 'string') continue;
            handleSseEvent(event);
          }

          if (done) {
            if (buffer.trim()) {
              parseAllSseJsonLines(buffer, handleSseEvent);
            }
            break;
          }
        }

        if (!sawDoneEvent) {
          assistantFinalized = true;
          const connectionHint =
            'No response was returned. The stream closed early — often the AI backend (LiteLLM / OpenAI) is unreachable or timed out. Check server env: LITELLM_URL, LITELLM_MASTER_KEY, or OPENAI_API_KEY.';
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id
                ? {
                    ...m,
                    content:
                      accumulatedText?.trim() ||
                      (typeof m.content === 'string' ? m.content.trim() : '') ||
                      connectionHint,
                    specialist: accumulatedSpecialist ?? m.specialist,
                    sources: accumulatedSources.length > 0 ? accumulatedSources : m.sources,
                    metadata: accumulatedMetadata ?? m.metadata,
                    chartData: accumulatedChartData ?? m.chartData,
                    tableData: accumulatedTableData ?? m.tableData,
                    widgets: accumulatedWidgets.length > 0 ? accumulatedWidgets : m.widgets,
                    pendingAction: accumulatedPendingAction ?? m.pendingAction,
                    isStreaming: false,
                  }
                : m,
            ),
          );
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          assistantFinalized = true;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, isStreaming: false, content: m.content || 'Response cancelled.' }
                : m,
            ),
          );
        } else {
          assistantFinalized = true;
          console.error('[useDoraChat] Error:', err);
          setError(err instanceof Error ? err.message : 'Failed to get AI response');
          setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));
        }
      } finally {
        sendInFlightRef.current = false;
        setIsLoading(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
        if (!assistantFinalized) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id && m.isStreaming
                ? {
                    ...m,
                    isStreaming: false,
                    content:
                      m.content?.trim() ||
                      'No response was returned. Try again or check your connection.',
                  }
                : m,
            ),
          );
        }
      }
    },
    [isLoading, interactionMode, maxHistory, sessionId, defaultMarketingAgentMode],
  );

  const cancelActConfirmation = useCallback((assistantMessageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMessageId
          ? {
              ...m,
              pendingConfirmation: undefined,
              content: m.content?.includes('?') ? `${m.content}\n\n_(Cancelled.)_` : 'Action cancelled.',
              isStreaming: false,
            }
          : m,
      ),
    );
  }, []);

  const clearPendingConfirmation = useCallback((assistantMessageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMessageId ? { ...m, pendingConfirmation: undefined } : m,
      ),
    );
  }, []);

  const confirmPendingAction = useCallback(
    async (messageId: string, actionToken: string, payload: Record<string, unknown>) => {
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
        const result = (await response.json()) as { success?: boolean; message?: string };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  actionStatus: result.success ? 'executed' : 'pending',
                  content:
                    m.content +
                    (result.success
                      ? `\n\n✅ ${result.message ?? 'Done.'}`
                      : `\n\n❌ ${result.message || 'Action failed. Please try again.'}`),
                  pendingAction: result.success ? undefined : m.pendingAction,
                }
              : m,
          ),
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  content: m.content + '\n\n❌ Failed to execute action. Please try again.',
                }
              : m,
          ),
        );
      }
    },
    [],
  );

  const cancelPendingAction = useCallback(async (messageId: string, actionToken: string) => {
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
      /* best-effort */
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, actionStatus: 'cancelled', pendingAction: undefined }
          : m,
      ),
    );
  }, []);

  const submitFeedback = useCallback(
    async (messageId: string, isHelpful: boolean) => {
      const currentMessages = messagesRef.current;
      const message = currentMessages.find((m) => m.id === messageId);
      if (!message || message.role !== 'assistant') return;

      const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
      const userMessage = messageIndex > 0 ? currentMessages[messageIndex - 1] : null;

      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: isHelpful ? 'up' : 'down' } : m)),
      );

      try {
        await khAIFeedbackAPI.submit({
          query: userMessage?.content ?? '',
          answer: message.content,
          sourceDocumentIds: message.sources?.map((s) => s.id) ?? [],
          isHelpful,
          telemetryId: message.metadata?.telemetryId,
        });
      } catch (err) {
        console.error('[useDoraChat] Feedback submission failed:', err);
      }
    },
    [],
  );

  const clearChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setError(null);
  }, []);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    conciseMode,
    setConciseMode,
    interactionMode,
    setInteractionMode,
    sendMessage,
    submitFeedback,
    cancelActConfirmation,
    clearPendingConfirmation,
    confirmPendingAction,
    cancelPendingAction,
    clearChat,
    abortStream,
  };
}

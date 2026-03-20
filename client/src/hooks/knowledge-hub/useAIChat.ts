/**
 * Messign AI Brain — useAIChat Hook
 *
 * Custom hook that manages the AI chat state:
 * - Sends queries to /api/knowledge-hub/ai/answer
 * - Parses SSE stream events (text, sources, metadata, chart_data, table_data)
 * - Manages message history
 * - Handles loading/streaming/error states
 * - Provides feedback submission
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
import { API_ORIGIN } from '@/lib/api';
import { khAIFeedbackAPI } from '@/lib/knowledge-hub/api';
import { resolveIntent } from '@/shared/intents/resolver';

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** v2 SSE uses `{ type, data }`; v1 used `{ type, content }`. */
function sseData(event: Record<string, unknown>): unknown {
  return event.data !== undefined ? event.data : event.content;
}

function sseTextChunk(event: Record<string, unknown>): string {
  const d = sseData(event);
  if (typeof d === 'string') return d;
  if (typeof event.content === 'string') return event.content;
  return '';
}

export interface SendMessageOptions {
  intentId?: string;
  confirmed?: boolean;
  confirmation?: { action: string; params: Record<string, unknown> };
  /** Act confirm: POST without adding another user bubble */
  skipUserMessage?: boolean;
}

export type InteractionMode = 'ask' | 'analyze' | 'act';

export interface UseAIChatOptions {
  /** Maximum messages to keep in history (default 50) */
  maxHistory?: number;
  /** API base URL (default /api/knowledge-hub) */
  apiBaseUrl?: string;
  /** Seed the chat with existing messages on mount */
  initialMessages?: AIMessage[];
  /** Called whenever the messages array changes */
  onMessagesChange?: (messages: AIMessage[]) => void;
  /** Default Ask / Analyze / Act (Dora) */
  initialInteractionMode?: InteractionMode;
  /** When typed text auto-maps to a preset intent (same as chips), register for session memory */
  onIntentResolved?: (intentId: string) => void;
}

export interface UseAIChatReturn {
  messages: AIMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  /** Knowledge Hub: concise ↔ maps to Ask vs Analyze */
  conciseMode: boolean;
  setConciseMode: (value: boolean) => void;
  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;
  sendMessage: (query: string, options?: SendMessageOptions) => Promise<void>;
  submitFeedback: (messageId: string, isHelpful: boolean) => Promise<void>;
  cancelActConfirmation: (assistantMessageId: string) => void;
  clearPendingConfirmation: (assistantMessageId: string) => void;
  /** Token-based `pending_action` SSE — POST /api/ai/actions/confirm */
  confirmPendingAction: (
    messageId: string,
    actionToken: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  /** Token-based `pending_action` SSE — POST /api/ai/actions/cancel */
  cancelPendingAction: (messageId: string, actionToken: string) => Promise<void>;
  clearChat: () => void;
  abortStream: () => void;
}

export function useAIChat(options: UseAIChatOptions = {}): UseAIChatReturn {
  const {
    maxHistory = 50,
    apiBaseUrl = `${API_ORIGIN}/api/knowledge-hub`,
    initialMessages,
    onMessagesChange,
    initialInteractionMode = 'ask',
    onIntentResolved,
  } = options;

  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;
  const onIntentResolvedRef = useRef(onIntentResolved);
  onIntentResolvedRef.current = onIntentResolved;

  const [messages, setMessages] = useState<AIMessage[]>(initialMessages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(initialInteractionMode);

  const conciseMode = interactionMode === 'ask';
  const setConciseMode = useCallback((value: boolean) => {
    setInteractionMode(value ? 'ask' : 'analyze');
  }, []);

  const sessionId = useMemo(() => crypto.randomUUID(), []);

  // Notify parent of message changes for persistence
  useEffect(() => {
    onMessagesChangeRef.current?.(messages);
  }, [messages]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<AIMessage[]>([]);
  messagesRef.current = messages;
  const sendInFlightRef = useRef(false);

  const sendMessage = useCallback(async (query: string, options?: SendMessageOptions) => {
    if (!query.trim() || isLoading || sendInFlightRef.current) return;

    sendInFlightRef.current = true;
    setError(null);
    setIsLoading(true);

    const trimmed = query.trim();
    const resolved = !options?.intentId ? resolveIntent(trimmed) : null;
    const effectiveIntentId =
      options?.intentId ?? (resolved?.handler ? resolved.id : undefined);
    if (effectiveIntentId && !options?.intentId) {
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
      const next = options?.skipUserMessage
        ? [...prev, assistantMessage]
        : [...prev, userMessage, assistantMessage];
      return next.slice(-maxHistory);
    });

    const history = prevMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    abortControllerRef.current = new AbortController();

    try {
      const token = getAccessToken();
      const response = await fetch(`${apiBaseUrl}/ai/answer`, {
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
          currentPath: window.location.pathname,
          sessionId,
          searchMode: false,
          ...(options?.confirmed === true && options?.confirmation
            ? {
                confirmed: true,
                confirmation: {
                  action: options.confirmation.action,
                  params: options.confirmation.params,
                },
              }
            : {}),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
      }

      const responseModeHeader = response.headers.get('X-Response-Mode');
      if (responseModeHeader === 'confirmation') {
        const body = (await response.json()) as {
          type?: string;
          action: string;
          params: Record<string, unknown>;
          message: string;
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  content: body.message || 'Please confirm this action.',
                  pendingConfirmation: {
                    action: body.action,
                    params: body.params ?? {},
                    message: body.message,
                    sourceQuery: trimmed,
                    sourceIntentId: effectiveIntentId,
                  },
                  isStreaming: false,
                }
              : m
          )
        );
        return;
      }

      if (responseModeHeader === 'instant') {
        const body = (await response.json()) as {
          text: string;
          widgets?: AIWidgetPayload[];
          sources?: AISourceDocument[];
          metadata?: AIResponseMetadata;
        };
        const meta = body.metadata;
        const specMod = meta?.specialist;
        const accumulatedSpecialist: SpecialistInfo | null =
          specMod && typeof specMod === 'string'
            ? {
                module: specMod,
                displayName: meta?.specialistDisplayName ?? specMod,
                icon: meta?.specialistIcon ?? '✨',
              }
            : null;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  content: body.text || '',
                  specialist: accumulatedSpecialist ?? m.specialist,
                  sources: body.sources?.length ? body.sources : undefined,
                  metadata: meta,
                  widgets: body.widgets?.length ? body.widgets : undefined,
                  isStreaming: false,
                }
              : m
          )
        );
        return;
      }

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);

          try {
            const event = JSON.parse(jsonStr) as Record<string, unknown>;

            switch (event.type) {
              case 'text':
                accumulatedText += sseTextChunk(event);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id ? { ...m, content: accumulatedText } : m
                  )
                );
                break;

              case 'notice': {
                const note = sseTextChunk(event);
                if (note) {
                  const prefix = accumulatedText ? '\n\n' : '';
                  accumulatedText += `${prefix}⚠️ ${note}`;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessage.id ? { ...m, content: accumulatedText } : m
                    )
                  );
                }
                break;
              }

              case 'specialist':
                accumulatedSpecialist = {
                  module: (event.module as string) ?? '',
                  displayName: (event.displayName as string) ?? event.module ?? '',
                  icon: (event.icon as string) ?? '✨',
                };
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id ? { ...m, specialist: accumulatedSpecialist } : m
                  )
                );
                break;

              case 'sources':
                accumulatedSources = (event.documents ?? sseData(event) ?? []) as AISourceDocument[];
                break;

              case 'metadata':
                accumulatedMetadata = sseData(event) as AIResponseMetadata;
                if (accumulatedMetadata?.specialist && !accumulatedSpecialist) {
                  accumulatedSpecialist = {
                    module: accumulatedMetadata.specialist,
                    displayName: accumulatedMetadata.specialistDisplayName ?? accumulatedMetadata.specialist,
                    icon: accumulatedMetadata.specialistIcon ?? '✨',
                  };
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessage.id ? { ...m, specialist: accumulatedSpecialist } : m
                    )
                  );
                }
                break;

              case 'chart_data':
                accumulatedChartData = sseData(event) as AIChartPayload;
                break;

              case 'table_data':
                accumulatedTableData = sseData(event) as AITablePayload;
                break;

              case 'widget_data': {
                const pack = sseData(event) as
                  | AIWidgetPayload
                  | { widgets?: AIWidgetPayload[] }
                  | undefined;
                if (pack && typeof pack === 'object' && 'widgets' in pack && pack.widgets?.length) {
                  accumulatedWidgets.push(...pack.widgets);
                } else if (pack && typeof pack === 'object' && 'widgetType' in pack) {
                  accumulatedWidgets.push(pack as AIWidgetPayload);
                }
                break;
              }

              case 'pending_action': {
                const pa = sseData(event) as DoraPendingActionContent;
                accumulatedPendingAction = pa;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? {
                          ...m,
                          pendingAction: pa,
                          actionStatus: 'pending',
                        }
                      : m
                  )
                );
                break;
              }

              case 'error': {
                const ed = event.data as { message?: string } | undefined;
                const errMsg = (
                  (ed && typeof ed.message === 'string' ? ed.message : null) ??
                  (typeof event.content === 'string' ? event.content : null) ??
                  (typeof event.message === 'string' ? event.message : null) ??
                  'Unknown error'
                ) as string;
                setError(errMsg);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: errMsg, isStreaming: false }
                      : m
                  )
                );
                break;
              }

              case 'done':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? {
                          ...m,
                          content: accumulatedText || m.content,
                          specialist: accumulatedSpecialist ?? m.specialist,
                          sources:
                            accumulatedSources.length > 0 ? accumulatedSources : undefined,
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
                      : m
                  )
                );
                break;
            }
          } catch {
            console.warn('[useAIChat] Failed to parse SSE event:', jsonStr);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, isStreaming: false, content: m.content || 'Response cancelled.' }
              : m
          )
        );
      } else {
        console.error('[useAIChat] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to get AI response');
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));
      }
    } finally {
      sendInFlightRef.current = false;
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [isLoading, interactionMode, maxHistory, apiBaseUrl, sessionId]);

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
          : m
      )
    );
  }, []);

  const clearPendingConfirmation = useCallback((assistantMessageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMessageId ? { ...m, pendingConfirmation: undefined } : m
      )
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
              : m
          )
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  content: m.content + '\n\n❌ Failed to execute action. Please try again.',
                }
              : m
          )
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
          : m
      )
    );
  }, []);

  const submitFeedback = useCallback(
    async (messageId: string, isHelpful: boolean) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message || message.role !== 'assistant') return;

      const messageIndex = messages.findIndex((m) => m.id === messageId);
      const userMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, feedback: isHelpful ? 'up' : 'down' } : m
        )
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
        console.error('[useAIChat] Feedback submission failed:', err);
      }
    },
    [messages]
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

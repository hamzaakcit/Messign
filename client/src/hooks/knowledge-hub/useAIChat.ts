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
} from '@/types/knowledge-hub/ai';
import { getAccessToken } from '@/lib/authToken';
import { khAIFeedbackAPI } from '@/lib/knowledge-hub/api';

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface UseAIChatOptions {
  /** Maximum messages to keep in history (default 50) */
  maxHistory?: number;
  /** API base URL (default /api/knowledge-hub) */
  apiBaseUrl?: string;
  /** Seed the chat with existing messages on mount */
  initialMessages?: AIMessage[];
  /** Called whenever the messages array changes */
  onMessagesChange?: (messages: AIMessage[]) => void;
}

export type ResponseMode = 'concise' | 'detailed' | 'search';

interface UseAIChatReturn {
  messages: AIMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  conciseMode: boolean;
  setConciseMode: (value: boolean) => void;
  responseMode: ResponseMode;
  setResponseMode: (mode: ResponseMode) => void;
  sendMessage: (query: string) => Promise<void>;
  submitFeedback: (messageId: string, isHelpful: boolean) => Promise<void>;
  clearChat: () => void;
  abortStream: () => void;
}

export function useAIChat(options: UseAIChatOptions = {}): UseAIChatReturn {
  const {
    maxHistory = 50,
    apiBaseUrl = '/api/knowledge-hub',
    initialMessages,
    onMessagesChange,
  } = options;

  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;

  const [messages, setMessages] = useState<AIMessage[]>(initialMessages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conciseMode, setConciseMode] = useState(true);
  const [responseMode, setResponseMode] = useState<ResponseMode>('concise');

  const sessionId = useMemo(() => crypto.randomUUID(), []);

  // Notify parent of message changes for persistence
  useEffect(() => {
    onMessagesChangeRef.current?.(messages);
  }, [messages]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<AIMessage[]>([]);
  messagesRef.current = messages;

  const sendMessage = useCallback(async (query: string) => {
    if (!query.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

    const userMessage: AIMessage = {
      id: generateMessageId(),
      role: 'user',
      content: query.trim(),
      timestamp: new Date(),
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
      const updated = [...prev, userMessage, assistantMessage];
      return updated.slice(-maxHistory);
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
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: query.trim(),
          history,
          concise: responseMode !== 'detailed',
          currentPath: window.location.pathname,
          sessionId,
          searchMode: responseMode === 'search',
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
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
                accumulatedText += (event.content as string) ?? '';
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id ? { ...m, content: accumulatedText } : m
                  )
                );
                break;

              case 'sources':
                accumulatedSources = (event.documents ?? event.content ?? []) as AISourceDocument[];
                break;

              case 'metadata':
                accumulatedMetadata = event.content as AIResponseMetadata;
                break;

              case 'chart_data':
                accumulatedChartData = event.content as AIChartPayload;
                break;

              case 'table_data':
                accumulatedTableData = event.content as AITablePayload;
                break;

              case 'widget_data':
                accumulatedWidgets.push(event.content as AIWidgetPayload);
                break;

              case 'error':
                const errMsg = (event.content ?? event.message ?? 'Unknown error') as string;
                setError(errMsg);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: errMsg, isStreaming: false }
                      : m
                  )
                );
                break;

              case 'done':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? {
                          ...m,
                          content: accumulatedText || m.content,
                          sources:
                            accumulatedSources.length > 0 ? accumulatedSources : undefined,
                          metadata: accumulatedMetadata,
                          chartData: accumulatedChartData,
                          tableData: accumulatedTableData,
                          widgets: accumulatedWidgets.length > 0 ? accumulatedWidgets : undefined,
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
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [isLoading, conciseMode, responseMode, maxHistory, apiBaseUrl, sessionId]);

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
    responseMode,
    setResponseMode,
    sendMessage,
    submitFeedback,
    clearChat,
    abortStream,
  };
}

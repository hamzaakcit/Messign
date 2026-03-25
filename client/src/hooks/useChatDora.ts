import { useCallback } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { chatAPI } from '@/lib/api';
import type { DoraKBSuggestion } from '@/types';

export function useChatDora() {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const doraSummary = useChatStore((s) => s.doraSummary);
  const doraActionItems = useChatStore((s) => s.doraActionItems);
  const doraLoading = useChatStore((s) => s.doraLoading);
  const doraPanelOpen = useChatStore((s) => s.doraPanelOpen);
  const toggleDoraPanel = useChatStore((s) => s.toggleDoraPanel);
  const fetchDoraSummary = useChatStore((s) => s.fetchDoraSummary);
  const fetchDoraActionItems = useChatStore((s) => s.fetchDoraActionItems);

  const summarize = useCallback(async () => {
    if (!activeChannelId) return;
    await fetchDoraSummary(activeChannelId);
  }, [activeChannelId, fetchDoraSummary]);

  const getActionItems = useCallback(async () => {
    if (!activeChannelId) return;
    await fetchDoraActionItems(activeChannelId);
  }, [activeChannelId, fetchDoraActionItems]);

  const getKBSuggestions = useCallback(async (question: string): Promise<DoraKBSuggestion[]> => {
    if (!activeChannelId) return [];
    try {
      const result = await chatAPI.doraSuggest(activeChannelId, question);
      return result.suggestions;
    } catch {
      return [];
    }
  }, [activeChannelId]);

  const createTaskFromActionItem = useCallback(async (
    text: string,
    assignee?: string,
    priority?: string,
  ): Promise<boolean> => {
    try {
      const { fetchAPI } = await import('@/lib/api');
      await fetchAPI('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: text,
          description: `Created from chat action item${activeChannelId ? ` in channel` : ''}`,
          status: 'todo',
          priority: priority ?? 'medium',
          assignees: assignee ? [assignee] : [],
          projectId: undefined,
        }),
      });
      if (activeChannelId) {
        chatAPI.awardChatXP(activeChannelId, 'chat.task.created_from_chat').catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }, [activeChannelId]);

  return {
    doraSummary,
    doraActionItems,
    doraLoading,
    doraPanelOpen,
    toggleDoraPanel,
    summarize,
    getActionItems,
    getKBSuggestions,
    createTaskFromActionItem,
  };
}

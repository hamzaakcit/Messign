import { useAIChat } from '@/hooks/knowledge-hub/useAIChat';
import type { UseAIChatOptions, UseAIChatReturn } from '@/hooks/knowledge-hub/useAIChat';
import { useDoraChat } from '@/hooks/useDoraChat';
import { DORA_V2 } from '@/lib/featureFlags';

export type { UseAIChatOptions } from '@/hooks/knowledge-hub/useAIChat';

/**
 * Dora chat: v1 (`useAIChat`) or v2 (`useDoraChat`) based on `VITE_DORA_V2`.
 * `VITE_DORA_V2` is fixed at build time — only one hook implementation runs per bundle.
 */
export function useDora(options: UseAIChatOptions = {}): UseAIChatReturn {
  const useImpl = DORA_V2 ? useDoraChat : useAIChat;
  return useImpl(options);
}

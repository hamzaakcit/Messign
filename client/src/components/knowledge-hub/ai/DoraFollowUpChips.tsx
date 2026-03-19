import type { AIMessage } from '@/types/knowledge-hub/ai';
import { getSuggestions } from '@/shared/intents/suggestion-engine';
import { resolveIntent } from '@/shared/intents/resolver';
import { INTENT_ICON_MAP } from './AISuggestionChips';
import { useDoraSessionStore } from '@/stores/doraSessionStore';

export function DoraFollowUpChips({
  message,
  priorUserMessage,
  onSendMessage,
  userRole,
  currentPath,
}: {
  message: AIMessage;
  priorUserMessage?: AIMessage | null;
  onSendMessage?: (text: string, intentId?: string) => void;
  userRole?: string;
  currentPath?: string;
}) {
  if (message.role !== 'assistant' || message.isStreaming || !onSendMessage) return null;

  const role = userRole ?? 'member';
  const path = currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/');

  const recentIntents = useDoraSessionStore((s) => s.recentIntents);
  const frequentCategories = useDoraSessionStore((s) => s.frequentCategories);
  const visitedModulePrefixes = useDoraSessionStore((s) => s.visitedModulePrefixes);

  const lastIntentId =
    priorUserMessage?.role === 'user'
      ? priorUserMessage.intentId ?? resolveIntent(priorUserMessage.content)?.id
      : undefined;

  const suggestions = getSuggestions({
    role,
    currentPath: path,
    surface: 'followup',
    lastIntentId,
    recentIntents,
    frequentCategories,
    visitedModulePrefixes,
    conversationActive: true,
  });

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className="text-[10px] text-white/35 w-full uppercase tracking-wide">Try next</span>
      {suggestions.map((s, i) => {
        const Icon = s.icon ? INTENT_ICON_MAP[s.icon] : null;
        return (
          <button
            key={s.id}
            type="button"
            title={s.query}
            style={{
              animation: 'dora-followup-in 0.35s ease-out forwards',
              animationDelay: `${i * 50}ms`,
              opacity: 0,
            }}
            onClick={() => onSendMessage(s.query, s.id.startsWith('generic.') ? undefined : s.id)}
            className="text-[11px] px-3 py-2 rounded-full bg-white/5 text-sky-300/90 border border-white/10
              hover:bg-sky-500/10 hover:border-sky-500/40 hover:scale-[1.02] transition-all duration-200
              inline-flex items-center gap-1"
          >
            {Icon && <Icon size={12} className="opacity-70 shrink-0" />}
            {s.label}
          </button>
        );
      })}
      <style>{`
        @keyframes dora-followup-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

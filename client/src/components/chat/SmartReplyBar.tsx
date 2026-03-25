import { Sparkles, X, RefreshCw, Loader2 } from 'lucide-react';
import { useSmartReply } from '@/hooks/useSmartReply';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';

export function SmartReplyBar() {
  const { replies, loading, refresh, clear } = useSmartReply();
  const sendMessage = useChatStore((s) => s.sendMessage);
  const user = useAuthStore((s) => s.user);

  if (replies.length === 0 && !loading) return null;

  const handleSelect = (reply: string) => {
    if (!user) return;
    sendMessage(reply, user.id);
    clear();
  };

  return (
    <div className="px-4 py-2 border-t border-app/50">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-app-muted shrink-0">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-primary-400" />}
          <span className="text-[11px] font-medium">Smart replies</span>
        </div>

        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {replies.map((reply, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(reply)}
              className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border border-primary-500/20 bg-primary-500/5 text-primary-400 hover:bg-primary-500/15 hover:border-primary-500/40 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              {reply}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={refresh} className="p-1 rounded text-app-muted hover:text-app transition-colors" title="Refresh suggestions">
            <RefreshCw className="w-3 h-3" />
          </button>
          <button onClick={clear} className="p-1 rounded text-app-muted hover:text-app transition-colors" title="Dismiss">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

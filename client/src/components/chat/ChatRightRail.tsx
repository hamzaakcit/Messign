import { useEffect, useRef } from 'react';
import { MessageSquare, PanelRightOpen, X } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { ThreadPanel } from './ThreadPanel';
import { ChatDetailPanel } from './ChatDetailPanel';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useMediaQueryMatch } from '@/hooks/useMediaQueryMatch';

/**
 * Unified right sheet: thread replies and channel details (members, files, pins).
 * Desktop and mobile use the same overlay pattern so the main column stays full width.
 */
export function ChatRightRail(): JSX.Element | null {
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const detailPanelOpen = useChatStore((s) => s.detailPanelOpen);
  const rightRailTab = useChatStore((s) => s.rightRailTab);
  const setRightRailTab = useChatStore((s) => s.setRightRailTab);
  const closeRightRail = useChatStore((s) => s.closeRightRail);
  const toggleDetailPanel = useChatStore((s) => s.toggleDetailPanel);

  const railRef = useRef<HTMLDivElement>(null);
  const isNarrowViewport = useMediaQueryMatch('(max-width: 1023px)');
  const showRail = Boolean(activeThreadId || detailPanelOpen);

  useFocusTrap(showRail && isNarrowViewport, railRef);

  useEffect(() => {
    if (!showRail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRightRail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showRail, closeRightRail]);

  if (!showRail) return null;

  const showThreadTab = Boolean(activeThreadId);
  const showDetailsTab = true;

  return (
    <div className="fixed inset-0 z-[58] flex justify-end lg:z-[58]" aria-label="Chat side panel">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] border-0 cursor-default p-0"
        onClick={() => closeRightRail()}
        aria-label="Close panel"
      />
      <div
        ref={railRef}
        role="dialog"
        aria-modal={isNarrowViewport ? 'true' : undefined}
        className={cn(
          'relative z-10 flex h-full w-full max-w-md flex-col min-h-0 border-l border-app',
          'bg-app-sidebar/95 backdrop-blur-xl shadow-2xl',
        )}
      >
        <div className="flex items-center gap-1 border-b border-app px-2 py-2 shrink-0 bg-app-sidebar/80">
          {showThreadTab && (
            <button
              type="button"
              onClick={() => setRightRailTab('thread')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors',
                rightRailTab === 'thread'
                  ? 'bg-primary-500/15 text-primary-400' : 'text-app-muted hover:text-app hover:bg-app-hover',
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Thread
            </button>
          )}
          {showDetailsTab && (
            <button
              type="button"
              onClick={() => {
                if (!detailPanelOpen) toggleDetailPanel();
                setRightRailTab('details');
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors',
                rightRailTab === 'details'
                  ? 'bg-primary-500/15 text-primary-400' : 'text-app-muted hover:text-app hover:bg-app-hover',
              )}
            >
              <PanelRightOpen className="w-3.5 h-3.5" />
              Details
            </button>
          )}
          <button
            type="button"
            onClick={() => closeRightRail()}
            className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover shrink-0"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {rightRailTab === 'thread' && activeThreadId ? (
            <ThreadPanel embedded />
          ) : (
            <ChatDetailPanel embedded />
          )}
        </div>
      </div>
    </div>
  );
}

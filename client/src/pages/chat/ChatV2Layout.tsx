import { useEffect, useRef } from 'react';
import { useChatStore, ADMIN_MESSAGES_CHANNEL_ID } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChannelSidebar } from '@/components/chat/ChannelSidebar';
import { ChatMainPanel } from '@/components/chat/ChatMainPanel';
import { ChatDetailPanel } from '@/components/chat/ChatDetailPanel';
import { AdminMessagesPanel } from '@/components/chat/AdminMessagesPanel';
import { ChannelCreateModal } from '@/components/chat/ChannelCreateModal';
import { MessageContextMenu } from '@/components/chat/MessageContextMenu';
import { ThreadPanel } from '@/components/chat/ThreadPanel';
import { ChatDuelHub } from '@/components/chat/ChatDuelHub';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useMediaQueryMatch } from '@/hooks/useMediaQueryMatch';
import { useChatChannelsQuery } from '@/hooks/useChatChannelsQuery';

export function ChatV2Layout() {
  const user = useAuthStore((s) => s.user);
  const fetchUsers = useUsersStore((s) => s.fetchUsers);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const fetchChannels = useChatStore((s) => s.fetchChannels);
  const hydrateChannels = useChatStore((s) => s.hydrateChannels);
  const { data: channelsQueryData, isSuccess: channelsQuerySuccess } = useChatChannelsQuery(user?.id);
  const detailPanelOpen = useChatStore((s) => s.detailPanelOpen);
  const mobileSidebarOpen = useChatStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useChatStore((s) => s.setMobileSidebarOpen);
  const channelCreateOpen = useChatStore((s) => s.channelCreateOpen);
  const contextMenuMessage = useChatStore((s) => s.contextMenuMessage);
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const closeThread = useChatStore((s) => s.closeThread);
  const toggleDetailPanel = useChatStore((s) => s.toggleDetailPanel);
  const channelRailCollapsed = useChatStore((s) => s.channelRailCollapsed);
  const threadSheetRef = useRef<HTMLDivElement>(null);
  const detailSheetRef = useRef<HTMLDivElement>(null);
  const isNarrowViewport = useMediaQueryMatch('(max-width: 1023px)');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (channelsQuerySuccess && channelsQueryData !== undefined) {
      hydrateChannels(channelsQueryData);
    }
  }, [channelsQuerySuccess, channelsQueryData, hydrateChannels]);

  useEffect(() => {
    if (user?.id) void fetchUsers();
  }, [user?.id, fetchUsers]);

  useEffect(() => {
    if ((location.state as { openAdminMessages?: boolean })?.openAdminMessages) {
      setActiveChannel(ADMIN_MESSAGES_CHANNEL_ID);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, setActiveChannel]);

  const showAdminMessages = activeChannelId === ADMIN_MESSAGES_CHANNEL_ID;

  useFocusTrap(!!activeThreadId && !showAdminMessages && isNarrowViewport, threadSheetRef);
  useFocusTrap(detailPanelOpen && !activeThreadId && !showAdminMessages && isNarrowViewport, detailSheetRef);

  return (
    <div className="chat-surface relative flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden bg-app-bg">
      <div className="chat-atmosphere pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden />
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="absolute inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Channel rail: off-canvas on small viewports; in-flow from lg so it shares width with app LeftSidebar correctly */}
      <div
        className={cn(
          'z-50 flex min-h-0 w-72 shrink-0 flex-col border-r border-app bg-app-sidebar transition-[width,transform] duration-300 ease-out',
          'lg:relative lg:inset-auto lg:translate-x-0',
          channelRailCollapsed && 'lg:w-[3.75rem] lg:min-w-[3.75rem]',
          !channelRailCollapsed && 'lg:w-72',
          mobileSidebarOpen
            ? 'absolute inset-y-0 left-0 translate-x-0 shadow-xl lg:relative lg:shadow-none'
            : 'absolute inset-y-0 left-0 -translate-x-full lg:translate-x-0 lg:relative',
        )}
      >
        <ChannelSidebar onRetry={() => user?.id && fetchChannels(user.id)} />
      </div>

      {/* Main chat area */}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        {showAdminMessages ? <AdminMessagesPanel /> : <ChatMainPanel />}
      </div>

      {/* Thread panel — mobile: full-height sheet; desktop: fixed column */}
      {activeThreadId && !showAdminMessages && (
        <div className="fixed inset-0 z-[60] flex justify-end lg:static lg:inset-auto lg:z-10 lg:w-96 lg:shrink-0 lg:flex">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 lg:hidden border-0 cursor-default p-0"
            onClick={closeThread}
            aria-label="Close thread"
          />
          <div
            ref={threadSheetRef}
            className="relative z-10 flex h-full w-full max-w-lg flex-col min-h-0 border-l border-app bg-app-sidebar shadow-xl lg:max-w-none lg:shadow-none"
            role={isNarrowViewport ? 'dialog' : undefined}
            aria-modal={isNarrowViewport ? 'true' : undefined}
            aria-label="Thread"
          >
            <ThreadPanel />
          </div>
        </div>
      )}

      {/* Detail panel — mobile: sheet; desktop: column */}
      {detailPanelOpen && !activeThreadId && !showAdminMessages && (
        <div className="fixed inset-0 z-[55] flex justify-end lg:static lg:inset-auto lg:z-10 lg:w-80 lg:shrink-0 lg:flex">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 lg:hidden border-0 cursor-default p-0"
            onClick={toggleDetailPanel}
            aria-label="Close channel details"
          />
          <div
            ref={detailSheetRef}
            className="relative z-10 flex h-full w-full max-w-lg flex-col min-h-0 border-l border-app bg-app-sidebar shadow-xl lg:max-w-none lg:shadow-none"
            role={isNarrowViewport ? 'dialog' : undefined}
            aria-modal={isNarrowViewport ? 'true' : undefined}
            aria-label="Channel details"
          >
            <ChatDetailPanel />
          </div>
        </div>
      )}

      {/* Modals */}
      {channelCreateOpen && <ChannelCreateModal />}
      {contextMenuMessage && <MessageContextMenu />}
      {!showAdminMessages && <ChatDuelHub />}
    </div>
  );
}

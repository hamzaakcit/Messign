import { useEffect } from 'react';
import { useChatStore, ADMIN_MESSAGES_CHANNEL_ID } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChannelSidebar } from '@/components/chat/ChannelSidebar';
import { ChatMainPanel } from '@/components/chat/ChatMainPanel';
import { ChatRightRail } from '@/components/chat/ChatRightRail';
import { AdminMessagesPanel } from '@/components/chat/AdminMessagesPanel';
import { ChannelCreateModal } from '@/components/chat/ChannelCreateModal';
import { MessageContextMenu } from '@/components/chat/MessageContextMenu';
import { ChatDuelHub } from '@/components/chat/ChatDuelHub';
import { cn } from '@/lib/utils';
import { ViewportContainer } from '@/components/layout/ViewportContainer';
import { useChatChannelsQuery } from '@/hooks/useChatChannelsQuery';
import { useUIStore } from '@/stores/uiStore';

export function ChatV2Layout() {
  const user = useAuthStore((s) => s.user);
  const isMobile = useUIStore((s) => s.isMobile);
  const focusMode = useUIStore((s) => s.focusMode);
  const leftSidebarOpen = useUIStore((s) => s.leftSidebarOpen);
  const leftSidebarCollapsed = useUIStore((s) => s.leftSidebarCollapsed);
  const fetchUsers = useUsersStore((s) => s.fetchUsers);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const fetchChannels = useChatStore((s) => s.fetchChannels);
  const hydrateChannels = useChatStore((s) => s.hydrateChannels);
  const { data: channelsQueryData, isSuccess: channelsQuerySuccess } = useChatChannelsQuery(user?.id);
  const mobileSidebarOpen = useChatStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useChatStore((s) => s.setMobileSidebarOpen);
  const channelCreateOpen = useChatStore((s) => s.channelCreateOpen);
  const contextMenuMessage = useChatStore((s) => s.contextMenuMessage);
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const detailPanelOpen = useChatStore((s) => s.detailPanelOpen);
  const channelRailCollapsed = useChatStore((s) => s.channelRailCollapsed);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (channelsQuerySuccess && Array.isArray(channelsQueryData)) {
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

  /** When <lg, the app LeftSidebar is absolute (z-40); main is full-width. Offset the channel rail so it does not sit under the nav. */
  const showAppLeftSidebar = !focusMode && leftSidebarOpen;
  const channelRailLeftClass =
    isMobile && showAppLeftSidebar ? (leftSidebarCollapsed ? 'left-16' : 'left-60') : 'left-0';
  /** Off-screen transform must account for `left` offset so the drawer fully clears the viewport. */
  const channelRailClosedTransformClass =
    isMobile && showAppLeftSidebar
      ? leftSidebarCollapsed
        ? '-translate-x-[calc(100%+4rem)]'
        : '-translate-x-[calc(100%+15rem)]'
      : '-translate-x-full';
  const channelRailZClass =
    mobileSidebarOpen && isMobile ? 'z-[45]' : 'z-[35]';

  const showRightRail = !showAdminMessages && (Boolean(activeThreadId) || detailPanelOpen);

  return (
    <ViewportContainer
      orientation="row"
      density="compact"
      className="chat-surface relative flex-1 bg-app-bg"
    >
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
          channelRailZClass,
          'flex min-h-0 w-72 shrink-0 flex-col border-r border-app bg-app-sidebar transition-[width,transform] duration-300 ease-out',
          'lg:relative lg:inset-auto lg:translate-x-0',
          channelRailCollapsed && 'lg:w-[3.75rem] lg:min-w-[3.75rem]',
          !channelRailCollapsed && 'lg:w-72',
          channelRailLeftClass,
          mobileSidebarOpen
            ? 'absolute inset-y-0 translate-x-0 shadow-xl lg:relative lg:shadow-none'
            : cn(
                'absolute inset-y-0',
                channelRailClosedTransformClass,
                'lg:translate-x-0 lg:relative',
              ),
        )}
      >
        <ChannelSidebar onRetry={() => user?.id && fetchChannels(user.id)} />
      </div>

      {/* Main chat area — only child that scrolls is the transcript inside ChatMainPanel */}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {showAdminMessages ? <AdminMessagesPanel /> : <ChatMainPanel />}
      </div>

      {showRightRail && <ChatRightRail />}

      {/* Modals */}
      {channelCreateOpen && <ChannelCreateModal />}
      {contextMenuMessage && <MessageContextMenu />}
      {!showAdminMessages && <ChatDuelHub />}
    </ViewportContainer>
  );
}

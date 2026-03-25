import { useEffect } from 'react';
import { useChatStore, ADMIN_MESSAGES_CHANNEL_ID } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChannelSidebar } from '@/components/chat/ChannelSidebar';
import { ChatMainPanel } from '@/components/chat/ChatMainPanel';
import { ChatDetailPanel } from '@/components/chat/ChatDetailPanel';
import { AdminMessagesPanel } from '@/components/chat/AdminMessagesPanel';
import { ChannelCreateModal } from '@/components/chat/ChannelCreateModal';
import { MessageContextMenu } from '@/components/chat/MessageContextMenu';
import { cn } from '@/lib/utils';

export function ChatV2Layout() {
  const user = useAuthStore((s) => s.user);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const channels = useChatStore((s) => s.channels);
  const fetchChannels = useChatStore((s) => s.fetchChannels);
  const detailPanelOpen = useChatStore((s) => s.detailPanelOpen);
  const mobileSidebarOpen = useChatStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useChatStore((s) => s.setMobileSidebarOpen);
  const channelCreateOpen = useChatStore((s) => s.channelCreateOpen);
  const contextMenuMessage = useChatStore((s) => s.contextMenuMessage);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.id && channels.length === 0) {
      fetchChannels(user.id);
    }
  }, [user?.id, channels.length, fetchChannels]);

  useEffect(() => {
    if ((location.state as { openAdminMessages?: boolean })?.openAdminMessages) {
      setActiveChannel(ADMIN_MESSAGES_CHANNEL_ID);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, setActiveChannel]);

  const showAdminMessages = activeChannelId === ADMIN_MESSAGES_CHANNEL_ID;

  return (
    <div className="h-full flex overflow-hidden bg-app-bg">
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Channel sidebar */}
      <div
        className={cn(
          'w-72 border-r border-app bg-app-sidebar shrink-0 flex flex-col transition-transform duration-300 z-50',
          'lg:relative lg:translate-x-0',
          mobileSidebarOpen ? 'fixed inset-y-0 left-0 translate-x-0' : 'fixed inset-y-0 left-0 -translate-x-full lg:translate-x-0 lg:relative',
        )}
      >
        <ChannelSidebar onRetry={() => user?.id && fetchChannels(user.id)} />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {showAdminMessages ? <AdminMessagesPanel /> : <ChatMainPanel />}
      </div>

      {/* Detail panel (collapsible) */}
      {detailPanelOpen && !showAdminMessages && (
        <div className="w-80 border-l border-app bg-app-sidebar shrink-0 hidden lg:flex flex-col">
          <ChatDetailPanel />
        </div>
      )}

      {/* Modals */}
      {channelCreateOpen && <ChannelCreateModal />}
      {contextMenuMessage && <MessageContextMenu />}
    </div>
  );
}

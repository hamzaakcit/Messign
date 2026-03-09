import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChannelList } from '@/components/chat/ChannelList';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { AdminMessagesPanel } from '@/components/chat/AdminMessagesPanel';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { useChatStore, ADMIN_MESSAGES_CHANNEL_ID } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';

export function ChatView() {
  const { activeChannelId, setActiveChannel, channels, fetchChannels } = useChatStore();
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Fetch channels from /api/chat/channels on mount when on Chat and logged in
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
    <div className="h-full flex">
      {/* Channel List */}
      <div className="w-64 border-r border-app bg-app-panelBg transition-colors duration-200 shrink-0">
        <ChannelList onRetry={() => user?.id && fetchChannels(user.id)} />
      </div>

      {/* Chat Window or Admin Messages */}
      <div className="flex-1 flex flex-col">
        <div className="px-4 pt-3">
          <DoraInsightBar module="chat" />
        </div>
        {showAdminMessages ? <AdminMessagesPanel /> : <ChatWindow />}
      </div>
    </div>
  );
}

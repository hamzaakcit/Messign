import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { Hash, Lock, User } from 'lucide-react';

export function ChatWindow() {
  const channels = useChatStore((s) => s.channels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const messages = useChatStore((s) => s.messages);
  const currentUser = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const channelMessages = activeChannelId ? messages[activeChannelId] || [] : [];
  const channelDisplayName =
    activeChannel?.type === 'dm'
      ? (users.find((u) => activeChannel.members.includes(u.id) && u.id !== currentUser?.id)?.name ?? activeChannel.name)
      : activeChannel?.name ?? '';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages]);

  if (!activeChannel) {
    return (
      <div className="h-full flex items-center justify-center text-app-muted">
        Select a channel to start chatting
      </div>
    );
  }

  const getChannelIcon = () => {
    switch (activeChannel.type) {
      case 'public': return <Hash className="w-5 h-5" />;
      case 'private': return <Lock className="w-5 h-5" />;
      case 'dm': return <User className="w-5 h-5" />;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Channel Header */}
      <div className="px-4 py-3 border-b border-app flex items-center gap-3">
        <span className="text-app-muted">{getChannelIcon()}</span>
        <div>
          <h3 className="font-semibold text-app">{channelDisplayName}</h3>
          {activeChannel.description && (
            <p className="text-xs text-app-muted">{activeChannel.description}</p>
          )}
        </div>
        <div className="ml-auto text-sm text-app-muted">
          {activeChannel.members.length} members
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {channelMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-app-muted">
            <Hash className="w-12 h-12 mb-4 text-app-muted" />
            <p className="text-lg font-medium">No messages yet</p>
            <p className="text-sm">Be the first to say something!</p>
          </div>
        ) : (
          <>
            {channelMessages.map((message, index) => {
              const user = users.find(u => u.id === message.userId);
              const prevMessage = channelMessages[index - 1];
              const showAvatar = !prevMessage || prevMessage.userId !== message.userId;

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  user={user}
                  showAvatar={showAvatar}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input */}
      <MessageInput channelName={activeChannel.name} />
    </div>
  );
}

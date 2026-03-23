import { ChevronRight, Pin, MessageCircle, FileText, Users } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useUsersStore } from '@/stores/usersStore';
import { Avatar } from '@/components/ui';
import { pinnedMessages, channelThreads, filesShared } from '@/data/rightSidebar';

export function ChatRightSidebar() {
  const channels = useChatStore((s) => s.channels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const getUserById = useUsersStore((s) => s.getUserById);
  const activeChannel = channels.find((c) => c.id === activeChannelId);

  if (!activeChannel) {
    return (
      <div className="h-full bg-app-sidebar border-l border-app flex flex-col items-center justify-center p-6 text-app-muted transition-colors duration-200" role="complementary">
        <p className="text-sm">Select a channel</p>
      </div>
    );
  }

  const memberIds = activeChannel.members.slice(0, 8);

  return (
    <div className="h-full bg-app-sidebar border-l border-app flex flex-col overflow-hidden transition-colors duration-200" role="complementary" aria-label="Channel details">
      {/* Channel info */}
      <div className="p-4 border-b border-app">
        <h3 className="font-semibold text-app">{activeChannel.name}</h3>
        {activeChannel.description && <p className="text-sm text-app-muted mt-1">{activeChannel.description}</p>}
        <div className="flex items-center gap-2 mt-3">
          <Users className="w-4 h-4 text-app-muted" />
          <span className="text-sm text-app-muted">{activeChannel.members.length} members</span>
        </div>
        <div className="flex -space-x-2 mt-2">
          {memberIds.map((id) => {
            const u = getUserById(id);
            return u ? <Avatar key={id} src={u.avatar} name={u.name} size="sm" showStatus={false} className="ring-2 ring-app-sidebar" /> : null;
          })}
        </div>
        <button className="mt-2 text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">View all members <ChevronRight className="w-3 h-3" /></button>
      </div>

      {/* Pinned messages */}
      <div className="p-4 border-b border-app flex-1 overflow-hidden flex flex-col min-h-0">
        <h4 className="font-medium text-app text-sm flex items-center gap-2 mb-2">
          <Pin className="w-4 h-4 text-warning-500" /> Pinned Messages
        </h4>
        <ul className="space-y-2 overflow-y-auto flex-1">
          {pinnedMessages.slice(0, 5).map((pin) => (
            <li key={pin.id} className="text-xs p-2 rounded-lg bg-app-hover hover:bg-app-hover/80">
              <p className="text-app line-clamp-2">{pin.snippet}</p>
              <span className="text-app-muted">{pin.timestamp}</span>
            </li>
          ))}
        </ul>
        <a href="#" className="text-xs text-primary-400 hover:text-primary-300 mt-2 flex items-center gap-1">View all pins <ChevronRight className="w-3 h-3" /></a>
      </div>

      {/* Thread activity */}
      <div className="p-4 border-b border-app">
        <h4 className="font-medium text-app text-sm flex items-center gap-2 mb-2">
          <MessageCircle className="w-4 h-4 text-accent-400" /> Thread Activity
        </h4>
        <ul className="space-y-2">
          {channelThreads.map((t) => (
            <li key={t.id} className="text-xs p-2 rounded-lg bg-app-hover">
              <p className="text-app truncate">{t.preview}</p>
              <span className="text-app-muted">{t.replyCount} replies · {t.lastActivity}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Files shared */}
      <div className="p-4">
        <h4 className="font-medium text-app text-sm flex items-center gap-2 mb-2">
          <FileText className="w-4 h-4 text-primary-400" /> Files Shared
        </h4>
        <div className="flex flex-wrap gap-2">
          {filesShared.map((f) => (
            <div key={f.id} className="w-14 h-14 rounded-lg bg-app-hover flex items-center justify-center text-xs text-app-muted truncate px-1" title={f.name}>
              {f.type.toUpperCase()}
            </div>
          ))}
        </div>
        <a href="#" className="text-xs text-primary-400 hover:text-primary-300 mt-2 inline-flex items-center gap-1">View all files <ChevronRight className="w-3 h-3" /></a>
      </div>
    </div>
  );
}

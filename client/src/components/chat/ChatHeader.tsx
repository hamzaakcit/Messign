import { Hash, Lock, User, Search, Pin, Sparkles, PanelRightOpen, PanelRightClose, Settings, Menu } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { PresenceAvatar } from './PresenceAvatar';

export function ChatHeader() {
  const channels = useChatStore((s) => s.channels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const detailPanelOpen = useChatStore((s) => s.detailPanelOpen);
  const toggleDetailPanel = useChatStore((s) => s.toggleDetailPanel);
  const setDetailTab = useChatStore((s) => s.setDetailTab);
  const searchOpen = useChatStore((s) => s.searchOpen);
  const setSearchOpen = useChatStore((s) => s.setSearchOpen);
  const toggleDoraPanel = useChatStore((s) => s.toggleDoraPanel);
  const doraPanelOpen = useChatStore((s) => s.doraPanelOpen);
  const setMobileSidebarOpen = useChatStore((s) => s.setMobileSidebarOpen);
  const currentUser = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  if (!activeChannel) return null;

  const channelDisplayName =
    activeChannel.type === 'dm'
      ? (users.find((u) => activeChannel.members.includes(u.id) && u.id !== currentUser?.id)?.name ?? activeChannel.name)
      : activeChannel.name;

  const getChannelIcon = () => {
    switch (activeChannel.type) {
      case 'public': return <Hash className="w-5 h-5" />;
      case 'private': return <Lock className="w-5 h-5" />;
      case 'dm': return <User className="w-5 h-5" />;
    }
  };

  const memberUsers = activeChannel.members
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean)
    .slice(0, 5);

  return (
    <div className="px-4 py-3 border-b border-app flex items-center gap-3 bg-app-bg/50 backdrop-blur-sm">
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="lg:hidden p-1.5 rounded-lg text-app-muted hover:text-app hover:bg-app-hover"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Channel info */}
      <span className="text-app-muted">{getChannelIcon()}</span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-app truncate">{channelDisplayName}</h3>
        {activeChannel.topic && (
          <p className="text-xs text-app-muted truncate">{activeChannel.topic}</p>
        )}
        {!activeChannel.topic && activeChannel.description && (
          <p className="text-xs text-app-muted truncate">{activeChannel.description}</p>
        )}
      </div>

      {/* Member avatars */}
      <div className="hidden sm:flex -space-x-1.5 mr-2">
        {memberUsers.map((u) => u && (
          <PresenceAvatar key={u.id} user={u} size="xs" className="ring-2 ring-app-bg" />
        ))}
        {activeChannel.members.length > 5 && (
          <span className="w-6 h-6 rounded-full bg-app-hover flex items-center justify-center text-[10px] font-medium text-app-muted ring-2 ring-app-bg">
            +{activeChannel.members.length - 5}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className={`p-2 rounded-lg transition-colors ${searchOpen ? 'text-primary-400 bg-primary-500/10' : 'text-app-muted hover:text-app hover:bg-app-hover'}`}
          title="Search messages"
        >
          <Search className="w-4 h-4" />
        </button>
        <button
          onClick={() => setDetailTab('pins')}
          className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
          title="Pinned messages"
        >
          <Pin className="w-4 h-4" />
        </button>
        <button
          onClick={toggleDoraPanel}
          className={`p-2 rounded-lg transition-colors ${doraPanelOpen ? 'text-primary-400 bg-primary-500/10' : 'text-app-muted hover:text-app hover:bg-app-hover'}`}
          title="Dora AI Assistant"
        >
          <Sparkles className="w-4 h-4" />
        </button>
        <button
          onClick={toggleDetailPanel}
          className={`p-2 rounded-lg transition-colors hidden lg:block ${detailPanelOpen ? 'text-primary-400 bg-primary-500/10' : 'text-app-muted hover:text-app hover:bg-app-hover'}`}
          title="Channel details"
        >
          {detailPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setDetailTab('settings')}
          className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

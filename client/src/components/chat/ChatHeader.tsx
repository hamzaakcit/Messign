import { useState, useEffect, useRef } from 'react';
import { Hash, Lock, User, Search, Pin, Sparkles, PanelRightOpen, PanelRightClose, Settings, Menu, Circle, Swords } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { PresenceAvatar } from './PresenceAvatar';
import { emitUserStatus } from '@/lib/socket';
import { cn } from '@/lib/utils';

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
  const setDuelHubOpen = useChatStore((s) => s.setDuelHubOpen);
  const duelHubOpen = useChatStore((s) => s.duelHubOpen);
  const currentUser = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const users = useUsersStore((s) => s.users);
  const updateUserStatus = useUsersStore((s) => s.updateUserStatus);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) setStatusMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const applyQuickStatus = (status: 'online' | 'away' | 'busy' | 'deep_work') => {
    if (!currentUser) return;
    emitUserStatus({ status });
    updateUser({ status });
    updateUserStatus(currentUser.id, status);
    setStatusMenuOpen(false);
  };

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
        <div className="relative hidden sm:block" ref={statusMenuRef}>
          <button
            type="button"
            onClick={() => setStatusMenuOpen((o) => !o)}
            className={cn(
              'p-2 rounded-lg transition-colors flex items-center gap-1 text-app-muted hover:text-app hover:bg-app-hover',
              statusMenuOpen && 'text-primary-400 bg-primary-500/10',
            )}
            title="Set your status"
            aria-label="Set your status"
            aria-expanded={statusMenuOpen}
            aria-haspopup="listbox"
          >
            <Circle
              className={cn(
                'w-2.5 h-2.5 fill-current',
                currentUser?.status === 'online' && 'text-green-500',
                currentUser?.status === 'away' && 'text-yellow-500',
                (currentUser?.status === 'busy' || currentUser?.status === 'deep_work') && 'text-red-500',
                currentUser?.status === 'offline' && 'text-gray-500',
              )}
              aria-hidden
            />
            <span className="text-[10px] font-medium max-w-[4.5rem] truncate hidden xl:inline">Status</span>
          </button>
          {statusMenuOpen && (
            <ul
              role="listbox"
              className="absolute right-0 top-full mt-1 py-1 min-w-[140px] rounded-xl border border-app bg-app-sidebar shadow-xl z-50"
            >
              {([
                ['online', 'Online'],
                ['away', 'Away'],
                ['busy', 'Busy'],
                ['deep_work', 'Deep work'],
              ] as const).map(([id, label]) => (
                <li key={id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={currentUser?.status === id}
                    onClick={() => applyQuickStatus(id)}
                    className="w-full text-left px-3 py-2 text-sm text-app hover:bg-app-hover"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDuelHubOpen(!duelHubOpen)}
          className={cn(
            'p-2 rounded-lg transition-colors hidden sm:flex',
            duelHubOpen ? 'text-violet-400 bg-violet-500/10' : 'text-app-muted hover:text-app hover:bg-app-hover',
          )}
          title="Channel duels — RPS, coin flip, lucky chamber"
          aria-label="Open channel duels"
        >
          <Swords className="w-4 h-4" />
        </button>
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

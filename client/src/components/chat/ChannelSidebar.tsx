import { useState, useEffect } from 'react';
import { Hash, Lock, MessageCircle, Plus, ChevronDown, Mail, Loader2, AlertCircle, Search, X, FolderOpen, Trash2 } from 'lucide-react';
import type { Channel, SmartFolder } from '@/types';
import { useChatStore, ADMIN_MESSAGES_CHANNEL_ID } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { chatAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PresenceAvatar } from './PresenceAvatar';

interface ChannelSidebarProps {
  onRetry?: () => void;
}

export function ChannelSidebar({ onRetry }: ChannelSidebarProps) {
  const channels = useChatStore((s) => s.channels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const addChannel = useChatStore((s) => s.addChannel);
  const isLoading = useChatStore((s) => s.isLoading);
  const chatError = useChatStore((s) => s.chatError);
  const setChannelCreateOpen = useChatStore((s) => s.setChannelCreateOpen);
  const setMobileSidebarOpen = useChatStore((s) => s.setMobileSidebarOpen);
  const currentUser = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);
  const smartFoldersRaw = useChatStore((s) => s.smartFolders);
  const smartFolders = smartFoldersRaw ?? [];
  const fetchSmartFolders = useChatStore((s) => s.fetchSmartFolders);
  const removeSmartFolder = useChatStore((s) => s.removeSmartFolder);
  const [expandedSections, setExpandedSections] = useState({ public: true, private: true, dm: true, folders: true });
  const [dmMenuOpen, setDmMenuOpen] = useState(false);
  const [dmCreating, setDmCreating] = useState(false);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    if (typeof fetchSmartFolders === 'function') void fetchSmartFolders();
  }, [fetchSmartFolders]);

  const otherUsers = users.filter((u) => u.id !== currentUser?.id);

  const handleStartDm = async (otherUserId: string) => {
    if (!currentUser?.id || dmCreating) return;
    setDmCreating(true);
    try {
      const channel = await chatAPI.createDm(otherUserId, currentUser.id);
      addChannel(channel as Channel);
      setActiveChannel(channel.id);
      setDmMenuOpen(false);
      setMobileSidebarOpen(false);
    } catch (e) {
      console.error('Failed to create DM', e);
    } finally {
      setDmCreating(false);
    }
  };

  const handleSelectChannel = (id: string) => {
    setActiveChannel(id);
    setMobileSidebarOpen(false);
  };

  const filteredChannels = filterText
    ? channels.filter((c) => c.name.toLowerCase().includes(filterText.toLowerCase()))
    : channels;
  const publicChannels = filteredChannels.filter((c) => c.type === 'public');
  const privateChannels = filteredChannels.filter((c) => c.type === 'private');
  const dmChannels = filteredChannels.filter((c) => c.type === 'dm');

  const toggleSection = (section: 'public' | 'private' | 'dm' | 'folders') => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const getChannelDisplayName = (c: Channel) =>
    c.type === 'dm'
      ? (users.find((u) => c.members.includes(u.id) && u.id !== currentUser?.id)?.name ?? c.name)
      : c.name;

  const getDmUser = (c: Channel) =>
    c.type === 'dm' ? users.find((u) => c.members.includes(u.id) && u.id !== currentUser?.id) : null;

  const ChannelSection = ({
    title, channels: sectionChannels, section, icon: Icon,
  }: {
    title: string; channels: Channel[]; section: 'public' | 'private' | 'dm'; icon: typeof Hash;
  }) => (
    <div className="mb-2">
      <button
        onClick={() => toggleSection(section)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[11px] font-semibold text-app-muted uppercase tracking-wider hover:text-app transition-colors"
      >
        <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', !expandedSections[section] && '-rotate-90')} />
        {title}
        <span className="ml-auto text-[10px] font-normal opacity-60">{sectionChannels.length}</span>
      </button>
      {expandedSections[section] && (
        <div className="mt-0.5 space-y-px">
          {sectionChannels.map((channel) => {
            const dmUser = getDmUser(channel);
            return (
              <button
                key={channel.id}
                onClick={() => handleSelectChannel(channel.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-all duration-150 group',
                  activeChannelId === channel.id
                    ? 'bg-primary-500/15 text-app border border-primary-500/20'
                    : 'text-app-muted hover:text-app hover:bg-app-hover border border-transparent',
                )}
              >
                {dmUser ? (
                  <PresenceAvatar user={dmUser} size="xs" />
                ) : (
                  <Icon className="w-4 h-4 shrink-0 opacity-70" />
                )}
                <span className="truncate flex-1 text-left text-sm">{getChannelDisplayName(channel)}</span>
                {channel.unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-primary-500 text-white rounded-full min-w-[18px] text-center">
                    {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-app">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-app tracking-tight">Chat</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDmMenuOpen((o) => !o)}
              className="p-1.5 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
              aria-label="New DM"
              title="New direct message"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setChannelCreateOpen(true)}
              className="p-1.5 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
              aria-label="Create channel"
              title="Create channel"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-app-muted" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter channels..."
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-app-inputBg border border-app-inputBorder rounded-lg text-app placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          />
          {filterText && (
            <button onClick={() => setFilterText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-app-muted hover:text-app">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* DM menu overlay */}
      {dmMenuOpen && (
        <>
          <div className="fixed inset-0 z-10" aria-hidden onClick={() => setDmMenuOpen(false)} />
          <div className="absolute right-4 top-14 z-20 w-56 rounded-xl border border-app bg-app-panelBg shadow-xl py-1 max-h-64 overflow-y-auto">
            <div className="px-3 py-2 text-xs font-semibold text-app-muted uppercase">Direct message</div>
            {otherUsers.length === 0 ? (
              <div className="px-3 py-2 text-sm text-app-muted">No other users</div>
            ) : (
              otherUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={dmCreating}
                  onClick={() => handleStartDm(u.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-app hover:bg-app-hover transition-colors"
                >
                  <PresenceAvatar user={u} size="xs" />
                  <span className="truncate">{u.name}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}

      {/* Channel lists */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-4 text-app-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading channels...
          </div>
        )}
        {!isLoading && chatError && (
          <div className="px-3 py-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{chatError}</span>
            </div>
            {onRetry && (
              <button type="button" onClick={onRetry} className="mt-2 px-3 py-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium">
                Retry
              </button>
            )}
          </div>
        )}
        {!isLoading && !chatError && (
          <>
            <button
              onClick={() => handleSelectChannel(ADMIN_MESSAGES_CHANNEL_ID)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 mb-3 border',
                activeChannelId === ADMIN_MESSAGES_CHANNEL_ID
                  ? 'bg-blue-500/15 text-app border-blue-500/20'
                  : 'text-app-muted hover:text-app hover:bg-app-hover border-transparent',
              )}
            >
              <Mail className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1 text-left text-sm font-medium">Admin Messages</span>
            </button>
            {/* Smart Folders */}
            {smartFolders.length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => toggleSection('folders')}
                  className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[11px] font-semibold text-app-muted uppercase tracking-wider hover:text-app transition-colors"
                >
                  <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', !expandedSections.folders && '-rotate-90')} />
                  Smart Folders
                  <span className="ml-auto text-[10px] font-normal opacity-60">{smartFolders.length}</span>
                </button>
                {expandedSections.folders && (
                  <div className="mt-0.5 space-y-px">
                    {smartFolders.map((folder: SmartFolder) => (
                      <div
                        key={folder.id}
                        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors group"
                      >
                        <FolderOpen className="w-4 h-4 shrink-0 text-accent-400" />
                        <span className="truncate flex-1 text-left text-sm">{folder.name}</span>
                        <span className="text-[10px] opacity-60">{folder.channelIds.length}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeSmartFolder(folder.id); }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-app-muted hover:text-red-400 transition-all"
                          aria-label="Remove folder"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <ChannelSection title="Channels" channels={publicChannels} section="public" icon={Hash} />
            <ChannelSection title="Private" channels={privateChannels} section="private" icon={Lock} />
            <ChannelSection title="Direct Messages" channels={dmChannels} section="dm" icon={MessageCircle} />
          </>
        )}
      </div>
    </div>
  );
}

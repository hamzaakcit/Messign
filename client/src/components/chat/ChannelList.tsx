import { Hash, Lock, MessageCircle, Plus, ChevronDown, Mail, Loader2, AlertCircle } from 'lucide-react';
import type { Channel } from '@/types';
import { useChatStore, ADMIN_MESSAGES_CHANNEL_ID } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import { chatAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getChannelMemberIds, normalizeChannelList } from '@/lib/chatChannelUtils';
import { useState, useMemo } from 'react';

interface ChannelListProps {
  onRetry?: () => void;
}

export function ChannelList({ onRetry }: ChannelListProps) {
  const channelsRaw = useChatStore((s) => s.channels);
  const channels = useMemo(() => normalizeChannelList(channelsRaw), [channelsRaw]);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const addChannel = useChatStore((s) => s.addChannel);
  const isLoading = useChatStore((s) => s.isLoading);
  const chatError = useChatStore((s) => s.chatError);
  const currentUser = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);
  const [expandedSections, setExpandedSections] = useState({
    public: true,
    private: true,
    dm: true,
  });
  const [dmMenuOpen, setDmMenuOpen] = useState(false);
  const [dmCreating, setDmCreating] = useState(false);

  const otherUsers = users.filter((u) => u.id !== currentUser?.id);

  const handleStartDm = async (otherUserId: string) => {
    if (!currentUser?.id || dmCreating) return;
    setDmCreating(true);
    try {
      const channel = await chatAPI.createDm(otherUserId, currentUser.id);
      addChannel(channel as Channel);
      setActiveChannel(channel.id);
      setDmMenuOpen(false);
    } catch (e) {
      console.error('Failed to create DM', e);
    } finally {
      setDmCreating(false);
    }
  };

  const publicChannels = channels.filter(c => c.type === 'public');
  const privateChannels = channels.filter(c => c.type === 'private');
  const dmChannels = channels.filter(c => c.type === 'dm');

  const toggleSection = (section: 'public' | 'private' | 'dm') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const getChannelDisplayName = (c: (typeof channels)[0]) =>
    c.type === 'dm'
      ? (users.find((u) => getChannelMemberIds(c).includes(u.id) && u.id !== currentUser?.id)?.name ?? c.name)
      : c.name;

  const ChannelSection = ({ 
    title, 
    channels: sectionChannels, 
    section,
    icon: Icon,
    getDisplayName = (ch: (typeof channels)[0]) => ch.name,
  }: { 
    title: string; 
    channels: typeof channels; 
    section: 'public' | 'private' | 'dm';
    icon: typeof Hash;
    getDisplayName?: (ch: (typeof channels)[0]) => string;
  }) => (
    <div className="mb-4">
      <button
        onClick={() => toggleSection(section)}
        className="flex items-center gap-1 w-full px-3 py-1 text-xs font-semibold text-app-muted uppercase tracking-wider hover:text-app transition-colors"
      >
        <ChevronDown className={cn(
          'w-3 h-3 transition-transform',
          !expandedSections[section] && '-rotate-90'
        )} />
        {title}
      </button>
      
      {expandedSections[section] && (
        <div className="mt-1 space-y-0.5">
          {sectionChannels.map(channel => (
            <button
              key={channel.id}
              onClick={() => setActiveChannel(channel.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200',
                activeChannelId === channel.id
                  ? 'bg-primary-500/20 text-app'
                  : 'text-app-muted hover:text-app hover:bg-app-hover'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate flex-1 text-left text-sm">{getDisplayName(channel)}</span>
              {channel.unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-medium bg-primary-500 text-app-text rounded-full">
                  {channel.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-app flex items-center justify-between relative">
        <h2 className="font-semibold text-app">Channels</h2>
        <div className="relative">
          <button
            type="button"
            onClick={() => setDmMenuOpen((o) => !o)}
            className="p-1 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
            aria-label="New channel or DM"
          >
            <Plus className="w-4 h-4" />
          </button>
          {dmMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => setDmMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-app bg-app-panelBg shadow-lg py-1 max-h-64 overflow-y-auto">
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
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-app hover:bg-app-hover"
                    >
                      <span className="truncate">{u.name}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Channel Lists */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-4 text-app-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading channels...
          </div>
        )}
        {!isLoading && chatError && (
          <div className="px-3 py-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{chatError}</span>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 px-3 py-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium"
              >
                Retry
              </button>
            )}
          </div>
        )}
        {!isLoading && !chatError && (
          <>
        <button
          onClick={() => setActiveChannel(ADMIN_MESSAGES_CHANNEL_ID)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-200 mb-4',
            activeChannelId === ADMIN_MESSAGES_CHANNEL_ID
              ? 'bg-blue-500/20 text-app'
              : 'text-app-muted hover:text-app hover:bg-app-hover'
          )}
        >
          <Mail className="w-4 h-4 flex-shrink-0" />
          <span className="truncate flex-1 text-left text-sm font-medium">
            Messages from Admin
          </span>
        </button>
        <ChannelSection 
          title="Public Channels" 
          channels={publicChannels} 
          section="public"
          icon={Hash}
        />
        <ChannelSection 
          title="Private Channels" 
          channels={privateChannels} 
          section="private"
          icon={Lock}
        />
        <ChannelSection 
          title="Direct Messages" 
          channels={dmChannels} 
          section="dm"
          icon={MessageCircle}
          getDisplayName={getChannelDisplayName}
        />
          </>
        )}
      </div>
    </div>
  );
}

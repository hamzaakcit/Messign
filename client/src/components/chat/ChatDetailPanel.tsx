import { useEffect } from 'react';
import { Users, Pin, FileText, Settings, X, ExternalLink } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useUsersStore } from '@/stores/usersStore';
import { PresenceAvatar } from './PresenceAvatar';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import type { DetailTab } from '@/stores/chatStore';

const TABS: { id: DetailTab; label: string; icon: typeof Users }[] = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'pins', label: 'Pinned', icon: Pin },
  { id: 'media', label: 'Files', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function ChatDetailPanel() {
  const channels = useChatStore((s) => s.channels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const detailTab = useChatStore((s) => s.detailTab);
  const setDetailTab = useChatStore((s) => s.setDetailTab);
  const toggleDetailPanel = useChatStore((s) => s.toggleDetailPanel);
  const pinnedMessages = useChatStore((s) => s.pinnedMessages);
  const channelMedia = useChatStore((s) => s.channelMedia);
  const fetchPins = useChatStore((s) => s.fetchPins);
  const fetchMedia = useChatStore((s) => s.fetchMedia);
  const users = useUsersStore((s) => s.users);

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const pins = activeChannelId ? pinnedMessages[activeChannelId] ?? [] : [];
  const media = activeChannelId ? channelMedia[activeChannelId] ?? [] : [];

  useEffect(() => {
    if (!activeChannelId) return;
    if (detailTab === 'pins') fetchPins(activeChannelId);
    if (detailTab === 'media') fetchMedia(activeChannelId);
  }, [activeChannelId, detailTab, fetchPins, fetchMedia]);

  if (!activeChannel) {
    return (
      <div className="h-full flex items-center justify-center text-app-muted text-sm p-6">
        Select a channel
      </div>
    );
  }

  const membersList = activeChannel.members
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-app flex items-center justify-between">
        <h3 className="font-semibold text-app text-sm">Details</h3>
        <button onClick={toggleDetailPanel} className="p-1 rounded text-app-muted hover:text-app transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-app">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setDetailTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium transition-colors border-b-2',
              detailTab === tab.id
                ? 'text-primary-400 border-primary-500'
                : 'text-app-muted hover:text-app border-transparent',
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Members tab */}
        {detailTab === 'members' && (
          <div className="space-y-1">
            <p className="text-xs text-app-muted mb-3">{membersList.length} members</p>
            {membersList.map((u) => u && (
              <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-app-hover transition-colors">
                <PresenceAvatar user={u} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-app truncate">{u.name}</p>
                  <p className="text-[11px] text-app-muted truncate">{u.jobTitle ?? u.department ?? ''}</p>
                </div>
                <span className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  u.status === 'online' ? 'bg-green-500' :
                  u.status === 'away' ? 'bg-yellow-500' :
                  u.status === 'busy' || u.status === 'deep_work' ? 'bg-red-500' :
                  'bg-gray-500',
                )} />
              </div>
            ))}
          </div>
        )}

        {/* Pins tab */}
        {detailTab === 'pins' && (
          <div className="space-y-2">
            {pins.length === 0 ? (
              <div className="text-center py-6 text-sm text-app-muted">
                <Pin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No pinned messages
              </div>
            ) : (
              pins.map((pin) => (
                <div key={pin.id} className="p-2.5 rounded-lg bg-app-hover/50 border border-app">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-medium text-app">{pin.senderName}</span>
                    <span className="text-[10px] text-app-muted">{formatTime(pin.timestamp)}</span>
                  </div>
                  <p className="text-sm text-app-muted line-clamp-3">{pin.content}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Media tab */}
        {detailTab === 'media' && (
          <div className="space-y-2">
            {media.length === 0 ? (
              <div className="text-center py-6 text-sm text-app-muted">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No files shared yet
              </div>
            ) : (
              media.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-app-hover transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-app-hover flex items-center justify-center text-xs font-medium text-app-muted shrink-0">
                    {(item.type ?? '').split('/').pop()?.toUpperCase().slice(0, 4) ?? 'FILE'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-app truncate">{item.name ?? 'Unknown'}</p>
                    <p className="text-[11px] text-app-muted">
                      {item.sharedBy} · {new Date(item.sharedAt).toLocaleDateString()}
                    </p>
                  </div>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-app-muted hover:text-primary-400">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Settings tab */}
        {detailTab === 'settings' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-app-muted uppercase tracking-wider">Channel Name</label>
              <p className="text-sm text-app mt-1">{activeChannel.name}</p>
            </div>
            {activeChannel.description && (
              <div>
                <label className="text-xs font-medium text-app-muted uppercase tracking-wider">Description</label>
                <p className="text-sm text-app mt-1">{activeChannel.description}</p>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-app-muted uppercase tracking-wider">Type</label>
              <p className="text-sm text-app mt-1 capitalize">{activeChannel.type}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-app-muted uppercase tracking-wider">Created</label>
              <p className="text-sm text-app mt-1">{new Date(activeChannel.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Pin, Tag, Activity, Search } from 'lucide-react';
import { knowledgeAPI } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { KbDocument } from './DocumentCard';

interface Props {
  onSelectDocument?: (slug: string) => void;
  onSelectTag?: (tagSlug: string) => void;
  onSearch?: (query: string) => void;
}

const RECENT_KEY = 'kb-recent-searches';

export function KnowledgeSidebar({ onSelectDocument, onSelectTag, onSearch }: Props) {
  const { user } = useAuthStore();
  const [pins, setPins] = useState<KbDocument[]>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string; slug: string; document_count?: number }>>([]);
  const [activities, setActivities] = useState<Array<{ id: string; action: string; document_title?: string; user_name?: string; created_at: string }>>([]);

  useEffect(() => {
    if (!user?.id) return;
    knowledgeAPI.myPins(user.id).then(data => setPins(data as KbDocument[])).catch(() => {});
    knowledgeAPI.tags.list(user.id).then(data => setTags(data as typeof tags)).catch(() => {});
    knowledgeAPI.activities(user.id, 10).then(data => setActivities(data as typeof activities)).catch(() => {});
  }, [user?.id]);

  const recentSearches: string[] = (() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
    catch { return []; }
  })();

  const formatActivity = (a: typeof activities[0]) => {
    const actions: Record<string, string> = {
      created: 'uploaded', updated: 'updated', downloaded: 'downloaded',
      acknowledged: 'reviewed', flagged: 'flagged', pinned: 'pinned',
    };
    const verb = actions[a.action] ?? a.action;
    return `${a.user_name ?? 'Someone'} ${verb} ${a.document_title ?? 'a document'}`;
  };

  const formatTimeAgo = (dateStr: string) => {
    const ms = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* My Shortcuts (Pinned) */}
      {pins.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-app-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Pin className="w-3.5 h-3.5" /> My Shortcuts
          </h3>
          <div className="space-y-1">
            {pins.slice(0, 5).map(doc => (
              <button key={doc.id} onClick={() => onSelectDocument?.(doc.slug)}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm text-app hover:bg-app-hover transition-colors truncate">
                {doc.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Popular Tags */}
      {tags.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-app-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" /> Popular Tags
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 12).map(tag => (
              <button key={tag.id} onClick={() => onSelectTag?.(tag.slug)}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-app-hover text-app-muted hover:text-app hover:bg-dark-600 transition-colors">
                {tag.name}
                {tag.document_count ? <span className="ml-1 opacity-60">({tag.document_count})</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {activities.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-app-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Recent Activity
          </h3>
          <div className="space-y-2">
            {activities.map(a => (
              <div key={a.id} className="text-xs text-app-muted leading-relaxed">
                <span>{formatActivity(a)}</span>
                <span className="block text-[10px] opacity-60 mt-0.5">{formatTimeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frequently Searched */}
      {recentSearches.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-app-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" /> Recent Searches
          </h3>
          <div className="space-y-1">
            {recentSearches.slice(0, 5).map(s => (
              <button key={s} onClick={() => onSearch?.(s)}
                className="block w-full text-left px-3 py-1.5 rounded-lg text-xs text-app-muted hover:text-app hover:bg-app-hover transition-colors truncate">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

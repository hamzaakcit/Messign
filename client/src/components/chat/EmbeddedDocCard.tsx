import { useEffect, useState } from 'react';
import { FileText, ExternalLink, User, Clock, Loader2 } from 'lucide-react';
import { chatAPI } from '@/lib/api';
import type { EmbeddedDocCard as DocCardType } from '@/types';

interface EmbeddedDocCardProps {
  refId: string;
  channelId: string;
}

export function EmbeddedDocCard({ refId, channelId }: EmbeddedDocCardProps) {
  const [card, setCard] = useState<DocCardType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    chatAPI.resolveEmbed(channelId, 'document', refId)
      .then((data) => {
        if (!cancelled && data?.type === 'document') setCard(data as DocCardType);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refId, channelId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl border border-app bg-app-hover/30 text-sm text-app-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading document...
      </div>
    );
  }

  if (!card) return null;

  return (
    <div className="rounded-xl border border-accent-500/20 bg-gradient-to-r from-accent-500/5 to-transparent overflow-hidden max-w-md">
      <div className="px-3 py-2 border-b border-accent-500/10 flex items-center gap-2">
        <FileText className="w-4 h-4 text-accent-400" />
        <span className="text-[11px] font-semibold text-accent-400 uppercase tracking-wider">Document</span>
        {card.category && <span className="text-[11px] text-app-muted">· {card.category}</span>}
        <a href={`/knowledge-hub/documents/${card.id}`} className="ml-auto text-app-muted hover:text-accent-400 transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <div className="px-3 py-2.5">
        <h4 className="text-sm font-semibold text-app mb-1">{card.title}</h4>
        <p className="text-xs text-app-muted line-clamp-2 mb-2">{card.excerpt}</p>
        <div className="flex items-center gap-3 text-[11px] text-app-muted">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" /> {card.authorName}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {new Date(card.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { Instagram, Linkedin, Mail, Megaphone, Twitter } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { ContentItem, Campaign, EmailCampaign } from '@/lib/marketingApi';
import type { ApprovalQueueItem, RiskLevel } from '../approvalQueue/types';

export interface BoardCardData {
  id: string;
  type: 'content' | 'campaign' | 'email' | 'approval';
  title: string;
  channel?: string | null;
  thumbnailUrl?: string | null;
  scheduledDate?: string | null;
  updatedAt: string;
  roi?: number | null;
  score?: number;
  riskLevel?: RiskLevel;
  status: string;
  sourceData: ContentItem | Campaign | ApprovalQueueItem | EmailCampaign;
}

interface BoardCardProps {
  card: BoardCardData;
  onClick: (card: BoardCardData) => void;
  overlay?: boolean;
}

function ChannelIcon({ channel, className }: { channel?: string | null; className?: string }): JSX.Element {
  const c = (channel ?? '').toLowerCase();
  if (c === 'instagram') return <Instagram className={cn('text-pink-400', className)} />;
  if (c === 'linkedin') return <Linkedin className={cn('text-blue-400', className)} />;
  if (c === 'twitter' || c === 'x') return <Twitter className={cn('text-sky-400', className)} />;
  if (c === 'email') return <Mail className={cn('text-emerald-400', className)} />;
  return <Megaphone className={cn('text-slate-400', className)} />;
}

function RiskDot({ level }: { level?: RiskLevel }): JSX.Element | null {
  if (!level || level === 'none') return null;
  const color =
    level === 'high' ? 'bg-red-500' : level === 'medium' ? 'bg-amber-500' : 'bg-emerald-500';
  return <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', color)} />;
}

function CardThumbnail({ url, channel }: { url?: string | null; channel?: string | null }): JSX.Element {
  if (url) {
    return (
      <div className="relative w-full h-14 rounded-t overflow-hidden bg-app-surface-tertiary">
        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
      </div>
    );
  }
  const c = (channel ?? '').toLowerCase();
  const gradient =
    c === 'instagram'
      ? 'from-pink-900/40 to-purple-900/40'
      : c === 'email'
        ? 'from-emerald-900/40 to-teal-900/40'
        : c === 'linkedin'
          ? 'from-blue-900/40 to-indigo-900/40'
          : 'from-slate-800/40 to-slate-700/40';
  return (
    <div className={cn('w-full h-10 rounded-t bg-gradient-to-br flex items-center justify-center', gradient)}>
      <ChannelIcon channel={channel} className="w-4 h-4 opacity-50" />
    </div>
  );
}

export function BoardCard({ card, onClick, overlay }: BoardCardProps): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, data: card });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (overlay) {
    return (
      <div className="rounded-lg border border-primary-400/40 bg-[#0c0f14] shadow-xl ring-2 ring-primary-400/30 w-full">
        <CardThumbnail url={card.thumbnailUrl} channel={card.channel} />
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <ChannelIcon channel={card.channel} className="w-3 h-3 shrink-0" />
            <span className="text-xs font-medium text-app-text truncate">{card.title}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layoutId={card.id}
      {...attributes}
      {...listeners}
      onClick={() => onClick(card)}
      className={cn(
        'rounded-lg border border-white/[0.08] bg-[#0c0f14] cursor-grab active:cursor-grabbing transition-shadow hover:border-app-border hover:shadow-lg',
        isDragging && 'opacity-40',
      )}
    >
      <CardThumbnail url={card.thumbnailUrl} channel={card.channel} />
      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5 mb-1">
          <ChannelIcon channel={card.channel} className="w-3 h-3 shrink-0" />
          <span className="text-xs font-medium text-app-text truncate">{card.title}</span>
          <RiskDot level={card.riskLevel} />
        </div>
        <div className="flex items-center justify-between text-[10px] text-app-muted">
          <span className="truncate">{formatRelativeTime(card.updatedAt)}</span>
          {card.roi != null && card.roi > 0 && (
            <span className={cn(
              'font-medium shrink-0',
              card.roi > 2 ? 'text-emerald-400' : card.roi >= 1 ? 'text-amber-400' : 'text-red-400',
            )}>
              {card.roi.toFixed(1)}x
            </span>
          )}
          {card.score != null && card.score > 0 && (
            <span className="font-medium text-purple-400 shrink-0">{card.score}/100</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function BoardCardOverlay({ card }: { card: BoardCardData }): JSX.Element {
  return <BoardCard card={card} onClick={() => {}} overlay />;
}

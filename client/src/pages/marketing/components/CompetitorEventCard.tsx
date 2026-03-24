import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import type { CompetitorEventClient } from '@/lib/marketingApi';

const EVENT_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  blog_post: { label: 'Blog', bg: 'bg-blue-500/15', text: 'text-blue-400' },
  product_launch: { label: 'Launch', bg: 'bg-purple-500/15', text: 'text-purple-400' },
  pricing_change: { label: 'Pricing', bg: 'bg-orange-500/15', text: 'text-orange-400' },
  email_campaign: { label: 'Email', bg: 'bg-teal-500/15', text: 'text-teal-400' },
  feature_update: { label: 'Feature', bg: 'bg-green-500/15', text: 'text-green-400' },
  partnership: { label: 'Partner', bg: 'bg-indigo-500/15', text: 'text-indigo-400' },
  funding: { label: 'Funding', bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
  press_release: { label: 'Press', bg: 'bg-gray-500/15', text: 'text-app-muted' },
  social_post: { label: 'Social', bg: 'bg-pink-500/15', text: 'text-pink-400' },
  other: { label: 'Other', bg: 'bg-gray-500/15', text: 'text-app-muted' },
};

export function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

interface CompetitorEventCardProps {
  event: CompetitorEventClient;
  competitorName?: string;
  showCompetitorName?: boolean;
}

export function CompetitorEventCard({ event, competitorName, showCompetitorName }: CompetitorEventCardProps) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const typeConfig = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.other;
  const displayDate = event.event_date || event.discovered_at;
  const displayName = competitorName || event.competitor_name;
  const showDot = event.significance === 'critical' || event.significance === 'high';
  const displayTags = event.tags?.slice(0, 5) || [];
  const overflowCount = (event.tags?.length || 0) - 5;

  return (
    <div className="p-4 rounded-lg border border-app-border bg-app-card/50 hover:bg-app-card transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${typeConfig.bg} ${typeConfig.text}`}>
          {typeConfig.label}
        </span>
        {showDot && (
          <span className={`w-2 h-2 rounded-full ${event.significance === 'critical' ? 'bg-red-500 animate-pulse' : 'bg-orange-400'}`} />
        )}
        <span className="ml-auto text-[11px] text-app-muted">{formatRelativeDate(displayDate)}</span>
      </div>

      <h4 className="text-sm font-medium text-app-text leading-snug mb-0.5">{event.title}</h4>

      {showCompetitorName && displayName && (
        <p className="text-xs text-app-muted mb-1">{displayName}</p>
      )}

      {event.summary && (
        <p className="text-xs text-app-muted line-clamp-2 mb-2">{event.summary}</p>
      )}

      {displayTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {displayTags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded-full bg-app-hover text-[10px] text-app-muted">{tag}</span>
          ))}
          {overflowCount > 0 && (
            <span className="text-[10px] text-app-muted">+{overflowCount}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {event.source_url && (
          <a
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-primary-400 hover:text-primary-300"
          >
            Source <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {event.ai_analysis && (
          <button
            type="button"
            onClick={() => setAnalysisOpen(!analysisOpen)}
            className="inline-flex items-center gap-1 text-[11px] text-app-muted hover:text-app-text"
          >
            AI Analysis {analysisOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {analysisOpen && event.ai_analysis && (
        <div className="mt-2 p-3 rounded-md bg-app-hover/50 border border-app-border/50">
          <p className="text-xs text-app-muted whitespace-pre-wrap leading-relaxed">{event.ai_analysis}</p>
        </div>
      )}
    </div>
  );
}

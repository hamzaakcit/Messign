import { useState } from 'react';
import { GitCompare, Megaphone } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { ApprovalQueueItem } from '../../approvalQueue/types';
import { channelLabel } from '../../approvalQueue/approvalQueueUtils';
import { TelemetryPanel } from './TelemetryPanel';
import { ChannelIcon } from './ChannelIcon';

interface ReviewDetailProps {
  item: ApprovalQueueItem | null;
  onApprove: () => void;
  onRequestRevision: () => void;
}

function previewWidthClass(channel: ApprovalQueueItem['targetChannel']): string {
  if (channel === 'linkedin' || channel === 'social' || channel === 'instagram') return 'max-w-md mx-auto';
  if (channel === 'email') return 'max-w-2xl';
  return 'max-w-3xl';
}

export function ReviewDetail({ item, onApprove, onRequestRevision }: ReviewDetailProps) {
  const [showRevisions, setShowRevisions] = useState(false);

  if (!item) {
    return (
      <div className="flex items-center justify-center h-full min-h-[320px] text-app-muted text-sm border border-dashed border-app-border rounded-xl">
        Select an item from the queue to review.
      </div>
    );
  }

  const hasRevisions = item.revisions && item.revisions.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0 border border-app-border rounded-xl bg-app-surface-tertiary overflow-hidden">
      <div className="p-4 border-b border-app-border shrink-0">
        <div className="flex items-start gap-3">
          <ChannelIcon channel={item.targetChannel} className="w-5 h-5 text-primary-300 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-app-text leading-tight">{item.title}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-app-muted">
              <Badge variant="blue" size="sm">
                {channelLabel(item.targetChannel)}
              </Badge>
              <span className="inline-flex items-center gap-1">
                <Megaphone className="w-3.5 h-3.5" />
                {item.campaignName}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-app-surface-tertiary border border-app-border p-3">
          <p className="text-[11px] uppercase tracking-wide text-app-muted mb-1">Original brief</p>
          <p className="text-sm text-app-text/90">{item.userBrief}</p>
        </div>

        {hasRevisions && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowRevisions((v) => !v)}
              className={cn(
                'inline-flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-lg border transition-colors',
                showRevisions ? 'bg-primary-500/20 border-primary-500/40 text-primary-200' : 'border-app-border text-app-muted hover:bg-app-nav-hover',
              )}
            >
              <GitCompare className="w-3.5 h-3.5" />
              Revision history {showRevisions ? '(hide)' : '(mock v1 → v2)'}
            </button>
            {showRevisions && (
              <ul className="mt-2 space-y-2 text-xs text-app-muted border border-app-border rounded-lg p-2 max-h-40 overflow-y-auto">
                {item.revisions!.map((r) => (
                  <li key={r.version}>
                    <span className="text-app-text font-medium">v{r.version}</span> {r.label} · {new Date(r.savedAt).toLocaleString()}
                    <pre className="mt-1 text-[10px] whitespace-pre-wrap text-app-muted/90 font-mono bg-black/20 p-2 rounded">{r.body.slice(0, 400)}{r.body.length > 400 ? '…' : ''}</pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_minmax(280px,340px)] gap-0 lg:divide-x divide-white/10">
        <div className="min-h-0 overflow-y-auto p-4">
          <p className="text-[11px] uppercase tracking-wide text-app-muted mb-2">Draft preview</p>
          <div
            className={cn(
              'rounded-xl border border-app-border bg-black/20 p-4 prose prose-invert prose-sm max-w-none',
              previewWidthClass(item.targetChannel),
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.body}</ReactMarkdown>
          </div>
        </div>
        <aside className="min-h-0 overflow-y-auto p-4 bg-black/10">
          <TelemetryPanel item={item} />
        </aside>
      </div>

      <div className="p-4 border-t border-app-border flex flex-wrap gap-2 justify-end shrink-0 bg-black/20">
        <button
          type="button"
          onClick={onRequestRevision}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-amber-500/40 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20"
        >
          Request revision
        </button>
        <button
          type="button"
          onClick={onApprove}
          className="px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600/90 text-app-text hover:bg-emerald-600 border border-emerald-500/50"
        >
          Approve
        </button>
      </div>
    </div>
  );
}

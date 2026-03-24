import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { cn, formatRelativeTime } from '@/lib/utils';
import type {
  SupportPriority,
  SupportSlaState,
  SupportSlaStatusDetail,
  SupportStatus,
} from '@/lib/supportApi';

const PRIORITY_VARIANTS: Record<SupportPriority, 'red' | 'orange' | 'blue' | 'default'> = {
  critical: 'red',
  high: 'orange',
  medium: 'blue',
  low: 'default',
};

const STATUS_VARIANTS: Record<SupportStatus, 'default' | 'blue' | 'orange' | 'green'> = {
  open: 'blue',
  awaiting_agent: 'orange',
  awaiting_customer: 'default',
  in_progress: 'blue',
  on_hold: 'orange',
  resolved: 'green',
  closed: 'default',
};

function formatStatusLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatHoursShort(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return '—';
  if (hours >= 24) return `${(hours / 24).toFixed(hours >= 48 ? 0 : 1)}d`;
  if (hours >= 1) return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  return `${Math.max(1, Math.round(hours * 60))}m`;
}

export function formatTicketStamp(ticketNumber: string): string {
  return ticketNumber.startsWith('#') ? ticketNumber : `#${ticketNumber}`;
}

export function getSlaTone(detail?: SupportSlaStatusDetail | null): SupportSlaState {
  return detail?.status ?? 'on_track';
}

export function formatSlaText(detail?: SupportSlaStatusDetail | null): string {
  if (!detail?.dueAt) return 'No SLA';
  const now = Date.now();
  const dueAt = new Date(detail.dueAt).getTime();
  const diffHours = Math.abs(dueAt - now) / 3_600_000;
  if (detail.status === 'breached') return `Breached ${formatHoursShort(diffHours)} ago`;
  return `${formatHoursShort(diffHours)} left`;
}

export function PriorityBadge({ priority }: { priority: SupportPriority }) {
  return (
    <Badge variant={PRIORITY_VARIANTS[priority]} className="gap-1.5">
      {priority === 'critical' && <span className="w-2 h-2 rounded-full bg-current animate-pulse" />}
      {formatStatusLabel(priority)}
    </Badge>
  );
}

export function TicketStatusBadge({ status }: { status: SupportStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]}>
      {formatStatusLabel(status)}
    </Badge>
  );
}

export function HealthScoreBadge({ score }: { score: number }) {
  const variant = score >= 75 ? 'green' : score >= 60 ? 'orange' : 'red';
  return <Badge variant={variant}>{score}/100 health</Badge>;
}

export function TrendBadge({ trend }: { trend: 'improving' | 'stable' | 'declining' | 'critical' }) {
  if (trend === 'stable') return <span className="text-xs text-app-muted">Stable</span>;
  const Icon = trend === 'improving' ? ArrowUpRight : trend === 'declining' ? ArrowDownRight : AlertTriangle;
  const className = trend === 'improving' ? 'text-emerald-400' : 'text-red-400';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', className)}>
      <Icon className="w-3.5 h-3.5" />
      {formatStatusLabel(trend)}
    </span>
  );
}

export function SlaBar({
  label,
  detail,
  summary,
}: {
  label: string;
  detail?: SupportSlaStatusDetail | null;
  summary: string;
}) {
  const tone = getSlaTone(detail);
  const color =
    tone === 'breached'
      ? 'red'
      : tone === 'at_risk'
        ? 'amber'
        : 'green';

  return (
    <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-app-muted">{label}</p>
        <span
          className={cn(
            'text-xs font-medium',
            color === 'red' && 'text-red-400',
            color === 'amber' && 'text-amber-400',
            color === 'green' && 'text-emerald-400',
          )}
        >
          {formatSlaText(detail)}
        </span>
      </div>
      <ProgressBar
        value={Math.min(detail?.percentElapsed ?? 0, 100)}
        variant={color === 'red' ? 'warning' : color === 'amber' ? 'warning' : 'success'}
        size="md"
      />
      <p className="text-sm text-app-text">{summary}</p>
    </div>
  );
}

export function TicketAssigneeValue({
  assigneeName,
}: {
  assigneeName?: string | null;
}) {
  if (assigneeName) return <span className="text-app-text">{assigneeName}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-amber-300">
      <AlertTriangle className="w-3.5 h-3.5" />
      Unassigned
    </span>
  );
}

export function RelativeStamp({ value }: { value: string }) {
  return <span title={new Date(value).toLocaleString()}>{formatRelativeTime(value)}</span>;
}

export function TimelineMarker({ emphasized = false }: { emphasized?: boolean }) {
  return (
    <span className={cn(
      'w-2.5 h-2.5 rounded-full mt-1.5 shrink-0',
      emphasized ? 'bg-primary-400' : 'bg-app-hover',
    )}
    />
  );
}

export function InlineArrow() {
  return <ArrowRight className="w-3.5 h-3.5 text-app-muted" />;
}

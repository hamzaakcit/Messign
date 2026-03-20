import { cn } from '@/lib/utils';

const STATUS_MAP: Record<
  string,
  { dot: string; label: string }
> = {
  draft: { dot: 'bg-slate-400', label: 'Draft' },
  idea: { dot: 'bg-slate-400', label: 'Draft' },
  in_review: { dot: 'bg-amber-400', label: 'Pending review' },
  pending_review: { dot: 'bg-amber-400', label: 'Pending review' },
  approved: { dot: 'bg-emerald-400', label: 'Approved' },
  published: { dot: 'bg-sky-400', label: 'Published' },
  rejected: { dot: 'bg-red-400', label: 'Rejected' },
  scheduled: { dot: 'bg-violet-400', label: 'Scheduled' },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? '').toLowerCase().trim();
  const m = STATUS_MAP[s] ?? { dot: 'bg-slate-500', label: status ?? '—' };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-300">
      <span className={cn('h-2 w-2 rounded-full', m.dot)} aria-hidden />
      {m.label}
    </span>
  );
}

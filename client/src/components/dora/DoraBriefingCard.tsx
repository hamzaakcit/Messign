import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { API_ORIGIN } from '@/lib/api';
import { getAccessToken } from '@/lib/authToken';

export interface DoraBriefingSnapshot {
  tasksDueToday: number;
  unpaidInvoices: number;
  unpaidInvoiceTotal: number;
  projectsAttention: number;
  hoursYesterday: number;
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function greetingName(first?: string): string {
  const h = new Date().getHours();
  const part =
    h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return first ? `${part}, ${first}` : part;
}

interface DoraBriefingCardProps {
  userFirstName?: string;
  onStartDay: () => void;
  onOpenTasks: () => void;
  onOpenFinance: () => void;
  onOpenProjects: () => void;
}

export function DoraBriefingCard({
  userFirstName,
  onStartDay,
  onOpenTasks,
  onOpenFinance,
  onOpenProjects,
}: DoraBriefingCardProps) {
  const [data, setData] = useState<DoraBriefingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_ORIGIN}/api/knowledge-hub/ai/briefing`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Briefing unavailable');
      const raw = (await res.json()) as Partial<DoraBriefingSnapshot>;
      setData({
        tasksDueToday: Number(raw.tasksDueToday ?? 0),
        unpaidInvoices: Number(raw.unpaidInvoices ?? 0),
        unpaidInvoiceTotal: Number(raw.unpaidInvoiceTotal ?? 0),
        projectsAttention: Number(raw.projectsAttention ?? 0),
        hoursYesterday: Number(raw.hoursYesterday ?? 0),
      });
    } catch {
      setErr('Could not load briefing');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      className="w-full rounded-[14px] border border-sky-500/12 bg-app-bg/40 p-4 text-left shadow-[0_0_24px_rgba(56,189,248,0.06)] backdrop-blur-md"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-app-text">
            {greetingName(userFirstName)} <span className="opacity-90">👋</span>
          </p>
          <p className="mt-0.5 text-[11px] text-app-muted">Live snapshot from your workspace</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-400/70" />}
      </div>

      {err && <p className="text-xs text-amber-500/90">{err}</p>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onOpenTasks}
              className="rounded-lg border border-app-border/80 bg-app-sidebar/50 px-3 py-2 text-left transition-colors hover:border-sky-500/25 hover:bg-app-hover"
            >
              <p className="text-[11px] uppercase tracking-wide text-app-muted">Tasks</p>
              <p className="text-sm text-gray-200">
                📊{' '}
                <span className="font-semibold text-app-text">{data.tasksDueToday}</span> due today
              </p>
            </button>
            <button
              type="button"
              onClick={onOpenFinance}
              className="rounded-lg border border-app-border/80 bg-app-sidebar/50 px-3 py-2 text-left transition-colors hover:border-emerald-500/25 hover:bg-app-hover"
            >
              <p className="text-[11px] uppercase tracking-wide text-app-muted">Finance</p>
              <p className="text-sm text-gray-200">
                💰{' '}
                <span className="font-semibold text-app-text">{data.unpaidInvoices}</span> unpaid
                invoices ({formatMoney(data.unpaidInvoiceTotal)})
              </p>
            </button>
            <button
              type="button"
              onClick={onOpenProjects}
              className="rounded-lg border border-app-border/80 bg-app-sidebar/50 px-3 py-2 text-left transition-colors hover:border-violet-500/25 hover:bg-app-hover"
            >
              <p className="text-[11px] uppercase tracking-wide text-app-muted">Projects</p>
              <p className="text-sm text-gray-200">
                📁{' '}
                <span className="font-semibold text-app-text">{data.projectsAttention}</span> projects
                need attention
              </p>
            </button>
            <div className="rounded-lg border border-app-border/80 bg-app-sidebar/40 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-app-muted">Time</p>
              <p className="text-sm text-gray-200">
                🕐 You tracked{' '}
                <span className="font-semibold text-app-text">{data.hoursYesterday.toFixed(1)}h</span>{' '}
                yesterday
              </p>
            </div>
          </div>

          {expanded && (
            <ul className="mt-3 space-y-1 border-t border-app-border pt-3 text-[11px] text-app-muted">
              <li>Tasks due today counts assignments with a due date of today (open states).</li>
              <li>Finance uses outstanding invoice totals for sent / partially paid invoices.</li>
              <li>Projects &ldquo;need attention&rdquo; = distinct projects with overdue open tasks assigned to you.</li>
              <li>Time is summed from yesterday&apos;s submitted entries.</li>
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onStartDay}
              className="rounded-full bg-sky-500/90 px-4 py-1.5 text-xs font-medium text-app-text transition-colors hover:bg-sky-400"
            >
              Start my day
            </button>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-app-border px-3 py-1.5 text-xs text-app-muted transition-colors hover:border-sky-500/30 hover:text-app-text"
            >
              {expanded ? (
                <>
                  Hide details <ChevronUp size={14} />
                </>
              ) : (
                <>
                  Show details <ChevronDown size={14} />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

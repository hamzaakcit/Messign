import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { marketingAPI, type BrandComplianceScanResult, type ComplianceFlag } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';

const FLAG_TYPE_LABELS: Record<string, string> = {
  forbidden_word: 'Forbidden word',
  missing_disclaimer: 'Missing disclaimer',
  tone_deviation: 'Tone issue',
  style_violation: 'Style',
  length_issue: 'Length',
};

function timeSinceScan(scannedAt: string): string {
  const diff = Date.now() - new Date(scannedAt).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function ScoreIcon({ score }: { score: number }) {
  if (score >= 80) return <ShieldCheck className="w-5 h-5 text-emerald-400" />;
  if (score >= 60) return <ShieldAlert className="w-5 h-5 text-amber-400" />;
  return <ShieldX className="w-5 h-5 text-red-400" />;
}

interface ComplianceDetailPanelProps {
  contentId: string;
  brandProfileName?: string;
  onRescan?: () => void;
}

export function ComplianceDetailPanel({ contentId, brandProfileName, onRescan }: ComplianceDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [scan, setScan] = useState<BrandComplianceScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<BrandComplianceScanResult[]>([]);

  const fetchScan = useCallback(async () => {
    if (!userId || !contentId) return;
    setLoading(true);
    try {
      const result = await marketingAPI.getLatestComplianceScan(userId, contentId);
      setScan(result);
    } catch {
      /* non-critical */
    } finally {
      setLoading(false);
    }
  }, [userId, contentId]);

  useEffect(() => {
    fetchScan();
  }, [fetchScan]);

  const handleRescan = async () => {
    if (!userId || !contentId) return;
    setRescanning(true);
    try {
      const result = await marketingAPI.triggerComplianceScan(userId, contentId);
      setScan(result);
      toast.success(`Rescanned: score ${result.score}`);
      onRescan?.();
    } catch (e) {
      toast.error('Rescan failed', { description: e instanceof Error ? e.message : 'Unknown' });
    } finally {
      setRescanning(false);
    }
  };

  const handleToggleHistory = async () => {
    if (!historyOpen && history.length === 0) {
      try {
        const res = await marketingAPI.getComplianceScanHistory(userId, contentId);
        setHistory(res.scans.slice(0, 5));
      } catch {
        /* ignore */
      }
    }
    setHistoryOpen((o) => !o);
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-app-border bg-app-surface-tertiary p-3">
        <p className="text-xs text-app-muted animate-pulse">Loading compliance data…</p>
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="rounded-lg border border-app-border bg-app-surface-tertiary p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-app-muted">No brand compliance scan yet</span>
          <button
            type="button"
            onClick={() => void handleRescan()}
            disabled={rescanning}
            className="inline-flex items-center gap-1 rounded-md bg-app-surface-tertiary px-2 py-1 text-[10px] font-medium text-app-text hover:bg-app-hover disabled:opacity-40"
          >
            <RefreshCw className={cn('w-3 h-3', rescanning && 'animate-spin')} />
            Scan now
          </button>
        </div>
      </div>
    );
  }

  const errors = scan.flags.filter((f: ComplianceFlag) => f.severity === 'error');
  const warnings = scan.flags.filter((f: ComplianceFlag) => f.severity === 'warning');

  return (
    <div className="rounded-lg border border-app-border bg-app-surface-tertiary">
      {/* Summary bar */}
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <ScoreIcon score={scan.score} />
          <div>
            <span className={cn('text-sm font-semibold', scoreColor(scan.score))}>{scan.score}</span>
            <span className="text-[10px] text-app-muted ml-1.5">
              {scan.passed ? 'Compliant' : scan.score >= 60 ? 'Review needed' : 'Non-compliant'}
            </span>
          </div>
          {brandProfileName && (
            <span className="text-[10px] text-slate-600">· {brandProfileName}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {scan.scanned_at && (
            <span className="text-[10px] text-slate-600">{timeSinceScan(scan.scanned_at)}</span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleRescan(); }}
            disabled={rescanning}
            className="inline-flex items-center gap-1 rounded-md bg-app-surface-tertiary px-1.5 py-0.5 text-[10px] font-medium text-app-muted hover:bg-app-hover disabled:opacity-40"
          >
            <RefreshCw className={cn('w-3 h-3', rescanning && 'animate-spin')} />
            Rescan
          </button>
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-app-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-app-muted" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-app-border px-3 py-3 space-y-3">
          {/* Score breakdown */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-app-surface-tertiary p-2">
              <p className={cn('text-lg font-bold', scoreColor(scan.score))}>{scan.score}</p>
              <p className="text-[9px] text-app-muted uppercase tracking-wider">Overall</p>
            </div>
            <div className="rounded-lg bg-app-surface-tertiary p-2">
              <p className="text-lg font-bold text-app-text">{scan.ruleScore}</p>
              <p className="text-[9px] text-app-muted uppercase tracking-wider">Rules (40%)</p>
            </div>
            <div className="rounded-lg bg-app-surface-tertiary p-2">
              <p className="text-lg font-bold text-app-text">{scan.llmScore !== null ? scan.llmScore : 'N/A'}</p>
              <p className="text-[9px] text-app-muted uppercase tracking-wider">Tone (60%)</p>
            </div>
          </div>

          <p className="text-[10px] text-slate-600">
            Completed in {scan.scanDurationMs < 1000 ? `${scan.scanDurationMs}ms` : `${(scan.scanDurationMs / 1000).toFixed(1)}s`}
          </p>

          {/* Flags */}
          {scan.flags.length === 0 ? (
            <p className="text-xs text-emerald-400/80">No issues found</p>
          ) : (
            <div className="space-y-2">
              {errors.length > 0 && (
                <FlagGroup label="Errors" flags={errors} borderColor="border-l-red-500/60" />
              )}
              {warnings.length > 0 && (
                <FlagGroup label="Warnings" flags={warnings} borderColor="border-l-amber-500/60" />
              )}
            </div>
          )}

          {/* History toggle */}
          <button
            type="button"
            onClick={() => void handleToggleHistory()}
            className="text-[10px] text-app-muted hover:text-app-text"
          >
            {historyOpen ? 'Hide previous scans' : 'Previous scans'}
          </button>
          {historyOpen && history.length > 0 && (
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={i} className="flex items-center justify-between rounded bg-app-surface-tertiary px-2 py-1 text-[10px]">
                  <span className="text-app-muted">{h.scanned_at ? timeSinceScan(h.scanned_at) : '—'}</span>
                  <span className={cn('font-medium', scoreColor(h.score))}>{h.score}</span>
                  <span className={h.passed ? 'text-emerald-400' : 'text-red-400'}>{h.passed ? 'Pass' : 'Fail'}</span>
                  <span className="text-slate-600">{h.flags.length} flag{h.flags.length !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FlagGroup({ label, flags, borderColor }: { label: string; flags: ComplianceFlag[]; borderColor: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted mb-1">{label}</p>
      <div className="space-y-1">
        {flags.map((flag, i) => (
          <div key={i} className={cn('rounded-md border-l-2 bg-app-surface-tertiary px-2.5 py-1.5', borderColor)}>
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                flag.severity === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400',
              )}>
                {FLAG_TYPE_LABELS[flag.type] || flag.type}
              </span>
              {flag.location && (
                <span className="text-[9px] text-slate-600">in {flag.location}</span>
              )}
            </div>
            <p className="text-[11px] text-app-text mt-0.5">{flag.message}</p>
            {flag.detail && (
              <p className="text-[10px] text-app-muted mt-0.5">{flag.detail}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

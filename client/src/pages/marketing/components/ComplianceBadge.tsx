import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { marketingAPI, type BrandComplianceScanResult } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';

type BadgeStatus = 'not_scanned' | 'passed' | 'warning' | 'failed';

function getStatus(score: number | null): BadgeStatus {
  if (score === null) return 'not_scanned';
  if (score >= 80) return 'passed';
  if (score >= 60) return 'warning';
  return 'failed';
}

function getLabel(status: BadgeStatus): string {
  if (status === 'not_scanned') return 'Not scanned';
  if (status === 'passed') return 'Compliant';
  if (status === 'warning') return 'Review needed';
  return 'Non-compliant';
}

function getFlagSummary(flags: Array<{ severity: string }>): string {
  const errors = flags.filter((f) => f.severity === 'error').length;
  const warnings = flags.filter((f) => f.severity === 'warning').length;
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors > 1 ? 's' : ''}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);
  return parts.join(', ') || 'No issues';
}

const STATUS_STYLES: Record<BadgeStatus, { dot: string; bg: string; text: string }> = {
  not_scanned: { dot: 'bg-slate-400', bg: 'bg-slate-500/10', text: 'text-app-muted' },
  passed: { dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  warning: { dot: 'bg-amber-400', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  failed: { dot: 'bg-red-400', bg: 'bg-red-500/10', text: 'text-red-400' },
};

interface ComplianceBadgeProps {
  contentId: string;
  size?: 'sm' | 'md';
  showScore?: boolean;
  className?: string;
  scanResult?: BrandComplianceScanResult | null;
}

export function ComplianceBadge({
  contentId,
  size = 'sm',
  showScore = false,
  className,
  scanResult: externalResult,
}: ComplianceBadgeProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [scan, setScan] = useState<BrandComplianceScanResult | null>(externalResult ?? null);
  const [loaded, setLoaded] = useState(externalResult !== undefined);

  useEffect(() => {
    if (externalResult !== undefined) {
      setScan(externalResult);
      setLoaded(true);
      return;
    }
    if (!userId || !contentId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await marketingAPI.getLatestComplianceScan(userId, contentId);
        if (!cancelled) {
          setScan(result);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [contentId, userId, externalResult]);

  if (!loaded) return null;

  const status = getStatus(scan?.score ?? null);
  const label = getLabel(status);
  const styles = STATUS_STYLES[status];
  const tooltip = scan ? getFlagSummary(scan.flags) : 'No scan data';

  if (size === 'sm') {
    return (
      <span className={cn('inline-flex items-center gap-1', className)} title={tooltip}>
        <span className={cn('h-2 w-2 rounded-full', styles.dot)} />
        <span className={cn('text-[10px] font-medium', styles.text)}>
          {label}
          {showScore && scan ? ` ${scan.score}` : ''}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
        styles.bg,
        className,
      )}
      title={tooltip}
    >
      <span className={cn('h-2 w-2 rounded-full', styles.dot)} />
      <span className={cn('text-xs font-medium', styles.text)}>
        {label}
        {showScore && scan ? ` ${scan.score}` : ''}
      </span>
    </span>
  );
}

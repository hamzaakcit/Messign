import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

function verdictIcon(ok: boolean, warn?: boolean) {
  if (warn) return <span className="text-amber-400">●</span>;
  return <span className={ok ? 'text-emerald-400' : 'text-red-400'}>●</span>;
}

function truthFromUnknown(raw: unknown): { pass: boolean; score: number | null; hints: string[] } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const v = o.verdict !== 'FAIL';
  const failed = Array.isArray(o.failed_reasons) ? o.failed_reasons.map(String) : [];
  return { pass: v, score: v ? 92 : null, hints: failed };
}

function brandFromUnknown(raw: unknown): { pass: boolean; score: number; hints: string[] } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const sc = typeof o.score === 'number' ? o.score : 0;
  const imp = Array.isArray(o.improvements) ? o.improvements.map(String).slice(0, 3) : [];
  return { pass: sc >= 70, score: sc, hints: imp };
}

function complianceFromUnknown(raw: unknown): { warn: boolean; issueCount: number; hints: string[] } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const verdict = o.verdict === 'WARNING';
  const warnings = Array.isArray(o.warnings) ? o.warnings : [];
  const hints = warnings
    .map((w) => {
      const x = w && typeof w === 'object' ? (w as Record<string, unknown>) : {};
      return String(x.issue ?? x.suggestion ?? '');
    })
    .filter(Boolean)
    .slice(0, 4);
  return { warn: verdict || hints.length > 0, issueCount: hints.length || (verdict ? 1 : 0), hints };
}

export function ValidationScores({
  truthRaw,
  brandRaw,
  complianceRaw,
}: {
  truthRaw?: unknown;
  brandRaw?: unknown;
  complianceRaw?: unknown;
}) {
  const [open, setOpen] = useState(false);

  const hasAny = truthRaw != null || brandRaw != null || complianceRaw != null;
  if (!hasAny) {
    return <p className="text-[11px] text-app-muted">Not validated — this row may have been created outside the agent pipeline.</p>;
  }

  const t = truthRaw != null ? truthFromUnknown(truthRaw) : null;
  const b = brandRaw != null ? brandFromUnknown(brandRaw) : null;
  const c = complianceRaw != null ? complianceFromUnknown(complianceRaw) : null;

  const detailHints = [...(t?.hints ?? []), ...(b?.hints ?? []), ...(c?.hints ?? [])].filter(Boolean);

  return (
    <div className="space-y-2">
      <div className="grid gap-2 text-[11px]">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-app-border bg-app-card px-2.5 py-2">
          <span className="text-app-muted">Product truth</span>
          <span className="flex items-center gap-2 tabular-nums text-app-text">
            {t ? (
              <>
                {verdictIcon(t.pass)}
                {t.pass ? <span>{t.score ?? '—'}/100</span> : <span className="text-red-300/90">Fail</span>}
              </>
            ) : (
              <span className="text-app-muted">—</span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-app-border bg-app-card px-2.5 py-2">
          <span className="text-app-muted">Brand voice</span>
          <span className="flex items-center gap-2 tabular-nums text-app-text">
            {b ? (
              <>
                {verdictIcon(b.pass)}
                <span>{b.score}/100</span>
              </>
            ) : (
              <span className="text-app-muted">—</span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-app-border bg-app-card px-2.5 py-2">
          <span className="text-app-muted">Compliance</span>
          <span className="flex items-center gap-2 text-app-text">
            {c ? (
              <>
                {verdictIcon(!c.warn, c.warn)}
                <span>{c.warn ? `${c.issueCount} issue(s)` : 'Clear'}</span>
              </>
            ) : (
              <span className="text-app-muted">Not stored</span>
            )}
          </span>
        </div>
      </div>
      {detailHints.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1 text-left text-[10px] font-medium text-app-muted hover:text-app-text"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Show details
        </button>
      )}
      {open && detailHints.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-app-border bg-app-surface-tertiary px-2.5 py-2 text-[10px] text-app-muted">
          {detailHints.map((h, i) => (
            <li key={i} className="leading-snug">
              — {h}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

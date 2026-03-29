import type { AssemblyResult } from '../../lib/types/unlayerTypes';
import { ESTIMATED_HTML_EXPORT_WARN_KB } from '../../lib/estimateUnlayerDesignHtmlWeight';

type StepState = 'idle' | 'active' | 'done' | 'warn';

function stepClass(state: StepState): string {
  switch (state) {
    case 'active':
      return 'bg-primary-500/25 text-primary-200 border-primary-500/40 animate-pulse';
    case 'done':
      return 'bg-emerald-500/15 text-emerald-200/90 border-emerald-500/30';
    case 'warn':
      return 'bg-amber-500/15 text-amber-200/90 border-amber-500/30';
    default:
      return 'bg-app-surface-tertiary/80 text-app-muted border-app-border';
  }
}

/**
 * Compact stepper: manifest → images → assemble → accessibility score.
 */
export function EmailPipelineStatusStrip({
  hasManifest,
  isResolvingImage,
  isAssembling,
  assemblyResult,
  lastResolvePartial,
  estimatedHtmlKb,
  exportHttpUrlCount,
  htmlExportHeavy,
}: {
  hasManifest: boolean;
  isResolvingImage: boolean;
  isAssembling: boolean;
  assemblyResult: AssemblyResult | null;
  /** When the last image resolve used fallbacks or had slot errors. */
  lastResolvePartial?: boolean;
  /** Heuristic KB from serialized design JSON (export size awareness). */
  estimatedHtmlKb?: number;
  /** Unique https? URLs in serialized design (often images/assets). */
  exportHttpUrlCount?: number;
  /** True when estimate exceeds the recommended ceiling (large sends / clipping risk). */
  htmlExportHeavy?: boolean;
}) {
  const m: StepState = hasManifest ? 'done' : 'idle';
  const img: StepState = isResolvingImage
    ? 'active'
    : lastResolvePartial
      ? 'warn'
      : hasManifest
        ? 'done'
        : 'idle';
  const asm: StepState = isAssembling
    ? 'active'
    : assemblyResult?.success
      ? 'done'
      : hasManifest && assemblyResult && !assemblyResult.success
        ? 'warn'
        : 'idle';
  const a11yScore = assemblyResult?.metadata?.accessibilityScore;
  const a11yWarn =
    (assemblyResult?.metadata?.accessibilityWarnings?.length ?? 0) > 0 ||
    (assemblyResult?.warnings?.length ?? 0) > 0;
  const a11y: StepState =
    isAssembling || isResolvingImage
      ? 'idle'
      : a11yScore != null
        ? a11yWarn
          ? 'warn'
          : 'done'
        : assemblyResult
          ? 'warn'
          : 'idle';

  const steps: { label: string; state: StepState; detail?: string }[] = [
    { label: 'Manifest', state: m },
    {
      label: 'Images',
      state: img,
      detail: isResolvingImage ? 'resolving' : lastResolvePartial ? 'partial' : undefined,
    },
    { label: 'Assemble', state: asm },
    {
      label: 'A11y',
      state: a11y,
      detail: a11yScore != null ? String(a11yScore) : undefined,
    },
  ];

  return (
    <div
      className="rounded-lg border border-app-border bg-app-surface-tertiary/60 px-2 py-1.5"
      role="status"
      aria-live="polite"
    >
      <div className="text-[10px] uppercase tracking-wide text-app-muted mb-1">Email pipeline</div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        {steps.map((s, i) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            {i > 0 ? <span className="text-app-muted/50">→</span> : null}
            <span
              className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 tabular-nums ${stepClass(s.state)}`}
            >
              {s.label}
              {s.detail ? <span className="opacity-80">({s.detail})</span> : null}
            </span>
          </span>
        ))}
      </div>
      {estimatedHtmlKb != null ? (
        <div className="mt-1.5 space-y-0.5">
          <div
            className={`text-[10px] tabular-nums ${htmlExportHeavy ? 'text-amber-200/90' : 'text-app-muted'}`}
          >
            Est. export HTML ~{estimatedHtmlKb} KB
            {exportHttpUrlCount != null ? ` · ${exportHttpUrlCount} URL${exportHttpUrlCount === 1 ? '' : 's'}` : ''}
            <span className="text-app-muted/80">
              {' '}
              (
              {estimatedHtmlKb < Math.round(ESTIMATED_HTML_EXPORT_WARN_KB * 0.45)
                ? 'light tier'
                : estimatedHtmlKb < ESTIMATED_HTML_EXPORT_WARN_KB
                  ? 'moderate tier'
                  : 'heavy tier'}
              )
            </span>
            {htmlExportHeavy
              ? ' — large payload; reduce image slots, shorten copy, or split the campaign. See docs/va12-phase-12.md and docs/va2-pro-quality-baseline.md §20.'
              : ''}
          </div>
          {!htmlExportHeavy ? (
            <p className="text-[9px] text-app-muted/70 leading-snug">
              HTML weight scales with resolved images and table markup — Unlayer parity checklist: docs/email-design-pipeline.md (Unlayer export QA).
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

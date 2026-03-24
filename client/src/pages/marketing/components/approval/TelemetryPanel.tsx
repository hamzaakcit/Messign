import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { ApprovalQueueItem, BrandDimensionKey } from '../../approvalQueue/types';
import { BRAND_DIMENSION_LABELS } from '../../approvalQueue/types';

interface TelemetryPanelProps {
  item: ApprovalQueueItem;
}

const DIM_ORDER: BrandDimensionKey[] = [
  'tone_voice',
  'clarity_structure',
  'audience_positioning',
  'claims_proof_safety',
  'taboo_policy',
];

function Bar({ value, max = 20 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-2 rounded-full bg-app-surface-tertiary overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', pct >= 75 ? 'bg-emerald-500/80' : pct >= 50 ? 'bg-amber-500/80' : 'bg-red-500/70')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function TelemetryPanel({ item }: TelemetryPanelProps) {
  const truth = item.productTruth;
  const brand = item.brandVoice;
  const comp = item.compliance;

  const warningsHigh = comp.warnings.filter((w) => w.severity === 'HIGH');
  const warningsMed = comp.warnings.filter((w) => w.severity === 'MEDIUM');
  const warningsLow = comp.warnings.filter((w) => w.severity === 'LOW');

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-app-muted mb-2">Product truth</h3>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={truth.verdict === 'PASS' ? 'green' : 'red'} size="md">
            {truth.verdict}
          </Badge>
          <span className="text-xs text-app-muted">Validator (features, claims, metrics)</span>
        </div>
        {truth.features_referenced.length > 0 && (
          <div className="mb-2">
            <p className="text-[11px] text-app-muted mb-1">Features referenced</p>
            <div className="flex flex-wrap gap-1">
              {truth.features_referenced.map((f) => (
                <Badge key={f} variant="default" size="sm">
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {truth.metrics_found.length > 0 && (
          <p className="text-xs text-app-muted">
            <span className="text-app-text/80">Metrics found: </span>
            {truth.metrics_found.join(', ')}
          </p>
        )}
        {truth.failed_reasons.length > 0 && (
          <ul className="mt-2 text-xs text-red-300/90 list-disc list-inside space-y-0.5">
            {truth.failed_reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-app-muted mb-2">Brand voice</h3>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-2xl font-semibold text-app-text" data-testid="telemetry-brand-score">
            {brand.score}
          </span>
          <span className="text-sm text-app-muted">/ 100</span>
          {brand.passes !== undefined && (
            <Badge variant={brand.passes ? 'green' : 'orange'} size="sm">
              {brand.passes ? 'Pass bar' : 'Below 75'}
            </Badge>
          )}
        </div>
        <div className="space-y-2">
          {DIM_ORDER.map((key) => {
            const v = brand.dimensions[key];
            if (v === undefined) return null;
            return (
              <div key={key}>
                <div className="flex justify-between text-[11px] text-app-muted mb-0.5">
                  <span>{BRAND_DIMENSION_LABELS[key]}</span>
                  <span>
                    {v}/20
                  </span>
                </div>
                <Bar value={v} />
              </div>
            );
          })}
        </div>
        {brand.improvements.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] text-app-muted mb-1">Improvements</p>
            <ul className="text-xs text-app-text/90 list-disc list-inside space-y-1">
              {brand.improvements.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-app-muted mb-2">Compliance</h3>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={comp.verdict === 'PASS' ? 'green' : 'orange'} size="md">
            {comp.verdict}
          </Badge>
          <span className="text-xs text-app-muted">
            H {comp.warning_count.high} · M {comp.warning_count.medium} · L {comp.warning_count.low}
          </span>
        </div>
        {comp.channel_specific_issues.length > 0 && (
          <p className="text-xs text-amber-200/90 mb-2">{comp.channel_specific_issues.join(' · ')}</p>
        )}
        <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
          {warningsHigh.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-red-400 uppercase mb-1">High</p>
              <ul className="space-y-2">
                {warningsHigh.map((w, i) => (
                  <li
                    key={`h-${i}`}
                    className="text-xs rounded-lg bg-red-500/10 border border-red-500/20 p-2"
                    data-testid={i === 0 ? 'telemetry-compliance-high-issue' : undefined}
                  >
                    <p className="font-medium text-red-200">{w.check}</p>
                    <p className="text-app-muted mt-0.5">{w.location}</p>
                    <p className="mt-1">{w.issue}</p>
                    <p className="text-app-muted mt-1 italic">→ {w.suggestion}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {warningsMed.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-amber-400 uppercase mb-1">Medium</p>
              <ul className="space-y-2">
                {warningsMed.map((w, i) => (
                  <li key={`m-${i}`} className="text-xs rounded-lg bg-amber-500/10 border border-amber-500/20 p-2">
                    <p className="font-medium text-amber-200">{w.check}</p>
                    <p className="text-app-muted">{w.location}</p>
                    <p className="mt-1">{w.issue}</p>
                    <p className="text-app-muted mt-1 italic">→ {w.suggestion}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {warningsLow.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-blue-400 uppercase mb-1">Low</p>
              <ul className="space-y-2">
                {warningsLow.map((w, i) => (
                  <li key={`l-${i}`} className="text-xs rounded-lg bg-blue-500/10 border border-blue-500/20 p-2">
                    <p className="font-medium text-blue-200">{w.check}</p>
                    <p className="text-app-muted">{w.location}</p>
                    <p className="mt-1">{w.issue}</p>
                    <p className="text-app-muted mt-1 italic">→ {w.suggestion}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {comp.warnings.length === 0 && <p className="text-xs text-app-muted">No warnings.</p>}
        </div>
      </section>
    </div>
  );
}

import { Filter } from 'lucide-react';
import type { CommandCenterPayload } from '@/lib/marketingApi';
import { MetricTile } from '../tiles/MetricTile';

export interface FunnelColumnProps {
  funnel7d: CommandCenterPayload['funnel7d'];
  funnelSeries7d: CommandCenterPayload['funnelSeries7d'];
  cacRoi: CommandCenterPayload['cacRoi'];
  alertSignupDrop?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

/**
 * Column 2: Acquisition funnel — velocity, CAC, conversion proxy.
 */
export function FunnelColumn({ funnel7d, funnelSeries7d, cacRoi, alertSignupDrop }: FunnelColumnProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2 min-w-0 w-full">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">The Funnel</h2>
        <Filter className="h-3.5 w-3.5 text-emerald-400/80" aria-hidden />
      </div>
      <MetricTile
        label="New leads (7d)"
        value={funnel7d.new}
        series7d={funnelSeries7d}
        color="#10b981"
        alert={alertSignupDrop}
      />
      <MetricTile label="Qualified + won" value={funnel7d.qualified + funnel7d.converted} series7d={funnelSeries7d} color="#22c55e" />
      <MetricTile label="CAC" value={formatCurrency(cacRoi.cac)} series7d={funnelSeries7d} color="#f59e0b" />
      <div className="rounded-lg border border-white/[0.08] bg-app-surface-tertiary/50 px-2 py-1.5 space-y-0.5">
        <p className="text-[9px] text-app-muted uppercase tracking-wide">LTV</p>
        <p className="text-xs font-medium text-app-text">—</p>
        <p className="text-[9px] text-slate-500">Connect CRM for LTV</p>
      </div>
      <div className="text-[10px] text-app-muted leading-snug">
        Signup velocity: <span className="text-app-text font-medium">{cacRoi.signupVelocity}/d</span>
        {cacRoi.landingConversionProxy != null && (
          <>
            {' '}
            · Conv. proxy:{' '}
            <span className="text-app-text font-medium">{(cacRoi.landingConversionProxy * 100).toFixed(1)}%</span>
          </>
        )}
      </div>
    </div>
  );
}

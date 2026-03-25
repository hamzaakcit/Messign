import { Radio } from 'lucide-react';
import type { CommandCenterPayload } from '@/lib/marketingApi';
import { MetricTile } from '../tiles/MetricTile';

export interface BrandSocialColumnProps {
  data: CommandCenterPayload['socialPulse'];
  onReconnect?: () => void;
}

/**
 * Column 1: Brand & social pulse — derived content activity + vibe score.
 */
export function BrandSocialColumn({ data, onReconnect }: BrandSocialColumnProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2 min-w-[260px]">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Brand & Social</h2>
        <Radio className="h-3.5 w-3.5 text-cyan-400/80" aria-hidden />
      </div>
      <MetricTile
        label="Vibe score"
        value={data.vibeScore}
        series7d={data.accounts[0]?.series7d ?? []}
        color="#8b5cf6"
      />
      {data.accounts.map((acc) => (
        <MetricTile
          key={acc.platform}
          label={acc.label}
          value={acc.contentPieces}
          series7d={acc.series7d}
          color={acc.platform === 'linkedin' ? '#0a66c2' : acc.platform === 'twitter' ? '#1d9bf0' : '#e11d48'}
          live={acc.contentPieces > 0}
        />
      ))}
      {!data.connected && (
        <div className="rounded-lg border border-white/[0.08] bg-app-surface-tertiary/50 px-2 py-1.5">
          <p className="text-[10px] text-app-muted leading-snug">
            X / LinkedIn analytics are not connected. Showing workspace content activity as a proxy.
            {data.errorCode ? ` (${data.errorCode})` : ''}
          </p>
          {onReconnect && (
            <button
              type="button"
              onClick={onReconnect}
              className="mt-1 text-[10px] font-medium text-cyan-400 hover:text-cyan-300"
            >
              Refresh data
            </button>
          )}
        </div>
      )}
    </div>
  );
}

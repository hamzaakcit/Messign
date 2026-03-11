import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Deal, DealStage } from '@/lib/crmApi';

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function healthColor(deal: Deal): string {
  const lastActivity = deal.recent_activities?.[0]?.completed_at ?? deal.updated_at ?? deal.created_at;
  const days = daysSince(lastActivity);
  if (days < 3) return '#10B981'; // green
  if (days <= 10) return '#F59E0B'; // amber
  return '#EF4444'; // red
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export interface PipelineRadialChartProps {
  stages: DealStage[];
  dealsByStage: Map<string, Deal[]>;
  totalValue: number;
}

export function PipelineRadialChart({ stages, dealsByStage, totalValue }: PipelineRadialChartProps) {
  const { rings, minAmount, maxAmount } = useMemo(() => {
    const wonStages = stages.filter(s => s.is_won);
    const lostStages = stages.filter(s => s.is_lost);
    const activeStages = stages.filter(s => !s.is_won && !s.is_lost);

    // Order: Closed Won innermost, then active stages by position, Lead outermost
    const orderedStages: DealStage[] = [
      ...wonStages.sort((a, b) => a.position - b.position),
      ...activeStages.sort((a, b) => b.position - a.position),
      ...lostStages.sort((a, b) => a.position - b.position),
    ].filter(Boolean);

    let minAmt = Infinity;
    let maxAmt = 0;
    const ringData: { stage: DealStage; deals: Deal[]; ringIndex: number }[] = [];

    orderedStages.forEach((stage, i) => {
      const deals = dealsByStage.get(stage.id) ?? [];
      for (const d of deals) {
        if (d.amount > 0) {
          minAmt = Math.min(minAmt, d.amount);
          maxAmt = Math.max(maxAmt, d.amount);
        }
      }
      ringData.push({ stage, deals, ringIndex: i });
    });

    return {
      rings: ringData,
      minAmount: minAmt === Infinity ? 0 : minAmt,
      maxAmount: maxAmt,
    };
  }, [stages, dealsByStage]);

  const cx = 200;
  const cy = 200;
  const baseRadius = 40;
  const ringGap = 35;
  const dotMin = 6;
  const dotMax = 24;

  const scaleAmount = (amount: number): number => {
    if (maxAmount <= 0) return dotMin;
    const t = (amount - minAmount) / (maxAmount - minAmount || 1);
    return dotMin + t * (dotMax - dotMin);
  };

  return (
    <div className="flex justify-center py-8">
      <svg viewBox="0 0 400 400" className="w-full max-w-[500px] h-auto" role="img" aria-label="Pipeline radial chart showing deal stages and values">
        {/* Center: total pipeline value */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={baseRadius - 4}
          fill="var(--app-card)"
          stroke="var(--app-border)"
          strokeWidth={1}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        />
        <motion.text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="fill-app-text text-sm font-semibold"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {formatCurrency(totalValue)}
        </motion.text>
        <motion.text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          className="fill-app-muted text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          Pipeline
        </motion.text>

        {/* Concentric rings with deal dots */}
        {rings.map(({ stage, deals, ringIndex }, ringIdx) => {
          const r = baseRadius + ringIndex * ringGap;
          const count = deals.length;
          const angleStep = count > 0 ? (2 * Math.PI) / count : 0;

          return (
            <g key={stage.id}>
              {/* Ring circle */}
              <motion.circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="var(--app-border)"
                strokeWidth={1}
                strokeDasharray="4 4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                transition={{ delay: 0.1 * ringIdx, duration: 0.4 }}
              />
              {/* Stage label */}
              <motion.text
                x={cx + r + 8}
                y={cy}
                className="fill-app-muted text-xs"
                initial={{ opacity: 0, x: cx + r }}
                animate={{ opacity: 1, x: cx + r + 8 }}
                transition={{ delay: 0.15 * ringIdx }}
              >
                {stage.name}
              </motion.text>
              {/* Deal dots */}
              {deals.map((deal, i) => {
                const angle = -Math.PI / 2 + i * angleStep;
                const size = scaleAmount(deal.amount);
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                const color = healthColor(deal);

                return (
                  <motion.g key={deal.id}>
                    <title>{`${deal.title} — ${formatCurrency(deal.amount)}`}</title>
                    <motion.circle
                      cx={x}
                      cy={y}
                      r={size / 2}
                      fill={color}
                      stroke="var(--app-bg)"
                      strokeWidth={1}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        delay: 0.2 + ringIdx * 0.05 + i * 0.02,
                        type: 'spring',
                        stiffness: 200,
                        damping: 20,
                      }}
                    />
                  </motion.g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface BudgetHealthGaugeProps {
  name: string;
  spent: number;
  allocated: number;
  currency?: string;
  warningThreshold?: number;
  size?: 'sm' | 'md';
}

export function BudgetHealthGauge({
  name,
  spent,
  allocated,
  currency = 'USD',
  warningThreshold = 80,
  size = 'md',
}: BudgetHealthGaugeProps) {
  const pct = allocated > 0 ? Math.min((spent / allocated) * 100, 100) : 0;
  const radius = size === 'sm' ? 40 : 55;
  const strokeWidth = size === 'sm' ? 6 : 8;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;

  const color = pct >= 100 ? '#ef4444' : pct >= warningThreshold ? '#f59e0b' : '#10b981';
  const svgSize = (radius + strokeWidth) * 2;

  const formatCurrency = (amt: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact' }).format(amt);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={svgSize} height={svgSize} className="transform -rotate-90">
        <circle
          cx={radius + strokeWidth}
          cy={radius + strokeWidth}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={radius + strokeWidth}
          cy={radius + strokeWidth}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="text-center -mt-16 mb-4">
        <div className="text-lg font-bold text-app-text">{pct.toFixed(0)}%</div>
        <div className="text-xs text-app-muted">{formatCurrency(spent)} / {formatCurrency(allocated)}</div>
      </div>
      <div className="text-xs font-medium text-app-text text-center">{name}</div>
    </div>
  );
}

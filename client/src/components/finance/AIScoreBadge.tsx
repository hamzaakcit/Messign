import { cn } from '@/lib/utils';
import { Shield, AlertTriangle, CheckCircle } from 'lucide-react';

interface AIScoreBadgeProps {
  score: number;
  type?: 'confidence' | 'risk';
  showIcon?: boolean;
  className?: string;
}

export function AIScoreBadge({ score, type = 'confidence', showIcon = true, className }: AIScoreBadgeProps) {
  const pct = Math.round(score * 100);

  let color: string;
  let bgColor: string;
  let Icon: typeof Shield;

  if (type === 'confidence') {
    color = score >= 0.9 ? 'text-emerald-400' : score >= 0.7 ? 'text-amber-400' : 'text-red-400';
    bgColor = score >= 0.9 ? 'bg-emerald-500/15' : score >= 0.7 ? 'bg-amber-500/15' : 'bg-red-500/15';
    Icon = score >= 0.9 ? CheckCircle : score >= 0.7 ? Shield : AlertTriangle;
  } else {
    color = score <= 0.3 ? 'text-emerald-400' : score <= 0.7 ? 'text-amber-400' : 'text-red-400';
    bgColor = score <= 0.3 ? 'bg-emerald-500/15' : score <= 0.7 ? 'bg-amber-500/15' : 'bg-red-500/15';
    Icon = score <= 0.3 ? CheckCircle : score <= 0.7 ? AlertTriangle : AlertTriangle;
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', bgColor, color, className)}>
      {showIcon && <Icon className="h-3 w-3" />}
      {pct}%
    </span>
  );
}

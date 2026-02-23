import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({ title, value, icon: Icon, trend, className }: StatCardProps) {
  return (
    <Card className={cn('flex items-start gap-4', className)}>
      <div className="p-2 rounded-lg bg-primary-50 dark:bg-white/10">
        <Icon className="w-6 h-6 text-primary-500 dark:text-primary-400" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-app-muted">{title}</p>
        <p className="text-2xl font-bold text-app mt-0.5">{value}</p>
        {trend != null && (
          <p className="text-xs text-app-muted mt-1">
            {trend.value >= 0 ? '+' : ''}{trend.value} {trend.label}
          </p>
        )}
      </div>
    </Card>
  );
}

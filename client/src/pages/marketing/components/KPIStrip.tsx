import { BarChart3, Mail, Megaphone, Target, TrendingUp } from 'lucide-react';
import { KPICard } from '@/components/finance/KPICard';
import type { DashboardMetrics } from '@/lib/marketingApi';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

interface KPIStripProps {
  metrics: DashboardMetrics | null;
  loading: boolean;
}

export function KPIStrip({ metrics, loading }: KPIStripProps): JSX.Element {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[88px] rounded-xl border border-white/10 bg-white/5" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      <KPICard title="MQLs This Month" value={metrics?.mqls ?? 0} icon={Target} />
      <KPICard title="Avg CPL" value={formatCurrency(metrics?.cpl ?? 0)} icon={TrendingUp} />
      <KPICard title="Best Campaign ROI" value={`${(metrics?.roi ?? 0).toFixed(2)}x`} icon={BarChart3} />
      <KPICard title="Email Open Rate" value={`${(metrics?.emailOpenRate ?? 0).toFixed(1)}%`} icon={Mail} />
      <KPICard title="Content Published" value={metrics?.contentPublished ?? 0} icon={Megaphone} />
    </div>
  );
}

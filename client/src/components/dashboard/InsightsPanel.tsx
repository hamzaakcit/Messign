import { TrendingUp, AlertTriangle, Sparkles, FileText, Bell, Download } from 'lucide-react';
import type { DashboardInsight, QuickStat } from '@/types/dashboard';
import { cn } from '@/lib/utils';

interface InsightsPanelProps {
  insights: DashboardInsight[];
  quickStats: QuickStat[];
  onViewReport?: () => void;
  onSetAlerts?: () => void;
  onExport?: () => void;
}

const SEVERITY_STYLES = {
  success: {
    bg: 'rgba(34, 197, 94, 0.1)',
    border: '#22c55e',
    icon: TrendingUp,
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.1)',
    border: '#f59e0b',
    icon: AlertTriangle,
  },
  info: {
    bg: 'rgba(59, 130, 246, 0.1)',
    border: '#3b82f6',
    icon: Sparkles,
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.1)',
    border: '#ef4444',
    icon: AlertTriangle,
  },
} as const;

export function InsightsPanel({
  insights,
  quickStats,
  onViewReport,
  onSetAlerts,
  onExport,
}: InsightsPanelProps) {
  return (
    <div
      className={cn(
        'rounded-[20px] p-6 h-full flex flex-col',
        'bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f]',
        'border border-white/[0.08] backdrop-blur-[20px]',
        'animate-chart-fade'
      )}
      style={{
        background: 'linear-gradient(135deg, rgba(30,30,45,0.6) 0%, rgba(20,20,35,0.8) 100%)',
      }}
      role="complementary"
      aria-label="Key insights"
    >
      <h3 className="text-lg font-bold text-app-text flex items-center gap-2 mb-5">
        <Sparkles className="w-5 h-5 text-amber-400" aria-hidden />
        Key Insights
      </h3>

      <div className="space-y-4 flex-1 overflow-y-auto">
        {insights.map((insight) => {
          const style = SEVERITY_STYLES[insight.severity];
          const Icon = style.icon;
          return (
            <div
              key={insight.id}
              className="rounded-xl p-4 border-l-[3px] transition-colors hover:brightness-110"
              style={{
                background: style.bg,
                borderLeftColor: style.border,
              }}
            >
              <div className="flex items-start gap-2">
                <Icon
                  className="w-5 h-5 shrink-0 mt-0.5"
                  style={{ color: style.border }}
                  aria-hidden
                />
                <div>
                  <p className="font-semibold text-app-text text-[15px]">{insight.title}</p>
                  <p className="mt-1.5 text-sm text-app-text/70 leading-relaxed">
                    {insight.description}
                  </p>
                  {insight.action && (
                    <button
                      type="button"
                      className="mt-3 text-sm font-medium transition-colors hover:underline"
                      style={{ color: style.border }}
                      onClick={() => {}}
                    >
                      {insight.action.label}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick stats 2x2 */}
      <div className="grid grid-cols-2 gap-2 mt-6 flex-shrink-0">
        {quickStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg p-3 border border-white/[0.05] bg-white/[0.03]"
          >
            <p className="text-[11px] uppercase tracking-wider text-app-text/50">{stat.label}</p>
            <p className="text-base font-bold text-app-text mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-white/5">
        {onViewReport && (
          <button
            type="button"
            onClick={onViewReport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-app-text/80 hover:bg-white/10 hover:text-app-text transition-colors"
          >
            <FileText className="w-4 h-4" />
            View Full Report
          </button>
        )}
        {onSetAlerts && (
          <button
            type="button"
            onClick={onSetAlerts}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-app-text/80 hover:bg-white/10 hover:text-app-text transition-colors"
          >
            <Bell className="w-4 h-4" />
            Set Alerts
          </button>
        )}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-app-text/80 hover:bg-white/10 hover:text-app-text transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Data
          </button>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { performanceAPI } from '@/lib/api';
import type { TeamPerformanceResponse, TeamMemberWholesale } from '@/types/performance';
import { DollarSign, MessageSquare, Users, Download } from 'lucide-react';
import { WholesaleTeamTable } from './WholesaleTeamTable';
import { Button } from '@/components/ui';

export function WholesaleSMSTeamSection() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [teamData, setTeamData] = useState<TeamPerformanceResponse<TeamMemberWholesale[]>['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('12m');

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setError('User session required to load team data.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    performanceAPI.getTeam(userId, 'wholesale-sms')
      .then((teamRes) => {
        if (cancelled) return;
        const team = (teamRes as { success: boolean; data: TeamPerformanceResponse<TeamMemberWholesale[]>['data'] }).data;
        setTeamData(team);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, period]);

  const summary = teamData?.summary as Record<string, { value?: number; formatted?: string; changePercent?: number; change?: number }> | undefined;
  const members = (teamData?.members ?? []) as TeamMemberWholesale[];

  if (loading && !teamData) {
    return (
      <section>
        <h2 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-3">WHOLESALE SMS TEAM PERFORMANCE</h2>
        <div className="rounded-2xl border border-app-border bg-app-card p-8 text-center text-app-muted">Loading...</div>
      </section>
    );
  }

  if (error && !teamData) {
    return (
      <section>
        <h2 className="text-sm font-medium text-app-muted uppercase tracking-wider mb-3">WHOLESALE SMS TEAM PERFORMANCE</h2>
        <div className="rounded-2xl border border-app-border bg-app-card p-8 text-center text-red-500">{error}</div>
      </section>
    );
  }

  return (
    <section className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="select-theme text-xs py-1.5 px-2 w-auto"
            aria-label="Time period"
          >
            <option value="7d">7 Days</option>
            <option value="90d">90 Days</option>
            <option value="12m">12 Months</option>
            <option value="3y">3 Years</option>
          </select>
          <Button variant="secondary" size="sm" className="gap-1 text-xs">
            <Download className="w-3 h-3" />
            Export
          </Button>
        </div>
      </div>

      {/* Compact summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <div className="rounded-lg p-3 border border-gray-800/50 bg-gray-900/40 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-teal-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-app">{summary?.totalRevenue?.formatted ?? '—'}</p>
            <p className="text-xs text-app-muted">Revenue · +{summary?.totalRevenue?.changePercent ?? 0}%</p>
          </div>
        </div>
        <div className="rounded-lg p-3 border border-gray-800/50 bg-gray-900/40 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-app">{summary?.totalSMS?.formatted ?? '—'}</p>
            <p className="text-xs text-app-muted">SMS · +{summary?.totalSMS?.changePercent ?? 0}%</p>
          </div>
        </div>
        <div className="rounded-lg p-3 border border-gray-800/50 bg-gray-900/40 flex items-center gap-2">
          <Users className="w-4 h-4 text-app-muted shrink-0" />
          <div>
            <p className="text-sm font-bold text-app">{summary?.activeMembers?.value ?? members.length}</p>
            <p className="text-xs text-app-muted">Members</p>
          </div>
        </div>
      </div>

      <WholesaleTeamTable members={members} />
    </section>
  );
}

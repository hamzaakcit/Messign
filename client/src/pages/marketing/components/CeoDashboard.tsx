import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ChevronRight,
  Mail,
  MousePointerClick,
  RefreshCw,
  Shield,
  Swords,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuthStore } from '@/stores/authStore';
import { marketingAPI, type CeoDashboardSnapshot, type CeoDashboardTrend } from '@/lib/marketingApi';
import { cn } from '@/lib/utils';

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function getTrendDirection(current: number | null, previous: number | null): 'up' | 'down' | 'flat' {
  if (current === null || previous === null) return 'flat';
  if (current > previous * 1.05) return 'up';
  if (current < previous * 0.95) return 'down';
  return 'flat';
}

function getSnapshotFreshness(generatedAt: string): { label: string; isStale: boolean } {
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  const hours = Math.floor(ageMs / 3600000);
  if (hours < 1) return { label: 'Just updated', isStale: false };
  if (hours < 24) return { label: `Updated ${hours}h ago`, isStale: false };
  return { label: `Updated ${Math.floor(hours / 24)}d ago`, isStale: true };
}

const VIOLATION_LABELS: Record<string, string> = {
  forbidden_word: 'Forbidden Words',
  missing_disclaimer: 'Missing Disclaimers',
  tone_deviation: 'Tone Issues',
  style_violation: 'Style Violations',
};

// ── Metric Card ──

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'flat';
  accent?: string;
}

function MetricCard({ icon, label, value, trend, accent = 'text-primary-400' }: MetricCardProps) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-app-card border border-app-border shadow-sm">
      <div className={cn('shrink-0', accent)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-app-muted truncate">{label}</p>
        <p className="text-xl font-bold text-app-text">{value}</p>
      </div>
      {trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />}
      {trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />}
    </div>
  );
}

// ── Main Component ──

export function CeoDashboard() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const navigate = useNavigate();

  const [snapshot, setSnapshot] = useState<CeoDashboardSnapshot | null>(null);
  const [trends, setTrends] = useState<CeoDashboardTrend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const [snap, trendRes] = await Promise.all([
        marketingAPI.getCeoDashboard(userId),
        marketingAPI.getCeoDashboardTrend(userId, 30),
      ]);
      setSnapshot(snap);
      setTrends(trendRes.trends);
    } catch {
      /* best-effort */
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = async () => {
    if (!userId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const snap = await marketingAPI.refreshCeoDashboard(userId);
      setSnapshot(snap);
      const trendRes = await marketingAPI.getCeoDashboardTrend(userId, 30);
      setTrends(trendRes.trends);
    } catch { /* best-effort */ }
    setIsRefreshing(false);
  };

  const isEmpty = snapshot &&
    snapshot.emailsCreated === 0 &&
    snapshot.contentPublished === 0 &&
    snapshot.activeTeamMembers === 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-400/40 border-t-primary-400" />
      </div>
    );
  }

  if (!snapshot || isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-4 text-center px-8">
        <BarChart3 className="w-12 h-12 text-app-muted/50" />
        <div>
          <p className="text-lg font-semibold text-app-text">Welcome to your marketing dashboard</p>
          <p className="text-sm text-app-muted mt-1">
            Start by creating content, setting up brand profiles, and adding competitors.
          </p>
        </div>
        <div className="flex gap-3 mt-2">
          <button type="button" onClick={() => navigate('/marketing')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500 text-app-text hover:bg-primary-600 transition-colors">
            Create Content
          </button>
          <button type="button" onClick={() => navigate('/marketing/intelligence')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-app-card border border-app-border text-app-text hover:bg-app-nav-hover transition-colors">
            Add Competitor
          </button>
        </div>
      </div>
    );
  }

  const freshness = getSnapshotFreshness(snapshot.generatedAt);

  const prevOpenRate = trends.length >= 2 ? trends[trends.length - 2]?.avgOpenRate ?? null : null;
  const prevCompliance = trends.length >= 2 ? trends[trends.length - 2]?.compliancePassRate ?? null : null;

  const emailChartData = trends.map((t) => ({
    date: t.date.slice(5),
    sent: t.emailsSent,
    openRate: t.avgOpenRate != null ? Math.round(t.avgOpenRate * 100) : null,
  }));

  const pipelineChartData = trends.map((t) => ({
    date: t.date.slice(5),
    compliance: t.compliancePassRate != null ? Math.round(t.compliancePassRate * 100) : null,
    batch: t.batchJobsCompleted,
  }));

  const pipeline = {
    draft: snapshot.contentInDraft,
    inReview: snapshot.contentInReview,
    approved: snapshot.contentApproved,
    published: snapshot.contentPublished,
  };
  const pipelineTotal = pipeline.draft + pipeline.inReview + pipeline.approved + pipeline.published;

  const channelEntries = Object.entries(snapshot.channelSuccessRates).sort((a, b) => b[1] - a[1]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-app-text">Marketing Dashboard</h1>
          <p className={cn('text-xs mt-0.5', freshness.isStale ? 'text-amber-400' : 'text-app-muted')}>
            {freshness.label} &middot; Last 30 days
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-app-card border border-app-border text-app-text hover:bg-app-nav-hover transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          icon={<Mail className="w-5 h-5" />}
          label="Emails Sent"
          value={formatNumber(snapshot.emailsSent)}
          accent="text-blue-400"
        />
        <MetricCard
          icon={<MousePointerClick className="w-5 h-5" />}
          label="Avg Open Rate"
          value={formatPercent(snapshot.avgOpenRate)}
          trend={getTrendDirection(snapshot.avgOpenRate, prevOpenRate)}
          accent="text-amber-400"
        />
        <MetricCard
          icon={<Shield className="w-5 h-5" />}
          label="Compliance Rate"
          value={formatPercent(snapshot.compliancePassRate)}
          trend={getTrendDirection(snapshot.compliancePassRate, prevCompliance)}
          accent={snapshot.compliancePassRate !== null && snapshot.compliancePassRate >= 0.85 ? 'text-emerald-400' : 'text-amber-400'}
        />
        <MetricCard
          icon={<Swords className="w-5 h-5" />}
          label="Competitor Moves"
          value={String(snapshot.significantCompetitorMoves)}
          accent={snapshot.significantCompetitorMoves > 0 ? 'text-red-400' : 'text-app-muted'}
        />
        <MetricCard
          icon={<Users className="w-5 h-5" />}
          label="Team Output"
          value={snapshot.contentPerMember != null ? `${snapshot.contentPerMember}/member` : '—'}
          accent="text-purple-400"
        />
      </div>

      {/* Trend Charts */}
      {trends.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Email Performance */}
          <div className="rounded-xl bg-app-card border border-app-border p-4">
            <h3 className="text-sm font-semibold text-app-text mb-3">Email Performance</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={emailChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="sent" name="Sent" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Area yAxisId="right" type="monotone" dataKey="openRate" name="Open %" stroke="#f59e0b" fill="rgba(245,158,11,0.1)" strokeWidth={2} dot={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pipeline & Compliance */}
          <div className="rounded-xl bg-app-card border border-app-border p-4">
            <h3 className="text-sm font-semibold text-app-text mb-3">Pipeline & Compliance</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pipelineChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="compliance" name="Compliance %" stroke="#10b981" fill="rgba(16,185,129,0.1)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="batch" name="Batch Jobs" stroke="#8b5cf6" fill="rgba(139,92,246,0.1)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Cross-Module Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Content Pipeline */}
        <div className="rounded-xl bg-app-card border border-app-border p-4">
          <h3 className="text-sm font-semibold text-app-text mb-3">Content Pipeline</h3>
          <div className="space-y-2">
            {([
              { label: 'Draft', value: pipeline.draft, color: 'bg-slate-500' },
              { label: 'In Review', value: pipeline.inReview, color: 'bg-amber-500' },
              { label: 'Approved', value: pipeline.approved, color: 'bg-blue-500' },
              { label: 'Published', value: pipeline.published, color: 'bg-emerald-500' },
            ] as const).map((stage) => (
              <div key={stage.label} className="flex items-center gap-2">
                <span className="text-xs text-app-muted w-16 shrink-0">{stage.label}</span>
                <div className="flex-1 h-5 rounded bg-app-surface-tertiary overflow-hidden">
                  <div
                    className={cn('h-full rounded transition-all', stage.color)}
                    style={{ width: pipelineTotal > 0 ? `${(stage.value / pipelineTotal) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-xs font-medium text-app-text w-6 text-right">{stage.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Channel Performance */}
        <div className="rounded-xl bg-app-card border border-app-border p-4">
          <h3 className="text-sm font-semibold text-app-text mb-3">Channel Performance</h3>
          {channelEntries.length === 0 ? (
            <p className="text-xs text-app-muted">No batch data yet</p>
          ) : (
            <div className="space-y-2">
              {channelEntries.slice(0, 6).map(([channel, rate]) => (
                <div key={channel} className="flex items-center gap-2">
                  <span className="text-xs text-app-muted w-16 shrink-0 capitalize truncate">{channel}</span>
                  <div className="flex-1 h-4 rounded bg-app-surface-tertiary overflow-hidden">
                    <div className="h-full rounded bg-primary-500/80 transition-all" style={{ width: `${Math.round(rate * 100)}%` }} />
                  </div>
                  <span className="text-xs font-medium text-app-text w-10 text-right">{Math.round(rate * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Compliance Overview */}
        <div className="rounded-xl bg-app-card border border-app-border p-4">
          <h3 className="text-sm font-semibold text-app-text mb-3">Compliance Overview</h3>
          <div className="flex items-center gap-4 mb-3">
            <div className="flex-1 text-center">
              <p className={cn(
                'text-2xl font-bold',
                snapshot.avgComplianceScore !== null && snapshot.avgComplianceScore >= 80 ? 'text-emerald-400' : 'text-amber-400',
              )}>
                {snapshot.avgComplianceScore !== null ? Math.round(snapshot.avgComplianceScore) : '—'}
              </p>
              <p className="text-[10px] text-app-muted">Avg Score</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-2xl font-bold text-app-text">{snapshot.complianceScanTotal}</p>
              <p className="text-[10px] text-app-muted">Scans</p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-2xl font-bold text-app-text">{formatPercent(snapshot.compliancePassRate)}</p>
              <p className="text-[10px] text-app-muted">Pass Rate</p>
            </div>
          </div>
          {snapshot.commonViolations.length > 0 && (
            <div className="border-t border-app-border pt-2 mt-2 space-y-1">
              <p className="text-[10px] text-app-muted uppercase tracking-wider">Top Violations</p>
              {snapshot.commonViolations.slice(0, 3).map((v) => (
                <div key={v.type} className="flex items-center justify-between text-xs">
                  <span className="text-app-muted">{VIOLATION_LABELS[v.type] || v.type}</span>
                  <span className="text-app-text font-medium">{v.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Competitive Landscape */}
        <div className="rounded-xl bg-app-card border border-app-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-app-text">Competitive Landscape</h3>
            <button
              type="button"
              onClick={() => navigate('/marketing/intelligence')}
              className="flex items-center gap-0.5 text-[10px] text-primary-400 hover:text-primary-300"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-app-text">{snapshot.activeCompetitorsCount}</p>
              <p className="text-[10px] text-app-muted">Active Competitors</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-app-text">{snapshot.competitorEventsDiscovered}</p>
              <p className="text-[10px] text-app-muted">Events Discovered</p>
            </div>
            <div>
              <p className={cn('text-2xl font-bold', snapshot.significantCompetitorMoves > 0 ? 'text-amber-400' : 'text-app-text')}>
                {snapshot.significantCompetitorMoves}
              </p>
              <p className="text-[10px] text-app-muted">Significant Moves</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-app-text capitalize">{snapshot.topCompetitorEventType || '—'}</p>
              <p className="text-[10px] text-app-muted">Top Event Type</p>
            </div>
          </div>
        </div>

        {/* Team Performance */}
        <div className="rounded-xl bg-app-card border border-app-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-app-text">Team Performance</h3>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-app-text">{snapshot.activeTeamMembers}</p>
              <p className="text-[10px] text-app-muted">Active Members</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-app-text">{snapshot.contentPerMember ?? '—'}</p>
              <p className="text-[10px] text-app-muted">Content / Member</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-app-text">{snapshot.batchJobsCompleted}</p>
              <p className="text-[10px] text-app-muted">Batch Jobs Done</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-app-text">{snapshot.totalDerivativesGenerated}</p>
              <p className="text-[10px] text-app-muted">Derivatives Created</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { onActivityNew } from '@/lib/socket';
import { executiveAPI, type ExecutiveDashboard, type ExecutiveChartData } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

import { CommandCenterKPIStrip } from './components/CommandCenterKPIStrip';
import { QuickActionModal, type ActionDepartment } from './components/QuickActionModal';
import { DoraCommandPanel } from './components/DoraCommandPanel';

import { SalesCard } from './components/departments/SalesCard';
import { FinanceCard } from './components/departments/FinanceCard';
import { SupportCard } from './components/departments/SupportCard';
import { MarketingCard } from './components/departments/MarketingCard';
import { HRCard } from './components/departments/HRCard';
import { EngineeringCard } from './components/departments/EngineeringCard';
import { OKRCard } from './components/departments/OKRCard';
import { TimeCard } from './components/departments/TimeCard';
import { CultureCard } from './components/departments/CultureCard';
import { OperationsCard } from './components/departments/OperationsCard';

const REFRESH_INTERVAL_MS = 60_000;

function relTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function executiveLoadErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/403|forbidden|not authorized|access denied|denied/i.test(raw)) {
    return 'You don\'t have access to the executive dashboard.';
  }
  return raw || 'Failed to load dashboard.';
}

export function ExecutiveDashboardPage(): JSX.Element {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const userId = user?.authUserId || user?.id || '';

  const [data, setData] = useState<ExecutiveDashboard | null>(null);
  const [chartData, setChartData] = useState<ExecutiveChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ActionDepartment>(null);
  const [doraQuery] = useState<string | undefined>(undefined);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval>>();

  const loadCharts = useCallback(async (): Promise<void> => {
    if (!userId) return;
    try {
      const charts = await executiveAPI.getChartData(userId);
      setChartData(charts);
    } catch (err) {
      console.warn('[executive] chart data failed', err);
      setChartData(null);
      toast.error('Trend charts could not be loaded.', { duration: 4_000 });
    }
  }, [userId]);

  const loadDashboard = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    try {
      const dashboard = await executiveAPI.getDashboard(userId);
      setData(dashboard);
      setLoadError(null);
      return true;
    } catch (err) {
      console.error('[executive] dashboard load failed', err);
      setData(null);
      setLoadError(executiveLoadErrorMessage(err));
      return false;
    }
  }, [userId]);

  const loadAll = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const ok = await loadDashboard();
      if (ok) await loadCharts();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, loadDashboard, loadCharts]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    refreshTimerRef.current = setInterval(() => loadAll(true), REFRESH_INTERVAL_MS);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [loadAll]);

  useEffect(() => {
    if (!data) return;
    const off = onActivityNew((event) => {
      const title = typeof event?.message === 'string' ? event.message : 'New activity';
      setData((prev) => prev ? {
        ...prev,
        recentActivity: [
          {
            id: crypto.randomUUID(),
            module: 'system',
            type: event?.type ?? 'activity',
            title,
            actor: 'System',
            timestamp: new Date().toISOString(),
            color: '#8b5cf6',
          },
          ...prev.recentActivity,
        ].slice(0, 20),
      } : prev);
    });
    return off;
  }, [data]);

  const handleDataChanged = useCallback(() => {
    loadAll(true);
  }, [loadAll]);

  const scrollToSection = useCallback((sectionId: string) => {
    document.getElementById(`dept-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const openAction = useCallback((dept: ActionDepartment) => {
    setActiveModal(dept);
  }, []);

  const openDeptPage = useCallback((route: string) => {
    navigate(route);
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-48px)] bg-app">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
          <span className="text-sm text-app-muted">Loading Command Center...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-48px)] bg-app px-4">
        <div className="text-center max-w-sm">
          <div className="text-red-400 text-sm mb-2">{loadError ?? 'Failed to load dashboard'}</div>
          <button
            type="button"
            onClick={() => loadAll()}
            className="text-xs text-primary-400 hover:text-primary-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-48px)] overflow-y-auto bg-app px-4 py-3 md:px-6 md:py-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-bold text-app">Command Center</h1>
          <p className="text-xs text-app-muted">
            Real-time overview across all departments
          </p>
        </div>
        <button
          onClick={() => loadAll(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-app text-app-muted hover:text-app hover:bg-app-hover transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI Strip */}
      <CommandCenterKPIStrip data={data} chartData={chartData} onKPIClick={scrollToSection} />

      {/* Department Grid - Row 1: Core business */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
        <SalesCard
          data={data.revenue}
          chartData={chartData?.revenueTrend}
          onAction={() => openAction('sales')}
        />
        <FinanceCard
          data={data.finance}
          chartData={chartData?.expenseTrend}
          pendingCount={data.finance.pendingApprovals}
          onAction={() => openAction('finance')}
        />
        <SupportCard
          data={data.support}
          chartData={chartData?.ticketTrend}
          onAction={() => openAction('support')}
        />
        <MarketingCard
          data={data.marketing}
          chartData={chartData?.leadsTrend}
          onAction={() => openAction('marketing')}
        />
      </div>

      {/* Department Grid - Row 2: Operations */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
        <HRCard
          data={data.people}
          onAction={() => openAction('hr')}
        />
        <EngineeringCard
          data={data.projects}
          onAction={() => openDeptPage('/projects')}
        />
        <OKRCard
          data={data.okrs}
          onAction={() => openAction('okr')}
        />
        <TimeCard
          data={data.people}
          chartData={chartData?.utilizationTrend}
          pendingCount={data.people.pendingTimesheets}
          onAction={() => openAction('time')}
        />
      </div>

      {/* Bottom Row: Culture, Operations, Dora, Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
        <CultureCard
          data={data.culture}
          onAction={() => openDeptPage('/culture')}
        />
        <OperationsCard
          data={data.operations}
          onAction={() => openDeptPage('/assets')}
        />

        {/* Dora AI */}
        <DoraCommandPanel initialQuery={doraQuery} />

        {/* Activity Feed */}
        <div className="rounded-lg border border-app bg-app-card p-3 flex flex-col" data-testid="executive-activity">
          <div className="text-sm font-semibold text-app mb-2">Activity Feed</div>
          <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[220px]">
            {data.recentActivity.slice(0, 15).map((a) => (
              <div key={a.id} className="flex gap-2 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                <div className="min-w-0">
                  <div className="text-app truncate">{a.title}</div>
                  <div className="text-app-muted">{a.actor} &middot; {relTime(a.timestamp)}</div>
                </div>
              </div>
            ))}
            {data.recentActivity.length === 0 && (
              <div className="text-xs text-app-muted text-center py-4">No recent activity</div>
            )}
          </div>
        </div>
      </div>

      {/* Dora Insights + Pending Actions Summary */}
      {(data.doraInsights.criticalCount > 0 || data.doraInsights.warningCount > 0) && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-amber-200">
              <span className="font-semibold">Dora Insights:</span>{' '}
              {data.doraInsights.criticalCount > 0 && (
                <span className="text-red-400">{data.doraInsights.criticalCount} critical</span>
              )}
              {data.doraInsights.criticalCount > 0 && data.doraInsights.warningCount > 0 && ' · '}
              {data.doraInsights.warningCount > 0 && (
                <span className="text-amber-400">{data.doraInsights.warningCount} warnings</span>
              )}
              {' · '}{data.doraInsights.totalUnread} unread
            </div>
            <button
              onClick={() => navigate('/dora/briefing')}
              className="text-xs text-cyan-400 hover:text-cyan-300"
            >
              View Briefing
            </button>
          </div>
        </div>
      )}

      {/* Quick Action Modal */}
      <QuickActionModal
        department={activeModal}
        onClose={() => setActiveModal(null)}
        onDataChanged={handleDataChanged}
        userId={userId}
      />
    </div>
  );
}

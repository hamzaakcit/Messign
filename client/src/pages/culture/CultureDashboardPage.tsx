import { useCallback, useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from 'recharts';
import { Lock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { heartAPI } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

type Tab = 'wellness' | 'team' | 'department' | 'organization';

const TABS: Array<{ id: Tab; label: string; minRole: string }> = [
  { id: 'wellness', label: 'My Wellness', minRole: 'employee' },
  { id: 'team', label: 'Team Health', minRole: 'manager' },
  { id: 'department', label: 'Department', minRole: 'dept_head' },
  { id: 'organization', label: 'Organization', minRole: 'admin' },
];

function scoreColor(score: number): string {
  if (score >= 75) return 'text-green-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function trendIcon(trend: string) {
  if (trend === 'improving') return <TrendingUp className="w-4 h-4 text-green-600" />;
  if (trend === 'declining') return <TrendingDown className="w-4 h-4 text-red-600" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

function MiniGauge({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <div className={cn('text-sm font-semibold', scoreColor(pct))}>{Math.round(value)}</div>
    </div>
  );
}

export function CultureDashboardPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const role = (user?.role as string) || 'employee';

  const [tab, setTab] = useState<Tab>('wellness');
  const [wellness, setWellness] = useState<{
    sentimentTrend: string;
    burnoutRisk: string;
    hoursThisWeek: number;
    daysSincePTO: number;
    suggestions: string[];
  } | null>(null);
  const [sentimentHistory, setSentimentHistory] = useState<Array<{ date: string; score: number; source: string }>>([]);
  const [teamHealth, setTeamHealth] = useState<Record<string, unknown> | null>(null);
  const [teamHistory, setTeamHistory] = useState<Array<Record<string, unknown>>>([]);
  const [orgHealth, setOrgHealth] = useState<Record<string, unknown> | null>(null);
  const [departments, setDepartments] = useState<Array<Record<string, unknown>>>([]);
  const [activeSurvey, setActiveSurvey] = useState<{ id?: string; title?: string; questions?: Array<{ id: string; text: string }>; responseCount?: number } | null>(null);
  const [surveyResults, setSurveyResults] = useState<Record<string, unknown> | null>(null);
  const [wellnessLoading, setWellnessLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const loading = wellnessLoading || teamLoading;

  const canSeeTab = useCallback(
    (t: Tab) => {
      const config = TABS.find((x) => x.id === t);
      if (!config) return false;
      const order = ['employee', 'manager', 'dept_head', 'admin'];
      return order.indexOf(role) >= order.indexOf(config.minRole);
    },
    [role]
  );

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setWellnessLoading(true);
    Promise.all([
      heartAPI.getMyWellness(userId),
      heartAPI.getMySentiment(userId, 30),
    ])
      .then(([w, s]) => {
        if (cancelled) return;
        setWellness(w as typeof wellness);
        setSentimentHistory((s as { history: typeof sentimentHistory }).history ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setWellnessLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!userId || !canSeeTab('team')) return;
    let cancelled = false;
    setTeamLoading(true);
    Promise.all([
      heartAPI.getTeam(userId, 'team'),
      heartAPI.getTeamHistory(userId, 'team', undefined, 12),
    ])
      .then(([t, h]) => {
        if (cancelled) return;
        setTeamHealth(t as typeof teamHealth);
        setTeamHistory((h as { history: typeof teamHistory }).history ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTeamLoading(false); });
    return () => { cancelled = true; };
  }, [userId, canSeeTab]);

  useEffect(() => {
    if (!userId || !canSeeTab('department')) return;
    let cancelled = false;
    heartAPI
      .getDepartments(userId)
      .then((r) => { if (!cancelled) setDepartments((r as { departments: typeof departments }).departments ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, canSeeTab]);

  useEffect(() => {
    if (!userId || !canSeeTab('organization')) return;
    let cancelled = false;
    heartAPI.getTeam(userId, 'organization')
      .then((t) => { if (!cancelled) setOrgHealth(t as typeof orgHealth); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, canSeeTab]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    heartAPI
      .getActiveSurvey(userId)
      .then((s) => { if (!cancelled) setActiveSurvey(s && (s as { id?: string }).id ? (s as typeof activeSurvey) : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!userId || !activeSurvey?.id || !canSeeTab('team')) return;
    let cancelled = false;
    heartAPI
      .getSurveyResults(userId, activeSurvey.id)
      .then((r) => { if (!cancelled) setSurveyResults(r as typeof surveyResults); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, activeSurvey?.id, canSeeTab]);

  const sentimentChartData = sentimentHistory.map((h) => ({
    date: h.date.slice(0, 10),
    score: Math.round((h.score + 1) * 50),
  }));

  const teamHistoryChartData = teamHistory.map((h) => ({
    period: (h.periodStart as string)?.slice(0, 10) ?? '',
    score: h.healthScore ?? 0,
  }));

  const radarData = departments.length
    ? [
        { subject: 'Engagement', fullMark: 100, ...Object.fromEntries(departments.map((d, i) => [`dept_${i}`, (d.engagementScore as number) ?? 0])) },
        { subject: 'Sentiment', fullMark: 100, ...Object.fromEntries(departments.map((d, i) => [`dept_${i}`, (d.sentimentScore as number) ?? 0])) },
        { subject: 'Velocity', fullMark: 100, ...Object.fromEntries(departments.map((d, i) => [`dept_${i}`, (d.velocityScore as number) ?? 75])) },
        { subject: 'Hours Balance', fullMark: 100, ...Object.fromEntries(departments.map((d, i) => [`dept_${i}`, (d.hoursBalanceScore as number) ?? 75])) },
        { subject: 'Collaboration', fullMark: 100, ...Object.fromEntries(departments.map((d, i) => [`dept_${i}`, (d.collaborationScore as number) ?? 75])) },
      ]
    : [];

  const COLORS = ['#22c55e', '#eab308', '#ef4444', '#3b82f6', '#8b5cf6'];

  return (
    <div className="h-[calc(100vh-48px)] overflow-y-auto p-4 md:p-6 bg-app space-y-4">
      <DoraInsightBar
        module="culture"
        fallback="Dora monitors team health and engagement patterns to help build a stronger culture."
      />

      <div className="flex flex-wrap gap-2 border-b border-app pb-2">
        {TABS.filter((t) => canSeeTab(t.id)).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
      )}

      {!loading && tab === 'wellness' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-app bg-app-card p-5">
            <h2 className="text-lg font-semibold text-app mb-4">Personal Sentiment Trend (30 days)</h2>
            {sentimentChartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sentimentChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No sentiment data yet. Check back after some activity.</p>
            )}
          </div>

          <div className="rounded-xl border border-app bg-app-card p-5">
            <h2 className="text-lg font-semibold text-app mb-4">Your current wellness indicators</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <MiniGauge label="Work-life balance" value={wellness ? Math.min(100, 100 - wellness.hoursThisWeek * 2) : 75} />
              <MiniGauge label="Engagement" value={wellness?.burnoutRisk === 'none' ? 85 : wellness?.burnoutRisk === 'low' ? 70 : 50} />
              <MiniGauge label="Sentiment" value={sentimentChartData.length ? sentimentChartData[sentimentChartData.length - 1]?.score ?? 75 : 75} />
            </div>
          </div>

          {wellness?.suggestions && wellness.suggestions.length > 0 && (
            <div className="rounded-xl border border-app bg-app-card p-5">
              <h2 className="text-lg font-semibold text-app mb-2">Personal suggestions from Dora</h2>
              <ul className="list-disc list-inside space-y-1 text-sm text-app">
                {wellness.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-app bg-app-card p-4 flex items-start gap-3 bg-muted/30">
            <Lock className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              This data is visible only to you. Your manager sees anonymized team averages.
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'team' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-app bg-app-card p-5">
            <h2 className="text-lg font-semibold text-app mb-4">Team Health Score</h2>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold">
                <span className={scoreColor((teamHealth?.healthScore as number) ?? 0)}>
                  {String(teamHealth?.healthScore ?? '—')}
                </span>
                <span className="text-muted-foreground text-2xl">/100</span>
              </div>
              {teamHealth?.healthTrend ? trendIcon(String(teamHealth.healthTrend)) : null}
            </div>
          </div>

          {departments.length > 0 && radarData.length > 0 && (
            <div className="rounded-xl border border-app bg-app-card p-5">
              <h2 className="text-lg font-semibold text-app mb-4">Department Health Radar</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} />
                    {departments.slice(0, 3).map((_, i) => (
                      <Radar
                        key={i}
                        name={(departments[i].scopeName as string) ?? `Dept ${i}`}
                        dataKey={`dept_${i}`}
                        stroke={COLORS[i]}
                        fill={COLORS[i]}
                        fillOpacity={0.3}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {teamHistoryChartData.length > 0 && (
            <div className="rounded-xl border border-app bg-app-card p-5">
              <h2 className="text-lg font-semibold text-app mb-4">Team Health Trend (12 weeks)</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={teamHistoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {teamHealth && (
            <div className="rounded-xl border border-app bg-app-card p-5">
              <h2 className="text-lg font-semibold text-app mb-4">Anonymous signals</h2>
              <div className="space-y-2 text-sm">
                {(teamHealth.highEngagementCount as number) > 0 && (
                  <p className="text-green-600">
                    {(teamHealth.highEngagementCount as number)} team members showing elevated engagement
                  </p>
                )}
                {(teamHealth.atRiskCount as number) > 0 && (
                  <p className="text-amber-600">
                    {(teamHealth.atRiskCount as number)} team members showing signs of stress (no names)
                  </p>
                )}
                <p className="text-muted-foreground">Suggested action: Schedule casual team check-in this week</p>
              </div>
            </div>
          )}

          {activeSurvey && surveyResults && (
            <div className="rounded-xl border border-app bg-app-card p-5">
              <h2 className="text-lg font-semibold text-app mb-2">{activeSurvey.title ?? 'Pulse Survey'}</h2>
              <span className="text-xs text-muted-foreground">
                Response rate: {(surveyResults.responseCount as number) ?? 0} responses
              </span>
              <div className="mt-4 space-y-4">
                {(activeSurvey.questions as Array<{ id: string; text: string }>)?.map((q) => {
                  const agg = (surveyResults.aggregates as Record<string, { avg: number }>)?.[q.id];
                  return (
                    <div key={q.id}>
                      <div className="text-sm font-medium text-app mb-1">{q.text}</div>
                      <div className="h-6 rounded bg-muted overflow-hidden flex">
                        {[1, 2, 3, 4, 5].map((v) => (
                          <div
                            key={v}
                            className="flex-1"
                            style={{
                              backgroundColor: v === 1 ? '#ef4444' : v === 2 ? '#f97316' : v === 3 ? '#eab308' : v === 4 ? '#84cc16' : '#22c55e',
                              opacity: agg ? Math.min(1, (agg.avg ?? 0) / 5) : 0.3,
                            }}
                          />
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Avg: {agg?.avg?.toFixed(1) ?? '—'}/5</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'department' && (
        <div className="space-y-6">
          {departments.length > 0 && radarData.length > 0 && (
            <div className="rounded-xl border border-app bg-app-card p-5">
              <h2 className="text-lg font-semibold text-app mb-4">Department Comparison</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} />
                    {departments.map((d, i) => (
                      <Radar
                        key={i}
                        name={(d.scopeName as string) ?? `Dept ${i}`}
                        dataKey={`dept_${i}`}
                        stroke={COLORS[i % COLORS.length]}
                        fill={COLORS[i % COLORS.length]}
                        fillOpacity={0.3}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-app bg-app-card p-5">
            <h2 className="text-lg font-semibold text-app mb-4">Department Ranking</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app">
                    <th className="text-left py-2 font-medium">Department</th>
                    <th className="text-right py-2 font-medium">Health</th>
                    <th className="text-right py-2 font-medium">Engagement</th>
                    <th className="text-right py-2 font-medium">Sentiment</th>
                    <th className="text-right py-2 font-medium">Members</th>
                    <th className="text-right py-2 font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d, i) => (
                    <tr key={i} className="border-b border-app/50">
                      <td className="py-2">{String((d.scopeName as string) ?? '—')}</td>
                      <td className={cn('text-right py-2 font-medium', scoreColor((d.healthScore as number) ?? 0))}>
                        {String(d.healthScore ?? '—')}
                      </td>
                      <td className="text-right py-2">{String(d.engagementScore ?? '—')}</td>
                      <td className="text-right py-2">{String(d.sentimentScore ?? '—')}</td>
                      <td className="text-right py-2">{String(d.memberCount ?? '—')}</td>
                      <td className="text-right py-2">{(d.healthTrend as string) ? trendIcon(d.healthTrend as string) : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'organization' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-app bg-app-card p-5">
            <h2 className="text-lg font-semibold text-app mb-4">Company-wide Health</h2>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold">
                <span className={scoreColor((orgHealth?.healthScore as number) ?? 0)}>
                  {String(orgHealth?.healthScore ?? '—')}
                </span>
                <span className="text-muted-foreground text-2xl">/100</span>
              </div>
              {orgHealth?.healthTrend ? trendIcon(String(orgHealth.healthTrend)) : null}
            </div>
          </div>

          <div className="rounded-xl border border-app bg-app-card p-5">
            <h2 className="text-lg font-semibold text-app mb-4">Department Comparison Grid</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map((d, i) => (
                <div key={i} className="rounded-lg border border-app p-4">
                  <div className="font-medium text-app">{(d.scopeName as string) ?? `Dept ${i}`}</div>
                  <div className={cn('text-2xl font-bold mt-1', scoreColor((d.healthScore as number) ?? 0))}>
                    {String(d.healthScore ?? '—')}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {String((d.memberCount as number) ?? 0)} members · {String(d.healthTrend ?? '—')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {activeSurvey && (
            <div className="rounded-xl border border-app bg-app-card p-5">
              <h2 className="text-lg font-semibold text-app mb-2">Active Pulse Survey</h2>
              <p className="text-sm text-muted-foreground">{activeSurvey.title}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(activeSurvey.responseCount as number) ?? 0} responses
              </p>
            </div>
          )}

          <div className="rounded-xl border border-app bg-app-card p-5 bg-muted/20">
            <h2 className="text-lg font-semibold text-app mb-2">Dora narrative</h2>
            <p className="text-sm text-muted-foreground">
              Overall culture health is {(orgHealth?.healthScore as number) >= 75 ? 'strong' : (orgHealth?.healthScore as number) >= 50 ? 'moderate' : 'needs attention'}.
              {(orgHealth?.atRiskCount as number) > 0
                ? ` ${orgHealth?.atRiskCount} team members may benefit from additional support.`
                : ' No elevated risk signals detected.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

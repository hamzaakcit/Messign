import { useState } from 'react';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { LoadingState } from '@/admin/components/LoadingState';
import { Card, CardHeader, CardTitle, CardContent, Button, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { aiAdminAPI, type AnalyticsPeriod } from '@/lib/knowledge-hub/aiAdminApi';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';

const RATE_LIMITS: { role: string; perMinute: number; perHour: number }[] = [
  { role: 'admin / cpo', perMinute: 40, perHour: 400 },
  { role: 'manager / hr / finance', perMinute: 30, perHour: 300 },
  { role: 'employee', perMinute: 20, perHour: 200 },
];

export function AISettingsPage() {
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('this_month');
  const [resettingProvider, setResettingProvider] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  const { data: health, isLoading: healthLoading, error: healthError, refetch: refetchHealth } = useQuery(
    ['ai-admin', 'health'],
    () => aiAdminAPI.getHealth()
  );

  const { data: providers, isLoading: providersLoading, refetch: refetchProviders } = useQuery(
    ['ai-admin', 'providers'],
    () => aiAdminAPI.getProviders()
  );

  const { data: circuits, refetch: refetchCircuits } = useQuery(
    ['ai-admin', 'circuits'],
    () => aiAdminAPI.getCircuits()
  );

  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useQuery(
    ['ai-admin', 'analytics', analyticsPeriod],
    () => aiAdminAPI.getAnalytics(analyticsPeriod)
  );

  const { data: tools } = useQuery(
    ['ai-admin', 'tools'],
    () => aiAdminAPI.getTools()
  );

  const { data: performance } = useQuery(
    ['ai-admin', 'performance'],
    () => aiAdminAPI.getPerformance()
  );

  const { data: cache, refetch: refetchCache } = useQuery(
    ['ai-admin', 'cache'],
    () => aiAdminAPI.getCache()
  );

  const handleResetCircuit = async (provider: string) => {
    setResettingProvider(provider);
    try {
      await aiAdminAPI.resetCircuit(provider);
      refetchCircuits();
      refetchHealth();
      refetchProviders();
    } finally {
      setResettingProvider(null);
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      await aiAdminAPI.clearCache();
      refetchCache();
      refetchHealth();
    } finally {
      setClearingCache(false);
    }
  };

  const isLoading = healthLoading || providersLoading;
  const hasError = healthError;

  if (isLoading && !health) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-app mb-6">AI Settings</h1>
        <LoadingState message="Loading AI configuration..." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-app mb-6">AI Settings</h1>

      {hasError && (
        <div className="mb-6 p-4 rounded-lg bg-danger-500/10 border border-danger-500/30 text-danger-600 dark:text-danger-400">
          Failed to load AI settings. You may need admin access. {hasError.message}
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="rate-limits">Rate Limits</TabsTrigger>
          <TabsTrigger value="cache">Cache</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {health?.status === 'healthy' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                  )}
                  <span className="font-medium capitalize">{health?.status ?? '—'}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tools Registered</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-app">{health?.toolsRegistered ?? tools?.totalTools ?? '—'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Providers Healthy</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-app">
                  {health?.providers ? `${health.providers.healthy}/${health.providers.total}` : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Avg Response</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-app">
                  {health?.performance?.avgResponseMs != null ? `${health.performance.avgResponseMs}ms` : '—'}
                </p>
              </CardContent>
            </Card>
          </div>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Provider Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {providers &&
                  Object.entries(providers).map(([name, p]) => (
                    <div key={name} className="flex items-center gap-2">
                      {p.configured ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-app-muted" />
                      )}
                      <span className="font-medium capitalize">{name}</span>
                      <span className="text-sm text-app-muted">({p.configured ? 'configured' : 'not set'})</span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>AI Providers</CardTitle>
              <p className="text-sm text-app-muted mt-1">
                API keys are configured via environment variables. Circuit breaker state resets after failures.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {providers &&
                  Object.entries(providers).map(([name, p]) => {
                    const circuit = circuits?.[name] as { state?: string; failureCount?: number; totalFailures?: number } | undefined;
                    return (
                      <div
                        key={name}
                        className="flex items-center justify-between p-4 rounded-lg border border-app-border bg-app-surface-tertiary"
                      >
                        <div className="flex items-center gap-3">
                          {p.configured ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : (
                            <XCircle className="w-5 h-5 text-app-muted" />
                          )}
                          <div>
                            <p className="font-medium capitalize">{name}</p>
                            <p className="text-sm text-app-muted">
                              {p.configured ? 'API key configured' : 'API key not set'}
                              {circuit && (
                                <>
                                  {' · '}
                                  Circuit: <span className="capitalize">{circuit.state?.replace('_', ' ')}</span>
                                  {circuit.failureCount != null && circuit.failureCount > 0 && (
                                    <> ({circuit.failureCount} failures)</>
                                  )}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        {p.configured && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={resettingProvider !== null}
                            isLoading={resettingProvider === name}
                            onClick={() => handleResetCircuit(name)}
                          >
                            <RefreshCw className="w-4 h-4" />
                            Reset Circuit
                          </Button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Usage Analytics</CardTitle>
              <div className="flex gap-2 mt-2">
                {(['today', 'this_week', 'this_month', 'this_quarter'] as const).map((p) => (
                  <Button
                    key={p}
                    variant={analyticsPeriod === p ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setAnalyticsPeriod(p)}
                  >
                    {p.replace('_', ' ')}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {analyticsError && (
                <p className="text-sm text-app-muted py-4">
                  Analytics unavailable. Ensure migrations (add_ai_brain_analytics.sql) have been applied.
                </p>
              )}
              {analyticsLoading && <LoadingState message="Loading analytics..." />}
              {analytics && !analyticsLoading && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-sm text-app-muted">Total Queries</p>
                      <p className="text-xl font-bold">{Number(analytics.totals?.total_queries) ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-sm text-app-muted">Successful</p>
                      <p className="text-xl font-bold text-green-600">{Number(analytics.totals?.successful_queries) ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-sm text-app-muted">Failed</p>
                      <p className="text-xl font-bold text-danger-500">{Number(analytics.totals?.failed_queries) ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-sm text-app-muted">Unique Users</p>
                      <p className="text-xl font-bold">{Number(analytics.totals?.unique_users) ?? 0}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Top Tools</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-app-border">
                            <th className="text-left py-2 text-app-muted font-medium">Tool</th>
                            <th className="text-left py-2 text-app-muted font-medium">Usage</th>
                            <th className="text-left py-2 text-app-muted font-medium">Avg Time (ms)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(analytics.topTools as { tool_name?: string; usage_count?: number; avg_time_ms?: number }[])?.slice(0, 10).map((t, i) => (
                            <tr key={i} className="border-b border-app-border last:border-0">
                              <td className="py-2">{t.tool_name ?? '—'}</td>
                              <td className="py-2">{t.usage_count ?? 0}</td>
                              <td className="py-2">{t.avg_time_ms ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Top Users</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-app-border">
                            <th className="text-left py-2 text-app-muted font-medium">User</th>
                            <th className="text-left py-2 text-app-muted font-medium">Queries</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(analytics.topUsers as { full_name?: string; user_id?: string; query_count?: number }[])?.slice(0, 10).map((u, i) => (
                            <tr key={i} className="border-b border-app-border last:border-0">
                              <td className="py-2">{u.full_name || u.user_id || '—'}</td>
                              <td className="py-2">{u.query_count ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Registered Tools</CardTitle>
              <p className="text-sm text-app-muted mt-1">{tools?.totalTools ?? 0} tools available to the AI</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-app-border">
                      <th className="text-left py-2 text-app-muted font-medium">Name</th>
                      <th className="text-left py-2 text-app-muted font-medium">Category</th>
                      <th className="text-left py-2 text-app-muted font-medium">Required Roles</th>
                      <th className="text-left py-2 text-app-muted font-medium">Params</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools?.tools?.map((t, i) => (
                      <tr key={i} className="border-b border-app-border last:border-0">
                        <td className="py-2 font-mono text-xs">{t.name}</td>
                        <td className="py-2">{t.category}</td>
                        <td className="py-2">{t.requiredRoles?.length ? t.requiredRoles.join(', ') : '—'}</td>
                        <td className="py-2">{t.parameterCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rate-limits" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Rate Limits</CardTitle>
              <p className="text-sm text-app-muted mt-1">
                Per-user limits for AI answer requests. Presentation generation: 5/hour (15 for admins).
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-app-border">
                      <th className="text-left py-2 text-app-muted font-medium">Role</th>
                      <th className="text-left py-2 text-app-muted font-medium">Per Minute</th>
                      <th className="text-left py-2 text-app-muted font-medium">Per Hour</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RATE_LIMITS.map((r, i) => (
                      <tr key={i} className="border-b border-app-border last:border-0">
                        <td className="py-2">{r.role}</td>
                        <td className="py-2">{r.perMinute}</td>
                        <td className="py-2">{r.perHour}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cache" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Query Cache</CardTitle>
              <p className="text-sm text-app-muted mt-1">
                In-memory cache for tool results. Cleared on server restart.
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm">
                    <span className="text-app-muted">Size:</span>{' '}
                    <span className="font-medium">{cache?.size ?? 0}</span> / {cache?.maxSize ?? 500}
                  </p>
                  <p className="text-sm">
                    <span className="text-app-muted">Total hits:</span>{' '}
                    <span className="font-medium">{cache?.totalHits ?? 0}</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-app-muted">Oldest entry:</span>{' '}
                    <span className="font-medium">
                      {cache?.oldestEntryAge != null ? `${Math.round(cache.oldestEntryAge / 1000)}s ago` : '—'}
                    </span>
                  </p>
                </div>
                <Button variant="secondary" onClick={handleClearCache} disabled={clearingCache} isLoading={clearingCache}>
                  <Trash2 className="w-4 h-4" />
                  Clear Cache
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <p className="text-sm text-app-muted mt-1">
                Rolling window of last 100 requests. Alerts when stages exceed thresholds.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-sm text-app-muted">Recent Requests</p>
                  <p className="text-xl font-bold">{performance?.requestCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-app-muted">Avg Router (ms)</p>
                  <p className="text-xl font-bold">{performance?.averages?.router ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-app-muted">Avg Tools (ms)</p>
                  <p className="text-xl font-bold">{performance?.averages?.tools ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-app-muted">Avg Synthesis (ms)</p>
                  <p className="text-xl font-bold">{performance?.averages?.synthesis ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-app-muted">Avg Total (ms)</p>
                  <p className="text-xl font-bold">{performance?.averages?.total ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-app-muted">P95 Total (ms)</p>
                  <p className="text-xl font-bold">{performance?.p95?.total ?? '—'}</p>
                </div>
              </div>
              {(performance?.alertCount?.router ?? 0) > 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-4">
                  {performance?.alertCount?.router} router alerts, {performance?.alertCount?.tools} tools alerts,{' '}
                  {performance?.alertCount?.synthesis} synthesis alerts in recent window.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { adminAPI } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';

export function Settings() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';

  const { data: settingsData } = useQuery(
    ['settings', userId],
    () => adminAPI.settings.get(userId) as Promise<Record<string, unknown>>,
    { enabled: !!userId }
  );

  const { data: performanceTeams = [] } = useQuery(
    ['admin', 'performance', 'teams', userId],
    () => adminAPI.performance.teams.getAll(userId) as Promise<unknown[]>,
    { enabled: !!userId }
  );

  const { data: performanceTargets = [] } = useQuery(
    ['admin', 'performance', 'targets', userId],
    () => adminAPI.performance.targets.getAll(userId) as Promise<unknown[]>,
    { enabled: !!userId }
  );

  const { data: performanceMetrics } = useQuery(
    ['admin', 'performance', 'metrics', userId],
    () => adminAPI.performance.metrics.get(userId) as Promise<Record<string, boolean>>,
    { enabled: !!userId }
  );

  const { data: performanceAlerts } = useQuery(
    ['admin', 'performance', 'alerts', userId],
    () => adminAPI.performance.alerts.get(userId) as Promise<Record<string, unknown>>,
    { enabled: !!userId }
  );

  const { data: performanceAudit = [] } = useQuery(
    ['admin', 'performance', 'audit', userId],
    () => adminAPI.performance.audit(userId) as Promise<unknown[]>,
    { enabled: !!userId }
  );

  const settings = settingsData && typeof settingsData === 'object' ? settingsData : {};
  const general = (settings.general as Record<string, string>) ?? {};
  const xp = (settings.xp as Record<string, unknown>) ?? {};
  const notifications = (settings.notifications as Record<string, unknown>) ?? {};
  const security = (settings.security as Record<string, unknown>) ?? {};
  const teamsList = Array.isArray(performanceTeams) ? performanceTeams : [];
  const targetsList = Array.isArray(performanceTargets) ? performanceTargets : [];
  const auditList = Array.isArray(performanceAudit) ? performanceAudit : [];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-app mb-6">System Settings</h1>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="xp">MP & Gamification</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="performance">Performance Management</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="backup">Backup & Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Company name</label>
                <input
                  type="text"
                  defaultValue={general.companyName}
                  className="input-theme w-full max-w-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Timezone</label>
                <select defaultValue={general.timezone} className="input-theme w-full max-w-md">
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New York</option>
                  <option value="Europe/London">Europe/London</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Primary color</label>
                <input
                  type="text"
                  defaultValue={general.primaryColor}
                  className="input-theme w-full max-w-xs"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="xp" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>MP & Gamification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" defaultChecked={Boolean(xp.leaderboardEnabled)} className="rounded" />
                <span className="text-sm text-app-muted">Leaderboard enabled</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Global MP multiplier</label>
                <input
                  type="number"
                  step={0.1}
                  defaultValue={(xp.globalMultiplier ?? 1).toString()}
                  className="input-theme w-full max-w-xs"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" defaultChecked={Boolean(notifications.emailEnabled)} className="rounded" />
                <span className="text-sm text-app-muted">Email notifications</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" defaultChecked={Boolean(notifications.inAppEnabled)} className="rounded" />
                <span className="text-sm text-app-muted">In-app notifications</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Digest frequency</label>
                <select defaultValue={String(notifications.digestFrequency ?? 'daily')} className="input-theme w-full max-w-xs">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="never">Never</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" defaultChecked={Boolean(security.requireMFA)} className="rounded" />
                <span className="text-sm text-app-muted">Require MFA (mock)</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Session timeout (minutes)</label>
                <input
                  type="number"
                  defaultValue={(security.sessionTimeoutMinutes ?? 60).toString()}
                  className="input-theme w-full max-w-xs"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="mt-0">
          <Tabs defaultValue="teams" className="space-y-4">
            <TabsList className="flex flex-wrap gap-1">
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="targets">Targets</TabsTrigger>
              <TabsTrigger value="assignments">Assignments</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
              <TabsTrigger value="alerts">Alerts</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </TabsList>
            <TabsContent value="teams" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Performance Teams</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-app-muted mb-4">Configure performance teams (e.g. Enterprise Sales, Wholesale SMS).</p>
                  <ul className="space-y-2">
                    {teamsList.map((t) => {
                      const row = t as Record<string, unknown>;
                      return (
                      <li key={String(row.id)} className="flex items-center justify-between py-2 border-b border-app-border last:border-0">
                        <span className="font-medium text-app">{String(row.teamName ?? row.team_name ?? row.teamCode ?? row.team_code ?? row.id)}</span>
                        <span className="text-sm text-app-muted">{String(row.teamCode ?? row.team_code ?? '')}</span>
                      </li>
                    ); })}
                  </ul>
                  {teamsList.length === 0 && <p className="text-sm text-app-muted">No teams configured. Use API to create teams.</p>}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="targets" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Performance Targets</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-app-muted mb-4">Set company, team, and member targets by period.</p>
                  {targetsList.length === 0 ? (
                    <p className="text-sm text-app-muted">No targets set. Use API to create targets.</p>
                  ) : (
                    <ul className="space-y-2">
                      {targetsList.map((t) => {
                        const row = t as Record<string, unknown>;
                        return (
                          <li key={String(row.id)} className="py-2 border-b border-app-border last:border-0 text-app text-sm">
                            {String(row.entityType ?? row.entity_type)} · {String(row.periodStart ?? row.period_start)} – {String(row.periodEnd ?? row.period_end)}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="assignments" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Team Assignments</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-app-muted">Assign employees to performance teams and set roles. Select a team above or use API.</p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="metrics" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Metrics Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-app-muted">Enable or disable global metrics (revenue, SMS, mail, conversion rate, etc.).</p>
                  {performanceMetrics && typeof performanceMetrics === 'object' && (
                    <ul className="space-y-2">
                      {Object.entries(performanceMetrics).map(([key, enabled]) => (
                        <li key={key} className="flex items-center gap-2">
                          <input type="checkbox" defaultChecked={!!enabled} className="rounded" />
                          <span className="text-app capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(!performanceMetrics || typeof performanceMetrics !== 'object') && (
                    <p className="text-sm text-app-muted">Load metrics config from API.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="alerts" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Thresholds & Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-app-muted mb-4">Configure status thresholds (e.g. exceeding ≥105%, on target 90–104%) and notification rules.</p>
                  {performanceAlerts && typeof performanceAlerts === 'object' && Object.keys(performanceAlerts).length > 0 ? (
                    <pre className="text-xs text-app-muted bg-app-surface-tertiary p-3 rounded-lg overflow-auto">{JSON.stringify(performanceAlerts, null, 2)}</pre>
                  ) : (
                    <p className="text-sm text-app-muted">No alert rules set. Use API to configure.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="reports" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Reports & Export</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-app-muted mb-4">Generate and export performance reports (PDF, Excel, CSV).</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => userId && adminAPI.performance.export(userId, { format: 'csv' }).then(() => {})}>Export CSV</Button>
                    <Button variant="secondary" onClick={() => userId && adminAPI.performance.export(userId, { format: 'json' }).then(() => {})}>Export JSON</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="audit" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Performance Audit Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-app-muted mb-4">Recent performance-related actions (team/target/member changes).</p>
                  {auditList.length === 0 ? (
                    <p className="text-sm text-app-muted">No performance audit entries yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-app-border">
                            <th className="text-left py-2 text-app-muted font-medium">Timestamp</th>
                            <th className="text-left py-2 text-app-muted font-medium">Action</th>
                            <th className="text-left py-2 text-app-muted font-medium">Entity</th>
                            <th className="text-left py-2 text-app-muted font-medium">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditList.slice(0, 20).map((entry, i) => {
                            const e = entry as Record<string, unknown>;
                            return (
                            <tr key={i} className="border-b border-app-border last:border-0">
                              <td className="py-2 text-app-muted">{String(e.timestamp ?? '')}</td>
                              <td className="py-2 text-app">{String(e.action ?? '')}</td>
                              <td className="py-2 text-app">{String(e.entityType ?? '')} / {String(e.entityId ?? '')}</td>
                              <td className="py-2 text-app-muted">{String(e.description ?? '')}</td>
                            </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="integrations" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-app-muted">Integration cards placeholder. (Slack, SSO, etc.)</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Backup & Maintenance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-app-muted mb-4">Last backup: —</p>
              <Button variant="secondary">Run backup now</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-6">
        <Button variant="primary">Save all settings</Button>
      </div>
    </div>
  );
}

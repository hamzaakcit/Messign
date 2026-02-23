import { useState, Fragment } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { adminAPI } from '@/lib/api';
import type { AuditLog } from '@/admin/types';
import { format } from 'date-fns';
import { Download, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';

export function AuditLogs() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: logsData, isLoading } = useQuery(
    ['audit-logs', userId, actionFilter, entityFilter],
    () =>
      adminAPI.auditLogs.get(userId, {
        action: actionFilter || undefined,
        entityType: entityFilter || undefined,
        limit: 50,
      }) as Promise<AuditLog[]>,
    { enabled: !!userId }
  );

  const logs = Array.isArray(logsData) ? logsData : [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-app">Audit Logs</h1>
        <Button variant="secondary" className="gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm text-app-muted mb-1">Action type</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="select-theme text-sm py-2 px-3 w-auto min-w-[180px]"
            >
              <option value="">All</option>
              <option value="employee.updated">Employee updated</option>
              <option value="employee.created">Employee created</option>
              <option value="employee.deleted">Employee deleted</option>
              <option value="xp.adjusted">MP adjusted</option>
              <option value="department.created">Department created</option>
              <option value="settings.updated">Settings updated</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-1">Entity type</label>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="select-theme text-sm py-2 px-3 w-auto min-w-[180px]"
            >
              <option value="">All</option>
              <option value="employee">Employee</option>
              <option value="department">Department</option>
              <option value="role">Role</option>
              <option value="settings">Settings</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log entries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-app-muted">Loading audit logs...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-app-border text-left text-app-muted">
                    <th className="py-2 px-3 w-8" />
                    <th className="py-2 px-3">Timestamp</th>
                    <th className="py-2 px-3">Admin</th>
                    <th className="py-2 px-3">Action</th>
                    <th className="py-2 px-3">Entity</th>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <Fragment key={log.id}>
                      <tr className="border-b border-app-border hover:bg-app-surface-tertiary">
                        <td className="py-2 px-3">
                          {log.changes && Object.keys(log.changes).length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                              className="p-0.5 rounded hover:bg-app-hover"
                              aria-label={expandedId === log.id ? 'Collapse' : 'Expand'}
                            >
                              {expandedId === log.id ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <span className="w-4 inline-block" />
                          )}
                        </td>
                        <td className="py-2 px-3 text-app-muted">
                          {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm')}
                        </td>
                        <td className="py-2 px-3 text-app">{log.adminId}</td>
                        <td className="py-2 px-3 text-app">{log.action}</td>
                        <td className="py-2 px-3 text-app-muted">
                          {log.entityType} / {log.entityId}
                        </td>
                        <td className="py-2 px-3 text-app-muted">{log.description}</td>
                        <td className="py-2 px-3 text-app-muted text-xs">{log.ipAddress ?? '—'}</td>
                      </tr>
                      {expandedId === log.id && log.changes && (
                        <tr className="border-b border-app-border bg-app-surface-tertiary">
                          <td colSpan={7} className="py-3 px-4">
                            <div className="text-xs space-y-2">
                              <p className="font-medium text-app-muted">Changes</p>
                              <pre className="bg-app-surface-tertiary p-3 rounded overflow-x-auto text-app">
                                {JSON.stringify(log.changes, null, 2)}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!isLoading && logs.length === 0 && (
            <p className="text-app-muted py-8 text-center">No audit logs match your filters.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

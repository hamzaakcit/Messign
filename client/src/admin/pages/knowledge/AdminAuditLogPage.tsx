import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { API_ORIGIN } from '@/lib/api';

interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export function AdminAuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('auth-token');
    if (token) {
      try { const p = JSON.parse(token); headers['Authorization'] = `Bearer ${p?.state?.accessToken ?? p}`; } catch { headers['Authorization'] = `Bearer ${token}`; }
    }

    fetch(`${API_ORIGIN}/api/admin/audit?limit=100`, { headers, signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        const rows = Array.isArray(data) ? data : (data?.data ?? []);
        if (!controller.signal.aborted) setEntries(rows);
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-app-text mb-6 flex items-center gap-2"><ScrollText className="w-5 h-5 text-orange-400" /> Knowledge Audit Log</h1>

      {loading ? (
        <div className="text-center py-10 text-app-muted">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 text-app-muted">
          <ScrollText className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-lg">Audit log is empty</p>
          <p className="text-sm mt-1">Actions will be recorded here as users interact with the Knowledge Hub</p>
        </div>
      ) : (
        <div className="rounded-xl border border-app-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-app-sidebar text-xs text-app-muted uppercase">
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Entity</th>
                <th className="text-left px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {entries.map(entry => (
                <tr key={entry.id} className="bg-app-sidebar/50">
                  <td className="px-4 py-2 text-xs text-app-muted">{new Date(entry.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-xs text-app-muted">{entry.user_id}</td>
                  <td className="px-4 py-2 text-xs text-app-text">{entry.action}</td>
                  <td className="px-4 py-2 text-xs text-app-muted">{entry.entity_type}/{entry.entity_id.slice(0, 8)}</td>
                  <td className="px-4 py-2 text-xs text-app-muted">{JSON.stringify(entry.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { adminAPI } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

interface AuditEntry {
  id: string;
  timestamp: string;
  description: string;
  action?: string;
  entityType?: string;
}

interface RightSidebarActivityProps {
  userId: string;
}

export function RightSidebarActivity({ userId }: RightSidebarActivityProps) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);

  useEffect(() => {
    if (!userId) return;
    adminAPI.auditLogs
      .get(userId, { limit: 10 })
      .then((data) => setLogs((Array.isArray(data) ? data : []) as AuditEntry[]))
      .catch(() => setLogs([]));
  }, [userId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Recent MP and badge activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 max-h-48 overflow-y-auto">
          {logs.length === 0 ? (
            <li className="text-sm text-gray-500">No recent activity</li>
          ) : (
            logs.map((log) => (
              <li key={log.id} className="text-sm text-gray-400">
                <span>{log.description}</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                </span>
              </li>
            ))
          )}
        </ul>
        <Link to="/admin/audit-logs" className="text-sm text-primary-400 hover:text-primary-300 mt-2 inline-block">
          View all activity
        </Link>
      </CardContent>
    </Card>
  );
}

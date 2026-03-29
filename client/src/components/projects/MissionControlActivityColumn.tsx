import { useEffect, useMemo, useState } from 'react';
import { Radio } from 'lucide-react';
import { activitiesAPI } from '@/lib/api';
import type { MarketplaceProject } from '@/lib/projectsApi';
import type { Task } from '@/types';
import { useUsersStore } from '@/stores/usersStore';
import { PresenceAvatar } from '@/components/chat/PresenceAvatar';
import { cn } from '@/lib/utils';

interface ActivityRow {
  id?: string;
  message?: string;
  type?: string;
  timestamp?: string;
  created_at?: string;
  userId?: string;
  user_id?: string;
}

export interface MissionControlActivityColumnProps {
  activeProjects: MarketplaceProject[];
  tasks: Task[];
  taskProjectIds: Set<string>;
  className?: string;
}

/**
 * Right rail: recent platform activity (filtered to project context) and team presence.
 */
export function MissionControlActivityColumn({
  activeProjects,
  tasks,
  taskProjectIds,
  className,
}: MissionControlActivityColumnProps): JSX.Element {
  const getUserById = useUsersStore((s) => s.getUserById);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const projectNames = useMemo(
    () => new Set(activeProjects.filter((p) => taskProjectIds.has(p.id)).map((p) => p.name.toLowerCase())),
    [activeProjects, taskProjectIds],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    activitiesAPI
      .getRecent(40)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? (data as ActivityRow[]) : [];
        setRows(list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (projectNames.size === 0) return rows.slice(0, 12);
    const needle = [...projectNames];
    return rows
      .filter((r) => {
        const msg = (r.message ?? '').toLowerCase();
        return needle.some((n) => n.length > 0 && (msg.includes(n) || msg.includes('task')));
      })
      .slice(0, 12);
  }, [rows, projectNames]);

  const teamIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks) {
      if (!taskProjectIds.has(t.projectId)) continue;
      for (const a of t.assignees) s.add(a);
    }
    for (const p of activeProjects) {
      if (!taskProjectIds.has(p.id)) continue;
      for (const uid of p.team ?? []) s.add(uid);
    }
    return [...s].slice(0, 16);
  }, [tasks, activeProjects, taskProjectIds]);

  return (
    <aside
      className={cn(
        'flex flex-col min-h-0 min-w-0 border-l border-app-border bg-app-surface-tertiary/40 backdrop-blur-[2px]',
        className,
      )}
      aria-label="Activity and team"
    >
      <div className="shrink-0 px-3 py-2 border-b border-app-border flex items-center gap-2">
        <Radio className="w-3.5 h-3.5 text-primary-400" aria-hidden />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Live</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4 text-[13px]">
        <div>
          <p className="text-[10px] font-medium text-app-muted uppercase tracking-wide mb-2">Team</p>
          <div className="flex flex-wrap gap-1.5">
            {teamIds.length === 0 ? (
              <span className="text-[11px] text-app-muted">No assignees yet</span>
            ) : (
              teamIds.map((id) => {
                const u = getUserById(id);
                if (!u) {
                  return (
                    <span
                      key={id}
                      className="w-7 h-7 rounded-full bg-app-hover border border-app-border text-[10px] flex items-center justify-center text-app-muted"
                      title={id}
                    >
                      ?
                    </span>
                  );
                }
                return <PresenceAvatar key={id} user={u} size="sm" />;
              })
            )}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-medium text-app-muted uppercase tracking-wide mb-2">Activity</p>
          {loading ? (
            <p className="text-[11px] text-app-muted">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-[11px] text-app-muted">No recent activity</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((r, i) => {
                const ts = r.timestamp ?? r.created_at ?? '';
                const timeShort = ts ? new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                return (
                  <li key={r.id ?? `${i}-${r.message?.slice(0, 20)}`} className="text-[11px] text-app leading-snug border-b border-app-border/40 pb-2 last:border-0">
                    <span className="text-app-muted block text-[10px] mb-0.5">{timeShort}</span>
                    {r.message ?? r.type ?? 'Activity'}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

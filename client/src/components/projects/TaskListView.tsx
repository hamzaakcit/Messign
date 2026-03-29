import { useMemo } from 'react';
import { LayoutList } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import type { Task, TaskStatus } from '@/types';
import { formatDate, getPriorityColor, cn } from '@/lib/utils';
import { Badge } from '@/components/ui';

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

export interface TaskListViewProps {
  tasks: Task[];
  getProjectName?: (projectId: string) => string | undefined;
  onSelectProject?: (projectId: string) => void;
  compact?: boolean;
}

/**
 * Dense list alternative to Kanban; status changes call the same updateTaskStatus as DnD.
 */
export function TaskListView({ tasks, getProjectName, onSelectProject, compact }: TaskListViewProps): JSX.Element {
  const updateTaskStatus = useProjectStore((s) => s.updateTaskStatus);
  const user = useAuthStore((s) => s.user);

  const sorted = useMemo(() => [...tasks].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')), [tasks]);

  return (
    <div className="h-full min-h-0 overflow-auto rounded-lg border border-app-border bg-app-sidebar/40">
      <div className="sticky top-0 z-[1] flex items-center gap-2 px-2 py-1.5 border-b border-app-border bg-app-surface-tertiary/90 backdrop-blur-sm text-[10px] uppercase tracking-wide text-app-muted">
        <LayoutList className="w-3.5 h-3.5" aria-hidden />
        List
      </div>
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-app-border text-[10px] text-app-muted uppercase tracking-wide">
            <th className="px-2 py-1.5 font-medium">Task</th>
            <th className="px-2 py-1.5 font-medium w-[120px]">Status</th>
            <th className="px-2 py-1.5 font-medium w-[90px]">Due</th>
            <th className="px-2 py-1.5 font-medium w-[72px]">Pri</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((task) => (
            <tr key={task.id} className="border-b border-app-border/60 hover:bg-app-hover/30">
              <td className="px-2 py-1 align-top">
                <div className={cn('text-app', compact && 'text-[13px]')}>{task.title}</div>
                {getProjectName && onSelectProject && (
                  <button
                    type="button"
                    className="text-[10px] text-primary-400 hover:text-primary-300 truncate max-w-[12rem] block text-left"
                    onClick={() => onSelectProject(task.projectId)}
                  >
                    {getProjectName(task.projectId) ?? task.projectId}
                  </button>
                )}
              </td>
              <td className="px-2 py-1 align-top">
                <select
                  value={task.status}
                  disabled={!user}
                  onChange={(e) => {
                    const next = e.target.value as TaskStatus;
                    if (user) void updateTaskStatus(task.id, next, user.id);
                  }}
                  className="w-full h-7 rounded-md bg-app-surface-tertiary border border-app-border px-1 text-[11px] text-app"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-1 text-[11px] text-app-muted align-top whitespace-nowrap">
                {task.dueDate ? formatDate(task.dueDate) : '—'}
              </td>
              <td className="px-2 py-1 align-top">
                <Badge className={cn('text-[9px]', getPriorityColor(task.priority))}>{task.priority}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && <p className="p-4 text-[12px] text-app-muted text-center">No tasks</p>}
    </div>
  );
}

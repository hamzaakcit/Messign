import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui';
import { useDoraStore } from '@/stores/doraStore';
import type { Task, TaskStatus } from '@/types';

export interface ProjectOptimizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  projectLabel?: string;
}

function buildPrompt(tasks: Task[], projectLabel?: string): string {
  const byStatus = (tasks as Task[]).reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<TaskStatus, number>,
  );
  const overdue = tasks.filter((t) => {
    if (!t.dueDate || t.status === 'done') return false;
    return new Date(t.dueDate) < new Date(new Date().toDateString());
  });
  const urgentReview = tasks.filter((t) => t.status === 'review' && (t.priority === 'urgent' || t.priority === 'high'));
  const ctx = projectLabel ? `Project focus: ${projectLabel}.` : 'Projects workspace.';
  return `${ctx} Task counts by column: todo ${byStatus.todo ?? 0}, in_progress ${byStatus.in_progress ?? 0}, review ${byStatus.review ?? 0}, done ${byStatus.done ?? 0}. Overdue: ${overdue.length}. High-priority in review: ${urgentReview.length}. Suggest concrete next steps to reduce bottlenecks and improve flow.`;
}

/**
 * Client-side bottleneck summary with optional handoff to Dora chat.
 */
export function ProjectOptimizationDialog({ open, onOpenChange, tasks, projectLabel }: ProjectOptimizationDialogProps): JSX.Element {
  const navigate = useNavigate();
  const createSession = useDoraStore((s) => s.createSession);
  const setActiveSession = useDoraStore((s) => s.setActiveSession);

  const report = useMemo(() => {
    const total = tasks.length;
    const byStatus = tasks.reduce(
      (acc, t) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const overdue = tasks.filter((t) => {
      if (!t.dueDate || t.status === 'done') return false;
      return new Date(t.dueDate) < new Date(new Date().toDateString());
    });
    const stuckReview = tasks.filter((t) => t.status === 'review');
    const wip = tasks.filter((t) => t.status === 'in_progress').length;
    return { total, byStatus, overdue, stuckReview: stuckReview.length, wip };
  }, [tasks]);

  const openInDora = () => {
    const session = createSession('Project optimization');
    setActiveSession(session.id);
    onOpenChange(false);
    navigate('/dora');
    const prompt = buildPrompt(tasks, projectLabel);
    window.setTimeout(() => {
      const input = document.querySelector<HTMLTextAreaElement>('[data-dora-input]');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(input, prompt);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border border-app-border">
        <DialogHeader>
          <DialogTitle>Optimization scan</DialogTitle>
          <DialogDescription>
            Heuristic snapshot of your visible tasks. Attachments are not analyzed (not stored on tasks yet).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-[13px] text-app">
          <p>
            <span className="text-app-muted">Total tasks:</span> {report.total}
          </p>
          <ul className="list-disc pl-4 space-y-0.5 text-[12px] text-app-muted">
            {Object.entries(report.byStatus).map(([k, v]) => (
              <li key={k}>
                {k}: <span className="text-app tabular-nums">{v}</span>
              </li>
            ))}
          </ul>
          <p className="text-amber-400/90">
            Overdue: {report.overdue.length}
            {report.overdue.length > 0 && (
              <span className="block text-[11px] text-app-muted mt-1">
                {report.overdue.slice(0, 3).map((t) => t.title).join(' · ')}
                {report.overdue.length > 3 ? '…' : ''}
              </span>
            )}
          </p>
          <p>
            <span className="text-app-muted">In review:</span> {report.stuckReview}{' '}
            <span className="text-app-muted">· In progress (WIP):</span> {report.wip}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" variant="primary" className="gap-1.5" onClick={openInDora}>
            Open in Dora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

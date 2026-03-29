import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button, Input } from '@/components/ui';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import type { MarketplaceProject } from '@/lib/projectsApi';
import type { TaskPriority } from '@/types';

export interface CreateTaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeProjects: MarketplaceProject[];
  defaultProjectId: string | null;
}

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

/**
 * Sheet to create a task via existing POST /tasks and projectStore.addTask.
 */
export function CreateTaskSheet({ open, onOpenChange, activeProjects, defaultProjectId }: CreateTaskSheetProps): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const addTask = useProjectStore((s) => s.addTask);
  const fetchTasks = useProjectStore((s) => s.fetchTasks);

  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDueDate('');
    setProjectId(defaultProjectId ?? (activeProjects[0]?.id ?? ''));
  };

  const handleOpen = (o: boolean) => {
    if (o) {
      setProjectId(defaultProjectId ?? activeProjects[0]?.id ?? '');
    } else {
      reset();
    }
    onOpenChange(o);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      toast.error('Sign in required');
      return;
    }
    if (!projectId || !title.trim()) {
      toast.error('Project and title are required');
      return;
    }
    setSubmitting(true);
    try {
      await addTask({
        projectId,
        title: title.trim(),
        description: description.trim(),
        status: 'todo',
        assignees: [user.id],
        tags: [],
        dueDate: dueDate || undefined,
        priority,
        xpReward: 50,
      });
      toast.success('Task created');
      void fetchTasks();
      handleOpen(false);
    } catch {
      toast.error('Could not create task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetContent side="right" className="sm:max-w-md w-full">
        <SheetHeader>
          <SheetTitle>New task</SheetTitle>
          <SheetDescription className="text-[12px] text-app-muted">
            Creates a task in the selected project. Attachments are not supported yet.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="flex flex-col gap-3 mt-2 text-[13px]">
          <div>
            <label className="text-[11px] text-app-muted block mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              className="w-full h-9 rounded-md bg-app-surface-tertiary border border-app-border px-2 text-app"
            >
              <option value="" disabled>
                Select project
              </option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-app-muted block mb-1">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Task title" className="h-9 text-[13px]" />
          </div>
          <div>
            <label className="text-[11px] text-app-muted block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md bg-app-surface-tertiary border border-app-border px-2 py-1.5 text-app text-[13px]"
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-app-muted block mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full h-9 rounded-md bg-app-surface-tertiary border border-app-border px-2 text-[13px]"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-app-muted block mb-1">Due</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9 text-[13px]" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-app-border mt-2">
            <Button type="button" variant="ghost" onClick={() => handleOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

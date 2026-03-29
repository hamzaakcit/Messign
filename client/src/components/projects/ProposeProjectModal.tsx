import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { projectsAPI, departmentsAPI, type RecruitmentSlot } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const DEPARTMENTS = ['engineering', 'design', 'product', 'marketing', 'sales', 'operations'] as const;

type ProjectKind = 'project' | 'side_op' | 'mspd';
const PROJECT_KINDS: { value: ProjectKind; label: string }[] = [
  { value: 'project', label: 'Project' },
  { value: 'side_op', label: 'Side Ops' },
  { value: 'mspd', label: 'MSPD' },
];

const SIDE_OPS_MAX_PEOPLE = 2;

interface ProposeProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ProposeProjectModal({ isOpen, onClose, onSuccess }: ProposeProjectModalProps) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [projectKind, setProjectKind] = useState<ProjectKind>('project');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<string>('product');
  const [dueDate, setDueDate] = useState('');
  const [xpReward, setXpReward] = useState<number | ''>(100);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | ''>('');
  const [slots, setSlots] = useState<RecruitmentSlot[]>([{ dept: 'engineering', count: 1, filled: 0 }]);
  const [tagsInput, setTagsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    departmentsAPI
      .getAll()
      .then((list) => setDepartments(Array.isArray(list) ? list : []))
      .catch(() => setDepartments([]));
  }, [isOpen]);

  const departmentOptions: { id: string; name: string }[] =
    departments.length > 0 ? departments : DEPARTMENTS.map((d) => ({ id: d, name: d.charAt(0).toUpperCase() + d.slice(1) }));

  useEffect(() => {
    const values = departmentOptions.map((d) => d.name.toLowerCase());
    if (values.length > 0 && !values.includes(type)) setType(values[0]!);
  }, [departments.length]);

  const reset = () => {
    setProjectKind('project');
    setName('');
    setDescription('');
    setType(departmentOptions[0] ? departmentOptions[0].name.toLowerCase() : 'product');
    setDueDate('');
    setXpReward(100);
    setEstimatedMinutes('');
    setSlots([{ dept: 'engineering', count: 1, filled: 0 }]);
    setTagsInput('');
  };

  const totalSeats = slots.reduce((sum, s) => sum + (s.count ?? 0), 0);
  const canAddSlot = projectKind !== 'side_op' || totalSeats < SIDE_OPS_MAX_PEOPLE;

  const addSlot = () => {
    if (projectKind === 'side_op' && totalSeats >= SIDE_OPS_MAX_PEOPLE) return;
    setSlots((prev) => [...prev, { dept: 'engineering', count: 1, filled: 0 }]);
  };

  const removeSlot = (index: number) => {
    if (slots.length <= 1) return;
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: 'dept' | 'count' | 'default_tasks', value: string | number) => {
    setSlots((prev) => {
      const next = [...prev];
      const slot = { ...next[index]! };
      if (field === 'dept') slot.dept = value as string;
      if (field === 'count') {
        const requested = Math.max(1, Number(value) || 1);
        if (projectKind === 'side_op') {
          const otherTotal = prev.reduce((s, sl, i) => s + (i === index ? 0 : sl.count ?? 0), 0);
          const maxForSlot = Math.max(0, SIDE_OPS_MAX_PEOPLE - otherTotal);
          slot.count = Math.max(1, Math.min(requested, maxForSlot));
        } else {
          slot.count = requested;
        }
      }
      if (field === 'default_tasks') {
        const raw = typeof value === 'string' ? value : '';
        slot.default_tasks = raw.split(',').map((s) => s.trim()).filter(Boolean);
      }
      next[index] = slot;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Project name is required');
      return;
    }
    if (projectKind === 'side_op' && totalSeats > SIDE_OPS_MAX_PEOPLE) {
      toast.error(`Side Ops allow at most ${SIDE_OPS_MAX_PEOPLE} people.`);
      return;
    }
    setSubmitting(true);
    try {
      const projectTags = tagsInput.trim() ? tagsInput.split(',').map((s) => s.trim()).filter(Boolean) : [];
      const isMspd = projectKind === 'mspd';
      const opportunityType = projectKind === 'side_op' ? 'side_op' : 'project';
      await projectsAPI.createProposal({
        name: name.trim(),
        description: description.trim() || undefined,
        type: type || 'product',
        due_date: dueDate || null,
        xp_reward: typeof xpReward === 'number' ? xpReward : Number(xpReward) || 0,
        recruitment_config: slots.map((s) => ({
          dept: s.dept,
          count: s.count,
          filled: 0,
          ...(Array.isArray(s.default_tasks) && s.default_tasks.length > 0 ? { default_tasks: s.default_tasks } : {}),
        })),
        tags: projectTags.length > 0 ? projectTags : undefined,
        opportunity_type: opportunityType,
        is_mspd: isMspd,
        ...(isMspd ? { reward_currency: 'MSP' as const } : {}),
        ...(projectKind === 'side_op' && estimatedMinutes !== '' ? { estimated_minutes: Number(estimatedMinutes) || null } : {}),
      });
      toast.success(
        isAdmin
          ? 'Project created and published to marketplace.'
          : 'Project proposed. It will appear in the marketplace after admin approval.'
      );
      reset();
      onClose();
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to propose project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[min(90vh,800px)] max-w-2xl overflow-y-auto rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-compact">Propose Project</DialogTitle>
        </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app mb-1">What kind of project?</label>
          <div className="flex flex-wrap gap-2">
            {PROJECT_KINDS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setProjectKind(opt.value)}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  projectKind === opt.value
                    ? opt.value === 'mspd'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : opt.value === 'side_op'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                        : 'bg-app-nav-active-bg text-app-nav-active-text border border-app-border'
                    : 'bg-app-surface-tertiary text-app-muted border border-transparent hover:text-app hover:border-app-border'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-app-muted mt-1">
            {projectKind === 'project' && 'Standard team project with recruitment slots.'}
            {projectKind === 'side_op' && 'Short-term tasks for up to 2 people (Side Ops).'}
            {projectKind === 'mspd' && 'Messign Special Projects Division — premium tier, MSP rewards.'}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-app mb-1">Name *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            required
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the project"
            rows={3}
            className={cn(
              'input-theme w-full resize-none rounded-lg px-3 py-2 text-sm',
              'placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-primary-500'
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-app mb-1">Department</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="input-theme w-full px-3 py-2 rounded-lg text-sm"
            >
              {departmentOptions.map((dept) => {
                const value = dept.name.toLowerCase();
                return (
                  <option key={dept.id} value={value}>
                    {dept.name}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-app mb-1">Due date</label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full"
            />
          </div>
          {projectKind === 'side_op' && (
            <div>
              <label className="block text-sm font-medium text-app mb-1">Estimated minutes (optional)</label>
              <Input
                type="number"
                min={0}
                value={estimatedMinutes === '' ? '' : estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                placeholder="e.g. 60"
                className="w-full max-w-[120px]"
              />
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-app mb-1">MP reward (optional)</label>
          <Input
            type="number"
            min={0}
            value={xpReward === '' ? '' : xpReward}
            onChange={(e) => setXpReward(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
            placeholder="100"
            className="w-full max-w-[120px]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-app">
              Open positions (slots)
              {projectKind === 'side_op' && (
                <span className="ml-2 text-xs font-normal text-app-muted">max {SIDE_OPS_MAX_PEOPLE} people</span>
              )}
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={addSlot} className="gap-1" disabled={!canAddSlot}>
              <Plus className="w-3.5 h-3.5" /> Add slot
            </Button>
          </div>
          <div className="space-y-2">
            {slots.map((slot, index) => (
              <div key={index} className="space-y-1.5 p-2 rounded-lg bg-app-surface-tertiary border border-app-border">
                <div className="flex items-center gap-2">
                  <select
                    value={slot.dept}
                    onChange={(e) => updateSlot(index, 'dept', e.target.value)}
                    className="input-theme flex-1 min-w-0 px-2 py-1.5 rounded text-sm capitalize"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={1}
                    value={slot.count}
                    onChange={(e) => updateSlot(index, 'count', e.target.value)}
                    className="w-16 text-center"
                  />
                  <span className="text-xs text-app-muted shrink-0">seats</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSlot(index)}
                    disabled={slots.length <= 1}
                    className="p-1.5 text-app-muted hover:text-red-400"
                    aria-label="Remove slot"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-app-muted mb-1">Starter tasks (comma-separated)</label>
                  <Input
                    placeholder="e.g. Read Docs, Setup Env"
                    value={Array.isArray(slot.default_tasks) ? slot.default_tasks.join(', ') : ''}
                    onChange={(e) => updateSlot(index, 'default_tasks', e.target.value)}
                    className="w-full text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-app mb-1">Skill tags (optional)</label>
          <Input
            placeholder="e.g. React, Marketing (comma-separated)"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full"
          />
        </div>

        {!isAdmin && (
          <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            As an employee, your proposal will be submitted for admin approval before it appears in the marketplace.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-app-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Submitting…' : isAdmin ? 'Create project' : 'Propose project'}
          </Button>
        </div>
      </form>
      </DialogContent>
    </Dialog>
  );
}

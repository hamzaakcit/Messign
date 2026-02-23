import { useState } from 'react';
import { toast } from 'sonner';
import { bountiesAPI } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { Modal } from '@/components/ui';

const CATEGORIES = [
  { value: 'DESIGN', label: '🎨 Design' },
  { value: 'CONTENT', label: '✍️ Content' },
  { value: 'DEVELOPMENT', label: '💻 Development' },
  { value: 'DATA', label: '📊 Data' },
  { value: 'RESEARCH', label: '🔍 Research' },
  { value: 'ADMIN', label: '📋 Admin' },
  { value: 'OTHER', label: '📦 Other' },
] as const;

const URGENCIES = [
  { value: 'LOW', label: '⚪ Low (within a week)' },
  { value: 'NORMAL', label: '🔵 Normal (2-3 days)' },
  { value: 'HIGH', label: '🟠 High (24 hours)' },
  { value: 'CRITICAL', label: '🔴 Critical (ASAP)' },
] as const;

interface CreateBountyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateBountyModal({ isOpen, onClose, onSuccess }: CreateBountyModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('DEVELOPMENT');
  const [xpReward, setXpReward] = useState<number | ''>(50);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | ''>(60);
  const [urgency, setUrgency] = useState<string>('NORMAL');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle('');
    setDescription('');
    setCategory('DEVELOPMENT');
    setXpReward(50);
    setEstimatedMinutes(60);
    setUrgency('NORMAL');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || title.length < 5) {
      toast.error('Title must be at least 5 characters');
      return;
    }
    if (!description.trim() || description.length < 10) {
      toast.error('Description must be at least 10 characters');
      return;
    }
    setSubmitting(true);
    try {
      await bountiesAPI.create({
        title: title.trim(),
        description: description.trim(),
        category,
        xpReward: typeof xpReward === 'number' ? xpReward : Number(xpReward) || 50,
        estimatedMinutes: typeof estimatedMinutes === 'number' ? estimatedMinutes : Number(estimatedMinutes) || 60,
        urgency,
      });
      toast.success('Side op posted!');
      reset();
      onClose();
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post Side Op');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Post Side Op" size="lg" forceDark>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app mb-1">Title *</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short, clear title (5-100 chars)"
            required
            minLength={5}
            maxLength={100}
            className="bg-app-surface border-app-border"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app mb-1">Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What needs to be done (10-2000 chars)"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            className="input-theme w-full resize-none rounded-lg px-3 py-2 min-h-[100px] focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-app mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="select-theme w-full rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-app mb-1">Urgency</label>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              className="select-theme w-full rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              {URGENCIES.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-app mb-1">MP Reward</label>
            <Input
              type="number"
              min={10}
              max={200}
              value={xpReward}
              onChange={(e) => setXpReward(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="50"
              className="bg-app-surface border-app-border"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-app mb-1">Est. time (minutes)</label>
            <Input
              type="number"
              min={15}
              max={480}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="60"
              className="bg-app-surface border-app-border"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Posting…' : 'Post Side Op'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

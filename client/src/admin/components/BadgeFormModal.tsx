import { useState, useEffect } from 'react';
import { Modal, Button } from '@/components/ui';
import { toast } from 'sonner';
import { adminAPI } from '@/lib/api';
import type { Badge } from '@/types';

const RARITIES: Badge['rarity'][] = ['common', 'rare', 'epic', 'legendary'];
const TYPES: Badge['type'][] = ['achievement', 'skill', 'milestone'];
const ICONS = ['award', 'rocket', 'check-circle', 'crown', 'star', 'zap', 'trophy', 'target', 'message-circle', 'code'];

interface BadgeFormModalProps {
  badge: Badge | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}

export function BadgeFormModal({ badge, isOpen, onClose, onSaved, userId }: BadgeFormModalProps) {
  const [name, setName] = useState(badge?.name ?? '');
  const [icon, setIcon] = useState(badge?.icon ?? 'award');
  const [rarity, setRarity] = useState<Badge['rarity']>(badge?.rarity ?? 'common');
  const [type, setType] = useState<Badge['type']>(badge?.type ?? 'achievement');
  const [description, setDescription] = useState(badge?.description ?? '');
  const [criteria, setCriteria] = useState(badge?.criteria ?? '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (badge) {
      setName(badge.name);
      setIcon(badge.icon ?? 'award');
      setRarity(badge.rarity ?? 'common');
      setType(badge.type ?? 'achievement');
      setDescription(badge.description ?? '');
      setCriteria(badge.criteria ?? '');
    } else {
      setName('');
      setIcon('award');
      setRarity('common');
      setType('achievement');
      setDescription('');
      setCriteria('');
    }
  }, [badge, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setLoading(true);
    try {
      if (badge) {
        await adminAPI.badges.update(userId, badge.id, {
          name: name.trim(),
          icon,
          rarity,
          type,
          description: description.trim(),
          criteria: criteria.trim() || undefined,
        });
        toast.success('Badge updated');
      } else {
        await adminAPI.badges.create(userId, {
          name: name.trim(),
          icon,
          rarity,
          type,
          description: description.trim(),
          criteria: criteria.trim() || undefined,
        });
        toast.success('Badge created');
      }
      onSaved();
      onClose();
    } catch {
      toast.error(badge ? 'Failed to update badge' : 'Failed to create badge');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen onClose={onClose} title={badge ? 'Edit badge' : 'Create badge'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app-muted mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-theme w-full"
            placeholder="Badge name"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-muted mb-1">Icon</label>
          <select value={icon} onChange={(e) => setIcon(e.target.value)} className="select-theme w-full">
            {ICONS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-app-muted mb-1">Rarity</label>
            <select value={rarity} onChange={(e) => setRarity(e.target.value as Badge['rarity'])} className="input-theme w-full">
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-app-muted mb-1">Category</label>
            <select value={type} onChange={(e) => setType(e.target.value as Badge['type'])} className="select-theme w-full">
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-app-muted mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-dark w-full min-h-[80px]"
            placeholder="What this badge represents"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-muted mb-1">Unlock criteria</label>
          <input
            type="text"
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            className="input-theme w-full"
            placeholder="e.g. Complete 25 tasks"
          />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Saving...' : badge ? 'Save' : 'Create badge'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

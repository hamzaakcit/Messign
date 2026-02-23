import { useState, useEffect } from 'react';
import { X, Users, Shield, Zap, Award, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { adminAPI } from '@/lib/api';
import type { Employee } from '@/admin/types';

interface BulkActionModalsProps {
  selectedEmployees: Employee[];
  onClose: () => void;
  onSuccess: () => void;
}

export function ChangeDepartmentModal({
  selectedEmployees,
  onClose,
  onSuccess,
}: BulkActionModalsProps) {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    adminAPI.departments
      .getAll(userId)
      .then((data) => setDepartments((Array.isArray(data) ? data : []) as { id: string; name: string }[]))
      .catch(() => setDepartments([]));
  }, [userId]);

  const handleSubmit = async () => {
    if (!departmentId) {
      toast.error('Please select a department');
      return;
    }
    setLoading(true);
    try {
      await Promise.all(
        selectedEmployees.map((emp) =>
          adminAPI.employees.update(userId, emp.id, { departmentId })
        )
      );
      toast.success(`Updated department for ${selectedEmployees.length} employee(s)`);
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to update department');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-xl p-6 w-full max-w-md border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-primary-400" />
            <h2 className="text-xl font-bold text-app">Change Department</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-app-hover rounded-lg text-gray-400 hover:text-app"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-gray-400 mb-4">
          Updating {selectedEmployees.length} employee(s)
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              New Department
            </label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="input-theme w-full"
            >
              <option value="">Select department...</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-app-surface-tertiary hover:bg-app-hover rounded-lg text-app"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg text-white disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChangeRoleModal({
  selectedEmployees,
  onClose,
  onSuccess,
}: BulkActionModalsProps) {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);

  const roles = ['admin', 'manager', 'member'] as const;

  const handleSubmit = async () => {
    if (!role) {
      toast.error('Please select a role');
      return;
    }
    setLoading(true);
    try {
      await Promise.all(
        selectedEmployees.map((emp) =>
          adminAPI.employees.update(userId, emp.id, { role })
        )
      );
      toast.success(`Updated role for ${selectedEmployees.length} employee(s)`);
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to update role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-xl p-6 w-full max-w-md border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary-400" />
            <h2 className="text-xl font-bold text-app">Change Role</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-app-hover rounded-lg text-gray-400 hover:text-app"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-gray-400 mb-4">
          Updating {selectedEmployees.length} employee(s)
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              New Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="input-theme w-full"
            >
              <option value="">Select role...</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-app-surface-tertiary hover:bg-app-hover rounded-lg text-app"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg text-white disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdjustXPModal({
  selectedEmployees,
  onClose,
  onSuccess,
}: BulkActionModalsProps) {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [xpAmount, setXpAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(true);

  const handleSubmit = async () => {
    const amount = parseInt(xpAmount, 10);
    if (!amount || amount === 0) {
      toast.error('Please enter a valid MP amount');
      return;
    }
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    setLoading(true);
    try {
      await Promise.all(
        selectedEmployees.map((emp) => {
          const currentXp = typeof emp.xp === 'number' ? emp.xp : 0;
          const newXp = Math.max(0, currentXp + (isAdding ? amount : -amount));
          return adminAPI.employees.update(userId, emp.id, { xp: newXp });
        })
      );
      toast.success(
        isAdding
          ? `Added ${amount} MP to ${selectedEmployees.length} employee(s)`
          : `Removed ${amount} MP from ${selectedEmployees.length} employee(s)`
      );
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to adjust MP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-xl p-6 w-full max-w-md border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-bold text-app">Adjust MP</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-app-hover rounded-lg text-gray-400 hover:text-app"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-gray-400 mb-4">
          Adjusting MP for {selectedEmployees.length} employee(s)
        </p>
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium ${
                isAdding ? 'bg-success-500 text-app' : 'bg-app-surface-tertiary text-app-muted hover:bg-white/10'
              }`}
            >
              Add MP
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium ${
                !isAdding ? 'bg-danger-500 text-app' : 'bg-app-surface-tertiary text-app-muted hover:bg-white/10'
              }`}
            >
              Remove MP
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Amount
            </label>
            <input
              type="number"
              min="1"
              value={xpAmount}
              onChange={(e) => setXpAmount(e.target.value)}
              placeholder="Enter MP amount..."
              className="input-theme w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Reason *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you adjusting MP?"
              rows={3}
              className="input-theme w-full resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-app-surface-tertiary hover:bg-app-hover rounded-lg text-app"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 rounded-lg text-white disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Adjust MP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AwardBadgeModal({
  selectedEmployees,
  onClose,
  onSuccess,
}: BulkActionModalsProps) {
  const [selectedBadge, setSelectedBadge] = useState('');
  const [loading, setLoading] = useState(false);

  const badges = [
    { id: '1', name: 'First Steps', icon: '🚀' },
    { id: '2', name: 'Task Master', icon: '✅' },
    { id: '3', name: 'Code Wizard', icon: '⚡' },
    { id: '4', name: 'Team Player', icon: '👥' },
  ];

  const handleSubmit = async () => {
    if (!selectedBadge) {
      toast.error('Please select a badge');
      return;
    }
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      toast.success(`Awarded badge to ${selectedEmployees.length} employee(s)`);
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to award badge');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-xl p-6 w-full max-w-md border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Award className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-bold text-app">Award Badge</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-app-hover rounded-lg text-gray-400 hover:text-app"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-gray-400 mb-4">
          Awarding badge to {selectedEmployees.length} employee(s)
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Select Badge
            </label>
            <div className="grid grid-cols-2 gap-3">
              {badges.map((badge) => (
                <button
                  key={badge.id}
                  type="button"
                  onClick={() => setSelectedBadge(badge.id)}
                  className={`p-4 rounded-lg border-2 text-center transition-colors ${
                    selectedBadge === badge.id
                      ? 'border-amber-500 bg-amber-500/10 text-app'
                      : 'border-app-border bg-app-surface-tertiary text-app-muted hover:bg-app-hover'
                  }`}
                >
                  <div className="text-3xl mb-2">{badge.icon}</div>
                  <div className="text-sm font-medium">{badge.name}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-app-surface-tertiary hover:bg-app-hover rounded-lg text-app"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 rounded-lg text-white disabled:opacity-50"
            >
              {loading ? 'Awarding...' : 'Award Badge'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SendMessageModal({
  selectedEmployees,
  onClose,
  onSuccess,
}: BulkActionModalsProps) {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await Promise.all(
        selectedEmployees.map((emp) =>
          adminAPI.messages.send(userId, {
            recipientId: emp.id,
            subject: subject.trim(),
            content: message.trim(),
            type: 'admin_announcement',
          })
        )
      );
      toast.success(`Message sent to ${selectedEmployees.length} employee(s)`);
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-xl p-6 w-full max-w-md border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Mail className="w-6 h-6 text-success-400" />
            <h2 className="text-xl font-bold text-app">Send Message</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-app-hover rounded-lg text-gray-400 hover:text-app"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-gray-400 mb-4">
          Sending to {selectedEmployees.length} employee(s)
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Message subject..."
              className="input-theme w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              rows={5}
              className="input-theme w-full resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-app-surface-tertiary hover:bg-app-hover rounded-lg text-app"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-success-500 hover:bg-success-600 rounded-lg text-white disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { X, Hash, Lock } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useUsersStore } from '@/stores/usersStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui';

export function ChannelCreateModal() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'public' | 'private'>('public');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const setChannelCreateOpen = useChatStore((s) => s.setChannelCreateOpen);
  const createChannel = useChatStore((s) => s.createChannel);
  const users = useUsersStore((s) => s.users);
  const currentUser = useAuthStore((s) => s.user);
  const otherUsers = users.filter((u) => u.id !== currentUser?.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createChannel({ name: name.trim(), description: description.trim() || undefined, type, members: selectedMembers });
    } catch {
      // Error toast already shown by store action
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setChannelCreateOpen(false)} />
      <div className="relative w-full max-w-md bg-app-sidebar border border-app rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-app flex items-center justify-between">
          <h3 className="text-lg font-bold text-app">Create Channel</h3>
          <button onClick={() => setChannelCreateOpen(false)} className="p-1 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Type */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('public')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border transition-colors ${
                type === 'public' ? 'border-primary-500 bg-primary-500/10 text-primary-400' : 'border-app text-app-muted hover:border-app-hover'
              }`}
            >
              <Hash className="w-4 h-4" /> Public
            </button>
            <button
              type="button"
              onClick={() => setType('private')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border transition-colors ${
                type === 'private' ? 'border-primary-500 bg-primary-500/10 text-primary-400' : 'border-app text-app-muted hover:border-app-hover'
              }`}
            >
              <Lock className="w-4 h-4" /> Private
            </button>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-app mb-1.5">Channel name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
              placeholder="e.g. marketing-strategy"
              className="w-full px-3 py-2 bg-app-inputBg border border-app-inputBorder rounded-xl text-app text-sm placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-app mb-1.5">Description <span className="text-app-muted font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this channel about?"
              className="w-full px-3 py-2 bg-app-inputBg border border-app-inputBorder rounded-xl text-app text-sm placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
              rows={2}
            />
          </div>

          {/* Members */}
          <div>
            <label className="block text-sm font-medium text-app mb-1.5">Add members</label>
            <div className="max-h-32 overflow-y-auto border border-app rounded-xl divide-y divide-app">
              {otherUsers.map((u) => (
                <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-app-hover cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(u.id)}
                    onChange={() => toggleMember(u.id)}
                    className="rounded border-app text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-sm text-app truncate">{u.name}</span>
                  {u.jobTitle && <span className="text-xs text-app-muted ml-auto">{u.jobTitle}</span>}
                </label>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setChannelCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || loading}>
              {loading ? 'Creating...' : 'Create Channel'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

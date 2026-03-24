import { useState } from 'react';
import { Plus, Shield } from 'lucide-react';
import { Button, Card, Modal } from '@/components/ui';
import { PermissionMatrix } from '@/admin/components/PermissionMatrix';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { adminAPI } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Role, Permission } from '@/admin/types';

export function RolePermissions() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const { data: rolesData, isLoading } = useQuery(
    ['roles', userId],
    () => adminAPI.roles.getAll(userId) as Promise<Role[]>,
    { enabled: !!userId }
  );

  const roles = Array.isArray(rolesData) ? rolesData : [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-app">Roles & Permissions</h1>
        <Button
          variant="primary"
          className="gap-2"
          onClick={() => {
            setSelectedRole(null);
            setModalOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Create Custom Role
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role list */}
        <div className="lg:col-span-1 space-y-2">
          {isLoading ? (
            <p className="text-app-muted">Loading roles...</p>
          ) : (
            roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedRole(role)}
                className={cn(
                  'w-full flex items-center gap-3 p-4 rounded-xl text-left transition-colors',
                  selectedRole?.id === role.id
                    ? 'bg-primary-500/20 border border-primary-500/30'
                    : 'glass-card border border-app-border hover:bg-app-nav-hover'
                )}
              >
                <Shield className="w-5 h-5 text-primary-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-app">{role.name}</p>
                  <p className="text-sm text-app-muted">{role.memberCount} members</p>
                </div>
                {role.isSystem && (
                  <span className="text-xs text-app-muted shrink-0">System</span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Permission matrix */}
        <div className="lg:col-span-2">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-app">
                {selectedRole ? selectedRole.name : 'Select a role'}
              </h2>
              {selectedRole?.description && (
                <span className="text-sm text-app-muted">— {selectedRole.description}</span>
              )}
            </div>
            {selectedRole ? (
              <PermissionMatrix
                permissions={selectedRole.permissions}
                readOnly
              />
            ) : (
              <p className="text-app-muted text-sm">Select a role to view its permissions.</p>
            )}
          </Card>
        </div>
      </div>

      {modalOpen && (
        <CreateRoleModal
          onClose={() => setModalOpen(false)}
          onSaved={() => setModalOpen(false)}
          userId={userId}
        />
      )}
    </div>
  );
}

function CreateRoleModal({
  onClose,
  onSaved,
  userId,
}: {
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<Permission[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminAPI.roles.create(userId, { name, description, permissions });
      onSaved();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Modal isOpen size="lg" onClose={onClose} title="Create Custom Role">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-theme w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-theme w-full min-h-[60px]"
            rows={2}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app mb-2">Permissions</label>
          <PermissionMatrix permissions={permissions} onChange={setPermissions} />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}

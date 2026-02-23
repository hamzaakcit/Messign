import { useState } from 'react';
import { Plus, Pencil, Trash2, Users, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Modal } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { adminAPI } from '@/lib/api';
import { LoadingState } from '@/admin/components/LoadingState';
import type { Department } from '@/admin/types';

export function DepartmentManagement() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  const { data: departmentsData, isLoading, error, refetch } = useQuery(
    ['departments', userId],
    () => adminAPI.departments.getAll(userId) as Promise<Array<{ id: string; name: string; description?: string }>>,
    { enabled: !!userId }
  );

  const rawList = Array.isArray(departmentsData) ? departmentsData : [];
  const departments: Department[] = rawList.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    headId: null,
    parentId: null,
    capacity: 20,
    costCenter: undefined,
  }));

  const handleRemove = async (dept: Department) => {
    if (!userId) return;
    if (!window.confirm(`Remove department "${dept.name}"? This cannot be undone.`)) return;
    try {
      await adminAPI.departments.delete(userId, dept.id);
      toast.success('Department removed');
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove department';
      toast.error(message);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-app">Departments & Teams</h1>
        <Button
          variant="primary"
          className="gap-2"
          onClick={() => {
            setEditingDept(null);
            setModalOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Add Department
        </Button>
      </div>

      {error && departments.length === 0 ? (
        <div className="py-12 text-center" role="alert">
          <p className="font-medium text-app text-danger-400">Failed to load departments</p>
          <p className="text-sm text-app-muted mt-1">{error.message}</p>
          <Button variant="primary" className="mt-4 gap-2" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : isLoading ? (
        <LoadingState message="Loading departments..." />
      ) : departments.length === 0 ? (
        <div className="py-12 text-center text-app-muted" role="status">
          <p className="font-medium text-app">No departments yet</p>
          <p className="text-sm mt-1">Create your first department to get started.</p>
          <Button variant="primary" className="mt-4 gap-2" onClick={() => { setEditingDept(null); setModalOpen(true); }}>
            <Plus className="w-4 h-4" />
            Add Department
          </Button>
        </div>
      ) : (
        <>
          {error ? (
            <div className="mb-4 p-3 rounded-lg bg-danger-500/10 border border-danger-500/30 text-danger-400 text-sm flex items-center justify-between" role="alert">
              <span>Could not refresh list: {error.message}</span>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <Card key={dept.id} className="flex flex-col">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-app">{dept.name}</h3>
                    <p className="text-sm text-app-muted">Head: {dept.headId ?? '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingDept(dept);
                      setModalOpen(true);
                    }}
                    aria-label="Edit department"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(dept)}
                    className="text-danger-400 hover:text-danger-300 hover:bg-danger-500/10"
                    aria-label="Remove department"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {dept.description && (
                <p className="text-sm text-app-muted mt-2 line-clamp-2">{dept.description}</p>
              )}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-app-border">
                <span className="flex items-center gap-1 text-sm text-app-muted">
                  <Users className="w-4 h-4" />
                  Capacity: {dept.capacity}
                </span>
                {dept.costCenter && (
                  <span className="text-xs text-app-muted">{dept.costCenter}</span>
                )}
              </div>
            </Card>
          ))}
          </div>
        </>
      )}

      {modalOpen && (
        <DepartmentModal
          department={editingDept}
          onClose={() => {
            setModalOpen(false);
            setEditingDept(null);
          }}
          onSaved={() => {
            setModalOpen(false);
            setEditingDept(null);
            refetch();
          }}
          userId={userId}
        />
      )}
    </div>
  );
}

function DepartmentModal({
  department,
  onClose,
  onSaved,
  userId,
}: {
  department: Department | null;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}) {
  const [name, setName] = useState(department?.name ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [capacity, setCapacity] = useState(department?.capacity ?? 20);
  const [costCenter, setCostCenter] = useState(department?.costCenter ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (department) {
        await adminAPI.departments.update(userId, department.id, {
          name,
          description,
          capacity,
          costCenter: costCenter || undefined,
        });
        toast.success('Department updated');
      } else {
        await adminAPI.departments.create(userId, {
          name,
          description,
          capacity,
          costCenter: costCenter || undefined,
        });
        toast.success('Department created');
      }
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save department';
      toast.error(message);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={department ? 'Edit Department' : 'Create Department'}>
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
            className="input-theme w-full min-h-[80px]"
            rows={3}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app mb-1">Capacity</label>
          <input
            type="number"
            min={0}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className="input-theme w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app mb-1">Cost center</label>
          <input
            type="text"
            value={costCenter}
            onChange={(e) => setCostCenter(e.target.value)}
            className="input-theme w-full"
          />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {department ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

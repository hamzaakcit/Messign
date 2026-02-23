import { useState, useMemo } from 'react';
import { Gift } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { adminAPI } from '@/lib/api';
import { calculateLevel } from '@/types';
import type { Badge } from '@/types';
import type { Employee } from '@/admin/types';

interface BulkBadgeAwardProps {
  badges: Badge[];
  onAwarded?: () => void;
}

export function BulkBadgeAward({ badges, onAwarded }: BulkBadgeAwardProps) {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [selectedBadgeId, setSelectedBadgeId] = useState('');
  const [recipientMode, setRecipientMode] = useState<'all' | 'department' | 'level'>('all');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [levelMin, setLevelMin] = useState(1);
  const [levelMax, setLevelMax] = useState(10);
  const [loading, setLoading] = useState(false);

  const { data: employeesData } = useQuery(
    ['employees', userId],
    () => adminAPI.employees.getAll(userId) as Promise<Employee[]>,
    { enabled: !!userId }
  );

  const employees = useMemo(() => (Array.isArray(employeesData) ? employeesData : []) as Employee[], [employeesData]);

  const departments = useMemo(() => {
    const set = new Set(employees.map((e) => e.department).filter(Boolean));
    return Array.from(set).sort();
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (recipientMode === 'department' && departmentFilter) {
      list = list.filter((e) => (e.department ?? '') === departmentFilter);
    }
    if (recipientMode === 'level') {
      list = list.filter((e) => {
        const xp = typeof e.xp === 'number' ? e.xp : 0;
        const { level } = calculateLevel(xp);
        return level >= levelMin && level <= levelMax;
      });
    }
    return list;
  }, [employees, recipientMode, departmentFilter, levelMin, levelMax]);

  const handleAward = async () => {
    if (!selectedBadgeId) {
      toast.error('Select a badge');
      return;
    }
    if (filteredEmployees.length === 0) {
      toast.error('No employees selected');
      return;
    }
    setLoading(true);
    try {
      await adminAPI.badges.award(userId, selectedBadgeId, filteredEmployees.map((e) => e.id));
      toast.success(`Awarded badge to ${filteredEmployees.length} employee(s)`);
      setSelectedBadgeId('');
      onAwarded?.();
    } catch {
      toast.error('Failed to award badge');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-amber-400" />
          Award badges in bulk
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-app-muted mb-1">Select badge</label>
          <select
            value={selectedBadgeId}
            onChange={(e) => setSelectedBadgeId(e.target.value)}
            className="input-theme w-full"
          >
            <option value="">Select badge...</option>
            {badges.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.rarity})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-app-muted mb-2">Select recipients</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="badge-recipient"
                checked={recipientMode === 'all'}
                onChange={() => setRecipientMode('all')}
                className="rounded-full"
              />
              <span className="text-sm text-app-muted">All employees ({employees.length})</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="badge-recipient"
                checked={recipientMode === 'department'}
                onChange={() => setRecipientMode('department')}
                className="rounded-full"
              />
              <span className="text-sm text-app-muted">By department:</span>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="input-theme text-sm py-1"
                disabled={recipientMode !== 'department'}
              >
                <option value="">Select...</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="badge-recipient"
                checked={recipientMode === 'level'}
                onChange={() => setRecipientMode('level')}
                className="rounded-full"
              />
              <span className="text-sm text-app-muted">By level:</span>
              <input
                type="number"
                min={1}
                max={30}
                value={levelMin}
                onChange={(e) => setLevelMin(Number(e.target.value) || 1)}
                className="input-theme w-14 text-sm py-1 text-center"
                disabled={recipientMode !== 'level'}
              />
              <span className="text-app-muted">to</span>
              <input
                type="number"
                min={1}
                max={30}
                value={levelMax}
                onChange={(e) => setLevelMax(Number(e.target.value) || 10)}
                className="input-theme w-14 text-sm py-1 text-center"
                disabled={recipientMode !== 'level'}
              />
            </label>
          </div>
          <p className="text-xs text-app-muted mt-1">{filteredEmployees.length} employee(s) selected</p>
        </div>

        <Button
          variant="primary"
          onClick={handleAward}
          disabled={loading || !selectedBadgeId || filteredEmployees.length === 0}
          className="gap-2"
        >
          <Gift className="w-4 h-4" />
          {loading ? 'Awarding...' : `Award to ${filteredEmployees.length} user(s)`}
        </Button>
      </CardContent>
    </Card>
  );
}

import { useState, useMemo } from 'react';
import { Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { adminAPI } from '@/lib/api';
import { calculateLevel } from '@/types';
import type { Employee } from '@/admin/types';

export function BulkXPPanel() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [recipientMode, setRecipientMode] = useState<'all' | 'department' | 'level'>('all');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [levelMin, setLevelMin] = useState(1);
  const [levelMax, setLevelMax] = useState(10);
  const [xpAmount, setXpAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isAdding, setIsAdding] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const { data: employeesData, refetch } = useQuery(
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

  const amountNum = parseInt(xpAmount, 10) || 0;
  const preview = useMemo(() => {
    if (amountNum <= 0) return { affected: 0, levelUps: 0, totalXP: 0 };
    let levelUps = 0;
    for (const emp of filteredEmployees) {
      const currentXp = typeof emp.xp === 'number' ? emp.xp : 0;
      const newXp = Math.max(0, currentXp + (isAdding ? amountNum : -amountNum));
      const oldLevel = calculateLevel(currentXp).level;
      const newLevel = calculateLevel(newXp).level;
      if (newLevel > oldLevel) levelUps++;
    }
    const totalXP = isAdding ? amountNum * filteredEmployees.length : -amountNum * filteredEmployees.length;
    return {
      affected: filteredEmployees.length,
      levelUps,
      totalXP,
    };
  }, [filteredEmployees, amountNum, isAdding]);

  const handleApply = async () => {
    if (amountNum <= 0) {
      toast.error('Enter a valid MP amount');
      return;
    }
    if (!reason.trim()) {
      toast.error('Provide a reason');
      return;
    }
    if (filteredEmployees.length === 0) {
      toast.error('No employees selected');
      return;
    }
    setLoading(true);
    try {
      await Promise.all(
        filteredEmployees.map((emp) => {
          const currentXp = typeof emp.xp === 'number' ? emp.xp : 0;
          const newXp = Math.max(0, currentXp + (isAdding ? amountNum : -amountNum));
          return adminAPI.employees.update(userId, emp.id, { xp: newXp });
        })
      );
      toast.success(
        isAdding
          ? `Added ${amountNum} MP to ${filteredEmployees.length} employee(s)`
          : `Removed ${amountNum} MP from ${filteredEmployees.length} employee(s)`
      );
      setXpAmount('');
      setReason('');
      setShowPreview(false);
      refetch();
    } catch {
      toast.error('Failed to adjust MP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          Bulk MP operations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={isAdding ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setIsAdding(true)}
          >
            Award MP
          </Button>
          <Button
            variant={!isAdding ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setIsAdding(false)}
            className={!isAdding ? 'bg-red-600 hover:bg-red-700' : ''}
          >
            Remove MP
          </Button>
          <Link to="/admin/audit-logs">
            <Button variant="ghost" size="sm">
              History
            </Button>
          </Link>
        </div>

        <div>
          <label className="block text-sm font-medium text-app-muted mb-2">Select recipients</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="recipient"
                checked={recipientMode === 'all'}
                onChange={() => setRecipientMode('all')}
                className="rounded-full"
              />
              <span className="text-sm text-app-muted">All employees ({employees.length})</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="recipient"
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
                name="recipient"
                checked={recipientMode === 'level'}
                onChange={() => setRecipientMode('level')}
                className="rounded-full"
              />
              <span className="text-sm text-app-muted">By level range:</span>
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

        <div>
          <label className="block text-sm font-medium text-app-muted mb-1">MP amount</label>
          <input
            type="number"
            min="1"
            value={xpAmount}
            onChange={(e) => setXpAmount(e.target.value)}
            placeholder={isAdding ? '+100' : '100'}
            className="input-theme w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-app-muted mb-1">Reason *</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Annual bonus for Q4 performance"
            rows={2}
            className="input-theme w-full resize-none"
          />
        </div>

        {amountNum > 0 && (
          <div className="p-3 bg-app-surface-tertiary rounded-lg text-sm space-y-1">
            <p className="text-app-muted">{preview.affected} employees will be affected</p>
            <p className="text-app-muted">{preview.levelUps} will level up</p>
            <p className="text-app-muted">
              Total MP {isAdding ? 'distributed' : 'removed'}: {Math.abs(preview.totalXP).toLocaleString()}
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? 'Hide preview' : 'Preview'}
          </Button>
          <Button variant="primary" onClick={handleApply} disabled={loading || filteredEmployees.length === 0}>
            {loading ? 'Applying...' : 'Apply changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

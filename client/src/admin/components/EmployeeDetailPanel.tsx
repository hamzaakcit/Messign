import { X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { Avatar, Button, Card } from '@/components/ui';
import type { Employee } from '@/admin/types';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'xp', label: 'MP & Progress' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'activity', label: 'Activity' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'analytics', label: 'Analytics' },
];

interface EmployeeDetailPanelProps {
  employee: Employee | null;
  onClose: () => void;
  onSave?: (employee: Employee) => void;
  onDelete?: (id: string) => void;
}

export function EmployeeDetailPanel({
  employee,
  onClose,
  onSave,
  onDelete,
}: EmployeeDetailPanelProps) {
  if (!employee) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-dark-800 border-l border-white/10 shadow-xl flex flex-col z-20">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white">Employee Profile</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
          aria-label="Close panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <Avatar src={employee.avatar} name={employee.name} size="lg" status={employee.status} />
          <div>
            <h3 className="font-semibold text-white">{employee.name}</h3>
            <p className="text-sm text-gray-400">{employee.jobTitle}</p>
            <p className="text-xs text-gray-500">{employee.email}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
        <TabsList className="flex shrink-0 gap-1 p-2 overflow-x-auto">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="overview" className="mt-0 space-y-4">
            <Card>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Basic Info</h4>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-gray-500">Department</dt>
                <dd className="text-white">{employee.department}</dd>
                <dt className="text-gray-500">Role</dt>
                <dd className="text-white">{employee.role}</dd>
                <dt className="text-gray-500">Level</dt>
                <dd className="text-white">{employee.level}</dd>
                <dt className="text-gray-500">MP</dt>
                <dd className="text-white">{employee.xp}</dd>
                <dt className="text-gray-500">Joined</dt>
                <dd className="text-white">{employee.joinedAt ? new Date(employee.joinedAt).toLocaleDateString() : '—'}</dd>
              </dl>
            </Card>
          </TabsContent>
          <TabsContent value="xp" className="mt-0">
            <Card>
              <h4 className="text-sm font-medium text-gray-400 mb-2">MP & Progress</h4>
              <p className="text-sm text-gray-500">MP history and manual adjustment form will appear here.</p>
            </Card>
          </TabsContent>
          <TabsContent value="achievements" className="mt-0">
            <Card>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Achievements</h4>
              <p className="text-sm text-gray-500">Earned badges grid and award new badge action.</p>
            </Card>
          </TabsContent>
          <TabsContent value="activity" className="mt-0">
            <Card>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Activity</h4>
              <p className="text-sm text-gray-500">Activity timeline will appear here.</p>
            </Card>
          </TabsContent>
          <TabsContent value="permissions" className="mt-0">
            <Card>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Permissions</h4>
              <p className="text-sm text-gray-500">Role and permission matrix.</p>
            </Card>
          </TabsContent>
          <TabsContent value="analytics" className="mt-0">
            <Card>
              <h4 className="text-sm font-medium text-gray-400 mb-2">Analytics</h4>
              <p className="text-sm text-gray-500">Charts and stats.</p>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      <div className="flex items-center gap-2 p-4 border-t border-white/10">
        <Button variant="primary" size="sm" onClick={() => onSave?.(employee)}>Save</Button>
        <Button variant="danger" size="sm" onClick={() => onDelete?.(employee.id)}>Delete</Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

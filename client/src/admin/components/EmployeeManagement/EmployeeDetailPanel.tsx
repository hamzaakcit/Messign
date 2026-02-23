import { useState, useEffect } from 'react';
import { X, Edit2, Mail, Phone, MapPin, Calendar, Zap, Award, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { adminAPI } from '@/lib/api';
import type { Employee } from '@/admin/types';
import type { Department } from '@/admin/types';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

interface EmployeeDetailPanelProps {
  employee: Employee | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function EmployeeDetailPanel({ employee, isOpen, onClose, onUpdate }: EmployeeDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'stats'>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);

  const emp = employee as Employee & { departmentId?: string; joinDate?: string };
  const { firstName: initFirst, lastName: initLast } = employee ? splitName(employee.name) : { firstName: '', lastName: '' };
  const joinDateVal = emp?.joinDate ?? emp?.joinedAt ?? '';

  const [formData, setFormData] = useState({
    firstName: initFirst,
    lastName: initLast,
    email: emp?.email ?? '',
    phone: emp?.phone ?? '',
    departmentId: (emp?.departmentId ?? '') as string,
    role: emp?.role ?? 'member',
    location: ((emp as { location?: string })?.location ?? emp?.officeLocation ?? '') as string,
    title: emp?.jobTitle ?? '',
  });

  useEffect(() => {
    if (!isOpen || !userId) return;
    adminAPI.departments
      .getAll(userId)
      .then((data) => setDepartments((Array.isArray(data) ? data : []) as Department[]))
      .catch(() => setDepartments([]));
  }, [isOpen, userId]);

  useEffect(() => {
    if (!employee) return;
    const { firstName, lastName } = splitName(employee.name);
    const deptId = (employee as { departmentId?: string }).departmentId ?? '';
    setFormData({
      firstName,
      lastName,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      departmentId: deptId,
      role: employee.role ?? 'member',
      location: ((employee as { location?: string }).location ?? employee.officeLocation ?? '') as string,
      title: employee.jobTitle ?? '',
    });
  }, [employee]);

  if (!isOpen || !employee) return null;

  const handleSave = async () => {
    if (!userId) {
      toast.error('You must be logged in to save changes');
      return;
    }
    setLoading(true);
    try {
      const name = `${formData.firstName} ${formData.lastName}`.trim() || employee.name;
      const payload = {
        name,
        jobTitle: formData.title || employee.jobTitle,
        email: formData.email || employee.email,
        role: formData.role || employee.role,
        ...(formData.departmentId ? { departmentId: formData.departmentId } : {}),
        ...(formData.phone !== undefined && formData.phone !== '' ? { phone: formData.phone } : {}),
        ...(formData.location !== undefined && formData.location !== '' ? { location: formData.location } : {}),
      };
      await adminAPI.employees.update(userId, employee.id, payload);
      toast.success('Employee updated successfully');
      setIsEditing(false);
      onUpdate();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update employee';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    const { firstName, lastName } = splitName(employee.name);
    const deptId = (employee as { departmentId?: string }).departmentId ?? '';
    setFormData({
      firstName,
      lastName,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      departmentId: deptId,
      role: employee.role ?? 'member',
      location: ((employee as { location?: string }).location ?? employee.officeLocation ?? '') as string,
      title: employee.jobTitle ?? '',
    });
    setIsEditing(false);
  };

  const displayName = `${formData.firstName} ${formData.lastName}`.trim() || employee.name;
  const displayTitle = formData.title || employee.jobTitle;
  const displayDepartment = departments.find((d) => d.id === formData.departmentId)?.name ?? employee.department ?? formData.departmentId;
  const tasksCount = employee.stats?.tasksCompleted ?? 0;
  const messagesCount = employee.stats?.messagesSent ?? 0;
  const badgesCount = employee.badges?.length ?? 0;
  const xp = typeof employee.xp === 'number' ? employee.xp : 0;
  const level = typeof employee.level === 'number' ? employee.level : 1;
  const progressPct = Math.min(100, (xp % 1000) / 10);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} aria-hidden />
      <div className="fixed right-0 top-0 h-screen w-[480px] bg-app-card border-l border-app-border z-50 overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-app-card/95 backdrop-blur-lg border-b border-app-border p-6 z-10">
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={onClose} className="p-2 hover:bg-app-hover rounded-lg text-app-muted hover:text-app" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={handleCancel} className="px-4 py-2 bg-app-surface-tertiary hover:bg-app-hover rounded-lg text-app font-medium">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={loading}
                  className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg disabled:opacity-50 font-medium"
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={employee.avatar}
                alt={displayName}
                className="w-20 h-20 rounded-full ring-4 ring-primary-500 object-cover"
              />
              <div
                className={`absolute bottom-0 right-0 w-5 h-5 rounded-full border-4 border-app-card ${
                  employee.status === 'online'
                    ? 'bg-green-500'
                    : employee.status === 'away'
                      ? 'bg-yellow-500'
                      : employee.status === 'busy'
                        ? 'bg-red-500'
                        : 'bg-gray-500'
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-app truncate">{displayName}</h2>
              <p className="text-app-muted truncate">{displayTitle}</p>
              <p className="text-sm text-app-muted truncate">{(employee as { employeeId?: string }).employeeId ?? employee.id}</p>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <span className="px-3 py-1 bg-primary-100 dark:bg-primary-500/20 border border-primary-500/30 rounded-lg text-sm text-primary-700 dark:text-primary-300">{displayDepartment}</span>
            <span className="px-3 py-1 bg-accent-100 dark:bg-accent-500/20 border border-accent-500/30 rounded-lg text-sm text-accent-700 dark:text-accent-300">{employee.role}</span>
          </div>
        </div>

        <div className="border-b border-app-border px-6">
          <div className="flex gap-6">
            {(['overview', 'activity', 'stats'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`py-4 border-b-2 font-medium transition-colors ${
                  activeTab === tab ? 'border-primary-500 text-primary-500' : 'border-transparent text-app-muted hover:text-app'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {activeTab === 'overview' && (
            <>
              <div>
                <h3 className="text-lg font-semibold text-app mb-4">Contact Information</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-app-surface-tertiary rounded-lg">
                    <Mail className="w-5 h-5 text-app-muted shrink-0" />
                    {isEditing ? (
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                        className="flex-1 input-theme py-1.5"
                      />
                    ) : (
                      <span className="text-app">{employee.email}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-app-surface-tertiary rounded-lg">
                    <Phone className="w-5 h-5 text-app-muted shrink-0" />
                    {isEditing ? (
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="Phone number"
                        className="flex-1 input-theme py-1.5"
                      />
                    ) : (
                      <span className="text-app">{employee.phone || 'Not provided'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-app-surface-tertiary rounded-lg">
                    <MapPin className="w-5 h-5 text-app-muted shrink-0" />
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.location}
                        onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
                        placeholder="Location"
                        className="flex-1 input-theme py-1.5"
                      />
                    ) : (
                      <span className="text-app">{formData.location || (employee as { location?: string }).location || employee.officeLocation || 'Not provided'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-app-surface-tertiary rounded-lg">
                    <Calendar className="w-5 h-5 text-app-muted shrink-0" />
                    <div>
                      <div className="text-sm text-app-muted">Join Date</div>
                      <div className="text-app">{joinDateVal ? formatDate(joinDateVal) : '—'}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-app mb-4">Employment Details</h3>
                <div className="space-y-3">
                  <div className="p-3 bg-app-surface-tertiary rounded-lg">
                    <div className="text-sm text-app-muted mb-1">Full Name</div>
                    {isEditing ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={formData.firstName}
                          onChange={(e) => setFormData((p) => ({ ...p, firstName: e.target.value }))}
                          placeholder="First name"
                          className="flex-1 input-theme py-1.5"
                        />
                        <input
                          type="text"
                          value={formData.lastName}
                          onChange={(e) => setFormData((p) => ({ ...p, lastName: e.target.value }))}
                          placeholder="Last name"
                          className="flex-1 input-theme py-1.5"
                        />
                      </div>
                    ) : (
                      <div className="font-medium text-app">{displayName}</div>
                    )}
                  </div>
                  <div className="p-3 bg-app-surface-tertiary rounded-lg">
                    <div className="text-sm text-app-muted mb-1">Job Title</div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Job title"
                        className="w-full input-theme py-1.5"
                      />
                    ) : (
                      <div className="font-medium text-app">{displayTitle}</div>
                    )}
                  </div>
                  <div className="p-3 bg-app-surface-tertiary rounded-lg">
                    <div className="text-sm text-app-muted mb-1">Department</div>
                    {isEditing ? (
                      <select
                        value={formData.departmentId}
                        onChange={(e) => setFormData((p) => ({ ...p, departmentId: e.target.value }))}
                        className="w-full select-theme py-1.5"
                      >
                        <option value="">Select department...</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="font-medium text-app">{displayDepartment}</div>
                    )}
                  </div>
                  <div className="p-3 bg-app-surface-tertiary rounded-lg">
                    <div className="text-sm text-app-muted mb-1">Role</div>
                    {isEditing ? (
                      <select
                        value={formData.role}
                        onChange={(e) => setFormData((p) => ({ ...p, role: e.target.value as import('@/types').UserRole }))}
                        className="w-full select-theme py-1.5"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="member">Member</option>
                      </select>
                    ) : (
                      <div className="font-medium text-app">{employee.role}</div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-app mb-4">Progress & Level</h3>
                <div className="p-4 bg-primary-50 dark:bg-primary-500/10 border border-app-border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-yellow-500" />
                      <span className="font-semibold text-app">Level {level}</span>
                    </div>
                    <span className="text-2xl font-bold text-app">{xp.toLocaleString()} MP</span>
                  </div>
                  <div className="h-2 bg-app-surface-tertiary rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="text-sm text-app-muted mt-2">{1000 - (xp % 1000)} MP to next level</div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-app mb-4">Statistics</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-app-surface-tertiary rounded-lg text-center">
                    <div className="text-2xl font-bold text-app">{tasksCount}</div>
                    <div className="text-sm text-app-muted">Tasks</div>
                  </div>
                  <div className="p-3 bg-app-surface-tertiary rounded-lg text-center">
                    <div className="text-2xl font-bold text-app">{messagesCount}</div>
                    <div className="text-sm text-app-muted">Messages</div>
                  </div>
                  <div className="p-3 bg-app-surface-tertiary rounded-lg text-center">
                    <div className="text-2xl font-bold text-app">{badgesCount}</div>
                    <div className="text-sm text-app-muted">Badges</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'activity' && (
            <div>
              <h3 className="text-lg font-semibold text-app mb-4">Recent Activity</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-app-surface-tertiary rounded-lg">
                  <Activity className="w-5 h-5 text-green-500 mt-1 shrink-0" />
                  <div>
                    <div className="font-medium text-app">Completed task</div>
                    <div className="text-sm text-app-muted">2 hours ago</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-app-surface-tertiary rounded-lg">
                  <Award className="w-5 h-5 text-yellow-500 mt-1 shrink-0" />
                  <div>
                    <div className="font-medium text-app">Earned badge: Task Master</div>
                    <div className="text-sm text-app-muted">Yesterday</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-app-surface-tertiary rounded-lg">
                  <Zap className="w-5 h-5 text-primary-500 mt-1 shrink-0" />
                  <div>
                    <div className="font-medium text-app">Gained 50 MP</div>
                    <div className="text-sm text-app-muted">2 days ago</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div>
              <h3 className="text-lg font-semibold text-app mb-4">Performance Stats</h3>
              <div className="space-y-4">
                <div className="p-4 bg-app-surface-tertiary rounded-lg">
                  <div className="flex justify-between mb-2">
                    <span className="text-app-muted">Task Completion Rate</span>
                    <span className="font-bold text-app">87%</span>
                  </div>
                  <div className="h-2 bg-app-surface-tertiary rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: '87%' }} />
                  </div>
                </div>
                <div className="p-4 bg-app-surface-tertiary rounded-lg">
                  <div className="flex justify-between mb-2">
                    <span className="text-app-muted">Engagement Score</span>
                    <span className="font-bold text-app">92%</span>
                  </div>
                  <div className="h-2 bg-app-surface-tertiary rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full" style={{ width: '92%' }} />
                  </div>
                </div>
                <div className="p-4 bg-app-surface-tertiary rounded-lg">
                  <div className="flex justify-between mb-2">
                    <span className="text-app-muted">Collaboration Score</span>
                    <span className="font-bold text-app">78%</span>
                  </div>
                  <div className="h-2 bg-app-surface-tertiary rounded-full overflow-hidden">
                    <div className="h-full bg-accent-500 rounded-full" style={{ width: '78%' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

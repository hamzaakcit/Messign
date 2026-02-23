import { useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { employeeFormSchema, type EmployeeFormValues } from '@/admin/utils/validation';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@/admin/hooks/useAdminQuery';
import { adminAPI } from '@/lib/api';
import type { Employee } from '@/admin/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const defaultValues: Partial<EmployeeFormValues> = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  pronouns: '',
  employeeId: '',
  departmentId: '',
  role: 'member',
  managerId: null,
  employmentType: 'full_time',
  startDate: '',
  endDate: null,
  officeLocation: '',
  schedule: '',
  level: 1,
  xp: 0,
  initialBadges: [],
  tags: [],
  status: 'offline',
  welcomeEmail: true,
  tempPassword: '',
  jobTitle: '',
  skills: '',
  bio: '',
  emergencyContact: '',
};

export function EmployeeForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { user } = useAuthStore();
  const userId = user?.id ?? '';

  const { data: departments } = useQuery(
    ['departments', userId],
    () => adminAPI.departments.getAll(userId) as Promise<{ id: string; name: string }[]>,
    { enabled: !!userId }
  );
  const { data: employeeData } = useQuery(
    ['employee', id ?? ''],
    () => (id ? adminAPI.employees.getById(userId, id) : Promise.resolve(null)) as Promise<Employee | null>,
    { enabled: !!id && !!userId }
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues,
  });

  useEffect(() => {
    if (isEdit && employeeData && typeof employeeData === 'object') {
      const emp = employeeData as Employee & { departmentId?: string };
      const deptId = emp.departmentId ?? (departments as { id: string; name: string }[] | undefined)?.find(
        (d) => d.name === emp.department
      )?.id ?? '';
      reset({
        firstName: emp.name?.split(' ')[0] ?? '',
        lastName: emp.name?.split(' ').slice(1).join(' ') ?? '',
        email: emp.email ?? '',
        phone: (emp as Employee).phone ?? '',
        employeeId: emp.employeeId ?? emp.id?.replace('user-', 'EMP') ?? '',
        departmentId: deptId,
        role: emp.role ?? 'member',
        managerId: emp.managerId ?? null,
        employmentType: (emp as Employee).employmentType ?? 'full_time',
        startDate: emp.joinedAt ? emp.joinedAt.slice(0, 10) : '',
        endDate: (emp as Employee).endDate ?? null,
        officeLocation: (emp as Employee).officeLocation ?? '',
        level: emp.level ?? 1,
        xp: emp.xp ?? 0,
        status: emp.status ?? 'offline',
        jobTitle: emp.jobTitle ?? '',
        tags: (emp as Employee).tags ?? [],
      });
    }
  }, [isEdit, employeeData, departments, reset]);

  const onSubmit = async (values: EmployeeFormValues) => {
    if (!userId) return;
    try {
      const name = `${values.firstName} ${values.lastName}`.trim();
      const payload = {
        name,
        email: values.email,
        jobTitle: values.jobTitle,
        departmentId: values.departmentId,
        role: values.role,
        xp: values.xp,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone || undefined,
        managerId: values.managerId,
        employmentType: values.employmentType,
        startDate: values.startDate,
        endDate: values.endDate,
        officeLocation: values.officeLocation,
        employeeId: values.employeeId,
      };
      if (isEdit && id) {
        await adminAPI.employees.update(userId, id, payload);
        toast.success('Employee updated successfully');
        navigate('/admin/employees');
      } else {
        await adminAPI.employees.create(userId, payload);
        toast.success('Employee added successfully');
        navigate('/admin/employees');
      }
    } catch (e) {
      console.error(e);
      toast.error(isEdit ? 'Failed to update employee' : 'Failed to add employee');
    }
  };

  const deptList = Array.isArray(departments) ? departments : [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/admin/employees"
          className="p-2 rounded-lg hover:bg-app-hover text-app-muted hover:text-app"
          aria-label="Back to employees"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-app">
          {isEdit ? 'Edit Employee' : 'Add Employee'}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">First name *</label>
                <Input {...register('firstName')} className={cn(errors.firstName && 'border-danger-500')} />
                {errors.firstName && (
                  <p className="text-danger-500 text-xs mt-1">{errors.firstName.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Last name *</label>
                <Input {...register('lastName')} className={cn(errors.lastName && 'border-danger-500')} />
                {errors.lastName && (
                  <p className="text-danger-500 text-xs mt-1">{errors.lastName.message}</p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-app-muted mb-1">Email *</label>
              <Input type="email" {...register('email')} className={cn(errors.email && 'border-danger-500')} />
              {errors.email && (
                <p className="text-danger-500 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Phone</label>
                <Input {...register('phone')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Date of birth</label>
                <Input type="date" {...register('dateOfBirth')} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-app-muted mb-1">Pronouns</label>
              <Input {...register('pronouns')} placeholder="e.g. she/her" />
            </div>
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card>
          <CardHeader>
            <CardTitle>Employment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-app-muted mb-1">Employee ID</label>
              <Input {...register('employeeId')} placeholder="Auto-generated if empty" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Department *</label>
                <select
                  {...register('departmentId')}
                  className="select-theme w-full"
                  aria-invalid={Boolean(errors.departmentId)}
                >
                  <option value="">Select department</option>
                  {deptList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {errors.departmentId && (
                  <p className="text-danger-500 text-xs mt-1">{errors.departmentId.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Job title *</label>
                <Input {...register('jobTitle')} className={cn(errors.jobTitle && 'border-danger-500')} />
                {errors.jobTitle && (
                  <p className="text-danger-500 text-xs mt-1">{errors.jobTitle.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Role *</label>
                <select {...register('role')} className="select-theme w-full">
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Employment type</label>
                <select {...register('employmentType')} className="select-theme w-full">
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                  <option value="contract">Contract</option>
                  <option value="intern">Intern</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Start date *</label>
                <Input type="date" {...register('startDate')} className={cn(errors.startDate && 'border-danger-500')} />
                {errors.startDate && (
                  <p className="text-danger-500 text-xs mt-1">{errors.startDate.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">End date</label>
                <Input type="date" {...register('endDate')} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-app-muted mb-1">Office location</label>
              <Input {...register('officeLocation')} />
            </div>
          </CardContent>
        </Card>

        {/* Initial Setup */}
        <Card>
          <CardHeader>
            <CardTitle>Initial Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">Level</label>
                <Input type="number" min={1} max={100} {...register('level', { valueAsNumber: true })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-app-muted mb-1">MP</label>
                <Input type="number" min={0} {...register('xp', { valueAsNumber: true })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-app-muted mb-1">Status</label>
              <select {...register('status')} className="select-theme w-full">
                <option value="offline">Offline</option>
                <option value="online">Online</option>
                <option value="away">Away</option>
                <option value="busy">Busy</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm text-app-muted">
                <input type="checkbox" {...register('welcomeEmail')} />
                Send welcome email
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-4">
          {!isEdit && (
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              Save and Add Another
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
          {isEdit && (
            <Button type="button" variant="secondary">
              Save as Draft
            </Button>
          )}
          <Link to="/admin/employees">
            <Button type="button" variant="ghost">Cancel</Button>
          </Link>
          <Button type="button" variant="ghost" onClick={() => reset()}>
            Reset
          </Button>
        </div>
      </form>
    </div>
  );
}

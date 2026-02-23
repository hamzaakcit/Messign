import type { Permission, PermissionAction } from '@/admin/types';
import { cn } from '@/lib/utils';

const ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'approve'];
const MODULES = ['employees', 'departments', 'roles', 'projects', 'xp', 'settings', 'audit'];

interface PermissionMatrixProps {
  permissions: Permission[];
  onChange?: (permissions: Permission[]) => void;
  readOnly?: boolean;
  className?: string;
}

export function PermissionMatrix({
  permissions,
  onChange,
  readOnly = false,
  className,
}: PermissionMatrixProps) {
  const getPermission = (module: string): Permission | undefined =>
    permissions.find((p) => p.module === module);

  const hasAction = (module: string, action: PermissionAction): boolean => {
    const p = getPermission(module);
    return p?.actions.includes(action) ?? false;
  };

  const setAction = (module: string, action: PermissionAction, value: boolean) => {
    if (readOnly || !onChange) return;
    const next = permissions.map((p) => ({ ...p }));
    let perm = next.find((p) => p.module === module);
    if (!perm) {
      perm = { module, actions: [], scope: 'none' };
      next.push(perm);
    }
    if (value) {
      if (!perm.actions.includes(action)) perm.actions.push(action);
    } else {
      perm.actions = perm.actions.filter((a) => a !== action);
    }
    onChange(next);
  };

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left py-2 px-3 text-gray-400 font-medium">Module</th>
            {ACTIONS.map((a) => (
              <th key={a} className="py-2 px-2 text-gray-400 font-medium capitalize text-center">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULES.map((module) => (
            <tr key={module} className="border-b border-white/5">
              <td className="py-2 px-3 text-white capitalize">{module}</td>
              {ACTIONS.map((action) => (
                <td key={action} className="py-2 px-2 text-center">
                  {readOnly ? (
                    <span className={cn(hasAction(module, action) ? 'text-primary-400' : 'text-gray-600')}>
                      {hasAction(module, action) ? '✓' : '—'}
                    </span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={hasAction(module, action)}
                      onChange={(e) => setAction(module, action, e.target.checked)}
                      aria-label={`${module} ${action}`}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

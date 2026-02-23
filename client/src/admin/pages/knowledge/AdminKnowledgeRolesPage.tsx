import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { toast } from 'sonner';
import { getAccessToken } from '@/lib/authToken';

interface UserRole {
  id: string;
  user_id: string;
  user_name: string;
  email: string;
  role: string;
}

interface OrgUser {
  id: string;
  auth_user_id: string;
  full_name: string;
  email: string;
}

const ROLES = ['admin', 'cpo', 'editor', 'reviewer', 'viewer'];

function getHeaders(): Record<string, string> {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export function AdminKnowledgeRolesPage() {
  const [users, setUsers] = useState<(OrgUser & { role: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [orgRes, rolesRes] = await Promise.all([
          fetch('/api/users', { headers: getHeaders() }),
          fetch('/api/knowledge-hub/roles', { headers: getHeaders() }),
        ]);
        const orgUsers: OrgUser[] = orgRes.ok ? await orgRes.json() : [];
        const existingRoles: UserRole[] = rolesRes.ok ? await rolesRes.json() : [];

        const roleMap = new Map<string, string>();
        existingRoles.forEach(r => roleMap.set(r.user_id, r.role));

        setUsers(orgUsers.map(u => ({
          ...u,
          role: roleMap.get(u.auth_user_id) ?? roleMap.get(u.id) ?? 'viewer',
        })));
      } catch (e) {
        console.error('Failed to load roles', e);
        toast.error('Failed to load users');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleRoleChange = async (user: OrgUser & { role: string }, newRole: string) => {
    const userId = user.auth_user_id || user.id;
    setSaving(userId);
    try {
      const res = await fetch(`/api/knowledge-hub/roles/${userId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed');
      }
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
      toast.success(`Role updated to ${newRole}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update role');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <Shield className="w-5 h-5 text-purple-400" /> Knowledge Roles
      </h1>

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading...</div>
      ) : (
        <div className="rounded-xl border border-dark-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-dark-800 text-xs text-gray-500 uppercase">
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {users.map(u => (
                <tr key={u.id} className="bg-dark-800/50 hover:bg-dark-800">
                  <td className="px-4 py-3 text-sm text-white">{u.full_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={saving === (u.auth_user_id || u.id)}
                      onChange={(e) => handleRoleChange(u, e.target.value)}
                      className="px-2 py-1 rounded bg-dark-700 border border-dark-600 text-sm text-white disabled:opacity-50"
                    >
                      {ROLES.map(r => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

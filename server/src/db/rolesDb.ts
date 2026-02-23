import { query } from './index.js';
import type { Role, Permission } from '../types/admin.js';

const DEFAULT_ORG_SLUG = 'messign';

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  role_key: string | null;
  is_system: boolean;
  member_count: number;
}

function mapRowToRole(row: RoleRow): Role {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    memberCount: row.member_count ?? 0,
    isSystem: row.is_system ?? false,
  };
}

export async function getAllRoles(): Promise<Role[]> {
  const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = $1 LIMIT 1`, [DEFAULT_ORG_SLUG]);
  const orgId = orgResult.rows[0]?.id;
  const result = await query<{ id: string; name: string; description: string | null; permissions: unknown; role_key: string | null; is_system: boolean }>(
    `SELECT id, name, description, COALESCE(permissions, '[]')::jsonb AS permissions, role_key, COALESCE(is_system, FALSE) AS is_system FROM roles ORDER BY name`
  );
  const roles: Role[] = [];
  for (const row of result.rows) {
    let memberCount = 0;
    if (orgId && row.role_key) {
      const countResult = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM reimbursement_users WHERE organization_id = $1 AND role = $2`,
        [orgId, row.role_key]
      );
      memberCount = parseInt(countResult.rows[0]?.n ?? '0', 10);
    }
    roles.push(mapRowToRole({ ...row, permissions: row.permissions as Permission[], member_count: memberCount }));
  }
  return roles;
}

export async function getRoleById(id: string): Promise<Role | null> {
  const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = $1 LIMIT 1`, [DEFAULT_ORG_SLUG]);
  const orgId = orgResult.rows[0]?.id;
  const result = await query<{ id: string; name: string; description: string | null; permissions: unknown; role_key: string | null; is_system: boolean }>(
    `SELECT id, name, description, COALESCE(permissions, '[]')::jsonb AS permissions, role_key, COALESCE(is_system, FALSE) AS is_system FROM roles WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  let memberCount = 0;
  if (orgId && row.role_key) {
    const countResult = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM reimbursement_users WHERE organization_id = $1 AND role = $2`,
      [orgId, row.role_key]
    );
    memberCount = parseInt(countResult.rows[0]?.n ?? '0', 10);
  }
  return mapRowToRole({ ...row, permissions: row.permissions as Permission[], member_count: memberCount });
}

export async function addRole(role: Omit<Role, 'memberCount' | 'id'> & { id?: string }): Promise<Role> {
  const id = role.id ?? `role-${(role.name ?? 'custom').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
  await query(
    `INSERT INTO roles (id, name, description, permissions, is_system)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, role.name, role.description ?? null, JSON.stringify(role.permissions ?? []), role.isSystem ?? false]
  );
  const out = await getRoleById(id);
  if (!out) throw new Error('Role insert failed');
  return out;
}

export async function updateRole(id: string, updates: Partial<Pick<Role, 'name' | 'description' | 'permissions'>>): Promise<Role | null> {
  const curResult = await query<{ name: string; description: string | null; permissions: unknown }>(
    `SELECT name, description, permissions FROM roles WHERE id = $1`,
    [id]
  );
  const cur = curResult.rows[0];
  if (!cur) return null;
  const name = updates.name ?? cur.name ?? '';
  const description = updates.description !== undefined ? updates.description : cur.description;
  const permissions = updates.permissions ?? (cur.permissions as Permission[]);
  await query(
    `UPDATE roles SET name = $1, description = $2, permissions = $3, updated_at = NOW() WHERE id = $4`,
    [name, description ?? null, JSON.stringify(permissions), id]
  );
  return getRoleById(id);
}

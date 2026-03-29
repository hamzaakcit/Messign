import { query } from './index.js';
import type { User, UserStats } from '../types/index.js';

const DEFAULT_ORG_SLUG = 'messign';

const LEVEL_XP_THRESHOLDS = [
  0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 3800, 4700, 5700, 6800, 8000,
  9300, 10700, 12200, 13800, 15500, 17300, 19200, 21200, 23300, 25500, 27800,
  30200, 32700, 35300, 38000, 40800,
];

function xpToLevel(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_XP_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_XP_THRESHOLDS[i]!) level = i + 1;
    else break;
  }
  return level;
}

export function getLevelFromXp(xp: number): number {
  return xpToLevel(xp);
}

function xpToNextLevelFromXp(xp: number): number {
  for (let i = 1; i < LEVEL_XP_THRESHOLDS.length; i++) {
    if (xp < LEVEL_XP_THRESHOLDS[i]!) return LEVEL_XP_THRESHOLDS[i]!;
  }
  return LEVEL_XP_THRESHOLDS[LEVEL_XP_THRESHOLDS.length - 1]! + 5000;
}

const defaultStats: UserStats = {
  tasksCompleted: 0,
  messagesSent: 0,
  hoursLogged: 0,
  projectsContributed: 0,
  documentsCreated: 0,
};

interface DbEmployeeRow {
  auth_user_id: string | null;
  id: string;
  email: string;
  full_name: string;
  role: string;
  job_title: string | null;
  xp: number;
  level: number;
  status: string;
  created_at: string;
  department: string | null;
}

function mapRowToUser(row: DbEmployeeRow): User {
  const id = row.auth_user_id ?? row.id;
  const role = row.role === 'admin' ? 'admin' : row.role === 'manager' ? 'manager' : 'member';
  return {
    id,
    email: row.email,
    name: row.full_name,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(id)}`,
    jobTitle: row.job_title ?? row.role,
    department: row.department ?? 'General',
    level: row.level ?? 1,
    xp: row.xp ?? 0,
    xpToNextLevel: xpToNextLevelFromXp(row.xp ?? 0),
    badges: [],
    stats: { ...defaultStats },
    status: (row.status as User['status']) ?? 'offline',
    role,
    joinedAt: row.created_at,
  };
}

const EMPLOYEE_SELECT = `
  ru.auth_user_id, ru.id::text AS id, ru.email, ru.full_name, ru.role,
  ru.job_title, COALESCE(ru.xp, 0)::int AS xp, COALESCE(ru.level, 1)::int AS level,
  COALESCE(ru.status, 'offline') AS status, ru.created_at::text AS created_at,
  (SELECT pt.team_name FROM performance_team_members ptm JOIN performance_teams pt ON pt.id = ptm.team_id
   WHERE ptm.employee_id = ru.auth_user_id AND ptm.is_active = TRUE
   ORDER BY CASE WHEN pt.team_code IN ('enterprise-sales','wholesale-sms') THEN 1 ELSE 0 END, pt.team_code
   LIMIT 1) AS department
`;

export async function getEmployeeById(id: string): Promise<DbEmployeeRow | null> {
  const orgResult = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG]
  );
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) return null;
  const result = await query<DbEmployeeRow>(
    `SELECT ${EMPLOYEE_SELECT}
     FROM reimbursement_users ru WHERE ru.organization_id = $1 AND (ru.auth_user_id = $2 OR ru.id::text = $2) LIMIT 1`,
    [orgId, id]
  );
  return result.rows[0] ?? null;
}

export async function getEmployeeByEmail(email: string): Promise<DbEmployeeRow | null> {
  const normalized = (email ?? '').trim().toLowerCase();
  /** Do not require slug `messign` to exist: single-org / migrated DBs may only have another tenant row. Prefer default org when present. */
  const result = await query<DbEmployeeRow>(
    `SELECT ${EMPLOYEE_SELECT}
     FROM reimbursement_users ru
     WHERE LOWER(TRIM(ru.email)) = $1
     ORDER BY
       CASE WHEN ru.organization_id = (SELECT id FROM organizations WHERE slug = $2 LIMIT 1) THEN 0 ELSE 1 END,
       ru.created_at ASC NULLS LAST
     LIMIT 1`,
    [normalized, DEFAULT_ORG_SLUG],
  );
  return result.rows[0] ?? null;
}

export async function getEmployeesByDepartment(department: string): Promise<DbEmployeeRow[]> {
  const orgResult = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG]
  );
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) return [];
  const result = await query<DbEmployeeRow>(
    `SELECT ${EMPLOYEE_SELECT}
     FROM reimbursement_users ru
     WHERE ru.organization_id = $1
       AND (
         EXISTS (SELECT 1 FROM performance_team_members ptm JOIN performance_teams pt ON pt.id = ptm.team_id
          WHERE ptm.employee_id = ru.auth_user_id AND ptm.is_active = TRUE AND pt.team_name = $2)
         OR ($2 = 'General' AND NOT EXISTS (SELECT 1 FROM performance_team_members ptm WHERE ptm.employee_id = ru.auth_user_id AND ptm.is_active = TRUE))
       )
     ORDER BY ru.full_name`,
    [orgId, department]
  );
  return result.rows;
}

export async function getEmployeesByRole(role: 'admin' | 'manager' | 'member'): Promise<DbEmployeeRow[]> {
  const orgResult = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG]
  );
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) return [];
  const roleVal = role === 'member' ? 'employee' : role;
  const result = await query<DbEmployeeRow>(
    `SELECT ${EMPLOYEE_SELECT}
     FROM reimbursement_users ru WHERE ru.organization_id = $1 AND ru.role = $2 ORDER BY ru.full_name`,
    [orgId, roleVal]
  );
  return result.rows;
}

export async function addEmployeeXP(id: string, amount: number): Promise<DbEmployeeRow | null> {
  const row = await getEmployeeById(id);
  if (!row) return null;
  const newXp = (row.xp ?? 0) + amount;
  const newLevel = xpToLevel(newXp);
  await query(
    `UPDATE reimbursement_users SET xp = $1, level = $2, updated_at = NOW() WHERE id = $3`,
    [newXp, newLevel, row.id]
  );
  return getEmployeeById(id);
}

export async function getEmployeeByIdAsUser(id: string): Promise<User | null> {
  const row = await getEmployeeById(id);
  return row ? mapRowToUser(row) : null;
}

/** Batch-fetch multiple employees by ID in a single query. */
export async function getEmployeesByIdsAsUsers(ids: string[]): Promise<Map<string, User>> {
  const result = new Map<string, User>();
  if (ids.length === 0) return result;
  const unique = [...new Set(ids)];
  const orgResult = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG]
  );
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) return result;
  const rows = await query<DbEmployeeRow>(
    `SELECT ${EMPLOYEE_SELECT}
     FROM reimbursement_users ru
     WHERE ru.organization_id = $1 AND (ru.auth_user_id = ANY($2::text[]) OR ru.id::text = ANY($2::text[]))`,
    [orgId, unique]
  );
  for (const row of rows.rows) {
    const user = mapRowToUser(row);
    result.set(user.id, user);
    if (row.id && row.id !== user.id) result.set(row.id, user);
    if (row.auth_user_id && row.auth_user_id !== user.id) result.set(row.auth_user_id, user);
  }
  return result;
}

export async function getEmployeesAsUsers(): Promise<User[]> {
  const orgResult = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG]
  );
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) return [];
  const result = await query<DbEmployeeRow>(
    `SELECT ${EMPLOYEE_SELECT}
     FROM reimbursement_users ru WHERE ru.organization_id = $1 ORDER BY ru.full_name`,
    [orgId]
  );
  return result.rows.map(mapRowToUser);
}

export async function updateEmployeeStatus(
  id: string,
  status: 'online' | 'away' | 'busy' | 'offline'
): Promise<DbEmployeeRow | null> {
  const row = await getEmployeeById(id);
  if (!row) return null;
  await query(
    `UPDATE reimbursement_users SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, row.id]
  );
  return getEmployeeById(id);
}

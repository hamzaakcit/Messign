import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import { query, getClient } from './index.js';
import { getDefaultSeedPassword } from '../types/auth.js';

const DEFAULT_ORG_SLUG = 'messign';
const SALT_ROUNDS = 12;

export interface ImportRow {
  id?: string;
  email: string;
  name: string;
  jobTitle?: string;
  department?: string;
  role?: string;
  level?: number;
  xp?: number;
  joinedAt?: string;
}

export interface BulkImportResult {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

function slugFromTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'team';
}

function normalizeRole(role: unknown): 'admin' | 'manager' | 'employee' {
  const r = String(role ?? '').toLowerCase();
  if (r === 'admin') return 'admin';
  if (r === 'manager') return 'manager';
  return 'employee';
}

export async function getOrgIdBySlug(slug: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [slug]
  );
  return result.rows[0]?.id ?? null;
}

export async function insertEmployees(
  rows: unknown[],
  orgId: string,
  options?: { createAuth?: boolean }
): Promise<BulkImportResult> {
  const createAuth = options?.createAuth !== false;
  const result: BulkImportResult = {
    total: rows.length,
    successful: 0,
    failed: 0,
    errors: [],
  };

  const parsed: ImportRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    if (!raw || typeof raw !== 'object') {
      result.errors.push({ row: i + 1, message: 'Invalid row: not an object' });
      result.failed++;
      continue;
    }
    const r = raw as Record<string, unknown>;
    const email = typeof r.email === 'string' ? r.email.trim() : '';
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!email || !name) {
      result.errors.push({ row: i + 1, message: 'Missing email or name' });
      result.failed++;
      continue;
    }
    parsed.push({
      id: typeof r.id === 'string' ? r.id.trim() || undefined : undefined,
      email,
      name,
      jobTitle: typeof r.jobTitle === 'string' ? r.jobTitle.trim() : undefined,
      department: typeof r.department === 'string' ? r.department.trim() : undefined,
      role: typeof r.role === 'string' ? r.role : undefined,
      level: typeof r.level === 'number' ? r.level : undefined,
      xp: typeof r.xp === 'number' ? r.xp : undefined,
      joinedAt: typeof r.joinedAt === 'string' ? r.joinedAt : undefined,
    });
  }

  let defaultPasswordHash: string | null = null;
  if (createAuth) {
    defaultPasswordHash = await bcrypt.hash(getDefaultSeedPassword(), SALT_ROUNDS);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i]!;
      const authUserId =
        row.id && row.id.length > 0 ? row.id : `user-${randomUUID()}`;
      const role = normalizeRole(row.role);
      const jobTitle = row.jobTitle ?? role;
      const xp = typeof row.xp === 'number' && row.xp >= 0 ? row.xp : 0;
      const level = typeof row.level === 'number' && row.level >= 1 ? row.level : 1;
      const emailLower = row.email.toLowerCase();
      let createdAt: string | null = null;
      if (row.joinedAt) {
        const d = new Date(row.joinedAt);
        if (!Number.isNaN(d.getTime())) createdAt = d.toISOString();
      }

        try {
        if (createdAt) {
          await client.query(
            `INSERT INTO reimbursement_users (organization_id, auth_user_id, email, full_name, role, job_title, xp, level, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'offline', $9::timestamptz, $9::timestamptz)
             ON CONFLICT (organization_id, email) DO UPDATE SET
               full_name = EXCLUDED.full_name,
               role = EXCLUDED.role,
               job_title = EXCLUDED.job_title,
               xp = EXCLUDED.xp,
               level = EXCLUDED.level,
               updated_at = NOW()`,
            [orgId, authUserId, emailLower, row.name, role, jobTitle, xp, level, createdAt]
          );
        } else {
          await client.query(
            `INSERT INTO reimbursement_users (organization_id, auth_user_id, email, full_name, role, job_title, xp, level, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'offline')
             ON CONFLICT (organization_id, email) DO UPDATE SET
               full_name = EXCLUDED.full_name,
               role = EXCLUDED.role,
               job_title = EXCLUDED.job_title,
               xp = EXCLUDED.xp,
               level = EXCLUDED.level,
               updated_at = NOW()`,
            [orgId, authUserId, emailLower, row.name, role, jobTitle, xp, level]
          );
        }

        const existingRow = await client.query<{ auth_user_id: string | null }>(
          `SELECT auth_user_id FROM reimbursement_users WHERE organization_id = $1 AND email = $2 LIMIT 1`,
          [orgId, emailLower]
        );
        const effectiveAuthUserId = existingRow.rows[0]?.auth_user_id ?? authUserId;

        if (row.department && row.department.length > 0) {
          let teamIdResult = await client.query<{ id: string }>(
            `SELECT id FROM performance_teams WHERE team_name = $1 AND is_active = TRUE LIMIT 1`,
            [row.department]
          );
          if (teamIdResult.rows.length === 0) {
            const teamCode = slugFromTeamName(row.department);
            await client.query(
              `INSERT INTO performance_teams (team_code, team_name, team_type, is_active)
               VALUES ($1, $2, 'sales', TRUE)
               ON CONFLICT (team_code) DO UPDATE SET team_name = EXCLUDED.team_name
               RETURNING id`,
              [teamCode, row.department]
            );
            teamIdResult = await client.query<{ id: string }>(
              `SELECT id FROM performance_teams WHERE team_code = $1 LIMIT 1`,
              [teamCode]
            );
          }
          const teamId = teamIdResult.rows[0]?.id;
          if (teamId) {
            await client.query(
              `INSERT INTO performance_team_members (team_id, employee_id, role_in_team, start_date, is_active)
               VALUES ($1, $2, 'member', CURRENT_DATE, TRUE)
               ON CONFLICT (team_id, employee_id) DO NOTHING`,
              [teamId, effectiveAuthUserId]
            );
          }
        }

        if (createAuth && defaultPasswordHash) {
          await client.query(
            `INSERT INTO employee_auth (auth_user_id, email, password_hash, must_change_password, temporary_password, account_status, created_by, updated_by)
             VALUES ($1, $2, $3, TRUE, $4, 'active', 'system', 'system')
             ON CONFLICT (auth_user_id) DO UPDATE SET
               email = EXCLUDED.email,
               password_hash = EXCLUDED.password_hash,
               must_change_password = EXCLUDED.must_change_password,
               temporary_password = EXCLUDED.temporary_password,
               account_status = EXCLUDED.account_status,
               updated_at = NOW(),
               updated_by = EXCLUDED.updated_by`,
            [effectiveAuthUserId, emailLower, defaultPasswordHash, getDefaultSeedPassword()]
          );
        }

        result.successful++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ row: i + 1, message });
        result.failed++;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch((err) => console.error('[bulkImportDb] Rollback failed', { error: err instanceof Error ? err.message : String(err) }));
    throw err;
  } finally {
    client.release();
  }

  return result;
}

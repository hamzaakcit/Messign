import bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import type { PoolClient } from 'pg';

/**
 * Allow-listed bootstrap (ADR-002): creating a tenant must write the legacy organizations, reimbursement_users and
 * employee_auth tables, which the engage role cannot touch, so it runs on the admin client inside one transaction.
 */
export interface ProvisionInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminFullName: string;
}

export interface ProvisionResult {
  organization: { id: string; name: string; slug: string; product: 'engage' };
  admin: { userId: string; authUserId: string; email: string };
  temporaryPassword: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ProvisionValidationError extends Error {}
export class ProvisionConflictError extends Error {}

export function validateProvisionInput(body: unknown): ProvisionInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const slug = typeof b.slug === 'string' ? b.slug.trim() : '';
  const adminEmail = typeof b.adminEmail === 'string' ? b.adminEmail.trim().toLowerCase() : '';
  const adminFullName = typeof b.adminFullName === 'string' ? b.adminFullName.trim() : '';
  if (name.length < 2 || name.length > 255) throw new ProvisionValidationError('name must be 2-255 characters');
  if (!SLUG_RE.test(slug)) throw new ProvisionValidationError('slug must be lowercase letters, digits and dashes (2-63 chars)');
  if (!EMAIL_RE.test(adminEmail) || adminEmail.length > 255) throw new ProvisionValidationError('adminEmail is invalid');
  if (adminFullName.length < 2 || adminFullName.length > 255) throw new ProvisionValidationError('adminFullName must be 2-255 characters');
  return { name, slug, adminEmail, adminFullName };
}

/** Route entry point: takes a client from the legacy admin pool (the only place engage code does). */
export async function provisionWithAdminPool(input: ProvisionInput): Promise<ProvisionResult> {
  const { pool } = await import('../../db/index.js');
  const client = await pool.connect();
  try {
    return await provisionOrganization(client, input);
  } finally {
    client.release();
  }
}

export async function provisionOrganization(client: PoolClient, input: ProvisionInput): Promise<ProvisionResult> {
  const temporaryPassword = randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const authUserId = randomUUID();

  await client.query('BEGIN');
  try {
    const org = await client.query<{ id: string }>(
      `INSERT INTO organizations (name, slug, product) VALUES ($1, $2, 'engage')
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [input.name, input.slug],
    );
    const orgId = org.rows[0]?.id;
    if (!orgId) throw new ProvisionConflictError('slug already exists');

    // reimbursement_users first: employee_auth upserts elsewhere would otherwise attach new users to the default org.
    const user = await client.query<{ id: string }>(
      `INSERT INTO reimbursement_users (organization_id, auth_user_id, email, full_name, role, status)
       VALUES ($1, $2, $3, $4, 'admin', 'active') RETURNING id`,
      [orgId, authUserId, input.adminEmail, input.adminFullName],
    );
    await client.query(
      `INSERT INTO employee_auth (auth_user_id, email, password_hash, must_change_password, account_status)
       VALUES ($1, $2, $3, true, 'active')`,
      [authUserId, input.adminEmail, passwordHash],
    );
    await client.query('INSERT INTO engage.tenant_settings (organization_id) VALUES ($1)', [orgId]);
    await client.query('COMMIT');

    return {
      organization: { id: orgId, name: input.name, slug: input.slug, product: 'engage' },
      admin: { userId: user.rows[0]!.id, authUserId, email: input.adminEmail },
      temporaryPassword,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

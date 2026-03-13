/**
 * Phase 1.2: Tenant context for Row-Level Security (RLS)
 *
 * - setTenantContext: Express middleware that extracts tenant ID from auth context
 * - withTenantQuery: Wraps DB operations in a transaction with app.current_tenant set
 *
 * Must run AFTER auth middleware (requireAuth / reimbursementAuth) which sets
 * organizationId or tenantId from JWT claims / user lookup.
 */

import type { Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../db/index.js';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

/**
 * Extracts tenant_id from the authenticated user.
 * Runs AFTER auth middleware (requireAuth / reimbursementAuth).
 * In our model, tenant_id = organization_id.
 */
export async function setTenantContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tenantId =
    req.tenantId ?? (req as { organizationId?: string }).organizationId;

  if (!tenantId) {
    res.status(403).json({ error: 'No tenant context' });
    return;
  }

  req.tenantId = tenantId;
  res.locals.tenantId = tenantId;
  next();
}

/**
 * Wrapper for DB queries that sets the RLS context.
 * SET LOCAL scopes the setting to the current transaction.
 *
 * @param tenantId - UUID of the tenant (organization_id)
 * @param fn - Async function that receives the PoolClient and returns T
 */
export async function withTenantQuery<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // SET LOCAL does not support $1; use set_config for parameterized tenant context
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

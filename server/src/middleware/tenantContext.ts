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
import { withTenantQuery } from '../db/index.js';

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

export { withTenantQuery };

import type { Express } from 'express';
import { assertEngageRoleSafe } from './db.js';
import { engageRouter } from './routes.js';

/** Mounts /api/engage only if the engage DB role is configured and cannot bypass RLS (ADR-002). Otherwise it stays off. */
export async function mountEngage(app: Express): Promise<boolean> {
  try {
    const role = await assertEngageRoleSafe();
    app.use('/api/engage', engageRouter);
    console.log(`[Engage] mounted at /api/engage (database role ${role})`);
    return true;
  } catch (err) {
    console.error('[Engage] NOT mounted:', err instanceof Error ? err.message : err);
    return false;
  }
}

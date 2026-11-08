import type { Express } from 'express';
import { assertEngageRoleSafe } from './db.js';
import { assertMasterKeyForMount } from './crypto.js';
import { logError, logInfo } from './log.js';
import { engageRouter } from './routes.js';

/** Mounts /api/engage only if the engage DB role is configured and cannot bypass RLS (ADR-002). Otherwise it stays off. */
export async function mountEngage(app: Express): Promise<boolean> {
  try {
    const role = await assertEngageRoleSafe();
    assertMasterKeyForMount();
    app.use('/api/engage', engageRouter);
    logInfo(`mounted at /api/engage (database role ${role})`);
    return true;
  } catch (err) {
    logError(`NOT mounted: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

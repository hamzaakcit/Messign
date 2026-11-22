import { logError } from '../log.js';

/**
 * Checks that belong to the platform, not to a tenant (WP-29): the dead-letter depth of the engage job queues. pg-boss keeps a
 * job that used up its retries in state `failed`; for the engage queues that is work nobody did (an import that never ran, a
 * journey tick that kept failing). Read with the server's own pool, since the engage role has no access to the queue's schema.
 * Where the queue schema does not exist (a database without pg-boss, as in tests) the answer is none.
 */
export async function failedEngageJobs(): Promise<Record<string, number>> {
  try {
    const { pool } = await import('../../db/index.js');
    const r = await pool.query<{ name: string; n: number }>(
      `SELECT name, count(*)::int AS n FROM pgboss.job WHERE name LIKE 'engage/%' AND state = 'failed' AND completed_on > now() - interval '24 hours' GROUP BY name ORDER BY name`);
    return Object.fromEntries(r.rows.map((x) => [x.name, x.n]));
  } catch (err) {
    if ((err as { code?: string }).code !== '42P01' && (err as { code?: string }).code !== '3F000') logError('could not read the job queue', { name: err instanceof Error ? err.name : 'error' });
    return {};
  }
}

export interface PlatformCondition { key: string; severity: 'warning' | 'critical'; text: string }

export function platformConditions(failed: Record<string, number>): PlatformCondition[] {
  return Object.entries(failed).filter(([, n]) => n > 0).map(([name, n]) => ({
    key: `job_failed:${name}`, severity: n >= 10 ? 'critical' : 'warning',
    text: `${n} ${name} job${n === 1 ? '' : 's'} failed for good in the last 24 hours (the dead-letter queue)`,
  }));
}

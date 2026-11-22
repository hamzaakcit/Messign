import { JOB_NAMES, registerJobHandler, scheduleJob } from '../../services/jobQueue.js';
import { logInfo } from '../log.js';
import { tracked } from '../ops/errors.js';
import { runIysSync } from './sync.js';

/**
 * The İYS sync wake-up (WP-26, ADR-022): every ten minutes, push the queued opt-outs and pull recipients' changes for every
 * tenant that has an İYS account. The work is found in the database, so a missed or doubled wake-up changes only how soon
 * an opt-out reaches İYS or İYS's changes reach the send gate. Ten minutes keeps a pull a long way inside İYS's hourly limit
 * of 100 history listings per IP, shared by every tenant that uses this server's address.
 */
export async function registerEngageIysSyncJob(): Promise<void> {
  await registerJobHandler(JOB_NAMES.ENGAGE_IYS_SYNC, tracked('iys_sync_job', async () => {
    const s = await runIysSync();
    if (s.tenants) logInfo('iys sync run', { ...s });
  }), { batchSize: 1 });
  await scheduleJob(JOB_NAMES.ENGAGE_IYS_SYNC, '*/10 * * * *');
  logInfo('iys sync job registered');
}

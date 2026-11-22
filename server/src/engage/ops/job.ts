import { JOB_NAMES, registerJobHandler, scheduleJob } from '../../services/jobQueue.js';
import { logInfo } from '../log.js';
import { tracked } from './errors.js';
import { runOpsCheck } from './monitor.js';

/** The ops check's wake-up (WP-29, ADR-024): every five minutes. The tenants to look at are found in the database, so a missed or doubled run changes only how soon a problem is noticed. */
export async function registerEngageOpsJob(): Promise<void> {
  await registerJobHandler(JOB_NAMES.ENGAGE_OPS_CHECK, tracked('ops_job', async () => { await runOpsCheck(); }), { batchSize: 1 });
  await scheduleJob(JOB_NAMES.ENGAGE_OPS_CHECK, '*/5 * * * *');
  logInfo('ops check job registered');
}

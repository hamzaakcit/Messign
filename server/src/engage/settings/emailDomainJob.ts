import { JOB_NAMES, registerJobHandler, scheduleJob } from '../../services/jobQueue.js';
import { logInfo } from '../log.js';
import { recheckDueEmailDomains } from './emailDomain.js';

/**
 * The hourly wake-up of the email domain re-check (ADR-020). The tenants that are due are found in the database
 * (migration 132), so a missed or doubled wake-up changes nothing but how soon a removed DNS record is noticed.
 */
export async function registerEngageEmailDomainJob(): Promise<void> {
  await registerJobHandler(JOB_NAMES.ENGAGE_EMAIL_DOMAIN_RECHECK, async () => {
    const s = await recheckDueEmailDomains();
    if (s.due) logInfo('email domain re-check run', { ...s });
  }, { batchSize: 1 });
  await scheduleJob(JOB_NAMES.ENGAGE_EMAIL_DOMAIN_RECHECK, '17 * * * *');
  logInfo('email domain re-check job registered');
}

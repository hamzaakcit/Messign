import { JOB_NAMES, registerJobHandler, scheduleJob } from '../../services/jobQueue.js';
import { logInfo } from '../log.js';
import { tracked } from '../ops/errors.js';
import { runDueTemplateChecks } from './templateCheck.js';

/**
 * The hourly WhatsApp template check (WP-40a, ADR-025). Meta's status webhook usually tells us first; this is what catches a
 * webhook that never arrived. The tenants that are due come from the database (migration 137), so a missed or doubled wake-up
 * only changes how soon a change is seen.
 */
export async function registerEngageWhatsappTemplateJob(): Promise<void> {
  await registerJobHandler(JOB_NAMES.ENGAGE_WHATSAPP_TEMPLATE_CHECK, tracked('whatsapp_template_job', async () => {
    const s = await runDueTemplateChecks();
    if (s.due) logInfo('whatsapp template check run', { ...s });
  }), { batchSize: 1 });
  await scheduleJob(JOB_NAMES.ENGAGE_WHATSAPP_TEMPLATE_CHECK, '41 * * * *');
  logInfo('whatsapp template check job registered');
}

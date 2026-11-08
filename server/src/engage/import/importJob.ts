import { JOB_NAMES, enqueueJob, registerJobHandler } from '../../services/jobQueue.js';
import { logInfo } from '../log.js';
import { markFailed, runImportJob } from './run.js';

/** Queue the job for an import record (ADR-003: pg-boss is the only async substrate). Returns false if the queue is down. */
export async function enqueueImport(orgId: string, importId: string): Promise<boolean> {
  const jobId = await enqueueJob(JOB_NAMES.ENGAGE_IMPORT, { importId, organizationId: orgId }, { singletonKey: importId, retryLimit: 2, retryDelay: 30 });
  if (!jobId) {
    await markFailed(orgId, importId, 'The job queue is not available; try again shortly');
    return false;
  }
  return true;
}

export async function registerEngageImportHandler(): Promise<void> {
  await registerJobHandler<{ importId: string; organizationId: string }>(JOB_NAMES.ENGAGE_IMPORT, async ([job]) => {
    await runImportJob(job!.data);
  }, { batchSize: 1 });
  logInfo('import job handler registered');
}

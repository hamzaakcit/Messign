import { withEngageScheduler } from './db.js';
import { JOB_NAMES, registerJobHandler, scheduleJob } from '../services/jobQueue.js';
import { logInfo } from './log.js';

/**
 * Creates the event partitions of the next two days ahead of time (WP-19 follow-up). Creating a partition takes an
 * exclusive lock on engage.events, which waits for any long transaction on events while every other event query
 * queues behind it; done by this job, an hour or more before a new month starts, the first event of the month finds
 * its partition ready. engage.ensure_event_partition refuses anything beyond two days ahead, and is a no-op when the
 * partition exists.
 */
export async function ensureUpcomingEventPartitions(): Promise<void> {
  await withEngageScheduler((c) => c.query(
    `SELECT engage.ensure_event_partition(now() + interval '1 day'),
            engage.ensure_event_partition(now() + interval '2 days' - interval '1 minute')`));
}

export async function registerEngagePartitionJob(): Promise<void> {
  await registerJobHandler(JOB_NAMES.ENGAGE_PARTITIONS, async () => { await ensureUpcomingEventPartitions(); }, { batchSize: 1 });
  await scheduleJob(JOB_NAMES.ENGAGE_PARTITIONS, '7 * * * *');
  await ensureUpcomingEventPartitions();
  logInfo('event partition job registered');
}

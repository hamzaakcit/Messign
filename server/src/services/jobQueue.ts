import { PgBoss } from 'pg-boss';
import type { Job, SendOptions, WorkOptions } from 'pg-boss';

/**
 * PostgreSQL-backed job queue using pg-boss.
 * No Redis or external queue infrastructure needed — runs on the same
 * Postgres database the application already uses.
 */

let boss: PgBoss | null = null;

/** pg-boss allows alnum, `_`, `-`, `.`, `/` only — no `:` (see pg-boss attorney assertQueueName). */
export const JOB_NAMES = {
  BATCH_GENERATE: 'marketing/batch-generate',
  COMPETITOR_SCRAPE: 'marketing/competitor-scrape',
  DASHBOARD_SNAPSHOT: 'marketing/dashboard-snapshot',
  /** Weekly email performance aggregation for Content Strategist calibration (Phase 7). */
  CALIBRATION_SNAPSHOT: 'marketing/calibration-snapshot',
  /** Engage CSV import (ADR-003). */
  ENGAGE_IMPORT: 'engage/import',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

/**
 * Initialize and start the pg-boss job queue.
 * Call once during server startup, after the database is reachable.
 */
export async function startJobQueue(connectionString: string): Promise<PgBoss> {
  if (boss) {
    console.warn('[JobQueue] Already initialized, returning existing instance');
    return boss;
  }

  boss = new PgBoss({
    connectionString,
    schema: 'pgboss',
    monitorIntervalSeconds: 30,
  });

  boss.on('error', (error: Error) => {
    console.error('[JobQueue] pg-boss error:', error);
  });

  await boss.start();
  await ensureJobQueuesExist(boss);
  console.info('[JobQueue] pg-boss started successfully');
  return boss;
}

/**
 * pg-boss v10+ requires each queue to exist in `pgboss.queue` before `work()` subscribes.
 * Creating queues here is idempotent; concurrent deploys may race `createQueue` (handled).
 */
async function ensureJobQueuesExist(pgBoss: PgBoss): Promise<void> {
  for (const name of Object.values(JOB_NAMES)) {
    const existing = await pgBoss.getQueue(name);
    if (existing) {
      continue;
    }
    try {
      await pgBoss.createQueue(name);
      console.info(`[JobQueue] Created queue "${name}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate|unique|already exists/i.test(msg)) {
        continue;
      }
      throw err;
    }
  }
}

/** Get the running pg-boss instance. Throws if not initialized. */
export function getQueue(): PgBoss {
  if (!boss) {
    throw new Error('[JobQueue] pg-boss not initialized. Call startJobQueue() first.');
  }
  return boss;
}

/** Gracefully stop the job queue. Call during server shutdown. */
export async function stopJobQueue(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 10_000 });
    boss = null;
    console.info('[JobQueue] pg-boss stopped');
  }
}

/**
 * Register a worker for a specific job type.
 *
 * In pg-boss v12, the handler receives an array of jobs (batch).
 * With `batchSize: 1` (default) each invocation gets exactly one job.
 */
export async function registerJobHandler<T extends object>(
  jobName: JobName,
  handler: (jobs: Job<T>[]) => Promise<void>,
  options?: WorkOptions,
): Promise<string> {
  const queue = getQueue();

  const workerId = await queue.work<T>(
    jobName,
    { batchSize: 1, ...options },
    async (jobs) => {
      for (const job of jobs) {
        console.info(`[JobQueue] Processing ${jobName}:${job.id}`);
        try {
          await handler([job]);
          console.info(`[JobQueue] Completed ${jobName}:${job.id}`);
        } catch (error) {
          console.error(`[JobQueue] Failed ${jobName}:${job.id}:`, error);
          throw error;
        }
      }
    },
  );

  console.info(`[JobQueue] Registered handler for "${jobName}" (worker ${workerId})`);
  return workerId;
}

/**
 * Enqueue a new job.
 * @returns The pg-boss job ID, or null if enqueue failed.
 */
export async function enqueueJob(
  jobName: JobName,
  data: Record<string, unknown>,
  options?: SendOptions,
): Promise<string | null> {
  try {
    const queue = getQueue();
    const jobId = await queue.send(jobName, data, options);
    if (jobId == null) {
      console.warn(`[JobQueue] send() returned null for ${jobName}`);
      return null;
    }
    console.info(`[JobQueue] Enqueued ${jobName}:${jobId}`);
    return jobId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[JobQueue] Enqueue failed for ${jobName}:`, message);
    return null;
  }
}

/** Cancel a job by queue name and ID. */
export async function cancelJob(jobName: JobName, jobId: string): Promise<void> {
  const queue = getQueue();
  await queue.cancel(jobName, jobId);
  console.info(`[JobQueue] Cancelled ${jobName}:${jobId}`);
}

/** True when pg-boss was never started or getQueue() cannot be used (e.g. ENABLE_PG_BOSS=false). */
export function isJobQueueUnavailableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /pg-boss not initialized|JobQueue.*not initialized|\[JobQueue\]/i.test(err.message);
}

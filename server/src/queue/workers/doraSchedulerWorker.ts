import { Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../connection.js';
import { query } from '../../db/index.js';
import { doraScheduler, runSchedulerJobForAllOrgs } from '../../services/finance/doraScheduler.js';

const connection = redisConnection as unknown as ConnectionOptions;

interface SchedulerJob {
  type: string;
}

const MATERIALIZED_VIEWS = [
  'mv_department_spend',
  'mv_budget_health',
  'mv_approval_pipeline',
  'mv_team_performance',
  'mv_project_velocity',
];

async function refreshMaterializedViews(): Promise<void> {
  for (const view of MATERIALIZED_VIEWS) {
    try {
      await query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
      console.log(`[DoraScheduler] Refreshed ${view}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[DoraScheduler] Could not refresh ${view}:`, message);
    }
  }
}

const worker = new Worker<SchedulerJob>(
  'dora-scheduler',
  async (job: Job<SchedulerJob>) => {
    const { type } = job.data;
    console.log(`[DoraScheduler] Running: ${type}`);

    switch (type) {
      case 'budget_health_check':
        await runSchedulerJobForAllOrgs('checkBudgetHealth', (orgId) =>
          doraScheduler.checkBudgetHealth(orgId),
        );
        break;

      case 'sla_check':
        await runSchedulerJobForAllOrgs('checkApprovalSLAs', (orgId) =>
          doraScheduler.checkApprovalSLAs(orgId),
        );
        break;

      case 'overdue_invoice_check':
        await runSchedulerJobForAllOrgs('checkOverdueInvoices', (orgId) =>
          doraScheduler.checkOverdueInvoices(orgId),
        );
        break;

      case 'recurring_invoice_generation':
        await runSchedulerJobForAllOrgs('generateRecurringInvoices', (orgId) =>
          doraScheduler.generateRecurringInvoices(orgId),
        );
        break;

      case 'refresh_materialized_views':
        await refreshMaterializedViews();
        break;

      default:
        console.log(`[DoraScheduler] Unknown job type: ${type}`);
    }
  },
  { connection, concurrency: 1 },
);

worker.on('error', (err) => console.warn('[DoraScheduler] Worker error (Redis?):', err.message));
worker.on('completed', (job) => console.log(`[DoraScheduler] ${job.name} completed`));
worker.on('failed', (job, err) => console.error(`[DoraScheduler] ${job?.name} failed:`, err.message));

export default worker;

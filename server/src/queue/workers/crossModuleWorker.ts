import { Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../connection.js';

const connection = redisConnection as unknown as ConnectionOptions;

// Handles cross-module side effects:
// - deal.won → generate invoice
// - expense.approved → update budget burn
// - task.completed → award XP
// - invoice.paid → update vendor payment timeline

interface CrossModuleJob {
  type: string;
  payload: Record<string, unknown>;
  sourceEvent: string;
}

const worker = new Worker<CrossModuleJob>(
  'cross-module',
  async (job: Job<CrossModuleJob>) => {
    const { type, payload, sourceEvent } = job.data;
    console.log(`[CrossModule] Processing ${type} from ${sourceEvent}`, payload);

    switch (type) {
      case 'update_budget_burn':
        // TODO: Call budgets DAL to recalculate burn rate
        console.log(`[CrossModule] Would update budget burn for expense ${payload.expenseId}`);
        break;
      case 'award_xp':
        // TODO: Call gamification service
        console.log(`[CrossModule] Would award ${payload.amount} XP to ${payload.userId}`);
        break;
      case 'update_vendor_timeline':
        // TODO: Call vendor DAL
        console.log(`[CrossModule] Would update vendor timeline for payment ${payload.paymentId}`);
        break;
      case 'generate_invoice_from_deal':
        console.log(`[CrossModule] Would create invoice from deal ${payload.dealId} for ${payload.amount} ${payload.currency}`);
        break;
      case 'generate_invoice_from_time':
        console.log(`[CrossModule] Would create invoice from timesheet for client ${payload.clientId}`);
        break;
      case 'update_okr_progress':
        console.log(`[CrossModule] Would recalculate OKR auto-progress from ${payload.source}`);
        break;
      default:
        console.log(`[CrossModule] Unknown job type: ${type}`);
    }
  },
  { connection, concurrency: 5 }
);

worker.on('error', (err) => console.warn('[CrossModule] Worker error (Redis?):', err.message));
worker.on('completed', (job) => console.log(`[CrossModule] Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[CrossModule] Job ${job?.id} failed:`, err.message));

export default worker;

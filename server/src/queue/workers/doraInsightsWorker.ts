import { Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../connection.js';

const connection = redisConnection as unknown as ConnectionOptions;

interface DoraInsightJob {
  type: 'analyze_expense' | 'budget_health_check' | 'sla_check' | 'overdue_invoice_check' | 'generate_insight';
  payload: Record<string, unknown>;
}

const worker = new Worker<DoraInsightJob>(
  'dora-insights',
  async (job: Job<DoraInsightJob>) => {
    const { type, payload } = job.data;
    console.log(`[DoraInsights] Processing ${type}`, payload);

    switch (type) {
      case 'analyze_expense':
        // TODO: Run AI review pipeline on the expense
        console.log(`[DoraInsights] Would analyze expense ${payload.expenseId}`);
        break;
      case 'budget_health_check':
        // TODO: Check all budgets, generate alerts for >85%
        console.log(`[DoraInsights] Would check all budget health`);
        break;
      case 'sla_check':
        // TODO: Check approval SLAs, escalate breaches
        console.log(`[DoraInsights] Would check SLA compliance`);
        break;
      case 'overdue_invoice_check':
        // TODO: Find overdue invoices, generate reminders
        console.log(`[DoraInsights] Would check overdue invoices`);
        break;
      case 'generate_insight':
        // TODO: Generate a contextual Dora insight
        console.log(`[DoraInsights] Would generate insight for ${payload.module}`);
        break;
    }
  },
  { connection, concurrency: 3 }
);

worker.on('error', (err) => console.warn('[DoraInsights] Worker error (Redis?):', err.message));
worker.on('completed', (job) => console.log(`[DoraInsights] Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[DoraInsights] Job ${job?.id} failed:`, err.message));

export default worker;

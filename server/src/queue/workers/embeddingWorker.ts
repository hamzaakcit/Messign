/**
 * Embedding Worker — Processes entity embedding jobs from domain events
 *
 * Consumes the embeddings queue; calls embedAndStore for each job.
 * Supports direct EmbeddingInput jobs and fetch-and-embed jobs for support/finance.
 */
import { Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../connection.js';
import { query } from '../../db/index.js';
import { embedAndStore, type EmbeddingInput } from '../../services/ai/rag/embeddingPipeline.js';

const connection = redisConnection as unknown as ConnectionOptions;

type EmbeddingJobData =
  | { type: 'embed'; payload: EmbeddingInput }
  | { type: 'fetch_support_ticket'; ticketId: string; organizationId: string; sourceType: 'ticket_created' | 'ticket_resolved' }
  | { type: 'fetch_expense'; expenseId: string; organizationId: string };

async function processEmbeddingJob(job: Job<EmbeddingJobData>): Promise<void> {
  const data = job.data;

  if (data.type === 'embed') {
    const input = data.payload;
    if (!input.tenantId || !input.sourceId || !input.text?.trim()) {
      console.warn('[EmbeddingWorker] Skipping embed job: missing tenantId, sourceId, or text');
      return;
    }
    await embedAndStore(input);
    console.log(`[EmbeddingWorker] Embedded ${input.sourceModule}:${input.sourceType} (${input.sourceId.substring(0, 8)}...)`);
    return;
  }

  if (data.type === 'fetch_support_ticket') {
    const row = await query<{ subject: string; description: string | null }>(
      `SELECT subject, description FROM support_tickets WHERE id = $1 AND organization_id = $2`,
      [data.ticketId, data.organizationId],
    ).then((r) => r.rows[0]);
    if (!row) {
      console.warn('[EmbeddingWorker] Support ticket not found:', data.ticketId);
      return;
    }
    const text = data.sourceType === 'ticket_created'
      ? `${row.subject}. ${row.description ?? ''}`.trim()
      : `Resolved: ${row.subject}. ${row.description ?? ''}`.trim();
    if (!text) return;
    await embedAndStore({
      tenantId: data.organizationId,
      sourceModule: 'support',
      sourceType: data.sourceType === 'ticket_created' ? 'ticket_description' : 'ticket_resolution',
      sourceId: data.ticketId,
      text,
      metadata: { ticket_id: data.ticketId },
      accessRoles: ['support', 'manager', 'admin'],
      sensitivity: 'normal',
    });
    console.log(`[EmbeddingWorker] Embedded support:${data.sourceType} (${data.ticketId.substring(0, 8)}...)`);
    return;
  }

  if (data.type === 'fetch_expense') {
    const row = await query<{ title: string; description: string | null; original_amount: number; category_slug: string }>(
      `SELECT title, description, original_amount, category_slug FROM reimbursement_requests WHERE id = $1 AND organization_id = $2`,
      [data.expenseId, data.organizationId],
    ).then((r) => r.rows[0]);
    if (!row) {
      console.warn('[EmbeddingWorker] Expense not found:', data.expenseId);
      return;
    }
    const text = `${row.title}. ${row.description ?? ''}. Amount: ${row.original_amount}. Category: ${row.category_slug}`.trim();
    if (!text) return;
    await embedAndStore({
      tenantId: data.organizationId,
      sourceModule: 'finance',
      sourceType: 'expense_description',
      sourceId: data.expenseId,
      text,
      metadata: { amount: row.original_amount, category: row.category_slug },
      accessRoles: ['finance', 'manager', 'admin'],
      sensitivity: 'confidential',
    });
    console.log(`[EmbeddingWorker] Embedded finance:expense_description (${data.expenseId.substring(0, 8)}...)`);
  }
}

const embeddingWorker = new Worker<EmbeddingJobData>(
  'embeddings',
  processEmbeddingJob,
  {
    connection,
    concurrency: 3,
  },
);

embeddingWorker.on('failed', (job, err) => {
  console.error('[EmbeddingWorker] Job failed:', job?.id, err?.message);
});

export default embeddingWorker;

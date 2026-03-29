import { Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../connection.js';
import type { EmailBulkResolveJobData } from '../emailBulkResolveQueue.js';
import { EMAIL_BULK_RESOLVE_QUEUE_NAME } from '../emailBulkResolveQueue.js';
import { validateEmailManifestInput } from '../../modules/marketing/emailManifestValidate.js';
import {
  runEmailImageResolvePipeline,
  type ResolveImagesManifest,
} from '../../services/marketing/emailImageResolvePipeline.js';
import { persistEmailResolveManifestToContent } from '../../modules/marketing/persistEmailResolve.js';
import type { CallerContext } from '../../dal/types.js';
import { setCachedEmailResolveAsync } from '../../routes/marketing/emailResolveIdempotency.js';

const connection = redisConnection as unknown as ConnectionOptions;

function bulkWorkerCtx(orgId: string): CallerContext {
  return {
    userId: 'system-email-bulk-resolve',
    role: 'admin',
    organizationId: orgId,
  };
}

/**
 * Processes batched email image-resolve jobs: validates each manifest, runs the same pipeline as
 * POST /resolve-email-images, persists merged manifests, and aggregates per-row outcomes.
 */
const worker = new Worker<EmailBulkResolveJobData>(
  EMAIL_BULK_RESOLVE_QUEUE_NAME,
  async (job: Job<EmailBulkResolveJobData>) => {
    const { orgId, contentIds, manifests, idempotencyKey, requestedAt } = job.data;
    const n = Math.min(contentIds.length, manifests.length);
    const ctx = bulkWorkerCtx(orgId);
    const rowResults: Array<{
      contentId: string;
      ok: boolean;
      error?: string;
      validationErrors?: { field: string; message: string }[];
      partial?: boolean;
      resolveRunId?: string;
    }> = [];

    for (let i = 0; i < n; i++) {
      const contentId = contentIds[i];
      const raw = manifests[i];
      const validated = validateEmailManifestInput(raw);
      if (!validated.valid) {
        rowResults.push({
          contentId,
          ok: false,
          validationErrors: validated.errors.map((e) => ({ field: e.field, message: e.message })),
        });
        continue;
      }

      const manifest = raw as unknown as ResolveImagesManifest;
      const pairIdem = idempotencyKey ? `${idempotencyKey}:${contentId}` : undefined;

      try {
        const { responseBody, resolveRunId } = await runEmailImageResolvePipeline({
          orgId,
          contentId,
          manifest,
          idempotencyKey: pairIdem,
        });

        await persistEmailResolveManifestToContent(
          ctx,
          contentId,
          manifest as unknown as Record<string, unknown>,
          responseBody,
          resolveRunId,
        );

        if (pairIdem) {
          await setCachedEmailResolveAsync(`email-resolve:${orgId}:${contentId}:${pairIdem}`, responseBody);
        }

        rowResults.push({
          contentId,
          ok: true,
          partial: Boolean(responseBody.partial),
          resolveRunId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rowResults.push({ contentId, ok: false, error: msg });
        console.error(
          JSON.stringify({
            event: 'email_bulk_resolve_row_failed',
            jobId: job.id,
            contentId,
            orgId,
            error: msg,
          }),
        );
      }
    }

    const okCount = rowResults.filter((r) => r.ok).length;
    const failCount = rowResults.length - okCount;

    console.log(
      JSON.stringify({
        event: 'email_bulk_resolve_completed',
        jobId: job.id,
        orgId,
        pairs: n,
        okCount,
        failCount,
        requestedAt,
        idempotencyKey: idempotencyKey ?? null,
      }),
    );

    return {
      ok: failCount === 0,
      processed: n,
      okCount,
      failCount,
      rowResults,
    };
  },
  { connection, concurrency: 2 },
);

worker.on('error', (err) => console.warn('[EmailBulkResolve] Worker error (Redis?):', err.message));
worker.on('completed', (job) => console.log(`[EmailBulkResolve] Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[EmailBulkResolve] Job ${job?.id} failed:`, err.message));

export default worker;

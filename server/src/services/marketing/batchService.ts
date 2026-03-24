import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import { enqueueJob, JOB_NAMES, registerJobHandler, cancelJob } from '../jobQueue.js';
import type { Job } from 'pg-boss';
import { getChannelGenerator } from './channelGenerators/registry.js';
import type { GeneratorInput, LLMCallFunction } from './channelGenerators/types.js';
import { generateResponse, LLM_TIER } from '../ai/llmGateway.js';
import { createContent } from '../../dal/marketing/content.js';
import type { CallerContext } from '../../dal/types.js';
import { runInstagramImageGeneration } from './workflows/instagramImagePipeline.js';
import { evaluateBatchTriggers } from './mpTriggerService.js';

// -- Types --

export interface CreateBatchJobInput {
  organizationId: string;
  heroContentId: string;
  channels: string[];
  userId: string;
}

export interface BatchJobRecord {
  id: string;
  organization_id: string;
  hero_content_id: string;
  status: BatchJobStatus;
  channels: string[];
  total_channels: number;
  completed_channels: number;
  failed_channels: number;
  results: BatchChannelResult[];
  error_log: BatchError[];
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  pgboss_job_id: string | null;
}

export type BatchJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'partial'
  | 'cancelled';

export interface BatchChannelResult {
  channel: string;
  content_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface BatchError {
  channel: string;
  error: string;
  timestamp: string;
}

// -- Valid Channels --

export const VALID_BATCH_CHANNELS = [
  'email',
  'twitter',
  'instagram',
  'linkedin',
  'sms',
] as const;

export type BatchChannel = (typeof VALID_BATCH_CHANNELS)[number];

/** Type guard for supported batch channels (case-sensitive). */
export function isValidChannel(channel: string): channel is BatchChannel {
  return VALID_BATCH_CHANNELS.includes(channel as BatchChannel);
}

// -- Tenant-scoped DB helper --

async function runInTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

// -- Service Functions --

/**
 * Create a new batch job and enqueue it for background processing.
 * Validates inputs, marks the hero content as is_hero_asset, inserts a
 * batch_jobs record, and enqueues a pg-boss job.
 */
export async function createBatchJob(
  input: CreateBatchJobInput,
): Promise<BatchJobRecord> {
  const { organizationId, heroContentId, channels, userId } = input;

  const validChannels = channels.filter(isValidChannel);
  if (validChannels.length === 0) {
    throw new Error(
      'No valid channels provided. Valid channels: ' +
        VALID_BATCH_CHANNELS.join(', '),
    );
  }

  return runInTenant(organizationId, async (client) => {
    const heroCheck = await client.query(
      'SELECT id FROM marketing_content WHERE id = $1',
      [heroContentId],
    );
    if (heroCheck.rows.length === 0) {
      throw new Error(`Hero content ${heroContentId} not found`);
    }

    const activeCheck = await client.query(
      `SELECT id FROM batch_jobs
       WHERE hero_content_id = $1 AND status IN ('pending', 'processing')
       LIMIT 1`,
      [heroContentId],
    );
    if (activeCheck.rows.length > 0) {
      throw new Error(
        `Hero content ${heroContentId} already has an active batch job: ${activeCheck.rows[0].id}`,
      );
    }

    await client.query(
      'UPDATE marketing_content SET is_hero_asset = true WHERE id = $1',
      [heroContentId],
    );

    const initialResults: BatchChannelResult[] = validChannels.map(
      (channel) => ({
        channel,
        content_id: null,
        status: 'pending' as const,
      }),
    );

    const insertResult = await client.query(
      `INSERT INTO batch_jobs
         (organization_id, hero_content_id, status, channels, total_channels,
          completed_channels, failed_channels, results, error_log, created_by)
       VALUES ($1, $2, 'pending', $3, $4, 0, 0, $5, '[]', $6)
       RETURNING *`,
      [
        organizationId,
        heroContentId,
        validChannels,
        validChannels.length,
        JSON.stringify(initialResults),
        userId,
      ],
    );

    const batchJob = rowToBatchJob(insertResult.rows[0]);

    const pgbossJobId = await enqueueJob(JOB_NAMES.BATCH_GENERATE, {
      batchJobId: batchJob.id,
      organizationId,
      heroContentId,
      channels: validChannels,
      userId,
    });

    if (pgbossJobId) {
      await client.query(
        'UPDATE batch_jobs SET pgboss_job_id = $1 WHERE id = $2',
        [pgbossJobId, batchJob.id],
      );
      batchJob.pgboss_job_id = pgbossJobId;
    }

    return batchJob;
  });
}

/** Get the current status of a batch job. */
export async function getBatchJobStatus(
  jobId: string,
  organizationId: string,
): Promise<BatchJobRecord | null> {
  return runInTenant(organizationId, async (client) => {
    const result = await client.query(
      'SELECT * FROM batch_jobs WHERE id = $1',
      [jobId],
    );
    if (result.rows.length === 0) return null;
    return rowToBatchJob(result.rows[0]);
  });
}

/** List batch jobs for an organization with optional status filter and pagination. */
export async function listBatchJobs(
  organizationId: string,
  options: { status?: string; limit?: number; offset?: number },
): Promise<{ jobs: BatchJobRecord[]; total: number }> {
  const { status, limit = 20, offset = 0 } = options;

  return runInTenant(organizationId, async (client) => {
    let where = 'WHERE 1=1';
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }

    const countResult = await client.query(
      `SELECT COUNT(*) as total FROM batch_jobs ${where}`,
      params,
    );

    params.push(limit, offset);
    const jobsResult = await client.query(
      `SELECT * FROM batch_jobs ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      jobs: jobsResult.rows.map(rowToBatchJob),
      total: parseInt(String(countResult.rows[0]?.total ?? 0), 10),
    };
  });
}

/** Cancel a batch job. Only works for pending/processing jobs. */
export async function cancelBatchJob(
  jobId: string,
  organizationId: string,
): Promise<BatchJobRecord | null> {
  return runInTenant(organizationId, async (client) => {
    const result = await client.query(
      'SELECT * FROM batch_jobs WHERE id = $1',
      [jobId],
    );
    if (result.rows.length === 0) return null;

    const job = rowToBatchJob(result.rows[0]);

    if (job.status !== 'pending' && job.status !== 'processing') {
      throw new Error(
        `Cannot cancel batch job in "${job.status}" state`,
      );
    }

    if (job.pgboss_job_id) {
      try {
        await cancelJob(JOB_NAMES.BATCH_GENERATE, job.pgboss_job_id);
      } catch (error) {
        console.warn(
          `[BatchService] Failed to cancel pg-boss job ${job.pgboss_job_id}:`,
          error,
        );
      }
    }

    const updateResult = await client.query(
      `UPDATE batch_jobs
       SET status = 'cancelled', completed_at = now()
       WHERE id = $1 RETURNING *`,
      [jobId],
    );

    return rowToBatchJob(updateResult.rows[0]);
  });
}

/**
 * Update a specific channel result within a batch job.
 * Called by the job handler as each channel generator completes or fails.
 * Automatically computes aggregate job status.
 */
export async function updateChannelResult(
  jobId: string,
  organizationId: string,
  channel: string,
  update: {
    status: 'processing' | 'completed' | 'failed';
    content_id?: string;
    error?: string;
  },
): Promise<void> {
  await runInTenant(organizationId, async (client) => {
    const result = await client.query(
      'SELECT * FROM batch_jobs WHERE id = $1',
      [jobId],
    );
    if (result.rows.length === 0) {
      throw new Error(`Batch job ${jobId} not found`);
    }

    const job = rowToBatchJob(result.rows[0]);
    const results = [...job.results];
    const channelIdx = results.findIndex((r) => r.channel === channel);
    if (channelIdx === -1) {
      throw new Error(`Channel ${channel} not found in batch job`);
    }

    const now = new Date().toISOString();
    results[channelIdx] = {
      ...results[channelIdx],
      status: update.status,
      content_id: update.content_id ?? results[channelIdx].content_id,
      ...(update.status === 'processing' ? { started_at: now } : {}),
      ...(update.status === 'completed' || update.status === 'failed'
        ? { completed_at: now }
        : {}),
    };

    const errorLog = [...job.error_log];
    if (update.status === 'failed' && update.error) {
      errorLog.push({ channel, error: update.error, timestamp: now });
    }

    const overallStatus = computeOverallStatus(
      results,
      job.total_channels,
      job.status,
    );
    const completedCount = results.filter(
      (r) => r.status === 'completed',
    ).length;
    const failedCount = results.filter(
      (r) => r.status === 'failed',
    ).length;
    const allDone = completedCount + failedCount === job.total_channels;

    await client.query(
      `UPDATE batch_jobs
       SET results = $1, error_log = $2,
           completed_channels = $3, failed_channels = $4,
           status = $5,
           started_at = COALESCE(
             started_at,
             CASE WHEN $5 = 'processing' THEN now() ELSE NULL END
           ),
           completed_at = CASE WHEN $6 THEN now() ELSE completed_at END
       WHERE id = $7`,
      [
        JSON.stringify(results),
        JSON.stringify(errorLog),
        completedCount,
        failedCount,
        overallStatus,
        allDone,
        jobId,
      ],
    );

    // Fire-and-forget MP trigger for full batch completion
    if (overallStatus === 'completed' && allDone) {
      try {
        await evaluateBatchTriggers(
          organizationId, job.created_by, jobId,
          completedCount, job.total_channels,
          { query: (text, values) => client.query(text, values).then((r) => ({ rows: r.rows as Record<string, unknown>[] })) },
        );
      } catch (err) {
        console.warn('[MP] Failed to evaluate batch triggers:', err);
      }
    }
  });
}

/** Get all derivative content records created from a hero asset. */
export async function getDerivatives(
  heroContentId: string,
  organizationId: string,
): Promise<Record<string, unknown>[]> {
  return runInTenant(organizationId, async (client) => {
    const result = await client.query(
      `SELECT * FROM marketing_content
       WHERE parent_content_id = $1
       ORDER BY created_at DESC`,
      [heroContentId],
    );
    return result.rows;
  });
}

// -- Aggregate Status Logic --

/**
 * Compute the overall batch job status from individual channel results.
 * Extracted as a pure function for testability.
 */
export function computeOverallStatus(
  results: BatchChannelResult[],
  totalChannels: number,
  currentStatus: BatchJobStatus,
): BatchJobStatus {
  if (currentStatus === 'cancelled') return 'cancelled';

  const completed = results.filter((r) => r.status === 'completed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const allDone = completed + failed === totalChannels;

  if (!allDone) return 'processing';
  if (failed === 0) return 'completed';
  if (completed === 0) return 'failed';
  return 'partial';
}

// -- Row Mapping --

function rowToBatchJob(row: Record<string, unknown>): BatchJobRecord {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    hero_content_id: row.hero_content_id as string,
    status: row.status as BatchJobStatus,
    channels: row.channels as string[],
    total_channels: row.total_channels as number,
    completed_channels: row.completed_channels as number,
    failed_channels: row.failed_channels as number,
    results: (typeof row.results === 'string'
      ? JSON.parse(row.results)
      : row.results) as BatchChannelResult[],
    error_log: (typeof row.error_log === 'string'
      ? JSON.parse(row.error_log)
      : row.error_log) as BatchError[],
    created_by: row.created_by as string,
    created_at: String(row.created_at),
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    pgboss_job_id: (row.pgboss_job_id as string) ?? null,
  };
}

// -- Batch Job Handler --

interface BatchJobPayload {
  batchJobId: string;
  organizationId: string;
  heroContentId: string;
  channels: string[];
  userId: string;
}

const CHANNEL_CONTENT_TYPES: Record<string, string> = {
  email: 'email',
  twitter: 'social',
  instagram: 'social',
  linkedin: 'social',
  sms: 'other',
};

/** Build an LLM call function that routes through the llmGateway. */
export function buildCallLLM(tenantId: string): LLMCallFunction {
  return async (params) => {
    const tier = params.model === 'fast' ? LLM_TIER.FAST : LLM_TIER.COMPLEX;
    const result = await generateResponse({
      tier,
      systemPrompt: params.systemPrompt,
      userMessage: params.userMessage,
      maxTokens: params.maxTokens ?? 1000,
      tenantId,
    });
    return result.content;
  };
}

/**
 * Register the batch generation job handler with pg-boss.
 * Call during server startup, after pg-boss is initialized.
 *
 * The handler processes channels in chunks, dispatching to channel-specific
 * generators and creating derivative content records linked to the hero asset.
 */
export async function registerBatchJobHandler(): Promise<string> {
  const CONCURRENCY_LIMIT = 5;

  return registerJobHandler<BatchJobPayload>(
    JOB_NAMES.BATCH_GENERATE,
    async (jobs: Job<BatchJobPayload>[]) => {
      const job = jobs[0];
      const { batchJobId, organizationId, heroContentId, channels, userId } =
        job.data;

      console.info(
        `[BatchHandler] Starting batch ${batchJobId}: ${channels.join(', ')}`,
      );

      const heroContent = await runInTenant(
        organizationId,
        async (client) => {
          const res = await client.query(
            'SELECT * FROM marketing_content WHERE id = $1',
            [heroContentId],
          );
          return res.rows[0] ?? null;
        },
      );

      if (!heroContent) {
        throw new Error(`Hero content ${heroContentId} not found`);
      }

      const callLLM = buildCallLLM(organizationId);

      const generatorInput: GeneratorInput = {
        heroContent: {
          id: heroContent.id as string,
          title: (heroContent.title as string) || '',
          body: (heroContent.body as string) || '',
          channel: (heroContent.channel as string) || '',
          metadata: {},
          organization_id: organizationId,
        },
        brandProfile: null,
        organizationId,
        userId,
      };

      const callerCtx: CallerContext = {
        userId,
        organizationId,
        role: 'system_admin',
      };

      for (let i = 0; i < channels.length; i += CONCURRENCY_LIMIT) {
        const chunk = channels.slice(i, i + CONCURRENCY_LIMIT);

        await Promise.allSettled(
          chunk.map(async (channel) => {
            await updateChannelResult(
              batchJobId,
              organizationId,
              channel,
              { status: 'processing' },
            );

            try {
              const generator = getChannelGenerator(channel);
              if (!generator) {
                throw new Error(`No generator registered for channel "${channel}"`);
              }

              const output = await generator(generatorInput, callLLM);

              const bodyDesign: Record<string, unknown> = {
                ...output.channelMetadata,
                ...(output.designManifest ? { design_manifest: output.designManifest } : {}),
                ...(output.imagePrompts?.length ? { image_prompts: output.imagePrompts } : {}),
              };

              const newContent = await createContent(callerCtx, {
                title: output.title,
                content_type: CHANNEL_CONTENT_TYPES[channel] || 'other',
                channel,
                status: 'in_review',
                body: output.body,
                body_design: bodyDesign,
                parent_content_id: heroContentId,
                author_id: userId,
              });

              await runInTenant(organizationId, async (client) => {
                await client.query(
                  'UPDATE marketing_content SET batch_job_id = $1 WHERE id = $2',
                  [batchJobId, newContent.id],
                );
              });

              if (channel === 'instagram') {
                const igImageResult = await runInstagramImageGeneration({
                  orgId: organizationId,
                  contentId: newContent.id,
                  rawDraft: output.body,
                  caller: callerCtx,
                  stylePreset: 'modern_noir',
                  intentContext: { title: output.title, userBrief: null },
                }).catch((err) => {
                  console.warn('[BatchHandler] Instagram image gen failed (non-fatal):', err);
                  return null;
                });
                if (igImageResult) {
                  console.log('[BatchHandler] Instagram batch image gen:', {
                    contentId: newContent.id,
                    success: igImageResult.success,
                    promptSource: igImageResult.promptSource,
                  });
                }
              }

              await updateChannelResult(
                batchJobId,
                organizationId,
                channel,
                { status: 'completed', content_id: newContent.id },
              );
            } catch (error) {
              const msg =
                error instanceof Error ? error.message : String(error);
              console.error(
                `[BatchHandler] Channel "${channel}" failed:`,
                msg,
              );
              await updateChannelResult(
                batchJobId,
                organizationId,
                channel,
                { status: 'failed', error: msg },
              );
            }
          }),
        );

        const currentJob = await getBatchJobStatus(
          batchJobId,
          organizationId,
        );
        if (currentJob?.status === 'cancelled') {
          console.info(
            `[BatchHandler] Batch ${batchJobId} cancelled, stopping`,
          );
          return;
        }
      }

      console.info(
        `[BatchHandler] Batch ${batchJobId} processing complete`,
      );
    },
    { batchSize: 1 },
  );
}

/**
 * Retry a single failed channel within an existing batch job.
 * Re-runs the generator and creates a new derivative content record.
 */
export async function retryBatchChannel(
  jobId: string,
  organizationId: string,
  channel: string,
  userId: string,
): Promise<BatchJobRecord> {
  const job = await getBatchJobStatus(jobId, organizationId);
  if (!job) throw new Error(`Batch job ${jobId} not found`);

  const channelResult = job.results.find((r) => r.channel === channel);
  if (!channelResult) {
    throw new Error(`Channel "${channel}" not found in batch job`);
  }
  if (channelResult.status !== 'failed') {
    throw new Error(
      `Channel "${channel}" is in "${channelResult.status}" state, only failed channels can be retried`,
    );
  }

  const generator = getChannelGenerator(channel);
  if (!generator) {
    throw new Error(`No generator registered for channel "${channel}"`);
  }

  const heroContent = await runInTenant(organizationId, async (client) => {
    const res = await client.query(
      'SELECT * FROM marketing_content WHERE id = $1',
      [job.hero_content_id],
    );
    return res.rows[0] ?? null;
  });

  if (!heroContent) {
    throw new Error(`Hero content ${job.hero_content_id} not found`);
  }

  const callLLM = buildCallLLM(organizationId);

  const generatorInput: GeneratorInput = {
    heroContent: {
      id: heroContent.id as string,
      title: (heroContent.title as string) || '',
      body: (heroContent.body as string) || '',
      channel: (heroContent.channel as string) || '',
      metadata: {},
      organization_id: organizationId,
    },
    brandProfile: null,
    organizationId,
    userId,
  };

  const callerCtx: CallerContext = {
    userId,
    organizationId,
    role: 'system_admin',
  };

  await updateChannelResult(jobId, organizationId, channel, {
    status: 'processing',
  });

  try {
    const output = await generator(generatorInput, callLLM);

    const bodyDesign: Record<string, unknown> = {
      ...output.channelMetadata,
      ...(output.designManifest ? { design_manifest: output.designManifest } : {}),
      ...(output.imagePrompts?.length ? { image_prompts: output.imagePrompts } : {}),
    };

    const newContent = await createContent(callerCtx, {
      title: output.title,
      content_type: CHANNEL_CONTENT_TYPES[channel] || 'other',
      channel,
      status: 'in_review',
      body: output.body,
      body_design: bodyDesign,
      parent_content_id: job.hero_content_id,
      author_id: userId,
    });

    await runInTenant(organizationId, async (client) => {
      await client.query(
        'UPDATE marketing_content SET batch_job_id = $1 WHERE id = $2',
        [jobId, newContent.id],
      );
    });

    if (channel === 'instagram') {
      await runInstagramImageGeneration({
        orgId: organizationId,
        contentId: newContent.id,
        rawDraft: output.body,
        caller: callerCtx,
        stylePreset: 'modern_noir',
        intentContext: { title: output.title, userBrief: null },
      }).catch((err) => {
        console.warn('[BatchRetry] Instagram image gen failed (non-fatal):', err);
      });
    }

    await updateChannelResult(jobId, organizationId, channel, {
      status: 'completed',
      content_id: newContent.id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateChannelResult(jobId, organizationId, channel, {
      status: 'failed',
      error: msg,
    });
    throw error;
  }

  const updated = await getBatchJobStatus(jobId, organizationId);
  if (!updated) throw new Error(`Batch job ${jobId} not found after retry`);
  return updated;
}

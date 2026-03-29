import { marketingRequest, BATCH_TERMINAL_STATES } from './helpers';
import type {
  PaginatedResult,
  ContentItem,
  ContentCalendarDay,
  EmailTemplate,
  BatchJob,
} from './types';
import type {
  EmailResolveRegeneratePayload,
  ResolveEmailImagesResponse,
} from '../../pages/marketing/lib/emailResolveTypes';

/** Fal queue + Kontext can run several minutes; avoid the browser giving up before the server responds. */
const AI_PHOTO_EDIT_CLIENT_TIMEOUT_MS = 900_000;

export const contentMethods = {
  listContent: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return marketingRequest<PaginatedResult<ContentItem>>(`/content?${params}`, {}, userId);
  },
  getContent: (userId: string, contentId: string) =>
    marketingRequest<ContentItem>(`/content/${contentId}`, { cache: 'no-store' }, userId),
  /** Org `marketing_brand_profile.profile` JSON — used for email builder color hints. */
  getBrandProfile: (userId: string) =>
    marketingRequest<{ profile: Record<string, unknown> | null }>('/brand-profile', {}, userId),
  createContent: (userId: string, data: Partial<ContentItem>) =>
    marketingRequest<ContentItem>('/content', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateContent: (
    userId: string,
    contentId: string,
    data: Partial<ContentItem> & { submit_for_review?: boolean },
  ) => marketingRequest<ContentItem>(`/content/${contentId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  publishContent: (userId: string, contentId: string) =>
    marketingRequest<ContentItem>(`/content/${contentId}/publish`, { method: 'POST' }, userId),
  scheduleContent: (userId: string, contentId: string, date: string, time?: string) =>
    marketingRequest<ContentItem>(`/content/${contentId}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ date, time }),
    }, userId),
  regenerateContentImage: (
    userId: string,
    contentId: string,
    payload: { image_prompt: string; style_preset?: string; aspect_ratio?: string },
  ) =>
    marketingRequest<{ success: boolean; image_url: string | null; error: string | null }>(
      `/content/${contentId}/regenerate-image`,
      { method: 'POST', body: JSON.stringify(payload) },
      userId,
    ),

  /** Upload reference JPEG/PNG/WebP (field name `image`) — sets `reference_image_url` on the content row. */
  uploadReferenceImage: (userId: string, contentId: string, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return marketingRequest<{ success: boolean; reference_image_url: string; content_id: string }>(
      `/content/${contentId}/reference-image`,
      { method: 'POST', body: fd },
      userId,
    );
  },

  /** Lucy Instagram modal: upload before content exists; use URL in [REFERENCE_IMAGE_URL] in the agent message. */
  uploadLucyReferenceImage: (userId: string, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return marketingRequest<{ success: boolean; reference_image_url: string }>(
      '/content/lucy-reference-upload',
      { method: 'POST', body: fd },
      userId,
    );
  },

  /** FLUX Kontext additive edit using stored `reference_image_url`. */
  aiPhotoEdit: (
    userId: string,
    contentId: string,
    payload: { edit_prompt: string; style_preset?: string },
  ) =>
    marketingRequest<{
      success: boolean;
      image_url: string | null;
      error: string | null;
      metadata?: Record<string, unknown> | null;
    }>(
      `/content/${contentId}/ai-photo-edit`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      userId,
      AI_PHOTO_EDIT_CLIENT_TIMEOUT_MS,
    ),

  generateImageVariants: (
    userId: string,
    contentId: string,
    payload: { image_prompt: string; style_presets?: string[]; aspect_ratio?: string },
  ) =>
    marketingRequest<{
      success: boolean;
      variants: Array<{
        id: string;
        image_url: string;
        style_preset: string;
        prompt: string;
        generated_at: string;
      }>;
    }>(
      `/content/${contentId}/image-variants`,
      { method: 'POST', body: JSON.stringify(payload) },
      userId,
    ),
  /** Batch-resolve AI-generated images; optional `regenerate` re-runs slots that already have URLs. */
  resolveEmailImages: (
    userId: string,
    contentId: string,
    payload: {
      manifest: Record<string, unknown>;
      workspace_id?: string | null;
      /** When true, server merges resolved manifest + email_resolve into `body_design.va2_manifest`. */
      persist?: boolean;
      webhook_url?: string;
      regenerate?: EmailResolveRegeneratePayload;
    },
    options?: { idempotencyKey?: string; signal?: AbortSignal },
  ) =>
    marketingRequest<ResolveEmailImagesResponse>(
      `/content/${contentId}/resolve-email-images`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          ...(options?.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
        },
        signal: options?.signal,
      },
      userId,
    ),

  enqueueEmailResolveBatch: (
    userId: string,
    payload: {
      content_ids: string[];
      manifests: Record<string, unknown>[];
      idempotency_key?: string;
    },
  ) =>
    marketingRequest<{ jobId: string | undefined; ok: boolean }>('/content/enqueue-email-resolve-batch', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, userId),

  /** Server-side VA2 manifest validation (same rules as `validateEmailManifestInput`). */
  validateEmailManifest: (userId: string, payload: { manifest: unknown }) =>
    marketingRequest<{
      valid: boolean;
      errors: Array<{ field: string; message: string; severity: string }>;
      warnings: Array<{ field: string; message: string; severity: string }>;
    }>('/content/validate-email-manifest', { method: 'POST', body: JSON.stringify(payload) }, userId),

  generateOverlayAsset: (
    userId: string,
    payload: { theme: string; effect: string; skip_fal?: boolean; brand_primary_hex?: string },
  ) =>
    marketingRequest<{ image_url: string; theme: string; cached: boolean }>(
      '/overlay-assets/generate',
      { method: 'POST', body: JSON.stringify(payload) },
      userId,
    ),

  getOverlayAssetUrl: (userId: string, theme: string, brandPrimaryHex?: string) => {
    const q =
      brandPrimaryHex && /^#?[0-9a-fA-F]{3,6}$/.test(brandPrimaryHex.trim())
        ? `?brand_primary_hex=${encodeURIComponent(
            brandPrimaryHex.trim().startsWith('#') ? brandPrimaryHex.trim() : `#${brandPrimaryHex.trim()}`,
          )}`
        : '';
    return marketingRequest<{ image_url: string | null }>(
      `/overlay-assets/${theme}/paper-plane${q}`,
      {},
      userId,
    );
  },

  repurposeContent: (
    userId: string,
    contentId: string,
    payload: { target_channels: string[]; style_hints?: Record<string, string> },
  ) =>
    marketingRequest<{
      success: boolean;
      variants: Array<{ content_id: string; channel: string; status: string; title: string }>;
      errors?: string[];
    }>(`/content/${contentId}/repurpose`, { method: 'POST', body: JSON.stringify(payload) }, userId),
  getCalendarView: (userId: string, month: number, year: number) =>
    marketingRequest<ContentCalendarDay[]>(`/content/calendar?month=${month}&year=${year}`, {}, userId),

  // ── Email Templates ──

  saveEmailTemplate: (
    userId: string,
    data: {
      name: string;
      category: string;
      description?: string;
      manifest_json: Record<string, unknown>;
      section_types?: string[];
      theme: string;
    },
  ) =>
    marketingRequest<EmailTemplate>('/templates', { method: 'POST', body: JSON.stringify(data) }, userId),

  listEmailTemplates: (userId: string, params?: { category?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    const q = qs.toString();
    return marketingRequest<{ data: EmailTemplate[]; total: number }>(`/templates${q ? `?${q}` : ''}`, {}, userId);
  },

  useEmailTemplate: (userId: string, templateId: string) =>
    marketingRequest<{ manifest_json: Record<string, unknown> }>(
      `/templates/${templateId}/use`,
      { method: 'POST', body: JSON.stringify({}) },
      userId,
    ),

  deleteEmailTemplate: async (userId: string, templateId: string) => {
    const body = await marketingRequest<{ success: boolean }>(
      `/templates/${templateId}`,
      { method: 'DELETE' },
      userId,
    );
    if (!body.success) throw new Error('delete_template failed');
  },

  // ── Batch Atomization ──

  createBatchJob: (userId: string, heroContentId: string, channels: string[]) =>
    marketingRequest<BatchJob>('/batch', {
      method: 'POST',
      body: JSON.stringify({ hero_content_id: heroContentId, channels }),
    }, userId),

  getBatchJobStatus: (userId: string, jobId: string) =>
    marketingRequest<BatchJob>(`/batch/${jobId}`, {}, userId),

  listBatchJobs: (
    userId: string,
    params?: { status?: string; limit?: number; offset?: number },
  ) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return marketingRequest<{ jobs: BatchJob[]; total: number }>(
      `/batch${q ? `?${q}` : ''}`,
      {},
      userId,
    );
  },

  cancelBatchJob: (userId: string, jobId: string) =>
    marketingRequest<BatchJob>(`/batch/${jobId}/cancel`, { method: 'POST' }, userId),

  getContentDerivatives: (userId: string, contentId: string) =>
    marketingRequest<{ derivatives: ContentItem[]; total: number }>(
      `/batch/derivatives/${contentId}`,
      {},
      userId,
    ),

  retryBatchChannel: (userId: string, jobId: string, channel: string) =>
    marketingRequest<BatchJob>(`/batch/${jobId}/retry-channel`, {
      method: 'POST',
      body: JSON.stringify({ channel }),
    }, userId),

  /**
   * Polls a batch job until it reaches a terminal state.
   * Calls onUpdate with each intermediate result.
   * Returns the final job state.
   */
  pollBatchJob: async (
    userId: string,
    jobId: string,
    options?: {
      onUpdate?: (job: BatchJob) => void;
      intervalMs?: number;
      timeoutMs?: number;
    },
  ): Promise<BatchJob> => {
    const intervalMs = options?.intervalMs ?? 3000;
    const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const job = await marketingRequest<BatchJob>(
        `/batch/${jobId}`,
        {},
        userId,
      );

      options?.onUpdate?.(job);

      if ((BATCH_TERMINAL_STATES as readonly string[]).includes(job.status)) {
        return job;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    const final = await marketingRequest<BatchJob>(
      `/batch/${jobId}`,
      {},
      userId,
    );
    return final;
  },
};

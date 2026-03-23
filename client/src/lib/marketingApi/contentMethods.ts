import { marketingRequest, BATCH_TERMINAL_STATES } from './helpers';
import type {
  PaginatedResult,
  ContentItem,
  ContentCalendarDay,
  EmailTemplate,
  BatchJob,
} from './types';

export const contentMethods = {
  listContent: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return marketingRequest<PaginatedResult<ContentItem>>(`/content?${params}`, {}, userId);
  },
  getContent: (userId: string, contentId: string) =>
    marketingRequest<ContentItem>(`/content/${contentId}`, {}, userId),
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
  /** Batch-resolve AI-generated images for all manifest sections that have imagePrompt but no imageUrl. */
  resolveEmailImages: (
    userId: string,
    contentId: string,
    payload: { manifest: Record<string, unknown>; workspace_id?: string | null },
  ) =>
    marketingRequest<{
      images: Record<number, string>;
      itemImages?: Record<string, string>;
      errors: string[];
    }>(`/content/${contentId}/resolve-email-images`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }, userId),

  generateOverlayAsset: (
    userId: string,
    payload: { theme: string; effect: string },
  ) =>
    marketingRequest<{ image_url: string; theme: string; cached: boolean }>(
      '/overlay-assets/generate',
      { method: 'POST', body: JSON.stringify(payload) },
      userId,
    ),

  getOverlayAssetUrl: (userId: string, theme: string) =>
    marketingRequest<{ image_url: string | null }>(
      `/overlay-assets/${theme}/paper-plane`,
      {},
      userId,
    ),

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

import { marketingRequest } from './helpers';
import type {
  MarketingApprovalApiRow,
  SubmitApprovalReviewPayload,
  MarketingAutomation,
  PerformanceRecord,
  PerformanceContext,
  CalibrationPromptResponse,
  RecordMetricsPayload,
  BrandProfileClient,
  BrandProfileStats,
  BrandComplianceScanResult,
  CompetitorClient,
  CompetitorEventClient,
  CompetitorScrapeStatus,
  CeoDashboardSnapshot,
  CeoDashboardTrend,
  MpTriggerClient,
  MpTriggerSummaryUser,
} from './types';

export const workflowMethods = {
  // ── Human Approval Queue ──

  listApprovals: async (userId: string, status: 'pending' | 'approved' | 'rejected' = 'pending') => {
    const body = await marketingRequest<{ success: boolean; data: { items: MarketingApprovalApiRow[] } }>(
      `/approvals?status=${encodeURIComponent(status)}`,
      {},
      userId,
    );
    if (!body.success) throw new Error('list_approvals failed');
    return body.data.items;
  },

  submitApprovalReview: async (userId: string, approvalId: string, payload: SubmitApprovalReviewPayload) => {
    const body = await marketingRequest<{
      success: boolean;
      data: { approval_id: string; content_id: string; content_status: string };
    }>(`/approvals/${approvalId}/review`, { method: 'POST', body: JSON.stringify(payload) }, userId);
    if (!body.success) throw new Error('submit_review failed');
    return body.data;
  },

  assignApproval: async (
    userId: string,
    payload: {
      content_id: string;
      validation_scores: {
        truth_validation?: unknown;
        brand_voice_check?: unknown;
        compliance_scan?: unknown;
      };
    },
  ) => {
    const body = await marketingRequest<{
      success: boolean;
      data: { approval_id: string; content_id: string };
    }>('/approvals', { method: 'POST', body: JSON.stringify(payload) }, userId);
    if (!body.success) throw new Error('assign_approval failed');
    return body.data;
  },

  // ── Automations ──

  listAutomations: async (userId: string) => {
    const body = await marketingRequest<{ success: boolean; data: MarketingAutomation[] }>(`/automations`, {}, userId);
    if (!body.success) throw new Error('list_automations failed');
    return body.data;
  },
  createAutomation: async (userId: string, data: Record<string, unknown>) => {
    const body = await marketingRequest<{ success: boolean; data: { id: string } }>(`/automations`, { method: 'POST', body: JSON.stringify(data) }, userId);
    if (!body.success) throw new Error('create_automation failed');
    return body.data;
  },
  updateAutomation: async (userId: string, id: string, data: Partial<MarketingAutomation>) => {
    const body = await marketingRequest<{ success: boolean; data: MarketingAutomation | null }>(
      `/automations/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      userId,
    );
    if (!body.success) throw new Error('update_automation failed');
    return body.data;
  },
  deleteAutomation: async (userId: string, id: string) => {
    const body = await marketingRequest<{ success: boolean }>(`/automations/${id}`, { method: 'DELETE' }, userId);
    if (!body.success) throw new Error('delete_automation failed');
  },
  triggerAutomation: async (userId: string, id: string) => {
    const body = await marketingRequest<{
      success: boolean;
      data: { status: string; contentIds: string[]; error?: string };
    }>(`/automations/${id}/trigger`, { method: 'POST', body: JSON.stringify({}) }, userId);
    if (!body.success) throw new Error('trigger_automation failed');
    return body.data;
  },
  listAutomationRuns: async (userId: string, id: string, limit?: number) => {
    const q = limit != null ? `?limit=${encodeURIComponent(String(limit))}` : '';
    const body = await marketingRequest<{ success: boolean; data: unknown[] }>(`/automations/${id}/runs${q}`, {}, userId);
    if (!body.success) throw new Error('list_runs failed');
    return body.data;
  },

  // ── Performance Feedback ──

  recordPerformanceMetrics: (userId: string, data: RecordMetricsPayload) =>
    marketingRequest<{ id: string; is_new: boolean; message: string }>(
      '/performance/record',
      { method: 'POST', body: JSON.stringify(data) },
      userId,
    ),

  getPerformanceContext: (
    userId: string,
    params?: { channel?: string; brand_profile_id?: string },
  ) => {
    const qs = new URLSearchParams();
    if (params?.channel) qs.set('channel', params.channel);
    if (params?.brand_profile_id) qs.set('brand_profile_id', params.brand_profile_id);
    const q = qs.toString();
    return marketingRequest<PerformanceContext>(
      `/performance/context${q ? `?${q}` : ''}`,
      {},
      userId,
    );
  },

  getCalibrationPrompt: (
    userId: string,
    params?: { channel?: string; brand_profile_id?: string },
  ) => {
    const qs = new URLSearchParams();
    if (params?.channel) qs.set('channel', params.channel);
    if (params?.brand_profile_id) qs.set('brand_profile_id', params.brand_profile_id);
    const q = qs.toString();
    return marketingRequest<CalibrationPromptResponse>(
      `/performance/context/prompt${q ? `?${q}` : ''}`,
      {},
      userId,
    );
  },

  getContentPerformanceHistory: (userId: string, contentId: string) =>
    marketingRequest<{ records: PerformanceRecord[] }>(
      `/performance/history/${contentId}`,
      {},
      userId,
    ),

  // ── Brand Profiles ──

  createBrandProfile: (userId: string, data: Partial<Omit<BrandProfileClient, 'id' | 'organization_id' | 'created_at' | 'updated_at' | 'created_by' | 'active'>>) =>
    marketingRequest<BrandProfileClient>(
      '/brand-profiles',
      { method: 'POST', body: JSON.stringify(data) },
      userId,
    ),

  listBrandProfiles: (
    userId: string,
    params?: { include_inactive?: boolean; limit?: number; offset?: number },
  ) => {
    const qs = new URLSearchParams();
    if (params?.include_inactive) qs.set('include_inactive', 'true');
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return marketingRequest<{ profiles: BrandProfileClient[]; total: number }>(
      `/brand-profiles${q ? `?${q}` : ''}`,
      {},
      userId,
    );
  },

  getBrandProfileById: (userId: string, id: string) =>
    marketingRequest<BrandProfileClient>(
      `/brand-profiles/${id}`,
      {},
      userId,
    ),

  updateBrandProfile: (userId: string, id: string, updates: Partial<Omit<BrandProfileClient, 'id' | 'organization_id' | 'created_at' | 'updated_at' | 'created_by'>>) =>
    marketingRequest<BrandProfileClient>(
      `/brand-profiles/${id}`,
      { method: 'PUT', body: JSON.stringify(updates) },
      userId,
    ),

  deleteBrandProfile: (userId: string, id: string) =>
    marketingRequest<{ success: boolean }>(
      `/brand-profiles/${id}`,
      { method: 'DELETE' },
      userId,
    ),

  associateBrandWithContent: (userId: string, brandProfileId: string, contentId: string) =>
    marketingRequest<{ success: boolean }>(
      `/brand-profiles/${brandProfileId}/associate`,
      { method: 'POST', body: JSON.stringify({ content_id: contentId }) },
      userId,
    ),

  getBrandProfileStats: (userId: string) =>
    marketingRequest<{ stats: BrandProfileStats[] }>(
      '/brand-profiles/stats',
      {},
      userId,
    ),

  // ── Instagram Intelligence ──

  analyzeHashtags: (userId: string, hashtags: string[]) =>
    marketingRequest<{
      success: boolean;
      data: {
        hashtags: Array<{
          tag: string;
          tier: 'high' | 'mid' | 'niche';
          estimatedPosts: number;
          relevanceScore: number;
          isBanned: boolean;
        }>;
        tierBreakdown: { high: number; mid: number; niche: number };
        overallScore: number;
        suggestions: string[];
        warnings: string[];
        estimatedReach: { low: number; high: number };
      };
    }>('/instagram/analyze-hashtags', {
      method: 'POST',
      body: JSON.stringify({ hashtags }),
    }, userId),

  getBestTimesToPost: (userId: string, opts?: {
    topN?: number;
    timezone?: string;
    contentType?: 'educational' | 'promotional' | 'lifestyle' | 'general';
  }) => {
    const params = new URLSearchParams();
    if (opts?.topN) params.set('topN', String(opts.topN));
    if (opts?.timezone) params.set('timezone', opts.timezone);
    if (opts?.contentType) params.set('contentType', opts.contentType);
    return marketingRequest<{
      success: boolean;
      data: {
        topSlots: Array<{
          day: string;
          timeSlot: string;
          hour: number;
          score: number;
          reason: string;
        }>;
        timezone: string;
        audienceInsight: string;
      };
    }>(`/instagram/best-times?${params}`, {}, userId);
  },

  generateCaptionVariants: (userId: string, caption: string, count?: number) =>
    marketingRequest<{
      success: boolean;
      data: Array<{
        id: string;
        label: string;
        hook: string;
        body: string;
        cta: string;
        hashtags: string[];
        fullCaption: string;
        strategy: string;
      }>;
    }>('/instagram/caption-variants', {
      method: 'POST',
      body: JSON.stringify({ caption, count }),
    }, userId),

  predictEngagement: (userId: string, payload: {
    caption: string;
    hashtags: string[];
    hasImage: boolean;
    hasCarousel?: boolean;
    postHour?: number;
    postDay?: string;
  }) =>
    marketingRequest<{
      success: boolean;
      data: {
        overallScore: number;
        breakdown: {
          captionQuality: number;
          hashtagStrategy: number;
          visualAppeal: number;
          timingFit: number;
          ctaStrength: number;
        };
        estimatedLikes: { low: number; high: number };
        estimatedComments: { low: number; high: number };
        estimatedSaves: { low: number; high: number };
        tips: string[];
      };
    }>('/instagram/predict-engagement', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, userId),

  // ── Brand Compliance ──

  triggerComplianceScan: (userId: string, contentId: string) =>
    marketingRequest<BrandComplianceScanResult>(
      `/compliance/scan/${contentId}`,
      { method: 'POST' },
      userId,
    ),

  getLatestComplianceScan: async (userId: string, contentId: string) => {
    const res = await marketingRequest<{ scan: BrandComplianceScanResult | null }>(
      `/compliance/latest/${contentId}`,
      {},
      userId,
    );
    return res.scan;
  },

  getComplianceScanHistory: (userId: string, contentId: string) =>
    marketingRequest<{ scans: BrandComplianceScanResult[] }>(
      `/compliance/history/${contentId}`,
      {},
      userId,
    ),

  // ── Competitor Intelligence ──

  listCompetitors: (userId: string, params?: { include_inactive?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.include_inactive) qs.set('include_inactive', 'true');
    const q = qs.toString();
    return marketingRequest<{ competitors: CompetitorClient[]; total: number }>(
      `/competitors${q ? `?${q}` : ''}`,
      {},
      userId,
    );
  },

  createCompetitor: (userId: string, data: Partial<Omit<CompetitorClient, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>) =>
    marketingRequest<CompetitorClient>(
      '/competitors',
      { method: 'POST', body: JSON.stringify(data) },
      userId,
    ),

  getCompetitor: (userId: string, id: string) =>
    marketingRequest<CompetitorClient>(`/competitors/${id}`, {}, userId),

  updateCompetitor: (userId: string, id: string, updates: Partial<Omit<CompetitorClient, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>) =>
    marketingRequest<CompetitorClient>(
      `/competitors/${id}`,
      { method: 'PATCH', body: JSON.stringify(updates) },
      userId,
    ),

  deleteCompetitor: (userId: string, id: string) =>
    marketingRequest<{ success: boolean }>(
      `/competitors/${id}`,
      { method: 'DELETE' },
      userId,
    ),

  triggerCompetitorScrape: (userId: string, id: string) =>
    marketingRequest<{ job_id: string | null; message: string }>(
      `/competitors/${id}/scrape`,
      { method: 'POST' },
      userId,
    ),

  triggerScrapeAll: (userId: string) =>
    marketingRequest<{ message: string }>(
      '/competitors/scrape-all',
      { method: 'POST' },
      userId,
    ),

  getCompetitorScrapeStatus: (userId: string, id: string) =>
    marketingRequest<CompetitorScrapeStatus>(
      `/competitors/${id}/scrape-status`,
      {},
      userId,
    ),

  queryCompetitorEvents: (userId: string, params?: {
    competitor_id?: string;
    event_type?: string;
    significance?: string;
    since?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.competitor_id) qs.set('competitor_id', params.competitor_id);
    if (params?.event_type) qs.set('event_type', params.event_type);
    if (params?.significance) qs.set('significance', params.significance);
    if (params?.since) qs.set('since', params.since);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return marketingRequest<{ events: CompetitorEventClient[]; total: number }>(
      `/competitors/events${q ? `?${q}` : ''}`,
      {},
      userId,
    );
  },

  getRecentCompetitorEvents: (userId: string, limit = 20) =>
    marketingRequest<{ events: CompetitorEventClient[] }>(
      `/competitors/events/recent?limit=${limit}`,
      {},
      userId,
    ),

  getSignificantCompetitorEvents: (userId: string, since?: string) => {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    return marketingRequest<{ events: CompetitorEventClient[] }>(
      `/competitors/events/significant${qs}`,
      {},
      userId,
    );
  },

  // ── CEO Dashboard ──

  getCeoDashboard: (userId: string) =>
    marketingRequest<CeoDashboardSnapshot>('/dashboard/executive', {}, userId),

  getCeoDashboardTrend: (userId: string, days = 30) =>
    marketingRequest<{ trends: CeoDashboardTrend[] }>(
      `/dashboard/executive/trend?days=${days}`,
      {},
      userId,
    ),

  refreshCeoDashboard: (userId: string) =>
    marketingRequest<CeoDashboardSnapshot>(
      '/dashboard/executive/refresh',
      { method: 'POST' },
      userId,
    ),

  getMpTriggers: (userId: string, params?: { user_id?: string; status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.user_id) qs.set('user_id', params.user_id);
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return marketingRequest<{ triggers: MpTriggerClient[]; total: number }>(
      `/dashboard/executive/mp-triggers${q ? `?${q}` : ''}`,
      {},
      userId,
    );
  },

  getMpTriggersSummary: (userId: string) =>
    marketingRequest<{ users: MpTriggerSummaryUser[] }>(
      '/dashboard/executive/mp-triggers/summary',
      {},
      userId,
    ),
};

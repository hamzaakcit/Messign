import { marketingRequest, unwrapCreateCampaignResponse } from './helpers';
import type {
  PaginatedResult,
  Campaign,
  SpendEntry,
  CampaignMetricsSummary,
  DashboardMetrics,
  ContentItem,
  EmailCampaign,
  Lead,
  CommandCenterPayload,
} from './types';

export const campaignMethods = {
  listCampaigns: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return marketingRequest<PaginatedResult<Campaign>>(`/campaigns?${params}`, {}, userId);
  },
  getCampaign: (userId: string, campaignId: string) =>
    marketingRequest<Campaign>(`/campaigns/${campaignId}`, {}, userId),
  createCampaign: async (userId: string, data: Partial<Campaign>) => {
    const body = await marketingRequest<unknown>('/campaigns', { method: 'POST', body: JSON.stringify(data) }, userId);
    return unwrapCreateCampaignResponse(body);
  },
  updateCampaign: (userId: string, campaignId: string, data: Partial<Campaign>) =>
    marketingRequest<Campaign>(`/campaigns/${campaignId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  launchCampaign: (userId: string, campaignId: string) =>
    marketingRequest<Campaign>(`/campaigns/${campaignId}/launch`, { method: 'POST' }, userId),
  pauseCampaign: (userId: string, campaignId: string, reason?: string) =>
    marketingRequest<Campaign>(`/campaigns/${campaignId}/pause`, { method: 'POST', body: JSON.stringify({ reason }) }, userId),
  completeCampaign: (userId: string, campaignId: string) =>
    marketingRequest<Campaign>(`/campaigns/${campaignId}/complete`, { method: 'POST' }, userId),
  getCampaignMetrics: (userId: string, period?: string) =>
    marketingRequest<CampaignMetricsSummary>(`/campaigns/metrics${period ? `?period=${period}` : ''}`, {}, userId),
  recordSpend: (userId: string, campaignId: string, data: Record<string, unknown>) =>
    marketingRequest<SpendEntry>(`/campaigns/${campaignId}/spend`, { method: 'POST', body: JSON.stringify(data) }, userId),
  listSpend: (userId: string, campaignId: string) =>
    marketingRequest<SpendEntry[]>(`/campaigns/${campaignId}/spend`, {}, userId),

  getDashboardMetrics: (userId: string, period?: string) =>
    marketingRequest<DashboardMetrics>(`/dashboard/metrics${period ? `?period=${period}` : ''}`, {}, userId),
  /** Single round-trip for dashboard home (server runs the same queries in parallel). */
  getDashboardBootstrap: (
    userId: string,
    period?: string,
    opts?: { fresh?: boolean },
  ) => {
    const q = new URLSearchParams();
    if (period) q.set('period', period);
    if (opts?.fresh) q.set('fresh', '1');
    const qs = q.toString();
    return marketingRequest<{
      metrics: DashboardMetrics;
      hotLeads: Lead[];
      content: PaginatedResult<ContentItem>;
      campaigns: PaginatedResult<Campaign>;
      emailCampaigns: PaginatedResult<EmailCampaign>;
    }>(`/dashboard/bootstrap${qs ? `?${qs}` : ''}`, {}, userId);
  },
  getChannelPerformance: (userId: string, period?: string) =>
    marketingRequest<DashboardMetrics['channelBreakdown']>(`/dashboard/channels${period ? `?period=${period}` : ''}`, {}, userId),
  getCampaignComparison: (userId: string, ids: string[]) =>
    marketingRequest<Campaign[]>(`/dashboard/comparison?ids=${encodeURIComponent(ids.join(','))}`, {}, userId),

  /** Marketing Command Center — funnel, experiments, social pulse, AI plays. */
  getCommandCenter: (
    userId: string,
    opts?: { days?: number; brandId?: string | null; fresh?: boolean },
  ) => {
    const q = new URLSearchParams();
    if (opts?.days != null) q.set('days', String(opts.days));
    if (opts?.brandId) q.set('brand_id', opts.brandId);
    if (opts?.fresh) q.set('fresh', '1');
    const qs = q.toString();
    return marketingRequest<CommandCenterPayload>(`/dashboard/command-center${qs ? `?${qs}` : ''}`, {}, userId);
  },
};

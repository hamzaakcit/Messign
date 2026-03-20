import { API_ORIGIN } from './api';
import { getAccessToken } from './authToken';
import type { MarketingApprovalApiRow } from '../pages/marketing/approvalQueue/mapApiApprovalToUi';

const MARKETING_BASE = `${API_ORIGIN}/api/marketing`;

async function marketingRequest<T>(
  path: string,
  options: RequestInit = {},
  userId?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;

  const res = await fetch(`${MARKETING_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

/** Handles `{ success, data: { campaign } }` from tool-style POST /campaigns and legacy raw campaign JSON. */
function unwrapCreateCampaignResponse(body: unknown): Campaign {
  if (body && typeof body === 'object' && 'success' in body) {
    const r = body as { success: boolean; data?: { campaign?: Campaign }; error?: string };
    if (!r.success) throw new Error(r.error || 'Failed to create campaign');
    if (r.data?.campaign) return r.data.campaign;
  }
  return body as Campaign;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
}

export interface SpendEntry {
  id: string;
  campaign_id: string;
  amount: number;
  currency: string;
  amount_eur: number | null;
  category: string | null;
  description: string | null;
  date: string;
  vendor: string | null;
  finance_expense_id: string | null;
  receipt_url: string | null;
  created_by: string | null;
  created_at: string;
  created_by_name?: string | null;
}

export interface Campaign {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  channel: string;
  status: string;
  budget: number;
  actual_spend: number;
  currency: string;
  budget_eur: number;
  actual_spend_eur: number;
  start_date: string | null;
  end_date: string | null;
  target_audience: string | null;
  goals: string | null;
  owner_id: string | null;
  owner_name?: string | null;
  impressions: number;
  clicks: number;
  conversions: number;
  leads_generated: number;
  cost_per_lead: number | null;
  roi: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  spend_entries?: SpendEntry[];
  spend_count?: number;
  lead_count?: number;
  content_count?: number;
  deal_value?: number;
}

export interface ContentItem {
  id: string;
  organization_id: string | null;
  campaign_id: string | null;
  title: string;
  content_type: string;
  channel: string | null;
  status: string;
  body: string | null;
  body_html: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  published_at: string | null;
  author_id: string | null;
  reviewer_id: string | null;
  tags: string[];
  views: number;
  engagement: number;
  click_throughs: number;
  leads_attributed: number;
  knowledge_doc_id: string | null;
  created_at: string;
  updated_at: string;
  campaign_name?: string | null;
  author_name?: string | null;
  reviewer_name?: string | null;
}

export interface ContentCalendarDay {
  date: string;
  items: ContentItem[];
}

export interface Lead {
  id: string;
  organization_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  job_title: string | null;
  phone: string | null;
  source: string;
  campaign_id: string | null;
  content_id: string | null;
  score: number;
  score_factors: Record<string, number>;
  status: string;
  crm_contact_id: string | null;
  crm_deal_id: string | null;
  converted_at: string | null;
  converted_by: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_page_url: string | null;
  ip_country: string | null;
  tags: string[];
  notes: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
  campaign_name?: string | null;
  content_title?: string | null;
  crm_contact_name?: string | null;
  crm_deal_title?: string | null;
}

export interface EmailCampaign {
  id: string;
  campaign_id: string | null;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  from_name: string | null;
  from_email: string | null;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  audience_filter: Record<string, unknown>;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  open_rate: number | null;
  click_rate: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  campaign_name?: string | null;
}

export interface CampaignMetricsSummary {
  activeCampaigns: number;
  totalSpend: number;
  totalLeads: number;
  avgCPL: number;
  avgROI: number;
  byChannel: Array<{
    channel: string;
    campaigns: number;
    spend: number;
    leads: number;
    cpl: number;
    roi: number;
  }>;
}

export interface LeadFunnelMetrics {
  new: number;
  contacted: number;
  nurturing: number;
  qualified: number;
  converted: number;
  disqualified: number;
}

export interface DashboardMetrics {
  mqls: number;
  cac: number;
  cpl: number;
  roi: number;
  activeCampaigns: number;
  totalSpend: number;
  totalLeads: number;
  emailOpenRate: number;
  contentPublished: number;
  channelBreakdown: Array<{
    channel: string;
    spend: number;
    leads: number;
    cpl: number;
    roi: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    spend: number;
    leads: number;
  }>;
}

export type SubmitApprovalReviewPayload = {
  status: 'approved' | 'rejected';
  feedback?: string;
  rejection_reason?: 'off_brand' | 'factually_wrong' | 'wrong_audience' | 'needs_polish' | 'other';
  /** Alias for rejection_reason */
  reason?: 'off_brand' | 'factually_wrong' | 'wrong_audience' | 'needs_polish' | 'other';
};

export const marketingAPI = {
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

  listContent: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return marketingRequest<PaginatedResult<ContentItem>>(`/content?${params}`, {}, userId);
  },
  getContent: (userId: string, contentId: string) =>
    marketingRequest<ContentItem>(`/content/${contentId}`, {}, userId),
  createContent: (userId: string, data: Partial<ContentItem>) =>
    marketingRequest<ContentItem>('/content', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateContent: (userId: string, contentId: string, data: Partial<ContentItem>) =>
    marketingRequest<ContentItem>(`/content/${contentId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  publishContent: (userId: string, contentId: string) =>
    marketingRequest<ContentItem>(`/content/${contentId}/publish`, { method: 'POST' }, userId),
  scheduleContent: (userId: string, contentId: string, date: string, time?: string) =>
    marketingRequest<ContentItem>(`/content/${contentId}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ date, time }),
    }, userId),
  getCalendarView: (userId: string, month: number, year: number) =>
    marketingRequest<ContentCalendarDay[]>(`/content/calendar?month=${month}&year=${year}`, {}, userId),

  captureLead: (userId: string, data: Record<string, unknown>) =>
    marketingRequest<Lead>('/leads/capture', { method: 'POST', body: JSON.stringify(data) }, userId),
  listLeads: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return marketingRequest<PaginatedResult<Lead>>(`/leads?${params}`, {}, userId);
  },
  getLead: (userId: string, leadId: string) =>
    marketingRequest<Lead>(`/leads/${leadId}`, {}, userId),
  updateLead: (userId: string, leadId: string, data: Partial<Lead>) =>
    marketingRequest<Lead>(`/leads/${leadId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  scoreLead: (userId: string, leadId: string, signal: string) =>
    marketingRequest<Lead>(`/leads/${leadId}/score`, { method: 'POST', body: JSON.stringify({ signal }) }, userId),
  qualifyLead: (userId: string, leadId: string) =>
    marketingRequest<Lead>(`/leads/${leadId}/qualify`, { method: 'POST' }, userId),
  convertLeadToCRM: (userId: string, leadId: string) =>
    marketingRequest<{ lead: Lead; contact: unknown; deal: unknown }>(`/leads/${leadId}/convert`, { method: 'POST' }, userId),
  getHotLeads: (userId: string) =>
    marketingRequest<Lead[]>('/leads/hot', {}, userId),
  getLeadFunnel: (userId: string, period?: string) =>
    marketingRequest<LeadFunnelMetrics>(`/leads/funnel${period ? `?period=${period}` : ''}`, {}, userId),

  listEmailCampaigns: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return marketingRequest<PaginatedResult<EmailCampaign>>(`/emails?${params}`, {}, userId);
  },
  getEmailCampaign: (userId: string, id: string) =>
    marketingRequest<EmailCampaign>(`/emails/${id}`, {}, userId),
  createEmailCampaign: (userId: string, data: Partial<EmailCampaign>) =>
    marketingRequest<EmailCampaign>('/emails', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateEmailCampaign: (userId: string, id: string, data: Partial<EmailCampaign>) =>
    marketingRequest<EmailCampaign>(`/emails/${id}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  sendEmailCampaign: (userId: string, id: string) =>
    marketingRequest<EmailCampaign>(`/emails/${id}/send`, { method: 'POST' }, userId),

  getDashboardMetrics: (userId: string, period?: string) =>
    marketingRequest<DashboardMetrics>(`/dashboard/metrics${period ? `?period=${period}` : ''}`, {}, userId),
  getChannelPerformance: (userId: string, period?: string) =>
    marketingRequest<DashboardMetrics['channelBreakdown']>(`/dashboard/channels${period ? `?period=${period}` : ''}`, {}, userId),
  getCampaignComparison: (userId: string, ids: string[]) =>
    marketingRequest<Campaign[]>(`/dashboard/comparison?ids=${encodeURIComponent(ids.join(','))}`, {}, userId),

  /** Human approval queue */
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
};

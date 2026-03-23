import { getAccessToken } from './authToken';
import { API_ORIGIN } from './api';
import type { PaginatedResult } from './types';

const CRM_BASE = `${API_ORIGIN}/api/crm`;

async function crmRequest<T>(
  path: string,
  options: RequestInit = {},
  userId?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;

  const res = await fetch(`${CRM_BASE}${path}`, {
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

// ── Types ──────────────────────────────────────────

export interface DealStage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability_default: number;
  is_won: boolean;
  is_lost: boolean;
  color: string;
  created_at: string;
  deal_count?: number;
  total_value?: number;
}

export interface Pipeline {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  team_id: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  stages?: DealStage[];
}

export interface Deal {
  id: string;
  organization_id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  amount: number;
  currency: string;
  probability: number;
  owner_id: string;
  owner_name?: string;
  owner_email?: string;
  company_id?: string;
  company_name?: string;
  contact_id?: string;
  contact_name?: string;
  expected_close_date?: string;
  actual_close_date?: string;
  lost_reason?: string;
  competitor?: string;
  description?: string;
  notes?: string;
  tags?: string[];
  dora_score?: number | null;
  dora_next_action?: string | null;
  created_at: string;
  updated_at: string;
  stage_name?: string;
  stage_color?: string;
  activities?: Activity[];
  recent_activities?: ActivityDetail[];
}

export interface Activity {
  id: string;
  type: 'call' | 'email' | 'meeting' | 'note';
  subject?: string;
  description?: string;
  scheduled_at?: string;
  completed_at?: string;
  user_id: string;
  created_at: string;
}

export interface ActivityDetail {
  id: string;
  organization_id: string;
  deal_id: string | null;
  contact_id: string | null;
  user_id: string;
  type: string;
  subject: string | null;
  description: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  outcome: string | null;
  created_at: string;
  user_name?: string;
  deal_title?: string;
  contact_name?: string;
}

export interface CreateActivityInput {
  type: 'call' | 'email' | 'meeting' | 'note' | 'task';
  subject?: string;
  description?: string;
  outcome?: string;
  scheduled_at?: string;
  duration_minutes?: number;
}

export interface StageHistoryEntry {
  id: string;
  deal_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  moved_by: string | null;
  moved_at: string;
  time_in_previous_stage_hours: number | null;
  from_stage_name?: string;
  to_stage_name?: string;
  moved_by_name?: string;
}

export interface Contact {
  id: string;
  organization_id?: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  company_id: string | null;
  owner_id: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  last_contacted_at: string | null;
  company_name?: string;
  owner_name?: string;
  deals?: Deal[];
  recent_activities?: ActivityDetail[];
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  organization_id?: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  annual_revenue: number | null;
  address: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  vendor_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deal_count?: number;
  total_deal_value?: number;
  contacts?: Contact[];
  deals?: Deal[];
}

export interface CreateContactInput {
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  job_title?: string;
  company_id?: string;
  source?: string;
  tags?: string[];
  notes?: string;
}

export interface CreateCompanyInput {
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  annual_revenue?: number;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
}

export interface SalesMetrics {
  totalPipeline: number;
  weightedPipeline: number;
  dealsWon: number;
  dealsLost: number;
  avgDealSize: number;
  winRate: number;
  avgCycleTime: number;
}

export interface StageForecast {
  stage_id: string;
  stage_name: string;
  deal_count: number;
  total_value: number;
  weighted_value: number;
}

export interface ForecastSummary {
  pipeline_id: string;
  pipeline_name: string;
  total_deals: number;
  total_value: number;
  weighted_value: number;
  stages: StageForecast[];
}

export interface OwnerForecast {
  owner_id: string;
  owner_name: string;
  deal_count: number;
  total_value: number;
  weighted_value: number;
}

export interface CreateDealInput {
  title: string;
  pipeline_id: string;
  stage_id: string;
  amount?: number;
  currency?: string;
  company_id?: string;
  contact_id?: string;
  expected_close_date?: string;
  competitor?: string;
  description?: string;
  notes?: string;
  tags?: string[];
}

export type { PaginatedResult } from './types';

// ── API ────────────────────────────────────────────

export const crmAPI = {
  listPipelines: (userId: string) =>
    crmRequest<Pipeline[]>('/pipelines', {}, userId),

  getPipeline: (userId: string, pipelineId: string) =>
    crmRequest<Pipeline>(`/pipelines/${pipelineId}`, {}, userId),

  getDealsByStage: (userId: string, pipelineId: string) =>
    crmRequest<Record<string, Deal[]>>(`/deals/by-stage/${pipelineId}`, {}, userId),

  getMetrics: (userId: string, period?: string) => {
    const params = period ? `?period=${period}` : '';
    return crmRequest<SalesMetrics>(`/deals/metrics${params}`, {}, userId);
  },

  listDeals: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return crmRequest<PaginatedResult<Deal>>(`/deals?${params}`, {}, userId);
  },

  getDeal: (userId: string, dealId: string) =>
    crmRequest<Deal>(`/deals/${dealId}`, {}, userId),

  createDeal: (userId: string, data: CreateDealInput) =>
    crmRequest<Deal>('/deals', { method: 'POST', body: JSON.stringify(data) }, userId),

  updateDeal: (userId: string, dealId: string, data: Partial<Deal>) =>
    crmRequest<Deal>(`/deals/${dealId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),

  moveDealToStage: (userId: string, dealId: string, stageId: string) =>
    crmRequest<Deal>(`/deals/${dealId}/stage`, {
      method: 'PUT',
      body: JSON.stringify({ stageId }),
    }, userId),

  deleteDeal: (userId: string, dealId: string) =>
    crmRequest<{ success: boolean }>(`/deals/${dealId}`, { method: 'DELETE' }, userId),

  getDealHistory: (userId: string, dealId: string) =>
    crmRequest<StageHistoryEntry[]>(`/deals/${dealId}/history`, {}, userId),

  getDealActivities: (userId: string, dealId: string, page = 1) =>
    crmRequest<PaginatedResult<ActivityDetail>>(`/deals/${dealId}/activities?page=${page}`, {}, userId),

  createDealActivity: (userId: string, dealId: string, data: CreateActivityInput) =>
    crmRequest<ActivityDetail>(`/deals/${dealId}/activities`, {
      method: 'POST',
      body: JSON.stringify(data),
    }, userId),

  loseDeal: (userId: string, dealId: string, reason?: string) =>
    crmRequest<Deal>(`/deals/${dealId}/lose`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }, userId),

  listContacts: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return crmRequest<PaginatedResult<Contact>>(`/contacts?${params}`, {}, userId);
  },

  getContact: (userId: string, contactId: string) =>
    crmRequest<Contact>(`/contacts/${contactId}`, {}, userId),

  createContact: (userId: string, data: CreateContactInput) =>
    crmRequest<Contact>('/contacts', { method: 'POST', body: JSON.stringify(data) }, userId),

  updateContact: (userId: string, contactId: string, data: Partial<CreateContactInput>) =>
    crmRequest<Contact>(`/contacts/${contactId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),

  searchContacts: (userId: string, query: string) =>
    crmRequest<Contact[]>(`/contacts/search?q=${encodeURIComponent(query)}`, {}, userId),

  listCompanies: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return crmRequest<PaginatedResult<Company>>(`/companies?${params}`, {}, userId);
  },

  getCompany: (userId: string, companyId: string) =>
    crmRequest<Company>(`/companies/${companyId}`, {}, userId),

  createCompany: (userId: string, data: CreateCompanyInput) =>
    crmRequest<Company>('/companies', { method: 'POST', body: JSON.stringify(data) }, userId),

  updateCompany: (userId: string, companyId: string, data: Partial<CreateCompanyInput>) =>
    crmRequest<Company>(`/companies/${companyId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),

  getPipelineForecast: (userId: string, pipelineId: string) =>
    crmRequest<ForecastSummary>(`/forecast?pipeline_id=${pipelineId}`, {}, userId),

  getForecastByOwner: (userId: string, pipelineId?: string) => {
    const params = pipelineId ? `?pipeline_id=${pipelineId}` : '';
    return crmRequest<OwnerForecast[]>(`/forecast/by-owner${params}`, {}, userId);
  },

  getActivityGaps: (userId: string) =>
    crmRequest<Deal[]>('/activities/gaps', {}, userId),
};

import { API_ORIGIN } from './apiCore';
import { getAccessToken } from './authToken';
import type { PaginatedResult } from './types';

const SUPPORT_BASE = `${API_ORIGIN}/api/support`;

export type SupportPriority = 'critical' | 'high' | 'medium' | 'low';
export type SupportStatus =
  | 'open'
  | 'awaiting_agent'
  | 'awaiting_customer'
  | 'in_progress'
  | 'on_hold'
  | 'resolved'
  | 'closed';
export type SupportSource = 'web' | 'email' | 'chat' | 'phone' | 'api';
export type SupportSlaState = 'on_track' | 'at_risk' | 'breached';

export type { PaginatedResult } from './types';

export interface SupportSlaStatusDetail {
  dueAt: string | null;
  elapsedHours: number;
  totalHours: number;
  percentElapsed: number;
  status: SupportSlaState;
  isMet: boolean;
  completedAt?: string | null;
  hoursRemaining?: number;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorId: string | null;
  authorEmail: string | null;
  authorName: string | null;
  body: string;
  bodyHtml: string | null;
  isInternalNote: boolean;
  attachments: Array<Record<string, unknown>>;
  createdAt: string;
}

export interface SupportTicketHistoryEntry {
  id: string;
  ticketId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  changedByName?: string | null;
  changedAt: string;
}

export interface SupportCsatRating {
  id: string;
  ticketId: string;
  rating: number;
  comment: string | null;
  submittedAt: string;
}

export interface SupportTicket {
  id: string;
  organizationId: string;
  ticketNumber: string;
  subject: string;
  description: string | null;
  status: SupportStatus;
  priority: SupportPriority;
  categoryId: string | null;
  categoryName?: string | null;
  assigneeId: string | null;
  assigneeName?: string | null;
  reporterEmail: string;
  reporterName: string | null;
  crmContactId: string | null;
  crmCompanyId: string | null;
  companyName?: string | null;
  slaPolicyId: string | null;
  slaFirstResponseDue: string | null;
  slaResolutionDue: string | null;
  slaFirstResponseAt: string | null;
  slaFirstResponseBreached: boolean;
  slaResolutionBreached: boolean;
  firstResponseTimeHours: number | null;
  resolutionTimeHours: number | null;
  tags: string[];
  source: SupportSource;
  doraCategorySuggestion: string | null;
  doraPrioritySuggestion: string | null;
  doraSentiment: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  slaStatus?: SupportSlaState;
  slaDetails?: {
    firstResponse: SupportSlaStatusDetail;
    resolution: SupportSlaStatusDetail;
  };
  messages?: SupportMessage[];
  history?: SupportTicketHistoryEntry[];
  csatRating?: SupportCsatRating | null;
}

export interface SupportCategory {
  id: string;
  organizationId: string;
  name: string;
  parentId: string | null;
  description: string | null;
  autoAssignTo: string | null;
  autoAssignToName?: string | null;
  defaultPriority: SupportPriority;
  isActive: boolean;
  createdAt: string;
}

export interface SupportSlaPolicy {
  id: string;
  organizationId: string;
  name: string;
  priority: SupportPriority;
  firstResponseHours: number;
  resolutionHours: number;
  escalationAfterHours: number | null;
  escalateToRole: string | null;
  businessHoursOnly: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupportCustomerHealth {
  id: string;
  crmCompanyId: string;
  companyName?: string | null;
  healthScore: number;
  openTicketCount: number;
  avgResolutionHours: number | null;
  avgCsat: number | null;
  repeatIssueCount: number;
  lastTicketAt: string | null;
  trend: 'improving' | 'stable' | 'declining' | 'critical';
  calculatedAt: string;
}

export interface SupportBreakdownItem {
  label: string;
  count: number;
}

export interface SupportTrendPoint {
  date: string;
  openCount: number;
  resolvedCount: number;
}

export interface SupportDashboardMetrics {
  openTickets: number;
  avgFirstResponseHours: number;
  avgResolutionHours: number;
  csatScore: number;
  slaCompliancePercent: number;
  ticketsByPriority: SupportBreakdownItem[];
  ticketsByCategory: SupportBreakdownItem[];
  ticketsByStatus: SupportBreakdownItem[];
  ticketTrend: SupportTrendPoint[];
}

export interface SupportAgentWorkload {
  assigneeId: string;
  name: string;
  openTickets: number;
  avgResponseTime: number;
  csatScore: number;
  resolvedThisWeek: number;
}

export interface SupportCsatSummary {
  averageRating: number;
  totalResponses: number;
  distribution: Array<{ rating: number; count: number }>;
  trend: Array<{ date: string; averageRating: number; count: number }>;
}

export interface SupportListFilters {
  status?: string;
  priority?: SupportPriority;
  assigneeId?: string;
  categoryId?: string;
  crmCompanyId?: string;
  slaStatus?: SupportSlaState;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  from?: string;
  to?: string;
}

export interface CreateSupportTicketInput {
  subject: string;
  description?: string;
  priority?: SupportPriority;
  categoryId?: string;
  assigneeId?: string;
  reporterEmail: string;
  reporterName?: string;
  crmContactId?: string;
  crmCompanyId?: string;
  tags?: string[];
  source?: SupportSource;
}

export interface UpdateSupportTicketInput {
  subject?: string;
  description?: string;
  status?: SupportStatus;
  priority?: SupportPriority;
  categoryId?: string | null;
  assigneeId?: string | null;
  reporterEmail?: string;
  reporterName?: string | null;
  crmContactId?: string | null;
  crmCompanyId?: string | null;
  tags?: string[];
  source?: SupportSource;
  doraCategorySuggestion?: string | null;
  doraPrioritySuggestion?: string | null;
  doraSentiment?: string | null;
}

type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };

function toCamelCaseKey(value: string): string {
  return value.replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase());
}

function normalizeValue<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry)) as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, entry]) => {
        acc[toCamelCaseKey(key)] = normalizeValue(entry);
        return acc;
      },
      {},
    ) as T;
  }
  return value as T;
}

function buildHeaders(userId?: string, hasBody: boolean = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody) headers['Content-Type'] = 'application/json';
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;
  return headers;
}

async function supportRequest<T>(
  path: string,
  options: RequestInit = {},
  userId?: string,
): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(`${SUPPORT_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...buildHeaders(userId, hasBody),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) return undefined as T;
  return normalizeValue<T>(JSON.parse(text) as JsonValue);
}

function buildQuery(filters: SupportListFilters = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const supportApi = {
  listTickets: (userId: string, filters: SupportListFilters = {}) =>
    supportRequest<PaginatedResult<SupportTicket>>(`/tickets${buildQuery(filters)}`, {}, userId),

  listMyTickets: (userId: string, filters: SupportListFilters = {}) =>
    supportRequest<PaginatedResult<SupportTicket>>(`/tickets/my${buildQuery(filters)}`, {}, userId),

  getTicket: (userId: string, ticketId: string) =>
    supportRequest<SupportTicket>(`/tickets/${ticketId}`, {}, userId),

  createTicket: (userId: string, payload: CreateSupportTicketInput) =>
    supportRequest<SupportTicket>(
      '/tickets',
      { method: 'POST', body: JSON.stringify(payload) },
      userId,
    ),

  updateTicket: (userId: string, ticketId: string, payload: UpdateSupportTicketInput) =>
    supportRequest<SupportTicket>(
      `/tickets/${ticketId}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      userId,
    ),

  assignTicket: (userId: string, ticketId: string, assigneeId: string) =>
    supportRequest<SupportTicket>(
      `/tickets/${ticketId}/assign`,
      { method: 'PUT', body: JSON.stringify({ assigneeId }) },
      userId,
    ),

  escalateTicket: (userId: string, ticketId: string, escalateTo: string, reason: string) =>
    supportRequest<SupportTicket>(
      `/tickets/${ticketId}/escalate`,
      { method: 'PUT', body: JSON.stringify({ escalateTo, reason }) },
      userId,
    ),

  reopenTicket: (userId: string, ticketId: string, reason?: string) =>
    supportRequest<SupportTicket>(
      `/tickets/${ticketId}/reopen`,
      { method: 'PUT', body: JSON.stringify({ reason }) },
      userId,
    ),

  addMessage: (
    userId: string,
    ticketId: string,
    payload: {
      body: string;
      bodyHtml?: string;
      attachments?: Array<Record<string, unknown>>;
      authorEmail?: string;
      authorName?: string;
      isExternal?: boolean;
    },
  ) =>
    supportRequest<SupportMessage>(
      `/tickets/${ticketId}/messages`,
      { method: 'POST', body: JSON.stringify(payload) },
      userId,
    ),

  addInternalNote: (userId: string, ticketId: string, body: string) =>
    supportRequest<SupportMessage>(
      `/tickets/${ticketId}/internal-notes`,
      { method: 'POST', body: JSON.stringify({ body }) },
      userId,
    ),

  bulkAssign: (userId: string, ticketIds: string[], assigneeId: string) =>
    supportRequest<{ success: boolean }>(
      '/tickets/bulk-assign',
      { method: 'POST', body: JSON.stringify({ ticketIds, assigneeId }) },
      userId,
    ),

  bulkClose: (userId: string, ticketIds: string[]) =>
    supportRequest<{ success: boolean }>(
      '/tickets/bulk-close',
      { method: 'POST', body: JSON.stringify({ ticketIds }) },
      userId,
    ),

  getDashboardMetrics: (userId: string, period?: string) =>
    supportRequest<SupportDashboardMetrics>(
      `/dashboard/metrics${period ? `?period=${encodeURIComponent(period)}` : ''}`,
      {},
      userId,
    ),

  getAgentWorkload: (userId: string) =>
    supportRequest<SupportAgentWorkload[]>('/dashboard/agent-workload', {}, userId),

  getTicketTrends: (userId: string, days: number = 30) =>
    supportRequest<SupportTrendPoint[]>(`/dashboard/trends?days=${days}`, {}, userId),

  listCategories: (userId: string, includeInactive: boolean = false) =>
    supportRequest<SupportCategory[]>(
      `/categories${includeInactive ? '?includeInactive=true' : ''}`,
      {},
      userId,
    ),

  createCategory: (
    userId: string,
    payload: {
      name: string;
      description?: string | null;
      parentId?: string | null;
      autoAssignTo?: string | null;
      defaultPriority?: SupportPriority;
      isActive?: boolean;
    },
  ) =>
    supportRequest<SupportCategory>(
      '/categories',
      { method: 'POST', body: JSON.stringify(payload) },
      userId,
    ),

  updateCategory: (
    userId: string,
    categoryId: string,
    payload: {
      name?: string;
      description?: string | null;
      parentId?: string | null;
      autoAssignTo?: string | null;
      defaultPriority?: SupportPriority;
      isActive?: boolean;
    },
  ) =>
    supportRequest<SupportCategory>(
      `/categories/${categoryId}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      userId,
    ),

  deleteCategory: (userId: string, categoryId: string) =>
    supportRequest<void>(`/categories/${categoryId}`, { method: 'DELETE' }, userId),

  listPolicies: (userId: string) =>
    supportRequest<SupportSlaPolicy[]>('/sla/policies', {}, userId),

  createPolicy: (
    userId: string,
    payload: {
      name: string;
      priority: SupportPriority;
      firstResponseHours: number;
      resolutionHours: number;
      escalationAfterHours?: number | null;
      escalateToRole?: string | null;
      businessHoursOnly?: boolean;
      isActive?: boolean;
    },
  ) =>
    supportRequest<SupportSlaPolicy>(
      '/sla/policies',
      { method: 'POST', body: JSON.stringify(payload) },
      userId,
    ),

  updatePolicy: (
    userId: string,
    policyId: string,
    payload: {
      name?: string;
      priority?: SupportPriority;
      firstResponseHours?: number;
      resolutionHours?: number;
      escalationAfterHours?: number | null;
      escalateToRole?: string | null;
      businessHoursOnly?: boolean;
      isActive?: boolean;
    },
  ) =>
    supportRequest<SupportSlaPolicy>(
      `/sla/policies/${policyId}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      userId,
    ),

  getCustomerHealth: (userId: string, crmCompanyId: string) =>
    supportRequest<SupportCustomerHealth>(`/customers/health/${crmCompanyId}`, {}, userId),

  listCustomerHealth: (userId: string, minScore?: number, maxScore?: number) => {
    const params = new URLSearchParams();
    if (minScore != null) params.set('minScore', String(minScore));
    if (maxScore != null) params.set('maxScore', String(maxScore));
    const query = params.toString();
    return supportRequest<SupportCustomerHealth[]>(
      `/customers/health${query ? `?${query}` : ''}`,
      {},
      userId,
    );
  },

  listAtRiskCustomers: (userId: string) =>
    supportRequest<SupportCustomerHealth[]>('/customers/health/at-risk', {}, userId),

  submitCsat: (userId: string, ticketId: string, rating: number, comment?: string) =>
    supportRequest<SupportCsatRating>(
      `/csat/tickets/${ticketId}/rating`,
      { method: 'POST', body: JSON.stringify({ rating, comment }) },
      userId,
    ),

  getCsatSummary: (userId: string, days: number = 30) =>
    supportRequest<SupportCsatSummary>(`/csat/summary?days=${days}`, {}, userId),
};

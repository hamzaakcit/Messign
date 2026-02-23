import { getAccessToken } from './authToken';

/**
 * Backend origin only (no path, no trailing slash).
 * VITE_API_URL must be set to e.g. https://messign-workspace.onrender.com
 * (do NOT include /api — the client adds /api when calling routes).
 * Prevents double /api and invalid ...com//api/auth/login.
 */
function getApiOrigin(): string {
  const raw = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const trimmed = (typeof raw === 'string' ? raw : '').trim().replace(/\/+$/, '');
  return trimmed.replace(/\/api\/?$/, '') || 'http://localhost:3001';
}

export const API_ORIGIN = getApiOrigin();
/** Base URL for API requests: origin + /api (backend mounts routes at /api/auth, /api/users, etc.) */
const API_BASE = `${API_ORIGIN}/api`;

let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(fn: () => void): void {
  onUnauthorized = fn;
}

function isAuthError(status: number, message?: string): boolean {
  if (status !== 401) return false;
  const m = (message ?? '').toLowerCase();
  return (
    m.includes('token') ||
    m.includes('expired') ||
    m.includes('authorization') ||
    m.includes('unauthorized') ||
    m.includes('required for admin')
  );
}

function authHeaders(userId?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;
  return headers;
}

async function fetchWithUserId<T>(endpoint: string, userId: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { ...authHeaders(userId), ...(options?.headers as Record<string, string>) },
    ...options,
  });
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

// Performance API (dashboard read; requires X-User-Id)
export const performanceAPI = {
  getCompany: (userId: string) => fetchWithUserId<{ success: boolean; data: unknown }>('/performance/company', userId),
  getCompanyTrends: (userId: string, period: string) =>
    fetchWithUserId<{ success: boolean; data: unknown[] }>(`/performance/company/trends?period=${period}`, userId),
  getTeam: (userId: string, teamId: string) =>
    fetchWithUserId<{ success: boolean; data: unknown }>(`/performance/teams/${teamId}`, userId),
  getTeamMembers: (userId: string, teamId: string) =>
    fetchWithUserId<{ success: boolean; data: { members: unknown[] } }>(`/performance/teams/${teamId}/members`, userId),
  getTeamTrends: (userId: string, teamId: string, period: string) =>
    fetchWithUserId<{ success: boolean; data: unknown[] }>(`/performance/teams/${teamId}/trends?period=${period}`, userId),
};

// Dashboard API (trends for chart; requires X-User-Id)
export const dashboardAPI = {
  getTrends: (
    userId: string,
    params: { metric: string; entityId: string; range: string }
  ) => {
    const q = new URLSearchParams(params).toString();
    return fetchWithUserId<{ success: boolean; data: { period: string; value: number }[] }>(
      `/dashboard/trends?${q}`,
      userId
    );
  },
};

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { ...headers, ...(options?.headers as Record<string, string>) },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = (body as { error?: string | { message?: string } }).error;
    const message = typeof err === 'string' ? err : (err && typeof err === 'object' && err.message ? err.message : response.statusText);
    if (isAuthError(response.status, message)) onUnauthorized?.();
    throw new Error(message);
  }

  return response.json();
}

// Auth API
export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body as { success: true; data: { accessToken: string; refreshToken: string; expiresIn: number; user: unknown; mustChangePassword: boolean } };
    const rawErr = (body as { success?: boolean; error?: { code: string; message: string; remainingAttempts?: number; lockedUntil?: string } | string }).error;
    const err = typeof rawErr === 'object' && rawErr !== null && 'message' in rawErr ? rawErr : { code: 'UNKNOWN', message: typeof rawErr === 'string' ? rawErr : response.statusText ?? 'Sign in failed' };
    const message = err.message ?? response.statusText ?? 'Sign in failed';
    return { success: false, error: { ...err, message } };
  },
  refresh: (refreshToken: string) =>
    fetchAPI<{ success: boolean; data?: { accessToken: string; refreshToken: string; expiresIn: number } }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  logout: (refreshToken?: string) =>
    fetchAPI<{ success: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  getMe: () =>
    fetchAPI<{ success: boolean; data?: { user: unknown; mustChangePassword: boolean } }>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    fetchAPI<{ success: boolean }>('/auth/password/change', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  getSessions: () =>
    fetchAPI<{ success: boolean; data?: unknown[] }>('/auth/sessions'),
  deleteSession: (sessionId: string) =>
    fetchAPI<{ success: boolean }>(`/auth/sessions/${sessionId}`, { method: 'DELETE' }),
  deleteAllSessions: () =>
    fetchAPI<{ success: boolean }>('/auth/sessions', { method: 'DELETE' }),
};

// Departments API (public list for main app, e.g. Team filter)
export const departmentsAPI = {
  getAll: () => fetchAPI<{ id: string; name: string }[]>('/departments'),
};

// Users API
export const usersAPI = {
  getAll: () => fetchAPI('/users'),
  getMe: () => fetchAPI('/users/me'),
  getById: (id: string) => fetchAPI(`/users/${id}`),
  updateStatus: (id: string, status: string) => 
    fetchAPI(`/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

// Channels API
export const channelsAPI = {
  getAll: () => fetchAPI('/channels'),
  getById: (id: string) => fetchAPI(`/channels/${id}`),
  create: (data: { name: string; description?: string; type?: string; members?: string[] }) =>
    fetchAPI('/channels', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  markAsRead: (id: string) =>
    fetchAPI(`/channels/${id}/read`, { method: 'POST' }),
};

// Messages API
export const messagesAPI = {
  getByChannel: (channelId: string) => fetchAPI(`/messages/channel/${channelId}`),
  send: (data: { channelId: string; userId: string; content: string }) =>
    fetchAPI('/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Chat API (DB-backed: /api/chat/channels) — pass userId so backend can use X-User-Id when JWT isn't ready
function chatFetch<T>(endpoint: string, userId?: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;
  return fetch(`${API_BASE}${endpoint}`, { ...options, headers: { ...headers, ...(options?.headers as Record<string, string>) } }).then((res) => {
    if (!res.ok) {
      return res.json().catch(() => ({})).then((body: unknown) => {
        const err = (body as { error?: string | { message?: string } }).error;
        const message = typeof err === 'string' ? err : (err && typeof err === 'object' && (err as { message?: string }).message) || res.statusText;
        throw new Error(message);
      });
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  });
}

export const chatAPI = {
  getChannels: (userId?: string) =>
    chatFetch<{ id: string; name: string; description?: string; type: string; members: string[]; unreadCount: number; createdAt: string }[]>('/chat/channels', userId),
  createDm: (otherUserId: string, userId?: string) =>
    chatFetch<{ id: string; name: string; description?: string; type: string; members: string[]; unreadCount: number; createdAt: string }>('/chat/dm', userId, {
      method: 'POST',
      body: JSON.stringify({ otherUserId }),
    }),
  getMessages: (channelId: string, userId?: string) =>
    chatFetch<{ id: string; channelId: string; userId: string; content: string; attachments: unknown[]; mentions: string[]; xpGained: number; timestamp: string; senderName?: string; senderAvatar?: string }[]>(
      `/chat/channels/${channelId}/messages`,
      userId
    ),
  sendMessage: (channelId: string, body: { content: string; attachments?: unknown[]; mentions?: string[] }, userId?: string) =>
    chatFetch<{ id: string; channelId: string; userId: string; content: string; attachments: unknown[]; mentions: string[]; xpGained: number; timestamp: string; senderName?: string; senderAvatar?: string }>(
      `/chat/channels/${channelId}/messages`,
      userId,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  markAsRead: (channelId: string, userId?: string) =>
    chatFetch<void>(`/chat/channels/${channelId}/read`, userId, { method: 'POST' }),
};

// Projects API
export const projectsAPI = {
  getAll: () => fetchAPI('/projects'),
  getActive: () => fetchAPI('/projects/active'),
  getById: (id: string) => fetchAPI(`/projects/${id}`),
  /** Marketplace: recruiting/active projects with user_application_status and application_count */
  getMarketplace: () => fetchAPI<MarketplaceProject[]>('/projects/marketplace'),
  /** Apply to project (auth from Bearer) */
  apply: (projectId: string, body?: { message?: string; slot_department?: string }) =>
    fetchAPI<{ status: string }>(`/projects/${projectId}/apply`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  /** Current user's applications */
  getMyApplications: () => fetchAPI<UserApplication[]>('/projects/applications/me'),
  /** Propose new project (employee or admin) */
  createProposal: (data: {
    name: string;
    description?: string;
    type?: string;
    due_date?: string | null;
    recruitment_status?: string;
    recruitment_config?: RecruitmentSlot[];
    xp_reward?: number;
    is_featured?: boolean;
    tags?: string[];
    opportunity_type?: 'project' | 'side_op';
    is_mspd?: boolean;
    reward_currency?: 'XP' | 'MSP';
    estimated_minutes?: number | null;
  }) =>
    fetchAPI('/projects/create', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  create: (data: { name: string; description: string; type: string; team: string[] }) =>
    fetchAPI('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProgress: (id: string, progress: number) =>
    fetchAPI(`/projects/${id}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({ progress }),
    }),
};

// Marketplace types (match server)
export interface RecruitmentSlot {
  dept: string;
  count: number;
  filled: number;
  /** Starter tasks created for the user when their application is accepted */
  default_tasks?: string[];
}

export type OpportunityType = 'project' | 'side_op';
export type RewardCurrency = 'XP' | 'MSP';

export interface MarketplaceProject {
  id: string;
  name: string;
  description: string;
  type: string;
  progress: number;
  team: string[];
  capacity: { current: number; max: number };
  status: string;
  due_date: string | null;
  created_at: string;
  recruitment_status: string;
  recruitment_config: RecruitmentSlot[];
  xp_reward: number;
  is_featured: boolean;
  application_count: number;
  user_application_status: 'pending' | 'approved' | 'rejected' | 'none';
  tags?: string[];
  /** Opportunity Hub: 'project' (team, long-term) or 'side_op' (up to 2 people, quick) */
  opportunity_type?: OpportunityType;
  /** Messign Special Projects Division - premium tier */
  is_mspd?: boolean;
  /** 'XP' or 'MSP' */
  reward_currency?: RewardCurrency;
  /** For side ops: estimated time in minutes */
  estimated_minutes?: number | null;
}

export interface UserApplication {
  id: string;
  project_id: string;
  project_name: string;
  status: string;
  message: string | null;
  created_at: string;
}

/** Admin: application with user info (for ApplicationDrawer) */
export interface ProjectApplicationWithUser {
  id: string;
  project_id: string;
  user_id: string;
  status: string;
  message: string | null;
  review_note: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  user_xp: number;
  user_level: number;
}

// Tasks API
export const tasksAPI = {
  getAll: () => fetchAPI('/tasks'),
  getByProject: (projectId: string) => fetchAPI(`/tasks/project/${projectId}`),
  getById: (id: string) => fetchAPI(`/tasks/${id}`),
  create: (data: any) =>
    fetchAPI('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateStatus: (id: string, status: string, userId: string) =>
    fetchAPI(`/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, userId }),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI(`/tasks/${id}`, { method: 'DELETE' }),
};

// Bounties API
export const bountiesAPI = {
  list: (params?: { status?: string; category?: string; urgency?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.category) q.set('category', params.category);
    if (params?.urgency) q.set('urgency', params.urgency);
    const query = q.toString();
    return fetchAPI<{ bounties: unknown[] }>(`/bounties${query ? `?${query}` : ''}`);
  },
  my: () => fetchAPI<{ created: unknown[]; claimed: unknown[] }>('/bounties/my'),
  create: (data: {
    title: string;
    description: string;
    category: string;
    departmentId?: string;
    xpReward?: number;
    estimatedMinutes?: number;
    urgency?: string;
    expiresAt?: string | null;
    attachments?: { name: string; url: string }[];
  }) => fetchAPI<{ bounty: unknown }>('/bounties', { method: 'POST', body: JSON.stringify(data) }),
  claim: (id: string) => fetchAPI<{ bounty: unknown }>(`/bounties/${id}/claim`, { method: 'POST' }),
  submit: (id: string) => fetchAPI<{ bounty: unknown }>(`/bounties/${id}/submit`, { method: 'POST' }),
  review: (id: string, body: { approved: boolean; rating?: number; note?: string }) =>
    fetchAPI<{ message: string }>(`/bounties/${id}/review`, { method: 'POST', body: JSON.stringify(body) }),
  unclaim: (id: string) => fetchAPI<{ message: string }>(`/bounties/${id}/unclaim`, { method: 'POST' }),
};

// Sprints API
export const sprintsAPI = {
  list: () => fetchAPI<{ sprints: unknown[] }>('/sprints'),
  create: (data: {
    projectId: string;
    title: string;
    description: string;
    skillsNeeded: string[];
    xpReward?: number;
    maxHelpers?: number;
    durationHours?: number;
  }) => fetchAPI<{ sprint: unknown }>('/sprints', { method: 'POST', body: JSON.stringify(data) }),
  join: (id: string) => fetchAPI<{ message: string }>(`/sprints/${id}/join`, { method: 'POST' }),
  resolve: (id: string, body?: { note?: string; helperContributions?: { userId: string; contribution?: string; xpMultiplier?: number }[] }) =>
    fetchAPI<{ message: string }>(`/sprints/${id}/resolve`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
};

// Showcase (Hall of Fame) API
export const showcaseAPI = {
  list: () => fetchAPI<{ showcases: unknown[] }>('/showcase'),
  add: (projectId: string, data: { impactSummary: string; impactMetrics?: unknown[]; testimonial?: string; coverImage?: string; screenshots?: string[] }) =>
    fetchAPI<{ showcase: unknown }>(`/showcase/${projectId}`, { method: 'POST', body: JSON.stringify(data) }),
  like: (id: string) => fetchAPI<{ liked: boolean; likes: number }>(`/showcase/${id}/like`, { method: 'POST' }),
  feature: (id: string) => fetchAPI<{ featured: boolean }>(`/showcase/${id}/feature`, { method: 'POST' }),
};

// Badges API
export const badgesAPI = {
  getAll: () => fetchAPI('/badges'),
  getById: (id: string) => fetchAPI(`/badges/${id}`),
  getForUser: (userId: string) => fetchAPI(`/badges/user/${userId}`),
};

// Documents API
export const documentsAPI = {
  getAll: () => fetchAPI('/documents'),
  getPinned: () => fetchAPI('/documents/pinned'),
  search: (query: string) => fetchAPI(`/documents/search?q=${encodeURIComponent(query)}`),
  getById: (id: string) => fetchAPI(`/documents/${id}`),
  create: (data: any) =>
    fetchAPI('/documents', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: any) =>
    fetchAPI(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  togglePin: (id: string) =>
    fetchAPI(`/documents/${id}/pin`, { method: 'PATCH' }),
};

// Activities API
export const activitiesAPI = {
  getRecent: (limit = 20) => fetchAPI(`/activities?limit=${limit}`),
};

// Leaderboard API
export const leaderboardAPI = {
  get: (limit = 10) => fetchAPI(`/leaderboard?limit=${limit}`),
  getMyRank: () => fetchAPI('/leaderboard/me'),
};

// Reimbursement API (requires X-User-Id header)
async function fetchReimbursementAPI<T>(
  endpoint: string,
  userId: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { ...authHeaders(userId), ...(options?.headers as Record<string, string>) },
    ...options,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || response.statusText);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

async function fetchReimbursementFormData(
  endpoint: string,
  userId: string,
  formData: FormData
): Promise<unknown> {
  // Do not set Content-Type so the browser sets multipart/form-data with boundary for FormData
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });
  } catch (networkErr: any) {
    throw new Error(`Network error during upload: ${networkErr?.message || 'Connection failed'}`);
  }
  if (!response.ok) {
    let errorMsg = response.statusText || `HTTP ${response.status}`;
    try {
      const body = await response.text();
      // Try to parse as JSON
      const parsed = JSON.parse(body);
      if (parsed?.error) errorMsg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
    } catch {
      // Not JSON — ignore
    }
    throw new Error(errorMsg);
  }
  // Handle empty responses gracefully
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export const reimbursementAPI = {
  getCounts: (userId: string) =>
    fetchReimbursementAPI<{
    myPendingCount: number;
    myPendingTotal: number;
    underReviewCount?: number;
    approvedThisMonth?: number;
    totalReimbursedYtd?: number;
  }>('/reimbursements/counts', userId),
  list: (userId: string, status?: string) =>
    fetchReimbursementAPI<unknown[]>(`/reimbursements${status ? `?status=${encodeURIComponent(status)}` : ''}`, userId),
  listAllApproved: (userId: string) =>
    fetchReimbursementAPI<unknown[]>('/reimbursements/admin/all-approved', userId),
  getById: (userId: string, id: string) =>
    fetchReimbursementAPI<unknown>(`/reimbursements/${id}`, userId),
  create: (userId: string, data: unknown) =>
    fetchReimbursementAPI<unknown>('/reimbursements', userId, { method: 'POST', body: JSON.stringify(data) }),
  update: (userId: string, id: string, data: unknown) =>
    fetchReimbursementAPI<unknown>(`/reimbursements/${id}`, userId, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (userId: string, id: string) =>
    fetchReimbursementAPI<void>(`/reimbursements/${id}`, userId, { method: 'DELETE' }),
  submit: (userId: string, id: string) =>
    fetchReimbursementAPI<unknown>(`/reimbursements/${id}/submit`, userId, { method: 'POST' }),
  uploadDocument: (userId: string, reimbursementId: string, file: File, documentType?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (documentType) formData.append('document_type', documentType);
    return fetchReimbursementFormData(`/reimbursements/${reimbursementId}/documents`, userId, formData);
  },
  deleteDocument: (userId: string, reimbursementId: string, docId: string) =>
    fetchReimbursementAPI<void>(`/reimbursements/${reimbursementId}/documents/${docId}`, userId, { method: 'DELETE' }),
  triggerOCR: (userId: string, reimbursementId: string, docId: string) =>
    fetchReimbursementAPI<unknown>(`/reimbursements/${reimbursementId}/documents/${docId}/ocr`, userId, { method: 'POST' }),
  getComments: (userId: string, id: string) =>
    fetchReimbursementAPI<unknown[]>(`/reimbursements/${id}/comments`, userId),
  addComment: (userId: string, id: string, commentText: string, isInternal?: boolean) =>
    fetchReimbursementAPI<unknown>(`/reimbursements/${id}/comments`, userId, {
      method: 'POST',
      body: JSON.stringify({ comment_text: commentText, is_internal: isInternal }),
    }),
};

export const categoriesAPI = {
  list: (userId: string) => fetchReimbursementAPI<unknown[]>('/categories', userId),
  listAll: (userId: string) => fetchReimbursementAPI<unknown[]>('/categories?all=true', userId),
  create: (userId: string, data: { name: string; icon?: string; spending_limit?: number; requires_justification_above?: number }) =>
    fetchReimbursementAPI<unknown>('/categories', userId, { method: 'POST', body: JSON.stringify(data) }),
  update: (userId: string, id: string, data: { name?: string; icon?: string; spending_limit?: number; requires_justification_above?: number; is_active?: boolean }) =>
    fetchReimbursementAPI<unknown>(`/categories/${id}`, userId, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (userId: string, id: string) =>
    fetchReimbursementAPI<void>(`/categories/${id}`, userId, { method: 'DELETE' }),
};

export const reimbursementSettingsAPI = {
  get: (userId: string) => fetchReimbursementAPI<unknown>('/settings/reimbursement', userId),
  patch: (userId: string, data: unknown) =>
    fetchReimbursementAPI<unknown>('/settings/reimbursement', userId, { method: 'PATCH', body: JSON.stringify(data) }),
};

export const exchangeRatesAPI = {
  get: (userId: string, from: string, to: string, date?: string) => {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return fetchReimbursementAPI<{ from: string; to: string; rate: number; date?: string }>(
      `/exchange-rates/${from}/${to}${q}`,
      userId
    );
  },
};

export const mileageAPI = {
  getRate: (userId: string) =>
    fetchReimbursementAPI<{ ratePerKm: number; currency: string }>('/mileage/rate', userId),
  calculate: (userId: string, data: { origin_address: string; destination_address: string; is_round_trip?: boolean }) =>
    fetchReimbursementAPI<unknown>('/mileage/calculate', userId, { method: 'POST', body: JSON.stringify(data) }),
};

export const approvalsAPI = {
  getCounts: (userId: string) =>
    fetchReimbursementAPI<{ pendingApprovalsCount: number }>('/approvals/counts', userId),
  list: (userId: string) => fetchReimbursementAPI<unknown[]>('/approvals', userId),
  approve: (userId: string, stepId: string, decisionNotes?: string) =>
    fetchReimbursementAPI<unknown>(`/approvals/${stepId}/approve`, userId, {
      method: 'POST',
      body: JSON.stringify({ decision_notes: decisionNotes }),
    }),
  reject: (userId: string, stepId: string, decisionNotes?: string) =>
    fetchReimbursementAPI<unknown>(`/approvals/${stepId}/reject`, userId, {
      method: 'POST',
      body: JSON.stringify({ decision_notes: decisionNotes }),
    }),
  bulk: (userId: string, stepIds: string[], action: 'approve' | 'reject') =>
    fetchReimbursementAPI<{ results: { stepId: string; success: boolean; error?: string }[] }>('/approvals/bulk', userId, {
      method: 'POST',
      body: JSON.stringify({ step_ids: stepIds, action }),
    }),
};

// Admin API (requires auth; caller must pass userId from auth)
async function fetchAdminAPI<T>(
  endpoint: string,
  userId: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { ...authHeaders(userId), ...(options?.headers as Record<string, string>) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (body as { error?: string }).error || response.statusText;
    if (isAuthError(response.status, message)) onUnauthorized?.();
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return body as T;
}

export const adminAPI = {
  auth: {
    getPolicy: (userId: string) => fetchAdminAPI<{ success: boolean; data: unknown }>('/admin/auth/policy', userId),
    updatePolicy: (userId: string, data: unknown) =>
      fetchAdminAPI<{ success: boolean; data: unknown }>('/admin/auth/policy', userId, { method: 'PUT', body: JSON.stringify(data) }),
    getEmployees: (userId: string) => fetchAdminAPI<{ success: boolean; data: unknown[] }>('/admin/auth/employees', userId),
    getEmployee: (userId: string, oddrooId: string) =>
      fetchAdminAPI<{ success: boolean; data: { auth: unknown; user: unknown } }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}`, userId),
    setPassword: (userId: string, oddrooId: string, body: { newPassword: string; forceChangeOnLogin?: boolean }) =>
      fetchAdminAPI<{ success: boolean }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/password`, userId, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    resetPassword: (userId: string, oddrooId: string) =>
      fetchAdminAPI<{ success: boolean }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/reset`, userId, { method: 'POST' }),
    viewPassword: (userId: string, oddrooId: string) =>
      fetchAdminAPI<{ success: boolean; data: { temporaryPassword: string | null; message: string } }>(
        `/admin/auth/employees/${encodeURIComponent(oddrooId)}/password`,
        userId
      ),
    updateStatus: (userId: string, oddrooId: string, status: string) =>
      fetchAdminAPI<{ success: boolean }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/status`, userId, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    unlock: (userId: string, oddrooId: string) =>
      fetchAdminAPI<{ success: boolean }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/unlock`, userId, { method: 'POST' }),
    updateForceChange: (userId: string, oddrooId: string, forceChange: boolean) =>
      fetchAdminAPI<{ success: boolean }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/force-change`, userId, {
        method: 'PUT',
        body: JSON.stringify({ forceChange }),
      }),
    getSessions: (userId: string, oddrooId: string) =>
      fetchAdminAPI<{ success: boolean; data: unknown[] }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/sessions`, userId),
    revokeSessions: (userId: string, oddrooId: string) =>
      fetchAdminAPI<{ success: boolean }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/sessions`, userId, { method: 'DELETE' }),
    getEmployeeAudit: (userId: string, oddrooId: string, params?: { limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.offset != null) q.set('offset', String(params.offset));
      const query = q.toString();
      return fetchAdminAPI<{ success: boolean; data: unknown[] }>(
        `/admin/auth/employees/${encodeURIComponent(oddrooId)}/audit${query ? `?${query}` : ''}`,
        userId
      );
    },
    getAudit: (userId: string, params?: { limit?: number; offset?: number; action?: string; targetAuthUserId?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.offset != null) q.set('offset', String(params.offset));
      if (params?.action) q.set('action', params.action);
      if (params?.targetAuthUserId) q.set('targetAuthUserId', params.targetAuthUserId);
      const query = q.toString();
      return fetchAdminAPI<{ success: boolean; data: unknown[] }>(`/admin/auth/audit${query ? `?${query}` : ''}`, userId);
    },
    bulkReset: (userId: string, oddrooIds: string[]) =>
      fetchAdminAPI<{ success: boolean; data: { oddrooId: string; success: boolean; error?: string }[] }>('/admin/auth/bulk/reset', userId, {
        method: 'POST',
        body: JSON.stringify({ oddrooIds }),
      }),
    bulkForceChange: (userId: string, oddrooIds: string[], forceChange: boolean) =>
      fetchAdminAPI<{ success: boolean; data: { oddrooId: string; success: boolean; error?: string }[] }>('/admin/auth/bulk/force-change', userId, {
        method: 'POST',
        body: JSON.stringify({ oddrooIds, forceChange }),
      }),
  },
  employees: {
    getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/employees', userId),
    getById: (userId: string, id: string) => fetchAdminAPI<unknown>(`/admin/employees/${id}`, userId),
    create: (userId: string, data: unknown) =>
      fetchAdminAPI('/admin/employees', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: unknown) =>
      fetchAdminAPI(`/admin/employees/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchAdminAPI(`/admin/employees/${id}`, userId, { method: 'DELETE' }),
  },
  projects: {
    getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/projects', userId),
    getPending: (userId: string) => fetchAdminAPI<unknown[]>('/admin/projects/pending', userId),
    getById: (userId: string, projectId: string) =>
      fetchAdminAPI<unknown>(`/admin/projects/${encodeURIComponent(projectId)}`, userId),
    update: (userId: string, projectId: string, data: unknown) =>
      fetchAdminAPI<unknown>(`/admin/projects/${encodeURIComponent(projectId)}`, userId, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (userId: string, projectId: string) =>
      fetchAdminAPI(`/admin/projects/${encodeURIComponent(projectId)}`, userId, { method: 'DELETE' }),
    getApplications: (userId: string, projectId: string) =>
      fetchAdminAPI<{ applications: ProjectApplicationWithUser[] }>(`/admin/projects/${encodeURIComponent(projectId)}/applications`, userId),
    approve: (userId: string, projectId: string, body?: { xp_reward?: number; is_featured?: boolean }) =>
      fetchAdminAPI<unknown>(`/admin/projects/${encodeURIComponent(projectId)}/approve`, userId, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    reject: (userId: string, projectId: string, reason: string) =>
      fetchAdminAPI<unknown>(`/admin/projects/${encodeURIComponent(projectId)}/reject`, userId, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    acceptApplication: (userId: string, projectId: string, applicationId: string) =>
      fetchAdminAPI<{ message: string }>(`/admin/projects/${encodeURIComponent(projectId)}/applications/${encodeURIComponent(applicationId)}/accept`, userId, {
        method: 'POST',
      }),
    rejectApplication: (userId: string, projectId: string, applicationId: string, note?: string) =>
      fetchAdminAPI<{ message: string }>(`/admin/projects/${encodeURIComponent(projectId)}/applications/${encodeURIComponent(applicationId)}/reject`, userId, {
        method: 'POST',
        body: JSON.stringify({ note: note ?? undefined }),
      }),
    complete: (userId: string, projectId: string) =>
      fetchAdminAPI<{ message: string; memberCount: number; xpReward: number }>(`/admin/projects/${encodeURIComponent(projectId)}/complete`, userId, {
        method: 'POST',
      }),
    create: (userId: string, data: unknown) =>
      fetchAdminAPI('/admin/projects', userId, { method: 'POST', body: JSON.stringify(data) }),
  },
  analytics: {
    getTalentHeatmap: (userId: string) =>
      fetchAdminAPI<{ departments: unknown[]; summary: unknown }>('/admin/analytics/talent-heatmap', userId),
  },
  departments: {
    getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/departments', userId),
    getById: (userId: string, id: string) => fetchAdminAPI<unknown>(`/admin/departments/${id}`, userId),
    create: (userId: string, data: unknown) =>
      fetchAdminAPI('/admin/departments', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: unknown) =>
      fetchAdminAPI(`/admin/departments/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchAdminAPI(`/admin/departments/${id}`, userId, { method: 'DELETE' }),
  },
  roles: {
    getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/roles', userId),
    getById: (userId: string, id: string) => fetchAdminAPI<unknown>(`/admin/roles/${id}`, userId),
    create: (userId: string, data: unknown) =>
      fetchAdminAPI('/admin/roles', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: unknown) =>
      fetchAdminAPI(`/admin/roles/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
  },
  auditLogs: {
    get: (userId: string, params?: { adminId?: string; action?: string; entityType?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params?.adminId) q.set('adminId', params.adminId);
      if (params?.action) q.set('action', params.action);
      if (params?.entityType) q.set('entityType', params.entityType);
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.offset != null) q.set('offset', String(params.offset));
      const query = q.toString();
      return fetchAdminAPI<unknown[]>(`/admin/audit-logs${query ? `?${query}` : ''}`, userId);
    },
  },
  settings: {
    get: (userId: string) => fetchAdminAPI<unknown>('/admin/settings', userId),
    update: (userId: string, data: unknown) =>
      fetchAdminAPI('/admin/settings', userId, { method: 'PUT', body: JSON.stringify(data) }),
  },
  import: {
    run: (userId: string, data: { rows: unknown[] }) =>
      fetchAdminAPI<unknown>('/admin/import', userId, { method: 'POST', body: JSON.stringify(data) }),
  },
  export: {
    get: (userId: string, format?: 'json' | 'csv') =>
      fetchAdminAPI<unknown>(`/admin/export${format ? `?format=${format}` : ''}`, userId),
    getBlob: async (userId: string, format: 'csv'): Promise<Blob> => {
      const response = await fetch(`${API_BASE}/admin/export?format=${format}`, {
        headers: authHeaders(userId),
      });
      if (!response.ok) throw new Error(`Export failed: ${response.statusText}`);
      return response.blob();
    },
  },
  messages: {
    send: (userId: string, data: { recipientId: string; subject: string; content: string; type?: string }) =>
      fetchAdminAPI<unknown>('/admin/messages/send', userId, { method: 'POST', body: JSON.stringify(data) }),
  },
  badges: {
    getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/badges', userId),
    getById: (userId: string, id: string) => fetchAdminAPI<unknown>(`/admin/badges/${id}`, userId),
    create: (userId: string, data: unknown) =>
      fetchAdminAPI('/admin/badges', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: unknown) =>
      fetchAdminAPI(`/admin/badges/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchAdminAPI(`/admin/badges/${id}`, userId, { method: 'DELETE' }),
    award: (userId: string, badgeId: string, userIds: string[]) =>
      fetchAdminAPI(`/admin/badges/${badgeId}/award`, userId, {
        method: 'POST',
        body: JSON.stringify({ userIds }),
      }),
  },
  performance: {
    teams: {
      getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/performance/teams', userId),
      getById: (userId: string, id: string) => fetchAdminAPI<unknown>(`/admin/performance/teams/${id}`, userId),
      create: (userId: string, data: unknown) =>
        fetchAdminAPI('/admin/performance/teams', userId, { method: 'POST', body: JSON.stringify(data) }),
      update: (userId: string, id: string, data: unknown) =>
        fetchAdminAPI(`/admin/performance/teams/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (userId: string, id: string) =>
        fetchAdminAPI(`/admin/performance/teams/${id}`, userId, { method: 'DELETE' }),
    },
    teamMembers: (teamId: string) => ({
      get: (userId: string) => fetchAdminAPI<unknown[]>(`/admin/performance/teams/${teamId}/members`, userId),
      add: (userId: string, data: unknown) =>
        fetchAdminAPI(`/admin/performance/teams/${teamId}/members`, userId, { method: 'POST', body: JSON.stringify(data) }),
      update: (userId: string, memberId: string, data: unknown) =>
        fetchAdminAPI(`/admin/performance/teams/${teamId}/members/${memberId}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
      remove: (userId: string, memberId: string) =>
        fetchAdminAPI(`/admin/performance/teams/${teamId}/members/${memberId}`, userId, { method: 'DELETE' }),
    }),
    targets: {
      getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/performance/targets', userId),
      create: (userId: string, data: unknown) =>
        fetchAdminAPI('/admin/performance/targets', userId, { method: 'POST', body: JSON.stringify(data) }),
      update: (userId: string, id: string, data: unknown) =>
        fetchAdminAPI(`/admin/performance/targets/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    },
    metrics: {
      get: (userId: string) => fetchAdminAPI<unknown>('/admin/performance/metrics', userId),
      update: (userId: string, data: unknown) =>
        fetchAdminAPI('/admin/performance/metrics', userId, { method: 'PUT', body: JSON.stringify(data) }),
    },
    alerts: {
      get: (userId: string) => fetchAdminAPI<unknown>('/admin/performance/alerts', userId),
      update: (userId: string, data: unknown) =>
        fetchAdminAPI('/admin/performance/alerts', userId, { method: 'PUT', body: JSON.stringify(data) }),
    },
    export: (userId: string, params?: { team?: string; format?: string }) => {
      const q = new URLSearchParams();
      if (params?.team) q.set('team', params.team);
      if (params?.format) q.set('format', params.format);
      const query = q.toString();
      return fetchAdminAPI<unknown>(`/admin/performance/export${query ? `?${query}` : ''}`, userId);
    },
    audit: (userId: string, params?: { entityType?: string; entityId?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params?.entityType) q.set('entityType', params.entityType);
      if (params?.entityId) q.set('entityId', params.entityId);
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.offset != null) q.set('offset', String(params.offset));
      const query = q.toString();
      return fetchAdminAPI<unknown[]>(`/admin/performance/audit${query ? `?${query}` : ''}`, userId);
    },
  },
};

/* ══════════════════════════════════════════════════════
   Invoices API
   ══════════════════════════════════════════════════════ */
export const invoicesAPI = {
  /** Returns only the current user's own invoices (even if admin). */
  list: (userId: string) =>
    fetchReimbursementAPI<unknown[]>('/invoices', userId),

  /** Returns ALL invoices in the org (admin/finance only). */
  listAll: (userId: string) =>
    fetchReimbursementAPI<unknown[]>('/invoices?scope=all', userId),

  getById: (userId: string, invoiceId: string) =>
    fetchReimbursementAPI<unknown>(`/invoices/${invoiceId}`, userId),

  generate: (userId: string, employeeId: string, year: number, month: number) =>
    fetchReimbursementAPI<unknown>('/invoices/generate', userId, {
      method: 'POST',
      body: JSON.stringify({ employeeId, year, month }),
    }),

  generateAll: (userId: string, year: number, month: number) =>
    fetchReimbursementAPI<{ generated: number; invoices: unknown[] }>('/invoices/generate-all', userId, {
      method: 'POST',
      body: JSON.stringify({ year, month }),
    }),

  finalize: (userId: string, invoiceId: string) =>
    fetchReimbursementAPI<unknown>(`/invoices/${invoiceId}/finalize`, userId, {
      method: 'PUT',
    }),

  reopen: (userId: string, invoiceId: string) =>
    fetchReimbursementAPI<unknown>(`/invoices/${invoiceId}/reopen`, userId, {
      method: 'PUT',
    }),

  reject: (userId: string, invoiceId: string, rejectionNote?: string) =>
    fetchReimbursementAPI<unknown>(`/invoices/${invoiceId}/reject`, userId, {
      method: 'PUT',
      body: JSON.stringify({ rejectionNote }),
    }),

  resubmit: (userId: string, invoiceId: string) =>
    fetchReimbursementAPI<unknown>(`/invoices/${invoiceId}/resubmit`, userId, {
      method: 'PUT',
    }),

  generateMine: (userId: string, year: number, month: number) =>
    fetchReimbursementAPI<unknown>('/invoices/generate-mine', userId, {
      method: 'POST',
      body: JSON.stringify({ year, month }),
    }),

  sign: (userId: string, invoiceId: string) =>
    fetchReimbursementAPI<unknown>(`/invoices/${invoiceId}/sign`, userId, {
      method: 'PUT',
    }),

  downloadPdf: async (userId: string, invoiceId: string) => {
    const response = await fetch(`${API_BASE}/invoices/${invoiceId}/pdf`, {
      headers: authHeaders(userId),
    });
    if (!response.ok) throw new Error('PDF download failed');
    return response.blob();
  },
};

/* ══════════════════════════════════════════════════════
   Bank Details API
   ══════════════════════════════════════════════════════ */
export const bankDetailsAPI = {
  get: (userId: string, targetUserId: string) =>
    fetchReimbursementAPI<unknown>(`/bank-details/${targetUserId}`, userId),

  update: (userId: string, targetUserId: string, data: {
    bankName?: string; iban?: string; swiftBic?: string; accountHolder?: string;
  }) =>
    fetchReimbursementAPI<unknown>(`/bank-details/${targetUserId}`, userId, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

/* ══════════════════════════════════════════════════════
   Signatures API
   ══════════════════════════════════════════════════════ */
export const signaturesAPI = {
  get: (userId: string, targetUserId: string) =>
    fetchReimbursementAPI<{ signature_data: string; created_at: string } | null>(`/signatures/${targetUserId}`, userId),

  save: (userId: string, targetUserId: string, signatureData: string) =>
    fetchReimbursementAPI<unknown>(`/signatures/${targetUserId}`, userId, {
      method: 'PUT',
      body: JSON.stringify({ signatureData }),
    }),
};

/* ══════════════════════════════════════════════════════
   Knowledge Hub API
   ══════════════════════════════════════════════════════ */
export const knowledgeAPI = {
  documents: {
    list: (userId: string, params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return fetchWithUserId<unknown>(`/knowledge/documents${qs}`, userId);
    },
    getBySlug: (userId: string, slug: string) =>
      fetchWithUserId<unknown>(`/knowledge/documents/${slug}`, userId),
    create: (userId: string, formData: FormData) => {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (userId) headers['X-User-Id'] = userId;
      return fetch(`${API_BASE}/knowledge/documents`, {
        method: 'POST', headers, body: formData,
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || r.statusText); }
        return r.json();
      });
    },
    update: (userId: string, id: string, formData: FormData) => {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (userId) headers['X-User-Id'] = userId;
      return fetch(`${API_BASE}/knowledge/documents/${id}`, {
        method: 'PUT', headers, body: formData,
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || r.statusText); }
        return r.json();
      });
    },
    delete: (userId: string, id: string) =>
      fetchWithUserId<unknown>(`/knowledge/documents/${id}`, userId, { method: 'DELETE' }),
    download: (userId: string, id: string) =>
      fetchWithUserId<{ fileUrl: string; downloadCount: number }>(`/knowledge/documents/${id}/download`, userId, { method: 'POST' }),
    acknowledge: (userId: string, id: string) =>
      fetchWithUserId<{ success: boolean }>(`/knowledge/documents/${id}/acknowledge`, userId, { method: 'POST' }),
    flag: (userId: string, id: string, reason: string) =>
      fetchWithUserId<unknown>(`/knowledge/documents/${id}/flag`, userId, { method: 'POST', body: JSON.stringify({ reason }) }),
    pin: (userId: string, id: string) =>
      fetchWithUserId<{ pinned: boolean }>(`/knowledge/documents/${id}/pin`, userId, { method: 'POST' }),
    versions: (userId: string, id: string) =>
      fetchWithUserId<unknown[]>(`/knowledge/documents/${id}/versions`, userId),
  },
  categories: {
    list: (userId: string) => fetchWithUserId<unknown[]>('/knowledge/categories', userId),
    create: (userId: string, data: { name: string; icon?: string; color?: string; sortOrder?: number }) =>
      fetchWithUserId<unknown>('/knowledge/categories', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: Record<string, unknown>) =>
      fetchWithUserId<unknown>(`/knowledge/categories/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchWithUserId<void>(`/knowledge/categories/${id}`, userId, { method: 'DELETE' }),
  },
  tags: {
    list: (userId: string) => fetchWithUserId<unknown[]>('/knowledge/tags', userId),
    create: (userId: string, name: string) =>
      fetchWithUserId<unknown>('/knowledge/tags', userId, { method: 'POST', body: JSON.stringify({ name }) }),
  },
  collections: {
    list: (userId: string) => fetchWithUserId<unknown[]>('/knowledge/collections', userId),
    getById: (userId: string, id: string) => fetchWithUserId<unknown>(`/knowledge/collections/${id}`, userId),
    create: (userId: string, data: Record<string, unknown>) =>
      fetchWithUserId<unknown>('/knowledge/collections', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: Record<string, unknown>) =>
      fetchWithUserId<unknown>(`/knowledge/collections/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchWithUserId<void>(`/knowledge/collections/${id}`, userId, { method: 'DELETE' }),
    getByShareToken: (shareToken: string) =>
      fetch(`${API_BASE}/knowledge/collections/share/${shareToken}`).then(r => r.json()),
  },
  search: (userId: string, params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return fetchWithUserId<unknown>(`/knowledge/search?${qs}`, userId);
  },
  stats: (userId: string) => fetchWithUserId<unknown>('/knowledge/stats', userId),
  activities: (userId: string, limit = 20) =>
    fetchWithUserId<unknown[]>(`/knowledge/activities?limit=${limit}`, userId),
  myPins: (userId: string) => fetchWithUserId<unknown[]>('/knowledge/my-pins', userId),
  requiredReading: (userId: string, role?: string) =>
    fetchWithUserId<unknown[]>(`/knowledge/required-reading${role ? `?role=${role}` : ''}`, userId),
};

/* ══════════════════════════════════════════════════════
   Admin Knowledge Hub API
   ══════════════════════════════════════════════════════ */
export const adminKnowledgeAPI = {
  stats: (userId: string) => fetchAdminAPI<unknown>('/admin/knowledge/stats', userId),
  documents: {
    list: (userId: string, params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return fetchAdminAPI<unknown>(`/admin/knowledge/documents${qs}`, userId);
    },
    getById: (userId: string, id: string) => fetchAdminAPI<unknown>(`/admin/knowledge/documents/${id}`, userId),
    create: (userId: string, formData: FormData) => {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (userId) headers['X-User-Id'] = userId;
      return fetch(`${API_BASE}/admin/knowledge/documents`, {
        method: 'POST', headers, body: formData,
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || r.statusText); }
        return r.json();
      });
    },
    update: (userId: string, id: string, formData: FormData) => {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (userId) headers['X-User-Id'] = userId;
      return fetch(`${API_BASE}/admin/knowledge/documents/${id}`, {
        method: 'PUT', headers, body: formData,
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || r.statusText); }
        return r.json();
      });
    },
    delete: (userId: string, id: string, permanent = false) =>
      fetchAdminAPI<void>(`/admin/knowledge/documents/${id}${permanent ? '?permanent=true' : ''}`, userId, { method: 'DELETE' }),
    restore: (userId: string, id: string) =>
      fetchAdminAPI<unknown>(`/admin/knowledge/documents/${id}/restore`, userId, { method: 'POST' }),
  },
  categories: {
    list: (userId: string) => fetchAdminAPI<unknown[]>('/admin/knowledge/categories', userId),
    create: (userId: string, data: Record<string, unknown>) =>
      fetchAdminAPI<unknown>('/admin/knowledge/categories', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: Record<string, unknown>) =>
      fetchAdminAPI<unknown>(`/admin/knowledge/categories/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchAdminAPI<void>(`/admin/knowledge/categories/${id}`, userId, { method: 'DELETE' }),
  },
  tags: {
    list: (userId: string) => fetchAdminAPI<unknown[]>('/admin/knowledge/tags', userId),
    create: (userId: string, name: string) =>
      fetchAdminAPI<unknown>('/admin/knowledge/tags', userId, { method: 'POST', body: JSON.stringify({ name }) }),
  },
  collections: {
    list: (userId: string) => fetchAdminAPI<unknown[]>('/admin/knowledge/collections', userId),
    create: (userId: string, data: Record<string, unknown>) =>
      fetchAdminAPI<unknown>('/admin/knowledge/collections', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: Record<string, unknown>) =>
      fetchAdminAPI<unknown>(`/admin/knowledge/collections/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchAdminAPI<void>(`/admin/knowledge/collections/${id}`, userId, { method: 'DELETE' }),
  },
  flags: {
    list: (userId: string, status?: string) =>
      fetchAdminAPI<unknown[]>(`/admin/knowledge/flags${status ? `?status=${status}` : ''}`, userId),
    count: (userId: string) => fetchAdminAPI<{ count: number }>('/admin/knowledge/flags/count', userId),
    resolve: (userId: string, id: string, status: string, note?: string) =>
      fetchAdminAPI<unknown>(`/admin/knowledge/flags/${id}`, userId, { method: 'PUT', body: JSON.stringify({ status, note }) }),
  },
  compliance: {
    get: (userId: string) => fetchAdminAPI<unknown>('/admin/knowledge/compliance', userId),
    acknowledgements: (userId: string, documentId: string) =>
      fetchAdminAPI<unknown[]>(`/admin/knowledge/compliance/${documentId}/acknowledgements`, userId),
  },
};

/** @module projectsApi — Projects, tasks, bounties, sprints, and showcase (Hall of Fame) APIs. */
import { fetchAPI } from './api';

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

export const tasksAPI = {
  getAll: () => fetchAPI('/tasks'),
  getByProject: (projectId: string) => fetchAPI(`/tasks/project/${projectId}`),
  getById: (id: string) => fetchAPI(`/tasks/${id}`),
  create: (data: Record<string, unknown>) =>
    fetchAPI('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateStatus: (id: string, status: string, userId: string) =>
    fetchAPI(`/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, userId }),
    }),
  update: (id: string, data: Record<string, unknown>) =>
    fetchAPI(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchAPI(`/tasks/${id}`, { method: 'DELETE' }),
};

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

export const showcaseAPI = {
  list: () => fetchAPI<{ showcases: unknown[] }>('/showcase'),
  add: (projectId: string, data: { impactSummary: string; impactMetrics?: unknown[]; testimonial?: string; coverImage?: string; screenshots?: string[] }) =>
    fetchAPI<{ showcase: unknown }>(`/showcase/${projectId}`, { method: 'POST', body: JSON.stringify(data) }),
  like: (id: string) => fetchAPI<{ liked: boolean; likes: number }>(`/showcase/${id}/like`, { method: 'POST' }),
  feature: (id: string) => fetchAPI<{ featured: boolean }>(`/showcase/${id}/feature`, { method: 'POST' }),
};

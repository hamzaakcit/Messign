import { API_ORIGIN } from './apiCore';
import { getAccessToken } from './authToken';
import type { PaginatedResult } from './types';

const RECRUITMENT_BASE = `${API_ORIGIN}/api/hr`;

async function recruitmentRequest<T>(
  path: string,
  options: RequestInit = {},
  userId?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${RECRUITMENT_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export type { PaginatedResult } from './types';

export interface RecruitmentJob {
  id: string;
  organization_id: string | null;
  title: string;
  department: string | null;
  department_id: string | null;
  location: string | null;
  location_type: string;
  employment_type: string;
  description: string | null;
  description_html: string | null;
  requirements: string[];
  nice_to_have: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  status: string;
  hiring_manager_id: string | null;
  recruiter_id: string | null;
  positions_count: number;
  positions_filled: number;
  published_at: string | null;
  closed_at: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  applicant_count?: number;
  applicants?: Array<Record<string, unknown>>;
}

export interface RecruitmentCandidate {
  id: string;
  organization_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  current_company: string | null;
  current_title: string | null;
  location: string | null;
  resume_url: string | null;
  resume_file_name: string | null;
  resume_text: string | null;
  resume_parsed: Record<string, unknown>;
  source: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface RecruitmentApplication {
  id: string;
  job_id: string;
  candidate_id: string;
  stage: string;
  match_score: number | null;
  match_details: Record<string, unknown>;
  screened_method: 'ai' | 'manual' | null;
  screened_at: string | null;
  cover_letter: string | null;
  status: string;
  rejection_reason: string | null;
  rejection_stage: string | null;
  source: string | null;
  applied_at: string;
  last_stage_change_at: string;
  created_at: string;
  updated_at: string;
  candidate?: RecruitmentCandidate & Record<string, unknown>;
  interviews?: RecruitmentInterview[];
  offers?: RecruitmentOffer[];
  stage_history?: Array<Record<string, unknown>>;
}

export interface RecruitmentInterview {
  id: string;
  application_id: string;
  interviewer_id: string;
  interview_type: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  status: string;
  notes: string | null;
  rating: number | null;
  recommendation: string | null;
  feedback: string | null;
  skills_assessed: Array<Record<string, unknown>>;
  completed_at: string | null;
  interviewer_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
}

export interface RecruitmentOffer {
  id: string;
  application_id: string;
  salary: number;
  currency: string;
  start_date: string | null;
  offer_type: string;
  benefits: string | null;
  notes: string | null;
  status: string;
  sent_at: string | null;
  responded_at: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface RecruitmentDashboardMetrics {
  openPositions: number;
  activeApplicants: number;
  avgTimeToHire: number;
  offerAcceptanceRate: number;
  pipelineByStage: Record<string, number>;
  sourceEffectiveness: Array<{ source: string; count: number }>;
  positionsByDepartment: Array<{ department: string; open_positions: number }>;
  upcomingInterviews: RecruitmentInterview[];
  timeToHireTrend: Array<{ month: string; avg_days: number }>;
}

export const recruitmentAPI = {
  listJobs: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return recruitmentRequest<PaginatedResult<RecruitmentJob>>(`/jobs?${params.toString()}`, {}, userId);
  },
  getJob: (userId: string, jobId: string) =>
    recruitmentRequest<RecruitmentJob>(`/jobs/${jobId}`, {}, userId),
  createJob: (userId: string, data: Partial<RecruitmentJob>) =>
    recruitmentRequest<RecruitmentJob>('/jobs', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateJob: (userId: string, jobId: string, data: Partial<RecruitmentJob>) =>
    recruitmentRequest<RecruitmentJob>(`/jobs/${jobId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  publishJob: (userId: string, jobId: string) =>
    recruitmentRequest<RecruitmentJob>(`/jobs/${jobId}/publish`, { method: 'POST' }, userId),
  closeJob: (userId: string, jobId: string, reason?: string) =>
    recruitmentRequest<RecruitmentJob>(`/jobs/${jobId}/close`, { method: 'POST', body: JSON.stringify({ reason }) }, userId),
  getJobMetrics: (userId: string, jobId?: string) =>
    recruitmentRequest<Record<string, unknown>>(`/jobs/metrics${jobId ? `?jobId=${jobId}` : ''}`, {}, userId),

  listCandidates: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return recruitmentRequest<PaginatedResult<RecruitmentCandidate>>(`/candidates?${params.toString()}`, {}, userId);
  },
  getCandidate: (userId: string, candidateId: string) =>
    recruitmentRequest<RecruitmentCandidate>(`/candidates/${candidateId}`, {}, userId),
  createCandidate: (userId: string, data: Partial<RecruitmentCandidate>) =>
    recruitmentRequest<RecruitmentCandidate>('/candidates', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateCandidate: (userId: string, candidateId: string, data: Partial<RecruitmentCandidate>) =>
    recruitmentRequest<RecruitmentCandidate>(`/candidates/${candidateId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  searchCandidates: (userId: string, query: string, limit: number = 20) =>
    recruitmentRequest<RecruitmentCandidate[]>(`/candidates/search?q=${encodeURIComponent(query)}&limit=${limit}`, {}, userId),
  uploadResume: async (userId: string, candidateId: string, file: File) => {
    const formData = new FormData();
    formData.append('resume', file);
    return recruitmentRequest<RecruitmentCandidate>(`/candidates/${candidateId}/resume`, { method: 'POST', body: formData }, userId);
  },

  listApplications: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return recruitmentRequest<PaginatedResult<RecruitmentApplication>>(`/applications?${params.toString()}`, {}, userId);
  },
  getApplicationsByStage: (userId: string, jobId?: string) =>
    recruitmentRequest<Record<string, RecruitmentApplication[]>>(`/applications/by-stage${jobId ? `?jobId=${jobId}` : ''}`, {}, userId),
  getApplication: (userId: string, applicationId: string) =>
    recruitmentRequest<RecruitmentApplication>(`/applications/${applicationId}`, {}, userId),
  createApplication: (userId: string, data: Record<string, unknown>) =>
    recruitmentRequest<RecruitmentApplication>('/applications', { method: 'POST', body: JSON.stringify(data) }, userId),
  moveApplicationStage: (userId: string, applicationId: string, stage: string, notes?: string) =>
    recruitmentRequest<RecruitmentApplication>(`/applications/${applicationId}/move-stage`, { method: 'POST', body: JSON.stringify({ stage, notes }) }, userId),
  rejectApplication: (userId: string, applicationId: string, reason: string) =>
    recruitmentRequest<RecruitmentApplication>(`/applications/${applicationId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, userId),

  listInterviews: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return recruitmentRequest<PaginatedResult<RecruitmentInterview>>(`/interviews?${params.toString()}`, {}, userId);
  },
  scheduleInterview: (userId: string, data: Record<string, unknown>) =>
    recruitmentRequest<RecruitmentInterview>('/interviews', { method: 'POST', body: JSON.stringify(data) }, userId),
  completeInterview: (userId: string, interviewId: string, data: Record<string, unknown>) =>
    recruitmentRequest<RecruitmentInterview>(`/interviews/${interviewId}/complete`, { method: 'POST', body: JSON.stringify(data) }, userId),
  cancelInterview: (userId: string, interviewId: string, notes?: string) =>
    recruitmentRequest<RecruitmentInterview>(`/interviews/${interviewId}/cancel`, { method: 'POST', body: JSON.stringify({ notes }) }, userId),

  createOffer: (userId: string, data: Record<string, unknown>) =>
    recruitmentRequest<RecruitmentOffer>('/offers', { method: 'POST', body: JSON.stringify(data) }, userId),
  sendOffer: (userId: string, offerId: string) =>
    recruitmentRequest<RecruitmentOffer>(`/offers/${offerId}/send`, { method: 'POST' }, userId),
  acceptOffer: (userId: string, offerId: string) =>
    recruitmentRequest<RecruitmentOffer>(`/offers/${offerId}/accept`, { method: 'POST' }, userId),
  rejectOffer: (userId: string, offerId: string, reason?: string) =>
    recruitmentRequest<RecruitmentOffer>(`/offers/${offerId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, userId),

  getDashboardMetrics: (userId: string) =>
    recruitmentRequest<RecruitmentDashboardMetrics>('/dashboard/metrics', {}, userId),
  getFunnel: (userId: string, jobId?: string) =>
    recruitmentRequest<Record<string, number>>(`/dashboard/funnel${jobId ? `?jobId=${jobId}` : ''}`, {}, userId),
  getTimeToHire: (userId: string) =>
    recruitmentRequest<{ avgDays: number }>('/dashboard/time-to-hire', {}, userId),
};

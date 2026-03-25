import { getAccessToken } from './authToken';
import { API_ORIGIN } from './apiCore';

const OKR_BASE = `${API_ORIGIN}/api/okr`;

async function okrRequest<T>(
  path: string,
  options: RequestInit = {},
  userId?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;

  const res = await fetch(`${OKR_BASE}${path}`, {
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

// ── Types ──

export interface OKRPeriod {
  id: string;
  organization_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export interface KeyResult {
  id: string;
  goal_id: string;
  title: string;
  metric_type: 'number' | 'percentage' | 'currency' | 'boolean';
  target_value: number;
  current_value: number;
  start_value: number;
  unit: string | null;
  auto_source: string | null;
  progress: number;
  created_at: string;
  updated_at: string;
  check_ins?: CheckIn[];
}

export interface Goal {
  id: string;
  organization_id: string;
  period_id: string;
  parent_goal_id: string | null;
  owner_id: string;
  level: 'company' | 'department' | 'team' | 'individual';
  department_id: string | null;
  title: string;
  description: string | null;
  progress: number;
  status: 'on_track' | 'at_risk' | 'behind' | 'completed';
  created_at: string;
  updated_at: string;
  owner_name?: string;
  key_results?: KeyResult[];
  children?: Goal[];
}

export interface CheckIn {
  id: string;
  key_result_id: string;
  user_id: string;
  value: number;
  note: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  created_at: string;
  user_name?: string;
}

export interface OKRMetrics {
  totalGoals: number;
  onTrack: number;
  atRisk: number;
  behind: number;
  completed: number;
  avgProgress: number;
}

export interface CreateGoalInput {
  period_id: string;
  parent_goal_id?: string;
  level: 'company' | 'department' | 'team' | 'individual';
  department_id?: string;
  title: string;
  description?: string;
}

export interface CreateKeyResultInput {
  title: string;
  metric_type?: 'number' | 'percentage' | 'currency' | 'boolean';
  target_value: number;
  start_value?: number;
  unit?: string;
  auto_source?: string;
}

// ── API Functions ──

export function listPeriods(userId?: string): Promise<OKRPeriod[]> {
  return okrRequest('/periods', {}, userId);
}

export function listGoals(
  userId?: string,
  periodId?: string,
  level?: string,
  parentGoalId?: string,
): Promise<Goal[]> {
  const params = new URLSearchParams();
  if (periodId) params.set('periodId', periodId);
  if (level) params.set('level', level);
  if (parentGoalId) params.set('parentGoalId', parentGoalId);
  const qs = params.toString();
  return okrRequest(`/goals${qs ? `?${qs}` : ''}`, {}, userId);
}

export function getGoalTree(periodId: string, userId?: string): Promise<Goal[]> {
  return okrRequest(`/goals/tree/${periodId}`, {}, userId);
}

export function getGoal(goalId: string, userId?: string): Promise<Goal> {
  return okrRequest(`/goals/${goalId}`, {}, userId);
}

export function createGoal(data: CreateGoalInput, userId?: string): Promise<Goal> {
  return okrRequest('/goals', { method: 'POST', body: JSON.stringify(data) }, userId);
}

export function updateGoal(goalId: string, data: Partial<Pick<Goal, 'title' | 'description' | 'status' | 'progress'>>, userId?: string): Promise<Goal> {
  return okrRequest(`/goals/${goalId}`, { method: 'PUT', body: JSON.stringify(data) }, userId);
}

export function createKeyResult(goalId: string, data: CreateKeyResultInput, userId?: string): Promise<KeyResult> {
  return okrRequest(`/goals/${goalId}/key-results`, { method: 'POST', body: JSON.stringify(data) }, userId);
}

export function checkIn(krId: string, value: number, note?: string, confidence?: 'high' | 'medium' | 'low', userId?: string): Promise<CheckIn> {
  return okrRequest(`/key-results/${krId}/check-in`, { method: 'PUT', body: JSON.stringify({ value, note, confidence }) }, userId);
}

export function getMetrics(periodId?: string, userId?: string): Promise<OKRMetrics> {
  const qs = periodId ? `?periodId=${periodId}` : '';
  return okrRequest(`/metrics${qs}`, {}, userId);
}

import { API_ORIGIN } from './apiCore';
import { getAccessToken } from './authToken';

const TIME_BASE = `${API_ORIGIN}/api/time`;

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

function toCamelCaseKey(value: string): string {
  return value.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}

function normalizeValue<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, entry]) => {
      acc[toCamelCaseKey(key)] = normalizeValue(entry);
      return acc;
    }, {}) as T;
  }
  return value as T;
}

function headers(userId?: string, hasBody: boolean = true): Record<string, string> {
  const out: Record<string, string> = {};
  if (hasBody) out['Content-Type'] = 'application/json';
  const token = getAccessToken();
  if (token) out.Authorization = `Bearer ${token}`;
  if (userId) out['X-User-Id'] = userId;
  return out;
}

async function timeRequest<T>(path: string, options: RequestInit = {}, userId?: string): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(`${TIME_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...headers(userId, hasBody),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return normalizeValue<T>(JSON.parse(text) as JsonValue);
}

function queryString(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v == null || v === '') return;
    params.set(k, String(v));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const timeApi = {
  listEntries: (userId: string, filters: Record<string, unknown> = {}) =>
    timeRequest(`/entries${queryString(filters)}`, {}, userId),
  getWeeklyGrid: (userId: string, weekStartDate: string) =>
    timeRequest(`/entries/weekly-grid${queryString({ weekStartDate })}`, {}, userId),
  createEntry: (userId: string, payload: Record<string, unknown>) =>
    timeRequest('/entries', { method: 'POST', body: JSON.stringify(payload) }, userId),
  updateEntry: (userId: string, id: string, payload: Record<string, unknown>) =>
    timeRequest(`/entries/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, userId),
  deleteEntry: (userId: string, id: string) =>
    timeRequest(`/entries/${id}`, { method: 'DELETE' }, userId),

  getActiveTimer: (userId: string) =>
    timeRequest('/timers/active', {}, userId),
  startTimer: (userId: string, payload: Record<string, unknown> = {}) =>
    timeRequest('/timers/start', { method: 'POST', body: JSON.stringify(payload) }, userId),
  stopTimer: (userId: string, id: string) =>
    timeRequest(`/timers/${id}/stop`, { method: 'POST' }, userId),
  discardTimer: (userId: string, id: string) =>
    timeRequest(`/timers/${id}/discard`, { method: 'POST' }, userId),

  listTimesheets: (userId: string, filters: Record<string, unknown> = {}) =>
    timeRequest(`/timesheets${queryString(filters)}`, {}, userId),
  getCurrentTimesheet: (userId: string, weekStartDate?: string) =>
    timeRequest(`/timesheets/current${queryString({ weekStartDate })}`, {}, userId),
  getTimesheet: (userId: string, id: string) =>
    timeRequest(`/timesheets/${id}`, {}, userId),
  submitTimesheet: (userId: string, id: string) =>
    timeRequest(`/timesheets/${id}/submit`, { method: 'POST' }, userId),
  approveTimesheet: (userId: string, id: string) =>
    timeRequest(`/timesheets/${id}/approve`, { method: 'POST' }, userId),
  rejectTimesheet: (userId: string, id: string, reason: string) =>
    timeRequest(`/timesheets/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, userId),

  getMyUtilization: (userId: string, period: 'week' | 'month' | 'quarter' = 'month') =>
    timeRequest(`/utilization/me${queryString({ period })}`, {}, userId),
  getTeamUtilization: (userId: string) =>
    timeRequest('/utilization/team', {}, userId),
  getBillingSummary: (userId: string, filters: Record<string, unknown> = {}) =>
    timeRequest(`/utilization/billing${queryString(filters)}`, {}, userId),

  listCategories: (userId: string) =>
    timeRequest('/categories', {}, userId),
};

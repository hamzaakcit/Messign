import { API_ORIGIN } from './apiCore';
import { getAccessToken } from './authToken';

const BASE = `${API_ORIGIN}/api/dora/automations`;

function headers(userId?: string, hasBody: boolean = true): Record<string, string> {
  const out: Record<string, string> = {};
  if (hasBody) out['Content-Type'] = 'application/json';
  const token = getAccessToken();
  if (token) out.Authorization = `Bearer ${token}`;
  if (userId) out['X-User-Id'] = userId;
  return out;
}

async function req<T>(path: string, options: RequestInit = {}, userId?: string): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(`${BASE}${path}`, {
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
  return response.json() as Promise<T>;
}

function qs(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v == null || v === '') continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export const doraAutomationsApi = {
  getStats: (userId: string) => req<any>('/stats', {}, userId),
  listPolicies: (userId: string) => req<any>('/policies', {}, userId),
  getPolicy: (userId: string, id: string) => req<any>(`/policies/${id}`, {}, userId),
  createPolicy: (userId: string, payload: Record<string, unknown>) =>
    req<any>('/policies', { method: 'POST', body: JSON.stringify(payload) }, userId),
  updatePolicy: (userId: string, id: string, payload: Record<string, unknown>) =>
    req<any>(`/policies/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, userId),
  togglePolicy: (userId: string, id: string, isActive: boolean) =>
    req<any>(`/policies/${id}/toggle`, { method: 'PUT', body: JSON.stringify({ isActive }) }, userId),
  deletePolicy: (userId: string, id: string) =>
    req<any>(`/policies/${id}`, { method: 'DELETE' }, userId),
  listLog: (userId: string, filters: Record<string, unknown> = {}) =>
    req<any>(`/log${qs(filters)}`, {}, userId),
  getLogDetail: (userId: string, id: string) => req<any>(`/log/${id}`, {}, userId),
  undoLog: (userId: string, id: string) => req<any>(`/log/${id}/undo`, { method: 'POST' }, userId),
};

/**
 * AI Admin API — Admin-only endpoints for AI Brain monitoring and control.
 * Base path: /api/knowledge-hub/ai/admin
 */

import { getAccessToken } from '@/lib/authToken';
import { API_ORIGIN } from '@/lib/api';

const API = `${API_ORIGIN}/api/knowledge-hub/ai/admin`;

function getHeaders(): Record<string, string> {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = { ...getHeaders(), ...(options?.headers as Record<string, string> ?? {}) };
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type AnalyticsPeriod = 'today' | 'this_week' | 'this_month' | 'this_quarter';

export interface AIAnalytics {
  totals: Record<string, unknown>;
  topTools: Record<string, unknown>[];
  topUsers: Record<string, unknown>[];
  queryTrend: Record<string, unknown>[];
  failedQueries: Record<string, unknown>[];
}

export interface CircuitStatus {
  state: 'closed' | 'open' | 'half_open';
  failureCount: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
}

export interface ProviderStatus {
  configured: boolean;
}

export interface AIHealth {
  status: 'healthy' | 'degraded';
  toolsRegistered: number;
  providers: {
    healthy: number;
    total: number;
    details: Record<string, CircuitStatus>;
  };
  cache: { size: number; maxSize: number; hitRate: number };
  performance: {
    avgResponseMs: number;
    p95ResponseMs: number;
    recentRequests: number;
  };
}

export const aiAdminAPI = {
  getAnalytics: (period: AnalyticsPeriod = 'this_month') =>
    request<AIAnalytics>(`/analytics?period=${period}`),

  getPerformance: () =>
    request<{
      requestCount: number;
      averages: { router: number; tools: number; synthesis: number; total: number };
      p95: { router: number; tools: number; synthesis: number; total: number };
      alertCount: { router: number; tools: number; synthesis: number; total: number };
    }>('/performance'),

  getCircuits: () =>
    request<Record<string, CircuitStatus>>('/circuits'),

  resetCircuit: (provider: string) =>
    request<{ message: string }>(`/circuits/${provider}/reset`, { method: 'POST' }),

  getCache: () =>
    request<{ size: number; maxSize: number; totalHits: number; oldestEntryAge: number }>('/cache'),

  clearCache: () =>
    request<{ message: string }>('/cache/clear', { method: 'POST' }),

  getTools: () =>
    request<{
      totalTools: number;
      tools: Array<{
        name: string;
        category: string;
        description: string;
        requiredRoles: string[];
        parameterCount: number;
      }>;
    }>('/tools'),

  getHealth: () => request<AIHealth>('/health'),

  getProviders: () =>
    request<Record<string, ProviderStatus>>('/providers'),

  getRateLimit: (userId: string) =>
    request<{ minuteUsed: number; minuteLimit: number; hourUsed: number; hourLimit: number }>(
      `/rate-limit/${encodeURIComponent(userId)}`
    ),
};

import { getAccessToken } from './authToken';

function normalizeApiOrigin(v: string | undefined): string {
  if (v == null || typeof v !== 'string') return '';
  const t = v.trim();
  if (!t) return '';
  return t.replace(/\/$/, '');
}

/** Prefer `VITE_API_URL`; also accept `VITE_API_ORIGIN` (used in some env files). */
const _explicitOrigin =
  normalizeApiOrigin(import.meta.env.VITE_API_URL) ||
  normalizeApiOrigin(import.meta.env.VITE_API_ORIGIN);

export const API_ORIGIN =
  _explicitOrigin ||
  (import.meta.env.PROD ? 'https://server-production-7283.up.railway.app' : '');

export const API_BASE = `${API_ORIGIN}/api`;

/**
 * Chat/SSE endpoints must return `text/event-stream` (or JSON for special modes), not the SPA HTML.
 * When `VITE_API_URL` points at the Vercel hostname, POST /api/... is rewritten to index.html.
 */
export function assertNotHtmlApiResponse(response: Response): void {
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('text/html')) {
    throw new Error(
      'Received a web page instead of the API. In Vercel → Environment Variables, set VITE_API_URL to your backend root URL (e.g. https://….up.railway.app), not the Vercel site URL. Redeploy after changing it.',
    );
  }
}

let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(fn: () => void): void {
  onUnauthorized = fn;
}

export function isAuthError(status: number, message?: string): boolean {
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

export function authHeaders(userId?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;
  return headers;
}

export async function fetchWithUserId<T>(endpoint: string, userId: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    credentials: 'include',
    headers: { ...authHeaders(userId), ...(options?.headers as Record<string, string>) },
    ...options,
  });
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return false;
      const body = await res.json();
      const data = (body as { data?: { accessToken: string; expiresIn: number } }).data;
      if (!data?.accessToken) return false;
      const expiresAt = Date.now() + (data.expiresIn ?? 900) * 1000;
      // Update persisted auth store so the store→module subscriber does not overwrite a fresh token with a stale expired one from persist.
      const { useAuthStore } = await import('@/stores/authStore');
      useAuthStore.setState({ accessToken: data.accessToken, expiresAt });
      return true;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    credentials: 'include',
    headers: { ...headers, ...(options?.headers as Record<string, string>) },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const err = (body as { error?: string | { message?: string } }).error;
    const message = typeof err === 'string' ? err : (err && typeof err === 'object' && err.message ? err.message : response.statusText);

    if (response.status === 401 && !endpoint.startsWith('/auth/')) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        const retryHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        const newToken = getAccessToken();
        if (newToken) retryHeaders['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
          credentials: 'include',
          headers: { ...retryHeaders, ...(options?.headers as Record<string, string>) },
          ...options,
        });
        if (retryResponse.ok) return retryResponse.json();
      }
      onUnauthorized?.();
      throw new Error(message);
    }

    if (isAuthError(response.status, message)) onUnauthorized?.();
    throw new Error(message);
  }

  return response.json();
}

export async function fetchAdminAPI<T>(
  endpoint: string,
  userId: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    credentials: 'include',
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

/* ══════════════════════════════════════════════════════
   Domain re-exports (backward compatibility)
   All existing `import { … } from '@/lib/api'` continue to work.
   ══════════════════════════════════════════════════════ */

export { reportsAPI, type ReportRequest, type ReportResult } from './reportsApi';
export { heartAPI } from './cultureApi';
export { notificationsAPI, type AppNotification, type NotificationPreference } from './notificationsApi';
export { authAPI } from './authApi';
export { departmentsAPI, usersAPI } from './orgApi';
export { channelsAPI, messagesAPI, chatAPI } from './messagingApi';
export { projectsAPI, tasksAPI, bountiesAPI, sprintsAPI, showcaseAPI, type RecruitmentSlot, type OpportunityType, type RewardCurrency, type MarketplaceProject, type UserApplication, type ProjectApplicationWithUser } from './projectsApi';
export { documentsAPI } from './documentsApi';
export { adminAPI } from './adminApi';
export { performanceAPI, dashboardAPI, executiveAPI, doraBriefingAPI, doraAiStatsAPI } from './executiveApi';
export type { ExecutiveDashboard, BriefingItem, BriefingSection, DailyBriefing, DoraUserStats } from './executiveApi';
export { reimbursementAPI, categoriesAPI, reimbursementSettingsAPI, budgetsAPI, exchangeRatesAPI, mileageAPI, approvalsAPI, invoicesAPI, bankDetailsAPI, signaturesAPI } from './reimbursementApi';
export type { Budget } from './reimbursementApi';
export { badgesAPI, activitiesAPI, leaderboardAPI } from './gamificationApi';
export { knowledgeAPI, adminKnowledgeAPI } from './knowledgeApi';

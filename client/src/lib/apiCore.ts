/**
 * HTTP primitives and API origin only. Domain modules (`*Api.ts`, `marketingApi/helpers`) must import
 * from here — not from `api.ts` — so the `api` barrel can re-export them without circular init / TDZ errors in production bundles.
 */
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

/**
 * Backend origin (no `/api` suffix). In Vitest, modules that read this directly (e.g. `fetchJson.ts`)
 * must mock `@/lib/apiCore` — mocking `@/lib/api` alone does not replace this binding.
 */
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

function parseErrorBody(body: Record<string, unknown>, statusText: string): string {
  const msg = body.message;
  if (typeof msg === 'string' && msg.length > 0) return msg;
  const err = body.error;
  if (typeof err === 'string' && err.length > 0) return err;
  if (err && typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: string }).message === 'string') {
    return (err as { message: string }).message;
  }
  return statusText;
}

/**
 * Same auth behavior as {@link fetchAPI}: Bearer token + refresh cookie on 401, then one retry.
 * Used by Command Center and other modules that pass `X-User-Id` (not only Bearer).
 */
export async function fetchWithUserId<T>(endpoint: string, userId: string, options?: RequestInit): Promise<T> {
  const { headers: optHeaders, ...restOpts } = options ?? {};
  const doFetch = (): Promise<Response> =>
    fetch(`${API_BASE}${endpoint}`, {
      ...restOpts,
      credentials: 'include',
      headers: { ...authHeaders(userId), ...(optHeaders as Record<string, string>) },
    });

  let response = await doFetch();
  assertNotHtmlApiResponse(response);

  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      response = await doFetch();
      assertNotHtmlApiResponse(response);
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const message = parseErrorBody(body, response.statusText);

    if (response.status === 401) {
      onUnauthorized?.();
      throw new Error(message);
    }
    if (isAuthError(response.status, message)) onUnauthorized?.();
    throw new Error(message || `API error: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
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
  const { headers: optHeaders, ...restOpts } = options ?? {};
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...restOpts,
    credentials: 'include',
    headers: { ...headers, ...(optHeaders as Record<string, string>) },
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
          ...restOpts,
          credentials: 'include',
          headers: { ...retryHeaders, ...(optHeaders as Record<string, string>) },
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
  const { headers: optHeaders, ...restOpts } = options ?? {};
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...restOpts,
    credentials: 'include',
    headers: { ...authHeaders(userId), ...(optHeaders as Record<string, string>) },
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

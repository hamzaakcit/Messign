/** @module authApi — Authentication endpoints (login, refresh, logout, sessions, password). */
import { API_BASE, fetchAPI } from './apiCore';

export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body as { success: true; data: { accessToken: string; expiresIn: number; user: unknown; mustChangePassword: boolean } };
    const rawErr = (body as { success?: boolean; error?: { code: string; message: string; remainingAttempts?: number; lockedUntil?: string } | string }).error;
    const err = typeof rawErr === 'object' && rawErr !== null && 'message' in rawErr ? rawErr : { code: 'UNKNOWN', message: typeof rawErr === 'string' ? rawErr : response.statusText ?? 'Sign in failed' };
    const message = err.message ?? response.statusText ?? 'Sign in failed';
    return { success: false, error: { ...err, message } };
  },
  refresh: () =>
    fetchAPI<{ success: boolean; data?: { accessToken: string; expiresIn: number } }>('/auth/refresh', {
      method: 'POST',
    }),
  logout: () =>
    fetchAPI<{ success: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
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

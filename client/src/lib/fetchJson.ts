import { getAccessToken } from './authToken';
import { API_ORIGIN, assertNotHtmlApiResponse } from './api';

export interface FetchJsonOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  userId?: string;
}

/**
 * Shared fetch wrapper for all domain API modules.
 * Handles auth headers, JSON serialization, error extraction, and HTML guard.
 */
export async function fetchJson<T>(
  path: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const { body, userId, ...init } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;

  const url = path.startsWith('http') ? path : `${API_ORIGIN}${path}`;

  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  assertNotHtmlApiResponse(res);

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    const message =
      (errBody as Record<string, unknown>).error ??
      (errBody as Record<string, unknown>).message ??
      `Request failed: ${res.status}`;
    throw new Error(String(message));
  }

  return res.json() as Promise<T>;
}

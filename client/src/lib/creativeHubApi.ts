import { API_ORIGIN } from './api';
import { getAccessToken } from './authToken';

const CREATIVE_BASE = `${API_ORIGIN}/api/creative`;

async function creativeRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${CREATIVE_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error || `Request failed: ${res.status}`);
  }
  return res.json();
}

/** Sprint 1: module health only — generation routes added in a later task */
export async function getCreativeModuleHealth(): Promise<{ module: string; status: string; sprint: number }> {
  return creativeRequest('/health');
}

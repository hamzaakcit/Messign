import { API_ORIGIN } from './apiCore';
import { getAccessToken } from './authToken';

const MA_BASE = `${API_ORIGIN}/api/marketing_automation`;

async function marketingAutomationRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${MA_BASE}${path}`, {
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

export async function getMarketingAutomationModuleHealth(): Promise<{ module: string; status: string; sprint: number }> {
  return marketingAutomationRequest('/health');
}

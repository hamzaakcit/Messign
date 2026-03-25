import { fetchAPI } from '../apiCore';
import type { Campaign } from './types';

export async function marketingRequest<T>(
  path: string,
  options: RequestInit = {},
  _userId?: string,
): Promise<T> {
  const extra: Record<string, string> = {};
  if (_userId) extra['X-User-Id'] = _userId;
  return fetchAPI<T>(`/marketing${path}`, {
    ...options,
    headers: { ...extra, ...(options.headers as Record<string, string>) },
  });
}

/** Handles `{ success, data: { campaign } }` from tool-style POST /campaigns and legacy raw campaign JSON. */
export function unwrapCreateCampaignResponse(body: unknown): Campaign {
  if (body && typeof body === 'object' && 'success' in body) {
    const r = body as { success: boolean; data?: { campaign?: Campaign }; error?: string };
    if (!r.success) throw new Error(r.error || 'Failed to create campaign');
    if (r.data?.campaign) return r.data.campaign;
  }
  return body as Campaign;
}

export const BATCH_TERMINAL_STATES = ['completed', 'failed', 'partial', 'cancelled'] as const;

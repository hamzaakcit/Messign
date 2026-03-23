import { API_ORIGIN } from './api';
import { getAccessToken } from './authToken';
import type { PaginatedResult } from './types';

const ASSETS_BASE = `${API_ORIGIN}/api/assets`;

async function assetsRequest<T>(path: string, options: RequestInit = {}, userId?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;
  const res = await fetch(`${ASSETS_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export type { PaginatedResult } from './types';

export interface Asset {
  id: string;
  category_id: string | null;
  name: string;
  asset_tag: string | null;
  serial_number: string | null;
  manufacturer: string | null;
  model: string | null;
  status: string;
  condition: string;
  purchase_cost: number | null;
  purchase_currency: string;
  current_value: number | null;
  assigned_to: string | null;
  assigned_to_name?: string | null;
  department: string | null;
  warranty_end: string | null;
  specifications: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  assignments?: Array<Record<string, unknown>>;
  maintenance?: Array<Record<string, unknown>>;
}

export interface License {
  id: string;
  software_name: string;
  vendor: string | null;
  license_type: string;
  seats_purchased: number;
  seats_used: number;
  total_monthly_cost: number | null;
  expiry_date: string | null;
  status: string;
  auto_renew: boolean;
  seats?: Array<Record<string, unknown>>;
}

export const assetsAPI = {
  listAssets: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return assetsRequest<PaginatedResult<Asset>>(`/assets?${params.toString()}`, {}, userId);
  },
  getAsset: (userId: string, assetId: string) =>
    assetsRequest<Asset>(`/assets/${assetId}`, {}, userId),
  createAsset: (userId: string, payload: Record<string, unknown>) =>
    assetsRequest<Asset>('/assets', { method: 'POST', body: JSON.stringify(payload) }, userId),
  updateAsset: (userId: string, assetId: string, payload: Record<string, unknown>) =>
    assetsRequest<Asset>(`/assets/${assetId}`, { method: 'PUT', body: JSON.stringify(payload) }, userId),
  assignAsset: (userId: string, assetId: string, assigneeId: string) =>
    assetsRequest<Asset>(`/assets/${assetId}/assign`, { method: 'POST', body: JSON.stringify({ assigneeId }) }, userId),
  returnAsset: (userId: string, assetId: string, condition: string, notes?: string) =>
    assetsRequest<Asset>(`/assets/${assetId}/return`, { method: 'POST', body: JSON.stringify({ condition, notes }) }, userId),
  retireAsset: (userId: string, assetId: string, reason: string) =>
    assetsRequest<Asset>(`/assets/${assetId}/retire`, { method: 'POST', body: JSON.stringify({ reason }) }, userId),
  scheduleMaintenance: (userId: string, assetId: string, payload: Record<string, unknown>) =>
    assetsRequest<Record<string, unknown>>(`/assets/${assetId}/maintenance`, { method: 'POST', body: JSON.stringify(payload) }, userId),
  getMetrics: (userId: string) =>
    assetsRequest<Record<string, number>>('/assets/metrics', {}, userId),

  listLicenses: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return assetsRequest<PaginatedResult<License>>(`/licenses?${params.toString()}`, {}, userId);
  },
  getLicense: (userId: string, licenseId: string) =>
    assetsRequest<License>(`/licenses/${licenseId}`, {}, userId),
  createLicense: (userId: string, payload: Record<string, unknown>) =>
    assetsRequest<License>('/licenses', { method: 'POST', body: JSON.stringify(payload) }, userId),
  updateLicense: (userId: string, licenseId: string, payload: Record<string, unknown>) =>
    assetsRequest<License>(`/licenses/${licenseId}`, { method: 'PUT', body: JSON.stringify(payload) }, userId),
  assignSeat: (userId: string, licenseId: string, targetUserId: string) =>
    assetsRequest<Record<string, unknown>>(`/licenses/${licenseId}/seats`, { method: 'POST', body: JSON.stringify({ userId: targetUserId }) }, userId),
  removeSeat: (userId: string, licenseId: string, targetUserId: string) =>
    assetsRequest<void>(`/licenses/${licenseId}/seats/${targetUserId}`, { method: 'DELETE' }, userId),
  getUtilization: (userId: string) =>
    assetsRequest<Array<Record<string, unknown>>>('/licenses/utilization', {}, userId),
  getUnderutilized: (userId: string) =>
    assetsRequest<License[]>('/licenses/underutilized', {}, userId),
  getExpiring: (userId: string, withinDays: number = 30) =>
    assetsRequest<License[]>(`/licenses/expiring?withinDays=${withinDays}`, {}, userId),

  listCategories: (userId: string) => assetsRequest<Array<Record<string, unknown>>>('/categories', {}, userId),
};

import { API_ORIGIN } from './apiCore';
import { getAccessToken } from './authToken';
import type { PaginatedResult } from './types';

const CONTRACTS_BASE = `${API_ORIGIN}/api/contracts`;

async function contractsRequest<T>(path: string, options: RequestInit = {}, userId?: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${CONTRACTS_BASE}${path}`, {
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

export interface Contract {
  id: string;
  title: string;
  type: string;
  status: string;
  counterparty_name: string;
  total_value: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  auto_renew: boolean;
  dora_extracted_terms: Record<string, unknown> | null;
  dora_extraction_confidence: number | null;
  signatories?: Array<Record<string, unknown>>;
  obligations?: Array<Record<string, unknown>>;
}

export const contractsAPI = {
  listContracts: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return contractsRequest<PaginatedResult<Contract>>(`/contracts?${params.toString()}`, {}, userId);
  },
  getContract: (userId: string, id: string) =>
    contractsRequest<Contract>(`/contracts/${id}`, {}, userId),
  createContract: (userId: string, payload: Record<string, unknown>) =>
    contractsRequest<Contract>('/contracts', { method: 'POST', body: JSON.stringify(payload) }, userId),
  updateContract: (userId: string, id: string, payload: Record<string, unknown>) =>
    contractsRequest<Contract>(`/contracts/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, userId),
  activateContract: (userId: string, id: string) =>
    contractsRequest<Contract>(`/contracts/${id}/activate`, { method: 'POST' }, userId),
  terminateContract: (userId: string, id: string, reason: string, effectiveDate: string) =>
    contractsRequest<Contract>(`/contracts/${id}/terminate`, { method: 'POST', body: JSON.stringify({ reason, effectiveDate }) }, userId),
  renewContract: (userId: string, id: string, newEndDate: string, newValue?: number) =>
    contractsRequest<Contract>(`/contracts/${id}/renew`, { method: 'POST', body: JSON.stringify({ newEndDate, newValue }) }, userId),
  extractTerms: (userId: string, id: string) =>
    contractsRequest<Contract>(`/contracts/${id}/extract-terms`, { method: 'POST' }, userId),
  uploadDocument: async (userId: string, id: string, file: File) => {
    const formData = new FormData();
    formData.append('document', file);
    return contractsRequest<Contract>(`/contracts/${id}/upload-document`, { method: 'POST', body: formData }, userId);
  },
  getExpiring: (userId: string, withinDays: number = 90) =>
    contractsRequest<Array<Record<string, unknown>>>(`/contracts/expiring?withinDays=${withinDays}`, {}, userId),
  getMetrics: (userId: string) =>
    contractsRequest<Record<string, number>>('/contracts/metrics', {}, userId),

  addSignatory: (userId: string, contractId: string, payload: Record<string, unknown>) =>
    contractsRequest<Record<string, unknown>>(`/signatories/${contractId}`, { method: 'POST', body: JSON.stringify(payload) }, userId),
  sign: (userId: string, signatoryId: string, signatureData: string) =>
    contractsRequest<Record<string, unknown>>(`/signatories/${signatoryId}/sign`, { method: 'POST', body: JSON.stringify({ signatureData }) }, userId),
  remind: (userId: string, signatoryId: string) =>
    contractsRequest<void>(`/signatories/${signatoryId}/remind`, { method: 'POST' }, userId),

  listObligations: (userId: string, query?: Record<string, string>) => {
    const params = new URLSearchParams(query || {});
    return contractsRequest<Array<Record<string, unknown>>>(`/obligations?${params.toString()}`, {}, userId);
  },
  listOverdueObligations: (userId: string) =>
    contractsRequest<Array<Record<string, unknown>>>('/obligations/overdue', {}, userId),
  createObligation: (userId: string, contractId: string, payload: Record<string, unknown>) =>
    contractsRequest<Record<string, unknown>>(`/obligations/${contractId}`, { method: 'POST', body: JSON.stringify(payload) }, userId),
  completeObligation: (userId: string, obligationId: string) =>
    contractsRequest<Record<string, unknown>>(`/obligations/complete/${obligationId}`, { method: 'POST' }, userId),
};

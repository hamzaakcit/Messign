/** @module reportsApi — Report generation, export, and history APIs. */
import { fetchWithUserId, API_BASE, authHeaders } from './api';

export interface ReportRequest {
  type: string;
  period?: { from: string; to: string };
  departmentId?: string;
  format: 'json' | 'csv' | 'pdf';
  filters?: Record<string, unknown>;
}

export interface ReportResult {
  type: string;
  title: string;
  description: string;
  generatedAt: string;
  period: { from: string; to: string };
  data: Record<string, unknown>;
  sections: Array<{ title: string; type: 'kpis' | 'table' | 'chart_data' | 'narrative'; data: unknown }>;
  aiSummary?: string;
}

export const reportsAPI = {
  getTypes: (userId: string) => fetchWithUserId<Array<{ type: string; description: string; permission: string }>>('/reports/types', userId),
  generate: (userId: string, body: ReportRequest) =>
    fetchWithUserId<ReportResult>('/reports/generate', userId, { method: 'POST', body: JSON.stringify(body) }),
  generateSimple: (userId: string, type: string, params?: { from?: string; to?: string; departmentId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.departmentId) qs.set('departmentId', params.departmentId);
    return fetchWithUserId<ReportResult>(`/reports/generate/${type}${qs.toString() ? `?${qs.toString()}` : ''}`, userId);
  },
  exportCsv: async (userId: string, body: ReportRequest): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/reports/export/csv`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(userId),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`CSV export failed: ${res.statusText}`);
    return res.blob();
  },
  exportPdf: async (userId: string, body: ReportRequest): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/reports/export/pdf`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(userId),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PDF export failed: ${res.statusText}`);
    return res.blob();
  },
  history: (userId: string) => fetchWithUserId<ReportResult[]>('/reports/history', userId),
};

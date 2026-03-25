import { getAccessToken } from './authToken';
import { API_BASE, authHeaders } from './apiCore';

async function fetchReimbursementAPI<T>(
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
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || response.statusText);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

async function fetchReimbursementFormData(
  endpoint: string,
  userId: string,
  formData: FormData
): Promise<unknown> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    });
  } catch (networkErr: any) {
    throw new Error(`Network error during upload: ${networkErr?.message || 'Connection failed'}`);
  }
  if (!response.ok) {
    let errorMsg = response.statusText || `HTTP ${response.status}`;
    try {
      const body = await response.text();
      const parsed = JSON.parse(body);
      if (parsed?.error) errorMsg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
    } catch {
      // Not JSON — ignore
    }
    throw new Error(errorMsg);
  }
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export const reimbursementAPI = {
  getCounts: (userId: string) =>
    fetchReimbursementAPI<{
    myPendingCount: number;
    myPendingTotal: number;
    underReviewCount?: number;
    approvedThisMonth?: number;
    totalReimbursedYtd?: number;
  }>('/reimbursements/counts', userId),
  list: (userId: string, status?: string) =>
    fetchReimbursementAPI<unknown[]>(`/reimbursements${status ? `?status=${encodeURIComponent(status)}` : ''}`, userId),
  listAllApproved: (userId: string) =>
    fetchReimbursementAPI<unknown[]>('/reimbursements/admin/all-approved', userId),
  getById: (userId: string, id: string) =>
    fetchReimbursementAPI<unknown>(`/reimbursements/${id}`, userId),
  create: (userId: string, data: unknown) =>
    fetchReimbursementAPI<unknown>('/reimbursements', userId, { method: 'POST', body: JSON.stringify(data) }),
  update: (userId: string, id: string, data: unknown) =>
    fetchReimbursementAPI<unknown>(`/reimbursements/${id}`, userId, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (userId: string, id: string) =>
    fetchReimbursementAPI<void>(`/reimbursements/${id}`, userId, { method: 'DELETE' }),
  submit: (userId: string, id: string) =>
    fetchReimbursementAPI<unknown>(`/reimbursements/${id}/submit`, userId, { method: 'POST' }),
  uploadDocument: (userId: string, reimbursementId: string, file: File, documentType?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (documentType) formData.append('document_type', documentType);
    return fetchReimbursementFormData(`/reimbursements/${reimbursementId}/documents`, userId, formData);
  },
  deleteDocument: (userId: string, reimbursementId: string, docId: string) =>
    fetchReimbursementAPI<void>(`/reimbursements/${reimbursementId}/documents/${docId}`, userId, { method: 'DELETE' }),
  triggerOCR: (userId: string, reimbursementId: string, docId: string) =>
    fetchReimbursementAPI<unknown>(`/reimbursements/${reimbursementId}/documents/${docId}/ocr`, userId, { method: 'POST' }),
  getComments: (userId: string, id: string) =>
    fetchReimbursementAPI<unknown[]>(`/reimbursements/${id}/comments`, userId),
  addComment: (userId: string, id: string, commentText: string, isInternal?: boolean) =>
    fetchReimbursementAPI<unknown>(`/reimbursements/${id}/comments`, userId, {
      method: 'POST',
      body: JSON.stringify({ comment_text: commentText, is_internal: isInternal }),
    }),
};

export const categoriesAPI = {
  list: (userId: string) => fetchReimbursementAPI<unknown[]>('/categories', userId),
  listAll: (userId: string) => fetchReimbursementAPI<unknown[]>('/categories?all=true', userId),
  create: (userId: string, data: { name: string; icon?: string; spending_limit?: number; requires_justification_above?: number }) =>
    fetchReimbursementAPI<unknown>('/categories', userId, { method: 'POST', body: JSON.stringify(data) }),
  update: (userId: string, id: string, data: { name?: string; icon?: string; spending_limit?: number; requires_justification_above?: number; is_active?: boolean }) =>
    fetchReimbursementAPI<unknown>(`/categories/${id}`, userId, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (userId: string, id: string) =>
    fetchReimbursementAPI<void>(`/categories/${id}`, userId, { method: 'DELETE' }),
};

export const reimbursementSettingsAPI = {
  get: (userId: string) => fetchReimbursementAPI<unknown>('/settings/reimbursement', userId),
  patch: (userId: string, data: unknown) =>
    fetchReimbursementAPI<unknown>('/settings/reimbursement', userId, { method: 'PATCH', body: JSON.stringify(data) }),
};

export interface Budget {
  id: string;
  organizationId: string;
  department: string;
  name?: string;
  description?: string;
  periodStart: string;
  periodEnd: string;
  allocatedAmount: number;
  currency: string;
  alertThreshold: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  spent: number;
  remaining: number;
  utilizationPct: number;
}

export const budgetsAPI = {
  list: (userId: string, params?: { department?: string; active?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.department) q.set('department', params.department);
    if (params?.active) q.set('active', 'true');
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchReimbursementAPI<Budget[]>(`/budgets${qs}`, userId);
  },
  getById: (userId: string, id: string) =>
    fetchReimbursementAPI<Budget>(`/budgets/${id}`, userId),
  getAlerts: (userId: string) =>
    fetchReimbursementAPI<Budget[]>('/budgets/alerts', userId),
  create: (userId: string, data: {
    department: string;
    periodStart: string;
    periodEnd: string;
    allocatedAmount: number;
    currency?: string;
    alertThreshold?: number;
    name?: string;
    description?: string;
  }) => fetchReimbursementAPI<Budget>('/budgets', userId, { method: 'POST', body: JSON.stringify(data) }),
  update: (userId: string, id: string, data: Partial<{
    department: string;
    periodStart: string;
    periodEnd: string;
    allocatedAmount: number;
    currency: string;
    alertThreshold: number;
  }>) => fetchReimbursementAPI<Budget>(`/budgets/${id}`, userId, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (userId: string, id: string) =>
    fetchReimbursementAPI<void>(`/budgets/${id}`, userId, { method: 'DELETE' }),
};

export const exchangeRatesAPI = {
  get: (userId: string, from: string, to: string, date?: string) => {
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return fetchReimbursementAPI<{ from: string; to: string; rate: number; date?: string }>(
      `/exchange-rates/${from}/${to}${q}`,
      userId
    );
  },
};

export const mileageAPI = {
  getRate: (userId: string) =>
    fetchReimbursementAPI<{ ratePerKm: number; currency: string }>('/mileage/rate', userId),
  calculate: (userId: string, data: { origin_address: string; destination_address: string; is_round_trip?: boolean }) =>
    fetchReimbursementAPI<unknown>('/mileage/calculate', userId, { method: 'POST', body: JSON.stringify(data) }),
};

export const approvalsAPI = {
  getCounts: (userId: string) =>
    fetchReimbursementAPI<{ pendingApprovalsCount: number }>('/approvals/counts', userId),
  list: (userId: string) => fetchReimbursementAPI<unknown[]>('/approvals', userId),
  approve: (userId: string, stepId: string, decisionNotes?: string) =>
    fetchReimbursementAPI<unknown>(`/approvals/${stepId}/approve`, userId, {
      method: 'POST',
      body: JSON.stringify({ decision_notes: decisionNotes }),
    }),
  reject: (userId: string, stepId: string, decisionNotes?: string) =>
    fetchReimbursementAPI<unknown>(`/approvals/${stepId}/reject`, userId, {
      method: 'POST',
      body: JSON.stringify({ decision_notes: decisionNotes }),
    }),
  bulk: (userId: string, stepIds: string[], action: 'approve' | 'reject') =>
    fetchReimbursementAPI<{ results: { stepId: string; success: boolean; error?: string }[] }>('/approvals/bulk', userId, {
      method: 'POST',
      body: JSON.stringify({ step_ids: stepIds, action }),
    }),
};

export const invoicesAPI = {
  list: (userId: string) =>
    fetchReimbursementAPI<unknown[]>('/invoices', userId),

  listAll: (userId: string) =>
    fetchReimbursementAPI<unknown[]>('/invoices?scope=all', userId),

  getById: (userId: string, invoiceId: string) =>
    fetchReimbursementAPI<unknown>(`/invoices/${invoiceId}`, userId),

  generate: (userId: string, employeeId: string, year: number, month: number) =>
    fetchReimbursementAPI<unknown>('/invoices/generate', userId, {
      method: 'POST',
      body: JSON.stringify({ employeeId, year, month }),
    }),

  generateAll: (userId: string, year: number, month: number) =>
    fetchReimbursementAPI<{ generated: number; invoices: unknown[] }>('/invoices/generate-all', userId, {
      method: 'POST',
      body: JSON.stringify({ year, month }),
    }),

  finalize: (userId: string, invoiceId: string) =>
    fetchReimbursementAPI<unknown>(`/invoices/${invoiceId}/finalize`, userId, {
      method: 'PUT',
    }),

  reopen: (userId: string, invoiceId: string) =>
    fetchReimbursementAPI<unknown>(`/invoices/${invoiceId}/reopen`, userId, {
      method: 'PUT',
    }),

  reject: (userId: string, invoiceId: string, rejectionNote?: string) =>
    fetchReimbursementAPI<unknown>(`/invoices/${invoiceId}/reject`, userId, {
      method: 'PUT',
      body: JSON.stringify({ rejectionNote }),
    }),

  resubmit: (userId: string, invoiceId: string) =>
    fetchReimbursementAPI<unknown>(`/invoices/${invoiceId}/resubmit`, userId, {
      method: 'PUT',
    }),

  generateMine: (userId: string, year: number, month: number) =>
    fetchReimbursementAPI<unknown>('/invoices/generate-mine', userId, {
      method: 'POST',
      body: JSON.stringify({ year, month }),
    }),

  sign: (userId: string, invoiceId: string) =>
    fetchReimbursementAPI<unknown>(`/invoices/${invoiceId}/sign`, userId, {
      method: 'PUT',
    }),

  downloadPdf: async (userId: string, invoiceId: string) => {
    const response = await fetch(`${API_BASE}/invoices/${invoiceId}/pdf`, {
      credentials: 'include',
      headers: authHeaders(userId),
    });
    if (!response.ok) throw new Error('PDF download failed');
    return response.blob();
  },
};

export const bankDetailsAPI = {
  get: (userId: string, targetUserId: string) =>
    fetchReimbursementAPI<unknown>(`/bank-details/${targetUserId}`, userId),

  update: (userId: string, targetUserId: string, data: {
    bankName?: string; iban?: string; swiftBic?: string; accountHolder?: string;
  }) =>
    fetchReimbursementAPI<unknown>(`/bank-details/${targetUserId}`, userId, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

export const signaturesAPI = {
  get: (userId: string, targetUserId: string) =>
    fetchReimbursementAPI<{ signature_data: string; created_at: string } | null>(`/signatures/${targetUserId}`, userId),

  save: (userId: string, targetUserId: string, signatureData: string) =>
    fetchReimbursementAPI<unknown>(`/signatures/${targetUserId}`, userId, {
      method: 'PUT',
      body: JSON.stringify({ signatureData }),
    }),
};

import { getAccessToken } from './authToken';
import { API_BASE, fetchWithUserId, fetchAdminAPI } from './apiCore';

export const knowledgeAPI = {
  documents: {
    list: (userId: string, params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return fetchWithUserId<unknown>(`/knowledge/documents${qs}`, userId);
    },
    getBySlug: (userId: string, slug: string) =>
      fetchWithUserId<unknown>(`/knowledge/documents/${slug}`, userId),
    create: (userId: string, formData: FormData) => {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (userId) headers['X-User-Id'] = userId;
      return fetch(`${API_BASE}/knowledge/documents`, {
        method: 'POST', credentials: 'include', headers, body: formData,
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || r.statusText); }
        return r.json();
      });
    },
    update: (userId: string, id: string, formData: FormData) => {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (userId) headers['X-User-Id'] = userId;
      return fetch(`${API_BASE}/knowledge/documents/${id}`, {
        method: 'PUT', credentials: 'include', headers, body: formData,
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || r.statusText); }
        return r.json();
      });
    },
    delete: (userId: string, id: string) =>
      fetchWithUserId<unknown>(`/knowledge/documents/${id}`, userId, { method: 'DELETE' }),
    download: (userId: string, id: string) =>
      fetchWithUserId<{ fileUrl: string; downloadCount: number }>(`/knowledge/documents/${id}/download`, userId, { method: 'POST' }),
    acknowledge: (userId: string, id: string) =>
      fetchWithUserId<{ success: boolean }>(`/knowledge/documents/${id}/acknowledge`, userId, { method: 'POST' }),
    flag: (userId: string, id: string, reason: string) =>
      fetchWithUserId<unknown>(`/knowledge/documents/${id}/flag`, userId, { method: 'POST', body: JSON.stringify({ reason }) }),
    pin: (userId: string, id: string) =>
      fetchWithUserId<{ pinned: boolean }>(`/knowledge/documents/${id}/pin`, userId, { method: 'POST' }),
    versions: (userId: string, id: string) =>
      fetchWithUserId<unknown[]>(`/knowledge/documents/${id}/versions`, userId),
  },
  categories: {
    list: (userId: string) => fetchWithUserId<unknown[]>('/knowledge/categories', userId),
    create: (userId: string, data: { name: string; icon?: string; color?: string; sortOrder?: number }) =>
      fetchWithUserId<unknown>('/knowledge/categories', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: Record<string, unknown>) =>
      fetchWithUserId<unknown>(`/knowledge/categories/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchWithUserId<void>(`/knowledge/categories/${id}`, userId, { method: 'DELETE' }),
  },
  tags: {
    list: (userId: string) => fetchWithUserId<unknown[]>('/knowledge/tags', userId),
    create: (userId: string, name: string) =>
      fetchWithUserId<unknown>('/knowledge/tags', userId, { method: 'POST', body: JSON.stringify({ name }) }),
  },
  collections: {
    list: (userId: string) => fetchWithUserId<unknown[]>('/knowledge/collections', userId),
    getById: (userId: string, id: string) => fetchWithUserId<unknown>(`/knowledge/collections/${id}`, userId),
    create: (userId: string, data: Record<string, unknown>) =>
      fetchWithUserId<unknown>('/knowledge/collections', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: Record<string, unknown>) =>
      fetchWithUserId<unknown>(`/knowledge/collections/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchWithUserId<void>(`/knowledge/collections/${id}`, userId, { method: 'DELETE' }),
    getByShareToken: (shareToken: string) =>
      fetch(`${API_BASE}/knowledge/collections/share/${shareToken}`).then(r => r.json()),
  },
  search: (userId: string, params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return fetchWithUserId<unknown>(`/knowledge/search?${qs}`, userId);
  },
  stats: (userId: string) => fetchWithUserId<unknown>('/knowledge/stats', userId),
  activities: (userId: string, limit = 20) =>
    fetchWithUserId<unknown[]>(`/knowledge/activities?limit=${limit}`, userId),
  myPins: (userId: string) => fetchWithUserId<unknown[]>('/knowledge/my-pins', userId),
  requiredReading: (userId: string, role?: string) =>
    fetchWithUserId<unknown[]>(`/knowledge/required-reading${role ? `?role=${role}` : ''}`, userId),
};

export const adminKnowledgeAPI = {
  stats: (userId: string) => fetchAdminAPI<unknown>('/admin/knowledge/stats', userId),
  documents: {
    list: (userId: string, params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return fetchAdminAPI<unknown>(`/admin/knowledge/documents${qs}`, userId);
    },
    getById: (userId: string, id: string) => fetchAdminAPI<unknown>(`/admin/knowledge/documents/${id}`, userId),
    create: (userId: string, formData: FormData) => {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (userId) headers['X-User-Id'] = userId;
      return fetch(`${API_BASE}/admin/knowledge/documents`, {
        method: 'POST', credentials: 'include', headers, body: formData,
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || r.statusText); }
        return r.json();
      });
    },
    update: (userId: string, id: string, formData: FormData) => {
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (userId) headers['X-User-Id'] = userId;
      return fetch(`${API_BASE}/admin/knowledge/documents/${id}`, {
        method: 'PUT', credentials: 'include', headers, body: formData,
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || r.statusText); }
        return r.json();
      });
    },
    delete: (userId: string, id: string, permanent = false) =>
      fetchAdminAPI<void>(`/admin/knowledge/documents/${id}${permanent ? '?permanent=true' : ''}`, userId, { method: 'DELETE' }),
    restore: (userId: string, id: string) =>
      fetchAdminAPI<unknown>(`/admin/knowledge/documents/${id}/restore`, userId, { method: 'POST' }),
  },
  categories: {
    list: (userId: string) => fetchAdminAPI<unknown[]>('/admin/knowledge/categories', userId),
    create: (userId: string, data: Record<string, unknown>) =>
      fetchAdminAPI<unknown>('/admin/knowledge/categories', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: Record<string, unknown>) =>
      fetchAdminAPI<unknown>(`/admin/knowledge/categories/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchAdminAPI<void>(`/admin/knowledge/categories/${id}`, userId, { method: 'DELETE' }),
  },
  tags: {
    list: (userId: string) => fetchAdminAPI<unknown[]>('/admin/knowledge/tags', userId),
    create: (userId: string, name: string) =>
      fetchAdminAPI<unknown>('/admin/knowledge/tags', userId, { method: 'POST', body: JSON.stringify({ name }) }),
  },
  collections: {
    list: (userId: string) => fetchAdminAPI<unknown[]>('/admin/knowledge/collections', userId),
    create: (userId: string, data: Record<string, unknown>) =>
      fetchAdminAPI<unknown>('/admin/knowledge/collections', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: Record<string, unknown>) =>
      fetchAdminAPI<unknown>(`/admin/knowledge/collections/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchAdminAPI<void>(`/admin/knowledge/collections/${id}`, userId, { method: 'DELETE' }),
  },
  flags: {
    list: (userId: string, status?: string) =>
      fetchAdminAPI<unknown[]>(`/admin/knowledge/flags${status ? `?status=${status}` : ''}`, userId),
    count: (userId: string) => fetchAdminAPI<{ count: number }>('/admin/knowledge/flags/count', userId),
    resolve: (userId: string, id: string, status: string, note?: string) =>
      fetchAdminAPI<unknown>(`/admin/knowledge/flags/${id}`, userId, { method: 'PUT', body: JSON.stringify({ status, note }) }),
  },
  compliance: {
    get: (userId: string) => fetchAdminAPI<unknown>('/admin/knowledge/compliance', userId),
    acknowledgements: (userId: string, documentId: string) =>
      fetchAdminAPI<unknown[]>(`/admin/knowledge/compliance/${documentId}/acknowledgements`, userId),
  },
};

/** @module adminApi — Admin-panel CRUD: employees, projects, roles, departments, badges, performance, audit. */
import { fetchAdminAPI, API_BASE, authHeaders } from './api';
import type { ProjectApplicationWithUser } from './projectsApi';

export const adminAPI = {
  auth: {
    getPolicy: (userId: string) => fetchAdminAPI<{ success: boolean; data: unknown }>('/admin/auth/policy', userId),
    updatePolicy: (userId: string, data: unknown) =>
      fetchAdminAPI<{ success: boolean; data: unknown }>('/admin/auth/policy', userId, { method: 'PUT', body: JSON.stringify(data) }),
    getEmployees: (userId: string) => fetchAdminAPI<{ success: boolean; data: unknown[] }>('/admin/auth/employees', userId),
    getEmployee: (userId: string, oddrooId: string) =>
      fetchAdminAPI<{ success: boolean; data: { auth: unknown; user: unknown } }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}`, userId),
    setPassword: (userId: string, oddrooId: string, body: { newPassword: string; forceChangeOnLogin?: boolean }) =>
      fetchAdminAPI<{ success: boolean }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/password`, userId, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    resetPassword: (userId: string, oddrooId: string) =>
      fetchAdminAPI<{ success: boolean }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/reset`, userId, { method: 'POST' }),
    viewPassword: (userId: string, oddrooId: string) =>
      fetchAdminAPI<{ success: boolean; data: { temporaryPassword: string | null; message: string } }>(
        `/admin/auth/employees/${encodeURIComponent(oddrooId)}/password`,
        userId
      ),
    updateStatus: (userId: string, oddrooId: string, status: string) =>
      fetchAdminAPI<{ success: boolean }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/status`, userId, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    unlock: (userId: string, oddrooId: string) =>
      fetchAdminAPI<{ success: boolean }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/unlock`, userId, { method: 'POST' }),
    updateForceChange: (userId: string, oddrooId: string, forceChange: boolean) =>
      fetchAdminAPI<{ success: boolean }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/force-change`, userId, {
        method: 'PUT',
        body: JSON.stringify({ forceChange }),
      }),
    getSessions: (userId: string, oddrooId: string) =>
      fetchAdminAPI<{ success: boolean; data: unknown[] }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/sessions`, userId),
    revokeSessions: (userId: string, oddrooId: string) =>
      fetchAdminAPI<{ success: boolean }>(`/admin/auth/employees/${encodeURIComponent(oddrooId)}/sessions`, userId, { method: 'DELETE' }),
    getEmployeeAudit: (userId: string, oddrooId: string, params?: { limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.offset != null) q.set('offset', String(params.offset));
      const query = q.toString();
      return fetchAdminAPI<{ success: boolean; data: unknown[] }>(
        `/admin/auth/employees/${encodeURIComponent(oddrooId)}/audit${query ? `?${query}` : ''}`,
        userId
      );
    },
    getAudit: (userId: string, params?: { limit?: number; offset?: number; action?: string; targetAuthUserId?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.offset != null) q.set('offset', String(params.offset));
      if (params?.action) q.set('action', params.action);
      if (params?.targetAuthUserId) q.set('targetAuthUserId', params.targetAuthUserId);
      const query = q.toString();
      return fetchAdminAPI<{ success: boolean; data: unknown[] }>(`/admin/auth/audit${query ? `?${query}` : ''}`, userId);
    },
    bulkReset: (userId: string, oddrooIds: string[]) =>
      fetchAdminAPI<{ success: boolean; data: { oddrooId: string; success: boolean; error?: string }[] }>('/admin/auth/bulk/reset', userId, {
        method: 'POST',
        body: JSON.stringify({ oddrooIds }),
      }),
    bulkForceChange: (userId: string, oddrooIds: string[], forceChange: boolean) =>
      fetchAdminAPI<{ success: boolean; data: { oddrooId: string; success: boolean; error?: string }[] }>('/admin/auth/bulk/force-change', userId, {
        method: 'POST',
        body: JSON.stringify({ oddrooIds, forceChange }),
      }),
  },
  employees: {
    getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/employees', userId),
    getById: (userId: string, id: string) => fetchAdminAPI<unknown>(`/admin/employees/${id}`, userId),
    create: (userId: string, data: unknown) =>
      fetchAdminAPI('/admin/employees', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: unknown) =>
      fetchAdminAPI(`/admin/employees/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchAdminAPI(`/admin/employees/${id}`, userId, { method: 'DELETE' }),
  },
  projects: {
    getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/projects', userId),
    getPending: (userId: string) => fetchAdminAPI<unknown[]>('/admin/projects/pending', userId),
    getById: (userId: string, projectId: string) =>
      fetchAdminAPI<unknown>(`/admin/projects/${encodeURIComponent(projectId)}`, userId),
    update: (userId: string, projectId: string, data: unknown) =>
      fetchAdminAPI<unknown>(`/admin/projects/${encodeURIComponent(projectId)}`, userId, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (userId: string, projectId: string) =>
      fetchAdminAPI(`/admin/projects/${encodeURIComponent(projectId)}`, userId, { method: 'DELETE' }),
    getApplications: (userId: string, projectId: string) =>
      fetchAdminAPI<{ applications: ProjectApplicationWithUser[] }>(`/admin/projects/${encodeURIComponent(projectId)}/applications`, userId),
    approve: (userId: string, projectId: string, body?: { xp_reward?: number; is_featured?: boolean }) =>
      fetchAdminAPI<unknown>(`/admin/projects/${encodeURIComponent(projectId)}/approve`, userId, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    reject: (userId: string, projectId: string, reason: string) =>
      fetchAdminAPI<unknown>(`/admin/projects/${encodeURIComponent(projectId)}/reject`, userId, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    acceptApplication: (userId: string, projectId: string, applicationId: string) =>
      fetchAdminAPI<{ message: string }>(`/admin/projects/${encodeURIComponent(projectId)}/applications/${encodeURIComponent(applicationId)}/accept`, userId, {
        method: 'POST',
      }),
    rejectApplication: (userId: string, projectId: string, applicationId: string, note?: string) =>
      fetchAdminAPI<{ message: string }>(`/admin/projects/${encodeURIComponent(projectId)}/applications/${encodeURIComponent(applicationId)}/reject`, userId, {
        method: 'POST',
        body: JSON.stringify({ note: note ?? undefined }),
      }),
    complete: (userId: string, projectId: string) =>
      fetchAdminAPI<{ message: string; memberCount: number; xpReward: number }>(`/admin/projects/${encodeURIComponent(projectId)}/complete`, userId, {
        method: 'POST',
      }),
    create: (userId: string, data: unknown) =>
      fetchAdminAPI('/admin/projects', userId, { method: 'POST', body: JSON.stringify(data) }),
  },
  analytics: {
    getTalentHeatmap: (userId: string) =>
      fetchAdminAPI<{ departments: unknown[]; summary: unknown }>('/admin/analytics/talent-heatmap', userId),
  },
  departments: {
    getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/departments', userId),
    getById: (userId: string, id: string) => fetchAdminAPI<unknown>(`/admin/departments/${id}`, userId),
    create: (userId: string, data: unknown) =>
      fetchAdminAPI('/admin/departments', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: unknown) =>
      fetchAdminAPI(`/admin/departments/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchAdminAPI(`/admin/departments/${id}`, userId, { method: 'DELETE' }),
  },
  roles: {
    getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/roles', userId),
    getById: (userId: string, id: string) => fetchAdminAPI<unknown>(`/admin/roles/${id}`, userId),
    create: (userId: string, data: unknown) =>
      fetchAdminAPI('/admin/roles', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: unknown) =>
      fetchAdminAPI(`/admin/roles/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
  },
  auditLogs: {
    get: (userId: string, params?: { adminId?: string; action?: string; entityType?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params?.adminId) q.set('adminId', params.adminId);
      if (params?.action) q.set('action', params.action);
      if (params?.entityType) q.set('entityType', params.entityType);
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.offset != null) q.set('offset', String(params.offset));
      const query = q.toString();
      return fetchAdminAPI<unknown[]>(`/admin/audit-logs${query ? `?${query}` : ''}`, userId);
    },
  },
  settings: {
    get: (userId: string) => fetchAdminAPI<unknown>('/admin/settings', userId),
    update: (userId: string, data: unknown) =>
      fetchAdminAPI('/admin/settings', userId, { method: 'PUT', body: JSON.stringify(data) }),
  },
  import: {
    run: (userId: string, data: { rows: unknown[] }) =>
      fetchAdminAPI<unknown>('/admin/import', userId, { method: 'POST', body: JSON.stringify(data) }),
  },
  export: {
    get: (userId: string, format?: 'json' | 'csv') =>
      fetchAdminAPI<unknown>(`/admin/export${format ? `?format=${format}` : ''}`, userId),
    getBlob: async (userId: string, format: 'csv'): Promise<Blob> => {
      const response = await fetch(`${API_BASE}/admin/export?format=${format}`, {
        credentials: 'include',
        headers: authHeaders(userId),
      });
      if (!response.ok) throw new Error(`Export failed: ${response.statusText}`);
      return response.blob();
    },
  },
  messages: {
    send: (userId: string, data: { recipientId: string; subject: string; content: string; type?: string }) =>
      fetchAdminAPI<unknown>('/admin/messages/send', userId, { method: 'POST', body: JSON.stringify(data) }),
  },
  badges: {
    getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/badges', userId),
    getById: (userId: string, id: string) => fetchAdminAPI<unknown>(`/admin/badges/${id}`, userId),
    create: (userId: string, data: unknown) =>
      fetchAdminAPI('/admin/badges', userId, { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, id: string, data: unknown) =>
      fetchAdminAPI(`/admin/badges/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (userId: string, id: string) =>
      fetchAdminAPI(`/admin/badges/${id}`, userId, { method: 'DELETE' }),
    award: (userId: string, badgeId: string, userIds: string[]) =>
      fetchAdminAPI(`/admin/badges/${badgeId}/award`, userId, {
        method: 'POST',
        body: JSON.stringify({ userIds }),
      }),
  },
  performance: {
    teams: {
      getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/performance/teams', userId),
      getById: (userId: string, id: string) => fetchAdminAPI<unknown>(`/admin/performance/teams/${id}`, userId),
      create: (userId: string, data: unknown) =>
        fetchAdminAPI('/admin/performance/teams', userId, { method: 'POST', body: JSON.stringify(data) }),
      update: (userId: string, id: string, data: unknown) =>
        fetchAdminAPI(`/admin/performance/teams/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (userId: string, id: string) =>
        fetchAdminAPI(`/admin/performance/teams/${id}`, userId, { method: 'DELETE' }),
    },
    teamMembers: (teamId: string) => ({
      get: (userId: string) => fetchAdminAPI<unknown[]>(`/admin/performance/teams/${teamId}/members`, userId),
      add: (userId: string, data: unknown) =>
        fetchAdminAPI(`/admin/performance/teams/${teamId}/members`, userId, { method: 'POST', body: JSON.stringify(data) }),
      update: (userId: string, memberId: string, data: unknown) =>
        fetchAdminAPI(`/admin/performance/teams/${teamId}/members/${memberId}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
      remove: (userId: string, memberId: string) =>
        fetchAdminAPI(`/admin/performance/teams/${teamId}/members/${memberId}`, userId, { method: 'DELETE' }),
    }),
    targets: {
      getAll: (userId: string) => fetchAdminAPI<unknown[]>('/admin/performance/targets', userId),
      create: (userId: string, data: unknown) =>
        fetchAdminAPI('/admin/performance/targets', userId, { method: 'POST', body: JSON.stringify(data) }),
      update: (userId: string, id: string, data: unknown) =>
        fetchAdminAPI(`/admin/performance/targets/${id}`, userId, { method: 'PUT', body: JSON.stringify(data) }),
    },
    metrics: {
      get: (userId: string) => fetchAdminAPI<unknown>('/admin/performance/metrics', userId),
      update: (userId: string, data: unknown) =>
        fetchAdminAPI('/admin/performance/metrics', userId, { method: 'PUT', body: JSON.stringify(data) }),
    },
    alerts: {
      get: (userId: string) => fetchAdminAPI<unknown>('/admin/performance/alerts', userId),
      update: (userId: string, data: unknown) =>
        fetchAdminAPI('/admin/performance/alerts', userId, { method: 'PUT', body: JSON.stringify(data) }),
    },
    export: (userId: string, params?: { team?: string; format?: string }) => {
      const q = new URLSearchParams();
      if (params?.team) q.set('team', params.team);
      if (params?.format) q.set('format', params.format);
      const query = q.toString();
      return fetchAdminAPI<unknown>(`/admin/performance/export${query ? `?${query}` : ''}`, userId);
    },
    audit: (userId: string, params?: { entityType?: string; entityId?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params?.entityType) q.set('entityType', params.entityType);
      if (params?.entityId) q.set('entityId', params.entityId);
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.offset != null) q.set('offset', String(params.offset));
      const query = q.toString();
      return fetchAdminAPI<unknown[]>(`/admin/performance/audit${query ? `?${query}` : ''}`, userId);
    },
  },
};

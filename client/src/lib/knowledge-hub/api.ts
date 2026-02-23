import type { KhDocument, KhCategory, KhTag, KhVersion, KhComment, KhCollection, KhNotification, KhContentFlag, KhSearchResult, KhAnalyticsStats, KhContentHealth, KhTeam, KhReviewAction } from '@/types/knowledge-hub';
import { getAccessToken } from '@/lib/authToken';

const API = '/api/knowledge-hub';

function getHeaders(): Record<string, string> {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = { ...getHeaders(), ...(options?.headers as Record<string, string> ?? {}) };
  if (options?.body instanceof FormData) delete headers['Content-Type'];
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Documents
export const khDocumentsAPI = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<KhSearchResult>(`/documents${qs}`);
  },
  getById: (id: string) => request<KhDocument>(`/documents/${id}`),
  getBySlug: (slug: string) => request<KhDocument>(`/documents/by-slug/${slug}`),
  create: (data: Record<string, unknown>) => request<KhDocument>('/documents', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) => request<KhDocument>(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
  backlinks: (id: string) => request<{ id: string; title: string; slug: string }[]>(`/documents/${id}/backlinks`),
  related: (id: string) => request<KhDocument[]>(`/documents/${id}/related`),
};

// Categories
export const khCategoriesAPI = {
  list: (tree = false) => request<KhCategory[]>(`/categories${tree ? '?tree=true' : ''}`),
  getById: (id: string) => request<KhCategory>(`/categories/${id}`),
  create: (data: Record<string, unknown>) => request<KhCategory>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) => request<KhCategory>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/categories/${id}`, { method: 'DELETE' }),
  documents: (id: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<KhSearchResult>(`/categories/${id}/documents${qs}`);
  },
};

// Tags
export const khTagsAPI = {
  list: () => request<KhTag[]>('/tags'),
  create: (data: { name: string; color?: string }) => request<KhTag>('/tags', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
};

// Search
export const khSearchAPI = {
  search: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<KhSearchResult>(`/search?${qs}`);
  },
  suggestions: (q: string) => request<{ id: string; title: string; slug: string }[]>(`/search/suggestions?q=${encodeURIComponent(q)}`),
  aiAnswer: (query: string): EventSource => {
    const headers = getHeaders();
    const es = new EventSource(`${API}/search/ai-answer?q=${encodeURIComponent(query)}&token=${encodeURIComponent(headers['Authorization']?.replace('Bearer ', '') ?? '')}`);
    return es;
  },
};

// Comments
export const khCommentsAPI = {
  list: (documentId: string) => request<KhComment[]>(`/comments/${documentId}`),
  create: (data: { documentId: string; content: string; selectionFrom?: number; selectionTo?: number; selectedText?: string; parentId?: string }) =>
    request<KhComment>('/comments', { method: 'POST', body: JSON.stringify(data) }),
  resolve: (id: string) => request<void>(`/comments/${id}/resolve`, { method: 'POST' }),
  delete: (id: string) => request<void>(`/comments/${id}`, { method: 'DELETE' }),
};

// Versions
export const khVersionsAPI = {
  list: (documentId: string) => request<KhVersion[]>(`/versions/${documentId}`),
  get: (documentId: string, versionNumber: number) => request<KhVersion>(`/versions/${documentId}/${versionNumber}`),
  restore: (documentId: string, versionNumber: number) => request<KhDocument>(`/versions/${documentId}/${versionNumber}/restore`, { method: 'POST' }),
};

// Workflow
export const khWorkflowAPI = {
  submitReview: (id: string) => request<KhDocument>(`/workflow/${id}/submit-review`, { method: 'POST' }),
  approve: (id: string, comment?: string) => request<KhDocument>(`/workflow/${id}/approve`, { method: 'POST', body: JSON.stringify({ comment }) }),
  reject: (id: string, comment: string) => request<KhDocument>(`/workflow/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) }),
  requestChanges: (id: string, comment: string) => request<KhDocument>(`/workflow/${id}/request-changes`, { method: 'POST', body: JSON.stringify({ comment }) }),
  archive: (id: string) => request<KhDocument>(`/workflow/${id}/archive`, { method: 'POST' }),
  restore: (id: string) => request<KhDocument>(`/workflow/${id}/restore`, { method: 'POST' }),
  reviewActions: (id: string) => request<KhReviewAction[]>(`/workflow/${id}/actions`),
  pendingReviews: () => request<KhDocument[]>('/workflow/pending'),
};

// Bookmarks
export const khBookmarksAPI = {
  list: () => request<KhDocument[]>('/bookmarks'),
  toggle: (documentId: string) => request<{ bookmarked: boolean }>(`/bookmarks/${documentId}`, { method: 'POST' }),
};

// Collections
export const khCollectionsAPI = {
  list: () => request<KhCollection[]>('/collections'),
  create: (data: { name: string; description?: string; isShared?: boolean }) => request<KhCollection>('/collections', { method: 'POST', body: JSON.stringify(data) }),
  addDocument: (collectionId: string, documentId: string) => request<void>(`/collections/${collectionId}/documents`, { method: 'POST', body: JSON.stringify({ documentId }) }),
  removeDocument: (collectionId: string, documentId: string) => request<void>(`/collections/${collectionId}/documents/${documentId}`, { method: 'DELETE' }),
  delete: (id: string) => request<void>(`/collections/${id}`, { method: 'DELETE' }),
};

// Notifications
export const khNotificationsAPI = {
  list: (unreadOnly = false) => request<KhNotification[]>(`/notifications${unreadOnly ? '?unread=true' : ''}`),
  markRead: (id: string) => request<void>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request<void>('/notifications/read-all', { method: 'POST' }),
};

// Content Flags
export const khFlagsAPI = {
  create: (data: { documentId: string; reason: string; description?: string }) => request<KhContentFlag>('/flags', { method: 'POST', body: JSON.stringify(data) }),
  list: (resolved?: boolean) => request<KhContentFlag[]>(`/flags${resolved !== undefined ? `?resolved=${resolved}` : ''}`),
  resolve: (id: string) => request<void>(`/flags/${id}/resolve`, { method: 'POST' }),
};

// Analytics
export const khAnalyticsAPI = {
  stats: () => request<KhAnalyticsStats>('/analytics/stats'),
  contentHealth: () => request<KhContentHealth[]>('/analytics/content-health'),
  topSearches: (days?: number) => request<{ query: string; count: number; avg_results: number }[]>(`/analytics/top-searches${days ? `?days=${days}` : ''}`),
  failedSearches: (days?: number) => request<{ query: string; count: number }[]>(`/analytics/failed-searches${days ? `?days=${days}` : ''}`),
  topContributors: (days?: number) => request<{ author_id: string; name: string; doc_count: number }[]>(`/analytics/top-contributors${days ? `?days=${days}` : ''}`),
  viewTrends: (days?: number) => request<{ date: string; views: number }[]>(`/analytics/view-trends${days ? `?days=${days}` : ''}`),
};

// Upload
async function uploadWithAuth(endpoint: string, formData: FormData): Promise<Response> {
  const headers = getHeaders();
  delete headers['Content-Type'];
  return fetch(`${API}${endpoint}`, { method: 'POST', headers, body: formData });
}

export const khUploadAPI = {
  uploadImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const r = await uploadWithAuth('/upload/image', formData);
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || r.statusText);
    }
    return r.json();
  },
  uploadCover: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const r = await uploadWithAuth('/upload/cover', formData);
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || r.statusText);
    }
    return r.json();
  },
  uploadFile: async (file: File, documentId?: string): Promise<{ id: string; url: string; fileName: string; fileSize?: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (documentId) formData.append('documentId', documentId);
    const r = await uploadWithAuth('/upload/file', formData);
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || r.statusText);
    }
    return r.json();
  },
};

// Teams
export const khTeamsAPI = {
  list: () => request<KhTeam[]>('/teams'),
  create: (data: { name: string; description?: string; color?: string }) => request<KhTeam>('/teams', { method: 'POST', body: JSON.stringify(data) }),
  addMember: (teamId: string, userId: string) => request<void>(`/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify({ userId }) }),
  removeMember: (teamId: string, userId: string) => request<void>(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),
  delete: (id: string) => request<void>(`/teams/${id}`, { method: 'DELETE' }),
};

// AI Feedback
export const khAIFeedbackAPI = {
  submit: (data: { query: string; answer: string; sourceDocumentIds: string[]; isHelpful: boolean; telemetryId?: string; comment?: string }) =>
    request<void>('/ai/feedback', { method: 'POST', body: JSON.stringify(data) }),
};

// Presentation (AI-generated slides + PPTX export)
export interface PresentationSlide {
  title: string;
  bullets: string[];
}
export interface Presentation {
  title: string;
  slides: PresentationSlide[];
}

export const khPresentationAPI = {
  create: (topic: string, slideCount?: number) =>
    request<Presentation>('/ai/presentation', {
      method: 'POST',
      body: JSON.stringify({ topic: topic.trim(), slideCount }),
    }),
  exportPptx: async (payload: Presentation): Promise<Blob> => {
    const headers = getHeaders();
    const res = await fetch(`${API}/ai/presentation/export`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || res.statusText);
    }
    return res.blob();
  },
};

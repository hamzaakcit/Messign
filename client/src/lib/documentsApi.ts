/** @module documentsApi — Legacy document CRUD (pinning, search). */
import { fetchAPI } from './api';

export const documentsAPI = {
  getAll: () => fetchAPI('/documents'),
  getPinned: () => fetchAPI('/documents/pinned'),
  search: (query: string) => fetchAPI(`/documents/search?q=${encodeURIComponent(query)}`),
  getById: (id: string) => fetchAPI(`/documents/${id}`),
  create: (data: Record<string, unknown>) =>
    fetchAPI('/documents', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Record<string, unknown>) =>
    fetchAPI(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  togglePin: (id: string) =>
    fetchAPI(`/documents/${id}/pin`, { method: 'PATCH' }),
};

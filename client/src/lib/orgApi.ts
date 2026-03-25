/** @module orgApi — Organization-level resources: departments and user directory. */
import { fetchAPI } from './apiCore';

export const departmentsAPI = {
  getAll: () => fetchAPI<{ id: string; name: string }[]>('/departments'),
};

export const usersAPI = {
  getAll: () => fetchAPI('/users'),
  getMe: () => fetchAPI('/users/me'),
  getById: (id: string) => fetchAPI(`/users/${id}`),
  updateStatus: (id: string, status: string) => 
    fetchAPI(`/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

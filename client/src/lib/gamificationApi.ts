import { fetchAPI } from './api';

export const badgesAPI = {
  getAll: () => fetchAPI('/badges'),
  getById: (id: string) => fetchAPI(`/badges/${id}`),
  getForUser: (userId: string) => fetchAPI(`/badges/user/${userId}`),
};

export const activitiesAPI = {
  getRecent: (limit = 20) => fetchAPI(`/activities?limit=${limit}`),
};

export const leaderboardAPI = {
  get: (limit = 10) => fetchAPI(`/leaderboard?limit=${limit}`),
  getMyRank: () => fetchAPI('/leaderboard/me'),
};

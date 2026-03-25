/** @module cultureApi — Heart/culture, wellness, and team health APIs. */
import { fetchWithUserId } from './apiCore';

export const heartAPI = {
  getMyWellness: (userId: string) => fetchWithUserId<{ sentimentTrend: string; burnoutRisk: string; hoursThisWeek: number; daysSincePTO: number; suggestions: string[] }>('/heart/me/wellness', userId),
  getMySentiment: (userId: string, days?: number) =>
    fetchWithUserId<{ history: Array<{ date: string; score: number; source: string }> }>(`/heart/me/sentiment${days ? `?days=${days}` : ''}`, userId),
  getTeam: (userId: string, scopeType?: string, scopeId?: string) => {
    const qs = new URLSearchParams();
    if (scopeType) qs.set('scopeType', scopeType);
    if (scopeId) qs.set('scopeId', scopeId);
    return fetchWithUserId<Record<string, unknown>>(`/heart/team${qs.toString() ? `?${qs.toString()}` : ''}`, userId);
  },
  getTeamHistory: (userId: string, scopeType?: string, scopeId?: string, periods?: number) => {
    const qs = new URLSearchParams();
    if (scopeType) qs.set('scopeType', scopeType);
    if (scopeId) qs.set('scopeId', scopeId);
    if (periods) qs.set('periods', String(periods));
    return fetchWithUserId<{ history: Array<Record<string, unknown>> }>(`/heart/team/history${qs.toString() ? `?${qs.toString()}` : ''}`, userId);
  },
  getDepartments: (userId: string) => fetchWithUserId<{ departments: Array<Record<string, unknown>> }>('/heart/departments', userId),
  getActiveSurvey: (userId: string) => fetchWithUserId<{ id?: string; title?: string; questions?: unknown[]; responseCount?: number } | Record<string, never>>('/heart/pulse/active', userId),
  getSurveyResults: (userId: string, surveyId: string) => fetchWithUserId<{ surveyId?: string; questionCount?: number; responseCount?: number; aggregates?: Record<string, { avg: number; min: number; max: number }> } | Record<string, never>>(`/heart/pulse/surveys/${surveyId}/results`, userId),
};

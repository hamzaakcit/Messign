import { marketingRequest } from './helpers';
import type {
  PaginatedResult,
  Lead,
  LeadFunnelMetrics,
  EmailCampaign,
  LandingPage,
  MarketingPopup,
  MarketingDocument,
} from './types';

export const channelMethods = {
  captureLead: (userId: string, data: Record<string, unknown>) =>
    marketingRequest<Lead>('/leads/capture', { method: 'POST', body: JSON.stringify(data) }, userId),
  listLeads: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return marketingRequest<PaginatedResult<Lead>>(`/leads?${params}`, {}, userId);
  },
  getLead: (userId: string, leadId: string) =>
    marketingRequest<Lead>(`/leads/${leadId}`, {}, userId),
  updateLead: (userId: string, leadId: string, data: Partial<Lead>) =>
    marketingRequest<Lead>(`/leads/${leadId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  scoreLead: (userId: string, leadId: string, signal: string) =>
    marketingRequest<Lead>(`/leads/${leadId}/score`, { method: 'POST', body: JSON.stringify({ signal }) }, userId),
  qualifyLead: (userId: string, leadId: string) =>
    marketingRequest<Lead>(`/leads/${leadId}/qualify`, { method: 'POST' }, userId),
  convertLeadToCRM: (userId: string, leadId: string) =>
    marketingRequest<{ lead: Lead; contact: unknown; deal: unknown }>(`/leads/${leadId}/convert`, { method: 'POST' }, userId),
  getHotLeads: (userId: string) =>
    marketingRequest<Lead[]>('/leads/hot', {}, userId),
  getLeadFunnel: (userId: string, period?: string) =>
    marketingRequest<LeadFunnelMetrics>(`/leads/funnel${period ? `?period=${period}` : ''}`, {}, userId),

  listEmailCampaigns: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return marketingRequest<PaginatedResult<EmailCampaign>>(`/emails?${params}`, {}, userId);
  },
  getEmailCampaign: (userId: string, id: string) =>
    marketingRequest<EmailCampaign>(`/emails/${id}`, {}, userId),
  createEmailCampaign: (userId: string, data: Partial<EmailCampaign>) =>
    marketingRequest<EmailCampaign>('/emails', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateEmailCampaign: (userId: string, id: string, data: Partial<EmailCampaign>) =>
    marketingRequest<EmailCampaign>(`/emails/${id}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  sendEmailCampaign: (userId: string, id: string) =>
    marketingRequest<EmailCampaign>(`/emails/${id}/send`, { method: 'POST' }, userId),

  listLandingPages: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return marketingRequest<PaginatedResult<LandingPage>>(`/pages?${params}`, {}, userId);
  },
  getLandingPage: (userId: string, id: string) =>
    marketingRequest<LandingPage>(`/pages/${id}`, {}, userId),
  createLandingPage: (userId: string, data: Partial<LandingPage>) =>
    marketingRequest<LandingPage>('/pages', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateLandingPage: (userId: string, id: string, data: Partial<LandingPage>) =>
    marketingRequest<LandingPage>(`/pages/${id}`, { method: 'PUT', body: JSON.stringify(data) }, userId),

  listMarketingPopups: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return marketingRequest<PaginatedResult<MarketingPopup>>(`/popups?${params}`, {}, userId);
  },
  getMarketingPopup: (userId: string, id: string) =>
    marketingRequest<MarketingPopup>(`/popups/${id}`, {}, userId),
  createMarketingPopup: (userId: string, data: Partial<MarketingPopup>) =>
    marketingRequest<MarketingPopup>('/popups', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateMarketingPopup: (userId: string, id: string, data: Partial<MarketingPopup>) =>
    marketingRequest<MarketingPopup>(`/popups/${id}`, { method: 'PUT', body: JSON.stringify(data) }, userId),

  listMarketingDocuments: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return marketingRequest<PaginatedResult<MarketingDocument>>(`/documents?${params}`, {}, userId);
  },
  getMarketingDocument: (userId: string, id: string) =>
    marketingRequest<MarketingDocument>(`/documents/${id}`, {}, userId),
  createMarketingDocument: (userId: string, data: Partial<MarketingDocument>) =>
    marketingRequest<MarketingDocument>('/documents', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateMarketingDocument: (userId: string, id: string, data: Partial<MarketingDocument>) =>
    marketingRequest<MarketingDocument>(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
};

import { fetchAPI } from '@/lib/apiCore';

/** Journeys, templates and segments for the builder screens (WP-20). Mirrors the server's engage routes. */

export interface Issue { path: string; message: string }
/** A 400 from the server carries field-level issues; keep them on the error so a form can show them. */
export class ApiIssues extends Error { constructor(message: string, public readonly issues: Issue[]) { super(message); } }

const call = <T>(endpoint: string): Promise<T> => fetchAPI<T>(endpoint);

/** POST through the shared client (auth, token refresh); a 400 with field issues becomes ApiIssues. */
async function post<T>(endpoint: string, json: unknown): Promise<T> {
  try {
    return await fetchAPI<T>(endpoint, { method: 'POST', body: JSON.stringify(json) });
  } catch (err) {
    const body = (err as { body?: { issues?: unknown } }).body;
    if (Array.isArray(body?.issues)) throw new ApiIssues((err as Error).message, body.issues as Issue[]);
    throw err;
  }
}

/** Who the signed-in user is to engage. Answers 403 for an organization that may not use it (ADR-016). */
export interface EngageMe { organizationId: string; userId: string; role: string; product: 'engage' | 'all' }
export const getEngageMe = () => call<EngageMe>('/engage/me');

export type VersionStatus = 'draft' | 'approved' | 'active' | 'retired';
export interface JourneySummary { id: string; key: string; name: string; createdAt: string; activeVersion: number | null; latestVersion: number }
export interface JourneyVersion {
  id: string; version: number; status: VersionStatus; definition: Record<string, unknown>;
  createdBy: string | null; createdAt: string; approvedBy: string | null; approvedAt: string | null;
  activatedBy: string | null; activatedAt: string | null; deactivatedBy: string | null; deactivatedAt: string | null;
}
export interface SegmentRun { id: string; slot: string; status: string; matched: number; enrolled: number; skipped: number; truncated: boolean; error: string | null; startedAt: string; finishedAt: string | null }

export const listJourneys = () => call<{ journeys: JourneySummary[] }>('/engage/journeys').then((r) => r.journeys);
export const getJourney = (id: string) => call<{ journey: JourneySummary; versions: JourneyVersion[] }>(`/engage/journeys/${encodeURIComponent(id)}`);
export const validateJourney = (definition: unknown) => post<{ ok: boolean; errors: Issue[] }>('/engage/journeys/validate', { definition });
export const createJourney = (input: { key: string; name: string; definition: unknown }) => post<{ journey: JourneySummary; version: JourneyVersion }>('/engage/journeys', input);
export const addJourneyVersion = (id: string, definition: unknown) => post<{ version: JourneyVersion }>(`/engage/journeys/${encodeURIComponent(id)}/versions`, { definition });
export const approveVersion = (id: string, v: number) => post<{ version: JourneyVersion }>(`/engage/journeys/${encodeURIComponent(id)}/versions/${v}/approve`, {});
export const activateVersion = (id: string, v: number) => post<{ version: JourneyVersion }>(`/engage/journeys/${encodeURIComponent(id)}/versions/${v}/activate`, {});
export const stopJourney = (id: string) => post<{ retiredVersion: number | null }>(`/engage/journeys/${encodeURIComponent(id)}/deactivate`, {});
export const listSegmentRuns = (id: string) => call<{ runs: SegmentRun[] }>(`/engage/journeys/${encodeURIComponent(id)}/segment-runs`).then((r) => r.runs);

export interface TemplateSummary { id: string; key: string; name: string; channel: 'email' | 'whatsapp'; createdAt: string; latestVersion: number }
export interface TemplateVersion { id: string; version: number; subject: string; html: string | null; text: string | null; createdAt: string }
export interface TemplatePreview { version: number; subject: string | null; html: string | null; text: string | null; errors: Array<{ code: string; message: string; variable?: string }> }
export const listTemplates = () => call<{ templates: TemplateSummary[] }>('/engage/templates').then((r) => r.templates);
/** Templates an email step or an email campaign can use. WhatsApp templates are kept out until journeys and campaigns send WhatsApp. */
export const listEmailTemplates = () => listTemplates().then((t) => t.filter((x) => x.channel === 'email'));

/** A template as Meta lists it (WP-40a mirror), with the Messign templates registered for it. */
export interface MetaTemplate {
  metaName: string; language: string; status: string; category: string | null; quality: string | null; rejectedReason: string | null;
  shape: { bodyText?: string | null; bodyVariables?: number; headerFormat?: string | null; headerText?: string | null; headerVariables?: number; urlButtonVariables?: number; buttons?: string[] };
  seenAt: string; registeredAs: Array<{ id: string; key: string }>;
}
export interface MetaTemplateList {
  check: { lastAttemptAt: string | null; lastOkAt: string | null; lastError: string | null; consecutiveFailures: number; templatesSeen: number };
  templates: MetaTemplate[]; unmatched: Array<{ id: string; key: string; metaName: string; language: string }>;
}
export const listMetaTemplates = () => call<MetaTemplateList>('/engage/whatsapp/templates');
export const checkMetaTemplates = () => post<{ ok: boolean; seen: number; changed: number; error: string | null }>('/engage/whatsapp/templates/check', {});
export const createWhatsappTemplate = (input: { key: string; name: string; content: WhatsappContentInput }) =>
  post<{ template: TemplateSummary }>('/engage/templates', { channel: 'whatsapp', ...input });
export const addWhatsappTemplateVersion = (id: string, content: WhatsappContentInput) => post<{ version: unknown }>(`/engage/templates/${encodeURIComponent(id)}/versions`, { content });
export type WhatsappContentInput = Omit<WhatsappContent, 'variables'> & { variables: Array<Omit<WhatsappVariable, 'position'>> };

/** A WhatsApp template (WP-40a): how a Meta-approved template is filled, and how it stands at Meta. */
export interface WhatsappVariable { position?: number; source: 'attribute' | 'payload' | 'system'; name: string; defaultValue: string | null }
export interface WhatsappContent {
  metaName: string; language: string; declaredCategory: 'marketing' | 'utility'; bodyText: string; variables: WhatsappVariable[];
  header: { text: string; variable: WhatsappVariable | null } | null; urlButton: { index: 0 | 1; baseUrl: string; variable: WhatsappVariable } | null;
  optOut: 'quick_reply' | 'text_in_body' | 'none';
}
export interface WhatsappHealth {
  status: { status: string; category: string | null; quality: string | null; rejectedReason: string | null; seenAt: string } | null;
  sendable: boolean; category: string; problems: string[]; warnings: string[];
}
export interface WhatsappTemplateDetail {
  template: TemplateSummary; whatsappVersions: Array<{ id: string; version: number; content: WhatsappContent; createdAt: string }>; health: WhatsappHealth;
}

export const getTemplate = (id: string) => call<{ template: TemplateSummary; versions: TemplateVersion[] }>(`/engage/templates/${encodeURIComponent(id)}`);
export const createTemplate = (input: { key: string; name: string; subject: string; html: string }) => post<{ template: TemplateSummary; version: TemplateVersion }>('/engage/templates', input);
export const addTemplateVersion = (id: string, input: { subject: string; html: string }) => post<{ version: TemplateVersion }>(`/engage/templates/${encodeURIComponent(id)}/versions`, input);
export const previewTemplate = (id: string, input: { version?: number; attributes?: Record<string, unknown>; payload?: Record<string, unknown> }) =>
  post<TemplatePreview>(`/engage/templates/${encodeURIComponent(id)}/preview`, input);

export interface SegmentSummary { id: string; key: string; name: string; createdAt: string; latestVersion: number }
export interface SegmentVersion { id: string; version: number; definition: Record<string, unknown>; createdAt: string }
export interface SegmentCount { count: number; sample: Array<{ id: string; externalId: string }>; evaluatedAt: string }
export const listSegments = () => call<{ segments: SegmentSummary[] }>('/engage/segments').then((r) => r.segments);
export const getSegment = (id: string) => call<{ segment: SegmentSummary; versions: SegmentVersion[] }>(`/engage/segments/${encodeURIComponent(id)}`);
export const createSegment = (input: { key: string; name: string; definition: unknown }) => post<{ segment: SegmentSummary; version: SegmentVersion }>('/engage/segments', input);
export const addSegmentVersion = (id: string, definition: unknown) => post<{ version: SegmentVersion }>(`/engage/segments/${encodeURIComponent(id)}/versions`, { definition });
export const previewSegment = (definition: unknown) => post<SegmentCount>('/engage/segments/preview', { definition });
export const countSegmentVersion = (id: string, v: number) => call<SegmentCount>(`/engage/segments/${encodeURIComponent(id)}/versions/${v}/count`);

export interface GroupCounts { entered: number; mature: number; active: number; completed: number; exited: number; failed: number }
export interface GroupConversion { n: number; converted: number; conversionRate: number | null; revenue: number; revenuePerCustomer: number | null }
export interface JourneyResults {
  windowHours: number; asOf: string;
  enrollments: { treatment: GroupCounts; holdout: GroupCounts };
  conversion: {
    treatment: GroupConversion; holdout: GroupConversion;
    uplift: { treatmentRate: number | null; holdoutRate: number | null; difference: number | null; low: number | null; high: number | null; relative: number | null; significant: boolean };
    revenueDifferencePerCustomer: number | null;
  };
  messages: { created: number; byStatus: Record<string, number>; heldOut: number };
  note: string;
}
export const getJourneyResults = (id: string, windowHours: number) =>
  call<JourneyResults>(`/engage/journeys/${encodeURIComponent(id)}/analytics?windowHours=${windowHours}`);

// One-off campaigns (WP-38, ADR-018): send a template to a segment now.
export type CampaignStatus = 'sending' | 'sent' | 'failed';
export interface Campaign {
  id: string; journeyId: string; name: string; channel: 'email' | 'whatsapp'; templateKey: string; templateVersion: number; segmentKey: string; segmentVersion: number;
  holdoutPercent: number; status: CampaignStatus; matched: number; enrolled: number; skipped: number; truncated: boolean; error: string | null;
  createdBy: string | null; createdAt: string; finishedAt: string | null;
}
export interface ReadinessProblem { code: string; message: string }
export interface SendReadiness { sendMode: 'off' | 'sandbox' | 'live'; ready: boolean; problems: ReadinessProblem[] }
export interface CampaignPreview {
  template: {
    id: string; key: string; name: string; version: number; channel: 'email' | 'whatsapp'; subject: string | null; hasUnsubscribeLink: boolean;
    whatsapp: { metaName: string; language: string; category: string; sendable: boolean; problems: string[]; body: string } | null;
  };
  segment: { id: string; key: string; name: string; version: number };
  audience: { inSegment: number; withConsent: number; sample: Array<{ id: string; externalId: string }>; cap: number; overCap: boolean };
  readiness: SendReadiness;
}
export const listCampaigns = () => call<{ campaigns: Campaign[] }>('/engage/campaigns').then((r) => r.campaigns);
export interface CampaignOutcome {
  messages: number; byStatus: Record<string, number>; heldOut: number; blockedBecause: Record<string, number>; waitingBecause?: Record<string, number>; inFlight: boolean;
}
export const getCampaign = (id: string) => call<{ campaign: Campaign; outcome: CampaignOutcome }>(`/engage/campaigns/${encodeURIComponent(id)}`);
export const previewCampaign = (input: { templateId: string; segmentId: string }) => post<CampaignPreview>('/engage/campaigns/preview', input);
export const startCampaign = (input: { name: string; templateId: string; segmentId: string; holdoutPercent: number; idempotencyKey: string }) =>
  post<{ campaign: Campaign; replayed: boolean }>('/engage/campaigns', input);
export const resumeCampaign = (id: string) => post<{ campaign: Campaign }>(`/engage/campaigns/${encodeURIComponent(id)}/resume`, {});


// AI copy drafts (WP-24, ADR-019): a draft proposes the next version of a message step's template. Nothing sends from it;
// an admin approves it, which adds the template version, or rejects it.
export type CopyStatus = 'pending' | 'approved' | 'rejected';
export interface CopyDraft {
  id: string; journeyId: string; stepId: string; templateId: string; purpose: 'marketing' | 'transactional'; language: 'tr' | 'en';
  brief: string; subject: string; html: string | null; text: string | null;
  variables: Array<{ name: string; source: string; defaultValue: string | null }>;
  status: CopyStatus; templateVersion: number | null;
  createdBy: string | null; createdAt: string; decidedBy: string | null; decidedAt: string | null;
}
export const listCopyDrafts = (status?: CopyStatus) =>
  call<{ drafts: CopyDraft[] }>(`/engage/copy-drafts${status ? `?status=${status}` : ''}`).then((r) => r.drafts);
export const requestCopyDraft = (input: { journeyId: string; stepId: string; brief: string; language: 'tr' | 'en' }) =>
  post<{ draft: CopyDraft; pinnedVersion: number | null }>('/engage/copy-drafts', input);
export const approveCopyDraft = (id: string) => post<{ draft: CopyDraft; templateVersion: number }>(`/engage/copy-drafts/${encodeURIComponent(id)}/approve`, {});
export const rejectCopyDraft = (id: string) => post<{ draft: CopyDraft }>(`/engage/copy-drafts/${encodeURIComponent(id)}/reject`, {});

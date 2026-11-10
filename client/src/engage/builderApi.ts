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

export interface TemplateSummary { id: string; key: string; name: string; channel: 'email'; createdAt: string; latestVersion: number }
export interface TemplateVersion { id: string; version: number; subject: string; html: string | null; text: string | null; createdAt: string }
export interface TemplatePreview { version: number; subject: string | null; html: string | null; text: string | null; errors: Array<{ code: string; message: string; variable?: string }> }
export const listTemplates = () => call<{ templates: TemplateSummary[] }>('/engage/templates').then((r) => r.templates);
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

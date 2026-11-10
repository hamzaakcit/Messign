import { fetchAPI } from '@/lib/apiCore';

/** Engage customer list and audit trail (WP-19). Mirrors server/src/engage/profileTrail.ts. */

export interface CustomerListItem {
  id: string; externalId: string; email: string | null; emailConsent: 'granted' | 'revoked' | null;
  suppressed: boolean; erased: boolean; createdAt: string; lastEventAt: string | null;
}
export interface CustomerPage { profiles: CustomerListItem[]; nextCursor: string | null }

export interface TrailDecision {
  id: string; decision: 'allow' | 'deny' | 'defer'; code: string; reasons: Array<{ rule?: string; code?: string }>;
  sendMode: string; createdAt: string; retryAt: string | null;
  consentInForce: { id: string; status: string; source: string; recordedAt: string } | null;
}
export interface TrailMessage {
  id: string; channel: string; purpose: string; status: string; errorCode: string | null; createdAt: string;
  subject: string | null; template: { id: string; version: number } | null; renderError: string | null;
  journey: { enrollmentId: string; journeyKey: string; stepId: string } | null;
  events: Array<{ type: string; source: string; occurredAt: string; errorCode: string | null }>;
  decisions: TrailDecision[];
}
export interface TrailEnrollment {
  id: string; journeyKey: string; journeyName: string; version: number; status: string; endReason: string | null;
  cohort: string; triggerKind: string; enteredAt: string; endedAt: string | null; currentStep: string;
  steps: Array<{ stepId: string; stepType: string; status: string; outcome: string | null; startedAt: string; wakeAt: string | null; doneAt: string | null; messageId: string | null }>;
}
export interface CustomerTrail {
  profile: {
    id: string; externalId: string; attributes: Record<string, unknown>; timezone: string | null; locale: string | null;
    createdAt: string; updatedAt: string; erasedAt: string | null;
    identifiers: { email: string | null; phone: string | null };
    consents: Partial<Record<string, 'granted' | 'revoked'>>;
  };
  identifiers: Array<{ type: string; value: string; active: boolean; firstSeenAt: string; deactivatedAt: string | null }>;
  consents: Array<{ id: string; channel: string; status: string; source: string; recordedAt: string; evidence: Record<string, unknown> }>;
  suppressions: Array<{ channel: string; value: string; reason: string; createdAt: string }>;
  enrollments: TrailEnrollment[];
  messages: TrailMessage[];
  events: Array<{ id: string; name: string; occurredAt: string; receivedAt: string; properties: Record<string, unknown> }>;
}

export function listCustomers(params: { q?: string; cursor?: string | null; limit?: number } = {}): Promise<CustomerPage> {
  const sp = new URLSearchParams();
  if (params.q?.trim()) sp.set('q', params.q.trim());
  if (params.cursor) sp.set('cursor', params.cursor);
  if (params.limit) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  return fetchAPI<CustomerPage>(`/engage/profiles${qs ? `?${qs}` : ''}`);
}

export function getCustomerTrail(id: string): Promise<CustomerTrail> {
  return fetchAPI<CustomerTrail>(`/engage/profiles/${encodeURIComponent(id)}/trail`);
}

export interface NewCustomerInput {
  external_id: string; email?: string | null; phone?: string | null; email_consent: boolean; consent_note?: string | null;
}
/** Add one customer by hand (admins). The server stores email consent only with a note of where the customer agreed. */
export function createCustomer(input: NewCustomerInput): Promise<{ id: string; externalId: string }> {
  return fetchAPI('/api/engage/profiles', { method: 'POST', body: JSON.stringify(input) });
}

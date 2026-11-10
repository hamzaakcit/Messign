import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampaignPanel, CampaignsSection, NewCampaignPanel } from '@/engage/CampaignsView';
import { EngageHub } from '@/engage/EngageHub';
import { useAuthStore } from '@/stores/authStore';
import type { Campaign, CampaignOutcome, CampaignPreview } from '@/engage/builderApi';

/** One-off campaigns (WP-38): the list, the wizard that checks before it sends, and one campaign's panel. */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
interface Call { url: string; method: string; body: Record<string, unknown> | undefined }
let calls: Call[];
const original = globalThis.fetch;
function mockApi(handler: (url: string, method: string, body: Record<string, unknown> | undefined) => Response) {
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ url, method, body });
    return handler(url, method, body);
  }) as typeof fetch;
}
const posted = (part: string) => calls.filter((c) => c.method === 'POST' && c.url.includes(part));
/** The requests that actually start a campaign (not the preview, which has the same prefix). */
const starts = () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/engage/campaigns'));
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui: JSX.Element) => render(<QueryClientProvider client={client()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

const CAMPAIGN = (over: Partial<Campaign> = {}): Campaign => ({
  id: 'c1', journeyId: 'j1', name: 'Autumn books', templateKey: 'autumn', templateVersion: 2, segmentKey: 'lapsed', segmentVersion: 1, holdoutPercent: 0,
  status: 'sent', matched: 120, enrolled: 120, skipped: 0, truncated: false, error: null, createdBy: 'u1', createdAt: '2026-11-10T10:00:00Z', finishedAt: '2026-11-10T10:00:05Z', ...over,
});
const OUTCOME = (over: Partial<CampaignOutcome> = {}): CampaignOutcome => ({
  messages: 120, byStatus: { sent: 30, delivered: 70, blocked: 20 }, heldOut: 0, blockedBecause: { not_allowlisted: 12, suppressed: 8 }, inFlight: false, ...over,
});
const PREVIEW = (over: { audience?: Partial<CampaignPreview['audience']>; template?: Partial<CampaignPreview['template']>; readiness?: CampaignPreview['readiness'] } = {}): CampaignPreview => ({
  template: { id: 't1', key: 'autumn', name: 'Autumn', version: 2, subject: 'New books', hasUnsubscribeLink: true, ...over.template },
  segment: { id: 's1', key: 'lapsed', name: 'Lapsed', version: 1 },
  audience: { inSegment: 150, withConsent: 120, sample: [], cap: 100000, overCap: false, ...over.audience },
  readiness: over.readiness ?? { sendMode: 'sandbox', ready: true, problems: [] },
});
const NOT_READY = { sendMode: 'off' as const, ready: false, problems: [{ code: 'send_mode_off', message: 'Sending is switched off on this server (SEND_MODE).' }, { code: 'tenant_send_disabled', message: 'Sending is not enabled for this organization yet.' }] };
const LISTS = (url: string, method: string): Response | null => {
  if (method !== 'GET') return null;
  if (url.endsWith('/engage/templates')) return json({ templates: [{ id: 't1', key: 'autumn', name: 'Autumn', channel: 'email', createdAt: '', latestVersion: 2 }, { id: 't2', key: 'other', name: 'Other', channel: 'email', createdAt: '', latestVersion: 1 }] });
  if (url.endsWith('/engage/segments')) return json({ segments: [{ id: 's1', key: 'lapsed', name: 'Lapsed', createdAt: '', latestVersion: 1 }] });
  if (url.endsWith('/engage/campaigns')) return json({ campaigns: [] });
  return null;
};

beforeEach(() => { useAuthStore.setState({ isAdmin: true }); });
afterEach(() => { globalThis.fetch = original; });

async function fill(): Promise<void> {
  fireEvent.change(await screen.findByLabelText('Campaign name'), { target: { value: 'Autumn books' } });
  await waitFor(() => expect((screen.getByTestId('campaign-template') as HTMLSelectElement).options.length).toBeGreaterThan(1));
  fireEvent.change(screen.getByTestId('campaign-template'), { target: { value: 't1' } });
  fireEvent.change(screen.getByTestId('campaign-segment'), { target: { value: 's1' } });
}

describe('campaigns list', () => {
  it('lists what was sent, and says so when nothing was', async () => {
    mockApi((url, method) => (url.endsWith('/engage/campaigns') ? json({ campaigns: [CAMPAIGN(), CAMPAIGN({ id: 'c2', name: 'Winter', status: 'sending', enrolled: 40 })] }) : LISTS(url, method) ?? json({}, 404)));
    const opened: string[] = [];
    const view = wrap(<CampaignsSection onOpen={(id) => opened.push(id)} onNew={() => undefined} />);
    expect(await screen.findByText('Autumn books')).toBeInTheDocument();
    expect(screen.getByTestId('status-sent')).toBeInTheDocument();
    expect(screen.getByTestId('status-sending')).toBeInTheDocument();
    expect(screen.getAllByText('autumn v2')).toHaveLength(2);
    fireEvent.click(screen.getByText('Winter'));
    expect(opened).toEqual(['c2']);
    view.unmount();
    mockApi((url, method) => LISTS(url, method) ?? json({}, 404));
    wrap(<CampaignsSection onOpen={() => undefined} onNew={() => undefined} />);
    expect(await screen.findByText(/No campaigns yet/)).toBeInTheDocument();
  });
});

describe('new campaign wizard', () => {
  it('sends nothing until the audience was checked and the admin confirmed; then sends once with the chosen settings', async () => {
    mockApi((url, method) => {
      if (url.endsWith('/campaigns/preview')) return json(PREVIEW());
      if (method === 'POST' && url.endsWith('/engage/campaigns')) return json({ campaign: CAMPAIGN(), replayed: false }, 201);
      return LISTS(url, method) ?? json({}, 404);
    });
    const sent: string[] = [];
    wrap(<NewCampaignPanel onSent={(id) => sent.push(id)} />);
    await fill();
    expect(screen.queryByTestId('send-campaign')).toBeNull();
    fireEvent.click(screen.getByTestId('check-campaign'));
    expect(await screen.findByTestId('audience-count')).toHaveTextContent('120 customers have email consent');
    expect(posted('/campaigns/preview')[0]!.body).toEqual({ templateId: 't1', segmentId: 's1' });
    const sendBtn = screen.getByTestId('send-campaign');
    expect(sendBtn).toBeDisabled();
    expect(sendBtn).toHaveTextContent('Send now to 120 customers');
    fireEvent.click(sendBtn);
    expect(starts()).toHaveLength(0);
    fireEvent.click(screen.getByTestId('confirm-campaign'));
    expect(sendBtn).toBeEnabled();
    fireEvent.click(sendBtn);
    await waitFor(() => expect(sent).toEqual(['c1']));
    const body = starts()[0]!.body!;
    expect(body).toMatchObject({ name: 'Autumn books', templateId: 't1', segmentId: 's1', holdoutPercent: 0 });
    expect(String(body.idempotencyKey)).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });

  it('a second press of Send, or a retry, carries the same idempotency key', async () => {
    let attempts = 0;
    mockApi((url, method) => {
      if (url.endsWith('/campaigns/preview')) return json(PREVIEW());
      if (method === 'POST' && url.endsWith('/engage/campaigns')) { attempts++; return attempts === 1 ? json({ error: 'Request failed' }, 500) : json({ campaign: CAMPAIGN(), replayed: true }, 200); }
      return LISTS(url, method) ?? json({}, 404);
    });
    const sent: string[] = [];
    wrap(<NewCampaignPanel onSent={(id) => sent.push(id)} />);
    await fill();
    fireEvent.click(screen.getByTestId('check-campaign'));
    fireEvent.click(await screen.findByTestId('confirm-campaign'));
    fireEvent.click(screen.getByTestId('send-campaign'));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByTestId('send-campaign'));
    await waitFor(() => expect(sent).toEqual(['c1']));
    const keys = starts().map((c) => c.body!.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('shows why sending is not ready and offers no Send button', async () => {
    mockApi((url, method) => (url.endsWith('/campaigns/preview') ? json(PREVIEW({ readiness: NOT_READY })) : LISTS(url, method) ?? json({}, 404)));
    wrap(<NewCampaignPanel onSent={() => undefined} />);
    await fill();
    fireEvent.click(screen.getByTestId('check-campaign'));
    const box = await screen.findByTestId('send-problems');
    expect(box).toHaveTextContent('Sending is switched off on this server');
    expect(box).toHaveTextContent('not enabled for this organization');
    expect(screen.queryByTestId('send-campaign')).toBeNull();
  });

  it('a template without an unsubscribe link, or an audience without consent, cannot be sent', async () => {
    mockApi((url, method) => (url.endsWith('/campaigns/preview') ? json(PREVIEW({ template: { hasUnsubscribeLink: false } })) : LISTS(url, method) ?? json({}, 404)));
    const a = wrap(<NewCampaignPanel onSent={() => undefined} />);
    await fill();
    fireEvent.click(screen.getByTestId('check-campaign'));
    expect(await screen.findByTestId('no-unsubscribe')).toBeInTheDocument();
    expect(screen.queryByTestId('send-campaign')).toBeNull();
    a.unmount();
    mockApi((url, method) => (url.endsWith('/campaigns/preview') ? json(PREVIEW({ audience: { withConsent: 0 } })) : LISTS(url, method) ?? json({}, 404)));
    wrap(<NewCampaignPanel onSent={() => undefined} />);
    await fill();
    fireEvent.click(screen.getByTestId('check-campaign'));
    expect(await screen.findByText(/Nobody in this segment has email consent/)).toBeInTheDocument();
    expect(screen.queryByTestId('send-campaign')).toBeNull();
  });

  it('changing the template or the segment drops the check, so what was checked is what is sent', async () => {
    mockApi((url, method) => (url.endsWith('/campaigns/preview') ? json(PREVIEW()) : LISTS(url, method) ?? json({}, 404)));
    wrap(<NewCampaignPanel onSent={() => undefined} />);
    await fill();
    fireEvent.click(screen.getByTestId('check-campaign'));
    await screen.findByTestId('send-campaign');
    fireEvent.change(screen.getByTestId('campaign-template'), { target: { value: 't2' } });
    expect(screen.queryByTestId('campaign-preview')).toBeNull();
    expect(screen.queryByTestId('send-campaign')).toBeNull();
  });

  it('an invalid holdout, or a missing name, keeps Send disabled', async () => {
    mockApi((url, method) => (url.endsWith('/campaigns/preview') ? json(PREVIEW()) : LISTS(url, method) ?? json({}, 404)));
    wrap(<NewCampaignPanel onSent={() => undefined} />);
    await fill();
    fireEvent.click(screen.getByTestId('check-campaign'));
    fireEvent.click(await screen.findByTestId('confirm-campaign'));
    expect(screen.getByTestId('send-campaign')).toBeEnabled();
    fireEvent.change(screen.getByTestId('campaign-holdout'), { target: { value: '60' } });
    expect(screen.getByTestId('send-campaign')).toBeDisabled();
    fireEvent.change(screen.getByTestId('campaign-holdout'), { target: { value: '10' } });
    expect(screen.getByTestId('send-campaign')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Campaign name'), { target: { value: '  ' } });
    expect(screen.getByTestId('send-campaign')).toBeDisabled();
  });

  it('shows the server\'s refusal when it is not ready after all, and the field issues when it is not valid', async () => {
    let mode: 'notready' | 'invalid' = 'notready';
    mockApi((url, method) => {
      if (url.endsWith('/campaigns/preview')) return json(PREVIEW());
      if (method === 'POST' && url.endsWith('/engage/campaigns')) {
        return mode === 'notready'
          ? json({ error: 'Sending is not ready for this organization', problems: NOT_READY.problems }, 409)
          : json({ error: 'The campaign is not valid', issues: [{ path: 'segmentId', message: 'this segment does not exist' }] }, 400);
      }
      return LISTS(url, method) ?? json({}, 404);
    });
    wrap(<NewCampaignPanel onSent={() => undefined} />);
    await fill();
    fireEvent.click(screen.getByTestId('check-campaign'));
    fireEvent.click(await screen.findByTestId('confirm-campaign'));
    fireEvent.click(screen.getByTestId('send-campaign'));
    expect(await screen.findByTestId('send-problems')).toHaveTextContent('switched off');
    mode = 'invalid';
    fireEvent.click(screen.getByTestId('send-campaign'));
    expect(await screen.findByTestId('issues')).toHaveTextContent('this segment does not exist');
  });
});

describe('campaign panel', () => {
  it('shows what was asked, how many customers, and the results of its messages', async () => {
    mockApi((url) => {
      if (url.endsWith('/engage/campaigns/c1')) return json({ campaign: CAMPAIGN({ holdoutPercent: 10 }), outcome: OUTCOME({ heldOut: 12 }) });
      if (url.includes('/analytics')) return json({
        windowHours: 72, asOf: '2026-11-10T11:00:00Z',
        enrollments: { treatment: { entered: 108, mature: 0, active: 0, completed: 108, exited: 0, failed: 0 }, holdout: { entered: 12, mature: 0, active: 0, completed: 12, exited: 0, failed: 0 } },
        conversion: { treatment: { n: 0, converted: 0, conversionRate: null, revenue: 0, revenuePerCustomer: null }, holdout: { n: 0, converted: 0, conversionRate: null, revenue: 0, revenuePerCustomer: null },
          uplift: { treatmentRate: null, holdoutRate: null, difference: null, low: null, high: null, relative: null, significant: false }, revenueDifferencePerCustomer: null },
        messages: { created: 108, byStatus: { delivered: 100, blocked: 8 }, heldOut: 12 }, note: '',
      });
      return json({}, 404);
    });
    wrap(<CampaignPanel id="c1" isAdmin />);
    expect(await screen.findByText('Autumn books')).toBeInTheDocument();
    expect(screen.getByText('autumn v2')).toBeInTheDocument();
    expect(screen.getByText('lapsed v1')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-enrolled')).toHaveTextContent('120');
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-sent')).toHaveTextContent('100');
    expect(screen.getByTestId('campaign-blocked')).toHaveTextContent('20');
    expect(screen.getByTestId('campaign-blocked-because')).toHaveTextContent('address suppressed: 8');
    expect(screen.getByTestId('campaign-blocked-because')).toHaveTextContent('not on the sandbox allow-list: 12');
    expect(screen.getByTestId('campaign-outcome')).toHaveTextContent('Held back, no email by design: 12');
    expect(screen.queryByTestId('finish-campaign')).toBeNull();
    await waitFor(() => expect(calls.some((c) => c.url.includes('/engage/journeys/j1/analytics'))).toBe(true));
  });

  it('a campaign sent to everyone shows what happened, not journey statistics; those appear only when a share was held back', async () => {
    mockApi((url) => (url.endsWith('/engage/campaigns/c1') ? json({ campaign: CAMPAIGN({ holdoutPercent: 0 }), outcome: OUTCOME() }) : json({}, 404)));
    wrap(<CampaignPanel id="c1" isAdmin />);
    expect(await screen.findByTestId('campaign-outcome')).toBeInTheDocument();
    expect(screen.queryByText('Results')).toBeNull();
    expect(calls.some((c) => c.url.includes('/analytics'))).toBe(false);
  });

  it('a campaign that is still sending can be finished by an admin only, and a failure says why', async () => {
    let c = CAMPAIGN({ status: 'sending', enrolled: 40, matched: 40, finishedAt: null });
    mockApi((url, method) => {
      if (method === 'POST' && url.endsWith('/c1/resume')) { c = CAMPAIGN({ enrolled: 120 }); return json({ campaign: c }); }
      if (url.endsWith('/engage/campaigns/c1')) return json({ campaign: c, outcome: OUTCOME({ messages: 0, byStatus: {}, blockedBecause: {}, inFlight: c.status === 'sending' }) });
      return json({}, 404);
    });
    const member = wrap(<CampaignPanel id="c1" isAdmin={false} />);
    await screen.findByText('Autumn books');
    expect(screen.queryByTestId('finish-campaign')).toBeNull();
    expect(screen.getByText(/Adding customers… 40 so far/)).toBeInTheDocument();
    member.unmount();
    wrap(<CampaignPanel id="c1" isAdmin />);
    fireEvent.click(await screen.findByTestId('finish-campaign'));
    await waitFor(() => expect(posted('/c1/resume')).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('campaign-enrolled')).toHaveTextContent('120'));
    expect(screen.queryByTestId('finish-campaign')).toBeNull();
  });

  it('refreshes by itself while a campaign is still being sent, and stops once it is sent', async () => {
    let hits = 0;
    mockApi((url) => {
      if (url.endsWith('/engage/campaigns/c1')) {
        hits++;
        // Customers are added (sending), then the sent campaign's messages are created and decided, then it is all settled.
        if (hits < 3) return json({ campaign: CAMPAIGN({ status: 'sending', enrolled: hits * 40, matched: hits * 40, finishedAt: null }), outcome: OUTCOME({ messages: 0, byStatus: {}, blockedBecause: {}, inFlight: true }) });
        if (hits < 10) return json({ campaign: CAMPAIGN(), outcome: OUTCOME({ messages: 120, byStatus: { sent: 60, queued: 60 }, blockedBecause: {}, inFlight: true }) });
        return json({ campaign: CAMPAIGN(), outcome: OUTCOME() });
      }
      return json({}, 404);
    });
    wrap(<CampaignPanel id="c1" isAdmin pollMs={40} />);
    await screen.findByText(/Adding customers/);
    // Messages are being sent: the page says so, shows what is already out, and keeps refreshing until it is all settled.
    expect((await screen.findByText(/Still waiting to be sent/)).closest('p')).toHaveTextContent('Still waiting to be sent: 60');
    expect(screen.getByText(/Still in progress/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('campaign-sent')).toHaveTextContent('100'), { timeout: 3000 });
    expect(screen.queryByText(/Still in progress/)).toBeNull();
    expect(screen.queryByText(/Still waiting to be sent/)).toBeNull();
    const settled = hits;
    await new Promise((r) => setTimeout(r, 250));
    expect(hits).toBe(settled);
  });

  it('the list refreshes by itself while any campaign is being sent', async () => {
    let hits = 0;
    mockApi((url) => (url.endsWith('/engage/campaigns') ? (hits++, json({ campaigns: [CAMPAIGN({ status: hits < 3 ? 'sending' : 'sent', enrolled: hits < 3 ? 10 : 120 })] })) : json({}, 404)));
    wrap(<CampaignsSection onOpen={() => undefined} onNew={() => undefined} pollMs={40} />);
    await screen.findByTestId('status-sending');
    expect(await screen.findByTestId('status-sent', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('says in words why a campaign ended early', async () => {
    mockApi(() => json({ campaign: CAMPAIGN({ status: 'failed', error: 'journey_stopped', enrolled: 4, matched: 4 }), outcome: OUTCOME({ messages: 4, byStatus: { sent: 4 }, blockedBecause: {} }) }));
    wrap(<CampaignPanel id="c1" isAdmin />);
    expect(await screen.findByText(/journey was stopped, so the send ended early/)).toBeInTheDocument();
    expect(screen.getByTestId('status-failed')).toBeInTheDocument();
  });
});

describe('campaigns in the hub', () => {
  it('after Send, the new campaign opens in the panel over the page', async () => {
    mockApi((url, method) => {
      if (url.endsWith('/campaigns/preview')) return json(PREVIEW());
      if (method === 'POST' && url.endsWith('/engage/campaigns')) return json({ campaign: CAMPAIGN(), replayed: false }, 201);
      if (url.endsWith('/engage/campaigns/c1')) return json({ campaign: CAMPAIGN(), outcome: OUTCOME() });
      if (url.includes('/analytics')) return json({}, 404);
      return LISTS(url, method) ?? json({ profiles: [], nextCursor: null });
    });
    wrap(<EngageHub />);
    fireEvent.click(screen.getByTestId('hub-new-campaign'));
    await fill();
    fireEvent.click(screen.getByTestId('check-campaign'));
    fireEvent.click(await screen.findByTestId('confirm-campaign'));
    fireEvent.click(screen.getByTestId('send-campaign'));
    expect(await screen.findByTestId('engage-campaign')).toBeInTheDocument();
    expect(screen.getByTestId('hub-panel')).toContainElement(screen.getByTestId('engage-campaign'));
    expect(screen.getByTestId('hub-tab-campaigns')).toHaveAttribute('aria-selected', 'true');
  });

  it('has a Campaigns tab and tile, and "Send an email now" opens the wizard (admins only)', async () => {
    mockApi((url, method) => LISTS(url, method) ?? json({ profiles: [], nextCursor: null }));
    const view = wrap(<EngageHub />);
    expect(screen.getByTestId('hub-tab-campaigns')).toBeInTheDocument();
    expect(screen.getByTestId('hub-go-campaigns')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hub-go-campaigns'));
    expect(await screen.findByTestId('hub-campaigns')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hub-new-campaign'));
    expect(await screen.findByTestId('new-campaign-panel')).toBeInTheDocument();
    expect(screen.getByTestId('hub-panel')).toContainElement(screen.getByTestId('new-campaign-panel'));
    view.unmount();
    useAuthStore.setState({ isAdmin: false });
    wrap(<EngageHub />);
    expect(screen.queryByTestId('hub-new-campaign')).toBeNull();
  });
});

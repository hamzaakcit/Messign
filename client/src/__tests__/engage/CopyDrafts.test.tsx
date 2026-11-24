import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CopyDraftsPanel } from '@/engage/CopyDraftsView';
import { TemplatesSection } from '@/engage/TemplatesView';
import { briefProblem, messageSteps, reasonText } from '@/engage/copyDraftText';
import type { CopyDraft } from '@/engage/builderApi';
import { useAuthStore } from '@/stores/authStore';

/** AI copy drafts (WP-24 UI): the queue, approval and rejection, asking for a draft, and the refusal reasons. */

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
const posts = (part: string) => calls.filter((c) => c.method === 'POST' && c.url.includes(part));
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui: JSX.Element) => render(<QueryClientProvider client={client()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

const DRAFT = (over: Partial<CopyDraft> = {}): CopyDraft => ({
  id: 'd1', journeyId: 'j1', stepId: 'remind', templateId: 't1', purpose: 'marketing', language: 'tr', brief: 'Sepet hatırlatması, kısa olsun.',
  subject: 'Sepetiniz sizi bekliyor', html: '<p>Merhaba</p>', text: null, variables: [], status: 'pending', templateVersion: null,
  createdBy: 'u1', createdAt: '2026-11-20T09:00:00Z', decidedBy: null, decidedAt: null, ...over,
});
const JOURNEY = { id: 'j1', key: 'cart', name: 'Cart reminder', createdAt: '', activeVersion: null, latestVersion: 1 };
const DEFINITION = {
  trigger: { type: 'event', event: 'cart_updated' },
  steps: [
    { id: 'remind', type: 'message', channel: 'email', template: 'cart', purpose: 'marketing' },
    { id: 'receipt', type: 'message', channel: 'email', template: 'cart', purpose: 'transactional' },
    { id: 'wait', type: 'delay', minutes: 60 },
  ],
};

beforeEach(() => { useAuthStore.setState({ isAdmin: true }); });
afterEach(() => { globalThis.fetch = original; });

const BASE = (url: string, method: string): Response | null => {
  if (method !== 'GET') return null;
  if (url.endsWith('/engage/journeys')) return json({ journeys: [JOURNEY] });
  if (url.includes('/engage/journeys/j1')) return json({ journey: JOURNEY, versions: [{ id: 'v1', version: 1, status: 'active', definition: DEFINITION }] });
  return null;
};

describe('copy draft helpers', () => {
  it('names each refusal in words, and never echoes a value', () => {
    expect(reasonText('personal_data:email')).toMatch(/email address/);
    expect(reasonText('personal_data:phone')).toMatch(/phone number/);
    expect(reasonText('unsubscribe_missing')).toMatch(/unsubscribe link/);
    expect(reasonText('link_not_allowed')).toMatch(/Leave links out/);
    expect(reasonText('greeting_repeated')).toMatch(/greets the reader twice/);
    expect(reasonText('link_reference')).toMatch(/refers to a link or a button/);
    expect(reasonText('sender_name')).toMatch(/team or shop name/);
    expect(reasonText('something_new')).toMatch(/did not pass/);
  });

  it('lists only message steps, in order, with their purpose and template', () => {
    expect(messageSteps(DEFINITION).map((s) => s.id)).toEqual(['remind', 'receipt']);
    expect(messageSteps(DEFINITION)[1]!.purpose).toBe('transactional');
    expect(messageSteps(undefined)).toEqual([]);
  });

  it('keeps the brief between 10 and 1000 characters, after trimming', () => {
    expect(briefProblem('   kısa   ')).toMatch(/at least 10/);
    expect(briefProblem('Sepet hatırlatması, kısa olsun.')).toBeNull();
    expect(briefProblem('a'.repeat(1001))).toMatch(/1000 characters or fewer/);
  });
});

describe('the approval queue', () => {
  it('shows waiting drafts with their copy; an admin can approve or reject, a member only reads', async () => {
    mockApi((url, method) => {
      if (url.includes('/engage/copy-drafts?status=pending')) return json({ drafts: [DRAFT()] });
      return BASE(url, method) ?? json({}, 404);
    });
    wrap(<CopyDraftsPanel isAdmin />);
    expect(await screen.findByText(/Sepetiniz sizi bekliyor/)).toBeInTheDocument();
    expect(screen.getByTestId('approve-d1')).toBeInTheDocument();
    expect(screen.getByTestId('reject-d1')).toBeInTheDocument();
    expect(screen.getByTitle('Draft d1')).toHaveAttribute('sandbox', '');
    expect(screen.getByText(/Cart reminder · remind · marketing · TR/)).toBeInTheDocument();
  });

  it('a member sees the queue without decision buttons or the ask form', async () => {
    useAuthStore.setState({ isAdmin: false });
    mockApi((url, method) => (url.includes('/engage/copy-drafts?status=pending') ? json({ drafts: [DRAFT()] }) : BASE(url, method) ?? json({}, 404)));
    wrap(<CopyDraftsPanel isAdmin={false} />);
    expect(await screen.findByText(/Sepetiniz sizi bekliyor/)).toBeInTheDocument();
    expect(screen.queryByTestId('approve-d1')).toBeNull();
    expect(screen.queryByTestId('ask-copy-draft')).toBeNull();
  });

  it('approving adds the version and reports it; the draft leaves the waiting list', async () => {
    let approved = false;
    mockApi((url, method) => {
      if (method === 'POST' && url.endsWith('/engage/copy-drafts/d1/approve')) { approved = true; return json({ draft: DRAFT({ status: 'approved', templateVersion: 3, decidedAt: '2026-11-20T10:00:00Z' }), templateVersion: 3 }); }
      if (url.includes('/engage/copy-drafts?status=pending')) return json({ drafts: approved ? [] : [DRAFT()] });
      return BASE(url, method) ?? json({}, 404);
    });
    wrap(<CopyDraftsPanel isAdmin />);
    fireEvent.click(await screen.findByTestId('approve-d1'));
    expect(await screen.findByText('Approved. The template now has version 3.')).toBeInTheDocument();
    expect(posts('/engage/copy-drafts/d1/approve')).toHaveLength(1);
  });

  it('rejecting sends a reject and adds nothing', async () => {
    mockApi((url, method) => {
      if (method === 'POST' && url.endsWith('/engage/copy-drafts/d1/reject')) return json({ draft: DRAFT({ status: 'rejected', decidedAt: '2026-11-20T10:00:00Z' }) });
      if (url.includes('/engage/copy-drafts?status=pending')) return json({ drafts: [DRAFT()] });
      return BASE(url, method) ?? json({}, 404);
    });
    wrap(<CopyDraftsPanel isAdmin />);
    fireEvent.click(await screen.findByTestId('reject-d1'));
    expect(await screen.findByText('Rejected. Nothing was added.')).toBeInTheDocument();
    expect(posts('/engage/copy-drafts/d1/reject')).toHaveLength(1);
    expect(posts('/engage/copy-drafts/d1/approve')).toHaveLength(0);
  });
});

describe('asking for a draft', () => {
  it('offers only the message steps of the chosen journey and sends nothing until the brief is valid', async () => {
    mockApi((url, method) => {
      if (url.includes('?status=')) return json({ drafts: [] });
      return BASE(url, method) ?? json({}, 404);
    });
    wrap(<CopyDraftsPanel isAdmin />);
    const ask = await screen.findByTestId('ask-copy-draft');
    expect(ask).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Cart reminder' });
    fireEvent.change(await screen.findByLabelText('Journey for the draft'), { target: { value: 'j1' } });
    const step = screen.getByLabelText('Message step for the draft');
    expect(await screen.findByRole('option', { name: /receipt · transactional/ })).toBeInTheDocument();
    fireEvent.change(step, { target: { value: 'remind' } });
    const btn = screen.getByTestId('ask-copy-draft');
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Brief'), { target: { value: 'short' } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Brief'), { target: { value: 'Sepet hatırlatması, kısa ve samimi.' } });
    expect(btn).toBeEnabled();
    expect(posts('/engage/copy-drafts')).toHaveLength(0);
  });

  it('posts the request with the chosen step, language and brief, and reports the saved draft', async () => {
    mockApi((url, method) => {
      if (method === 'POST' && url.endsWith('/engage/copy-drafts')) return json({ draft: DRAFT(), pinnedVersion: null }, 201);
      if (url.includes('?status=')) return json({ drafts: [] });
      return BASE(url, method) ?? json({}, 404);
    });
    wrap(<CopyDraftsPanel isAdmin />);
    await screen.findByRole('option', { name: 'Cart reminder' });
    fireEvent.change(await screen.findByLabelText('Journey for the draft'), { target: { value: 'j1' } });
    expect(await screen.findByRole('option', { name: /remind · marketing/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message step for the draft'), { target: { value: 'remind' } });
    fireEvent.change(screen.getByLabelText('Language of the copy'), { target: { value: 'en' } });
    fireEvent.change(screen.getByLabelText('Brief'), { target: { value: 'A reminder for shoppers with books in the basket.' } });
    fireEvent.click(screen.getByTestId('ask-copy-draft'));
    expect(await screen.findByTestId('copy-notice')).toHaveTextContent('Draft saved for approval.');
    expect(posts('/engage/copy-drafts')[0]!.body).toEqual({ journeyId: 'j1', stepId: 'remind', language: 'en', brief: 'A reminder for shoppers with books in the basket.' });
  });

  it('shows why a refused draft was not saved, in words, and still saves nothing', async () => {
    mockApi((url, method) => {
      if (method === 'POST' && url.endsWith('/engage/copy-drafts')) return json({ error: 'The draft did not pass the checks and was not saved', reasons: ['personal_data:email', 'unsubscribe_missing'] }, 422);
      if (url.includes('?status=')) return json({ drafts: [] });
      return BASE(url, method) ?? json({}, 404);
    });
    wrap(<CopyDraftsPanel isAdmin />);
    await screen.findByRole('option', { name: 'Cart reminder' });
    fireEvent.change(await screen.findByLabelText('Journey for the draft'), { target: { value: 'j1' } });
    expect(await screen.findByRole('option', { name: /remind · marketing/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message step for the draft'), { target: { value: 'remind' } });
    fireEvent.change(screen.getByLabelText('Brief'), { target: { value: 'Sepet hatırlatması, kısa olsun.' } });
    fireEvent.click(screen.getByTestId('ask-copy-draft'));
    const refused = await screen.findByTestId('copy-refused');
    expect(refused).toHaveTextContent('email address');
    expect(refused).toHaveTextContent('unsubscribe link');
    expect(screen.queryByTestId('copy-notice')).toBeNull();
  });
});

describe('the templates section entry', () => {
  it('shows how many drafts wait, and opens the queue', async () => {
    mockApi((url, method) => {
      if (url.includes('/engage/copy-drafts?status=pending')) return json({ drafts: [DRAFT(), DRAFT({ id: 'd2' })] });
      if (url.endsWith('/engage/templates')) return json({ templates: [] });
      return json({}, 404);
    });
    const opened: string[] = [];
    wrap(<TemplatesSection onOpen={() => undefined} onNew={() => undefined} onDrafts={() => opened.push('drafts')} />);
    await waitFor(() => expect(screen.getByTestId('copy-drafts-pending')).toHaveTextContent('2 waiting for approval'));
    fireEvent.click(screen.getByTestId('open-copy-drafts'));
    expect(opened).toEqual(['drafts']);
  });
});

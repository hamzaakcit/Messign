import type { Page, Route } from '@playwright/test';

/**
 * A fake API for the marketing screens (UX-09). Nothing here reaches a server: every `/api` call is answered from the
 * rows below, and a call nobody mocked gets an empty `{}` and is recorded in `unmocked`.
 */
export interface Row {
  id: string;
  title: string;
  content_type: string;
  channel: string | null;
  status: string;
  body: string | null;
  image_url: string | null;
  parent_content_id: string | null;
  user_brief: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
  tags: string[];
}

const NOW = '2026-11-20T09:00:00.000Z';
const base = {
  image_url: null, parent_content_id: null, user_brief: null, scheduled_for: null,
  created_at: NOW, updated_at: NOW, tags: [] as string[],
};

export function seedRows(): Row[] {
  return [
    { ...base, id: 'offer-dora', title: 'Dora is in Istanbul', content_type: 'offer', channel: 'internal', status: 'draft', body: null, user_brief: 'product: Dora' },
    { ...base, id: 'ig-dora', title: 'Dora post', content_type: 'social', channel: 'instagram', status: 'draft', body: 'Dora in the city', image_url: 'https://cdn.example/dora.jpg', parent_content_id: 'offer-dora' },
    { ...base, id: 'em-dora', title: 'Dora email', content_type: 'email', channel: 'email', status: 'draft', parent_content_id: 'offer-dora', tags: ['journey_email'], body: 'SUBJECT: Dora\nProduct: Dora\nPrice: 450\nUnsubscribe: {{unsubscribe_url}}' },
    { ...base, id: 'offer-ready', title: 'Window drop', content_type: 'offer', channel: 'internal', status: 'draft', body: null, user_brief: 'product: Window drop' },
    { ...base, id: 'ig-ready', title: 'Window post', content_type: 'social', channel: 'instagram', status: 'approved', body: 'Window drop caption', image_url: 'https://cdn.example/window.jpg', parent_content_id: 'offer-ready' },
  ];
}

export interface Mock {
  rows: Map<string, Row>;
  /** Calls that changed something: `PUT /content/ig-dora`, `POST /content/ig-ready/schedule`. */
  writes: string[];
  unmocked: string[];
}

const user = {
  id: 'u1', authUserId: 'u1', email: 'smoke@example.com', name: 'Smoke Test', avatar: '', jobTitle: 'Manager', department: 'Marketing',
  level: 1, xp: 0, xpToNextLevel: 100, badges: [], status: 'online', role: 'manager', joinedAt: NOW,
  stats: { tasksCompleted: 0, messagesSent: 0, hoursLogged: 0, projectsContributed: 0, documentsCreated: 0 },
};

/** Signs the browser in without a server: the persisted session the auth store reads on load. */
export async function signIn(page: Page): Promise<void> {
  await page.addInitScript((u) => {
    localStorage.setItem('messign-auth', JSON.stringify({
      state: { user: u, accessToken: 'smoke-token', expiresAt: Date.now() + 3_600_000, mustChangePassword: false, isAuthenticated: true, isAdmin: false },
      version: 0,
    }));
    localStorage.setItem('onboarding_completed', 'true');
    sessionStorage.setItem('messign.contentTenant', 'messign');
  }, user);
}

const page1 = (rows: Row[]) => ({ data: rows, total: rows.length, page: 1, pageSize: 50, totalPages: 1 });

export async function installApi(page: Page): Promise<Mock> {
  const mock: Mock = { rows: new Map(seedRows().map((r) => [r.id, r])), writes: [], unmocked: [] };

  await page.route('**/api/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = req.method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (method !== 'GET') mock.writes.push(`${method} ${path}`);

    if (path.startsWith('/auth/')) return json({ success: true, data: { accessToken: 'smoke-token', expiresIn: 3600, user, mustChangePassword: false } });
    if (path === '/marketing/dashboard/bootstrap') {
      const rows = [...mock.rows.values()];
      return json({ metrics: { mqls: 0, cpl: 0, roi: 0, emailOpenRate: 0, monthlyTrend: [] }, hotLeads: [], content: page1(rows), campaigns: page1([]), emailCampaigns: page1([]) });
    }
    if (path === '/marketing/approvals') return json({ success: true, data: { items: [] } });
    if (path === '/marketing/emails' && method === 'GET') {
      const design = { id: 'email-1', name: 'Spring newsletter', subject: 'Spring is here', status: 'draft', updated_at: NOW, created_at: NOW, total_recipients: 0 };
      return json(page1([design as unknown as Row]));
    }
    if (path === '/marketing/brand-profiles/stats') return json({ stats: [] });
    if (path === '/marketing/brand-profiles') return json({ profiles: [], total: 0 });
    if (path === '/marketing/brand-profile') return json({ profile: null });
    if (path === '/marketing/content/instagram-publish-mode') return json({ mode: 'mock' });
    if (path === '/marketing/content/instagram-connection') return json({ connected: false, accountId: null, username: null });
    if (path === '/marketing/content/calendar') return json([]);
    if (path === '/marketing/content' && method === 'GET') {
      const parent = url.searchParams.get('parent_id');
      const status = url.searchParams.get('status');
      const rows = [...mock.rows.values()].filter((r) => (!parent || r.parent_content_id === parent) && (!status || r.status === status));
      return json(page1(rows));
    }
    if (path === '/marketing/content' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}') as Partial<Row>;
      const channel = body.channel ?? null;
      const row: Row = {
        ...base, ...body, id: `new-${mock.rows.size + 1}`, status: 'draft', channel,
        title: body.title || 'Untitled', content_type: body.content_type || 'social', tags: body.tags ?? [],
        body: channel === 'instagram' ? 'A caption for the new offer' : null,
        image_url: channel === 'instagram' ? 'https://cdn.example/new.jpg' : null,
        parent_content_id: body.parent_content_id ?? null, user_brief: body.user_brief ?? null,
      };
      mock.rows.set(row.id, row);
      return json(row, 201);
    }
    const caption = path.match(/^\/marketing\/content\/([^/]+)\/caption$/);
    if (caption && method === 'POST') {
      const row = mock.rows.get(caption[1]);
      if (!row) return json({ error: 'Not found' }, 404);
      if (row.status !== 'draft') return json({ error: 'Only a draft can be written or rewritten.' }, 409);
      row.body = 'A caption written by the model.';
      return json(row);
    }
    const journey = path.match(/^\/marketing\/content\/([^/]+)\/journey-email$/);
    if (journey && method === 'POST') {
      const row: Row = {
        ...base, id: `new-${mock.rows.size + 1}`, title: 'Journey subject', content_type: 'email', channel: 'email', status: 'draft',
        body: 'SUBJECT: Journey subject\nUnsubscribe: {{unsubscribe_url}}', parent_content_id: journey[1], tags: ['journey_email'],
      };
      mock.rows.set(row.id, row);
      return json(row, 201);
    }
    const schedule = path.match(/^\/marketing\/content\/([^/]+)\/schedule$/);
    if (schedule && method === 'POST') {
      const row = mock.rows.get(schedule[1]);
      if (!row) return json({ error: 'Not found' }, 404);
      const body = JSON.parse(req.postData() || '{}') as { date?: string; time?: string };
      row.status = 'scheduled';
      row.scheduled_for = `${body.date}T${body.time ?? '09:00'}:00.000Z`;
      return json(row);
    }
    const one = path.match(/^\/marketing\/content\/([^/]+)$/);
    if (one) {
      const row = mock.rows.get(decodeURIComponent(one[1]));
      if (!row) return json({ error: 'Not found' }, 404);
      if (method === 'PUT') {
        const patch = JSON.parse(req.postData() || '{}') as Record<string, unknown>;
        if (patch.submit_for_review) { row.status = 'in_review'; delete patch.submit_for_review; }
        Object.assign(row, patch);
      }
      return json(row);
    }
    if (path.startsWith('/marketing/') || path.startsWith('/v2/')) {
      mock.unmocked.push(`${method} ${path}`);
      return json(path.endsWith('s') ? [] : {});
    }
    // Everything else is the app shell (notifications, presence, briefing…): quiet and empty.
    return json([]);
  });
  return mock;
}

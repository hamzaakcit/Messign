import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../services/marketing/publishing/adapters/instagramImageUrl.js', () => ({
  validateInstagramImageUrlStruct: () => ({ ok: true }),
  verifyInstagramImageUrlReachable: async () => ({ ok: true }),
}));

const calendar = {
  id: 'cal-1',
  workspace_id: 'ws-1',
  content_id: 'content-1',
  campaign_id: null,
  scheduled_at: '2026-11-07T00:00:00Z',
  channel: 'email',
  status: 'scheduled',
};
const content = {
  title: 'Title',
  body: 'Body',
  body_html: null,
  content_type: 'social',
  channel: null,
  image_url: 'https://example.com/image.jpg',
};

const CREDENTIALS = {
  RESEND_API_KEY: 'test-key',
  LINKEDIN_ACCESS_TOKEN: 'test-token',
  X_BEARER_TOKEN: 'test-token',
  META_GRAPH_ACCESS_TOKEN: 'test-token',
  INSTAGRAM_BUSINESS_ACCOUNT_ID: 'test-account',
  MARKETING_BLOG_WEBHOOK_URL: 'https://example.com/webhook',
};

// instagramAdapter reads its credentials at import time, so each case re-imports after stubbing env.
const adapters: Array<[string, () => Promise<unknown>]> = [
  ['email', async () => (await import('../../../services/marketing/publishing/adapters/emailAdapter.js')).publishEmailCampaign({ calendar, content })],
  ['linkedin', async () => (await import('../../../services/marketing/publishing/adapters/linkedinAdapter.js')).publishLinkedInOrganicShare({ calendar, content })],
  ['x', async () => (await import('../../../services/marketing/publishing/adapters/xAdapter.js')).publishXTweet({ calendar, content })],
  ['blog', async () => (await import('../../../services/marketing/publishing/adapters/blogAdapter.js')).publishBlogOrCms({ calendar, content })],
  ['instagram', async () => (await import('../../../services/marketing/publishing/adapters/instagramAdapter.js')).publishInstagramPost({ calendar, content })],
];

describe('SEND_MODE gate on legacy adapters', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ id: 'provider-id', status_code: 'FINISHED', permalink: 'https://example.com/p' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    for (const [key, value] of Object.entries(CREDENTIALS)) vi.stubEnv(key, value);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe.each(adapters)('%s adapter', (_name, publish) => {
    it.each([
      ['unset', undefined],
      ['off', 'off'],
      ['sandbox', 'sandbox'],
      ['a wrong-case value', 'LIVE'],
    ])('makes no outbound call with credentials present when SEND_MODE is %s', async (_label, mode) => {
      vi.stubEnv('SEND_MODE', mode as string);
      await publish();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('makes the outbound call when SEND_MODE=live', async () => {
      vi.stubEnv('SEND_MODE', 'live');
      await publish();
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});

import { publishBlogOrCms } from '../../services/marketing/publishing/adapters/blogAdapter.js';
import { publishEmailCampaign } from '../../services/marketing/publishing/adapters/emailAdapter.js';
import { publishLinkedInOrganicShare } from '../../services/marketing/publishing/adapters/linkedinAdapter.js';
import { publishXTweet } from '../../services/marketing/publishing/adapters/xAdapter.js';
import type { CalendarRecordForPublish, ContentPayloadForPublish } from '../../services/marketing/publishing/types.js';

const calendar: CalendarRecordForPublish = {
  id: 'cal-1',
  workspace_id: 'ws-1',
  content_id: 'content-1',
  campaign_id: null,
  scheduled_at: '2026-11-13T00:00:00.000Z',
  channel: 'linkedin',
  status: 'scheduled',
};

const content: ContentPayloadForPublish = {
  title: 'Launch note',
  body: 'A short note for the feed.',
  body_html: null,
  content_type: 'social_post',
  channel: 'linkedin',
};

describe('legacy adapters when SEND_MODE is unset', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('SEND_MODE', '');
    vi.stubEnv('LINKEDIN_ACCESS_TOKEN', 'token-present');
    vi.stubEnv('LINKEDIN_FORCE_MOCK', '');
    vi.stubEnv('LINKEDIN_MOCK_TRANSIENT_503', '');
    vi.stubEnv('LINKEDIN_MOCK_HARD_401', '');
    vi.stubEnv('X_BEARER_TOKEN', 'token-present');
    vi.stubEnv('X_FORCE_REAL', '1');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FORCE_REAL', '1');
    vi.stubEnv('MARKETING_BLOG_WEBHOOK_URL', 'https://hooks.example/publish');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns a mock result and does not call the network', async () => {
    const linkedin = await publishLinkedInOrganicShare({ calendar, content });
    const tweet = await publishXTweet({ calendar: { ...calendar, channel: 'x' }, content });
    const email = await publishEmailCampaign({
      calendar: { ...calendar, channel: 'email' },
      content: { ...content, channel: 'email', content_type: 'newsletter' },
    });
    const blog = await publishBlogOrCms({
      calendar: { ...calendar, channel: 'blog' },
      content: { ...content, channel: 'blog', content_type: 'blog_post' },
    });

    expect(linkedin.externalPostId).toBe('urn:li:ugcPost:mock-cal-1');
    expect(tweet.publishedUrl).toContain('mock-cal-1');
    expect(email.externalPostId ?? '').toMatch(/^email-mock-/);
    expect(blog.externalPostId ?? '').toMatch(/^kh-mock-/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

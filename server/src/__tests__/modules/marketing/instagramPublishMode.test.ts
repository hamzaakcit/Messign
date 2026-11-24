import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishInstagramPost } from '../../../services/marketing/publishing/adapters/instagramAdapter.js';
import {
  instagramPublishMode,
  instagramTestPublishBlock,
} from '../../../services/marketing/publishing/instagramPublishMode.js';

const CALENDAR = {
  id: '11111111-2222-4333-8444-555555555555',
  workspace_id: 'org-1',
  content_id: '11111111-2222-4333-8444-555555555555',
  campaign_id: null,
  scheduled_at: '2026-11-16T10:00:00.000Z',
  channel: 'instagram',
  status: 'test',
};

const CONTENT = {
  title: 'Ince Memed',
  body: 'A square still for the shop window.',
  body_html: null,
  content_type: 'social',
  channel: 'instagram',
  image_url: 'https://cdn.example.com/book.jpg',
};

describe('instagram publish mode', () => {
  const previous = {
    SEND_MODE: process.env.SEND_MODE,
    META_GRAPH_ACCESS_TOKEN: process.env.META_GRAPH_ACCESS_TOKEN,
    INSTAGRAM_BUSINESS_ACCOUNT_ID: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    restore('SEND_MODE', previous.SEND_MODE);
    restore('META_GRAPH_ACCESS_TOKEN', previous.META_GRAPH_ACCESS_TOKEN);
    restore('INSTAGRAM_BUSINESS_ACCOUNT_ID', previous.INSTAGRAM_BUSINESS_ACCOUNT_ID);
  });

  it('unset SEND_MODE returns the mock permalink and does not call Graph', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    delete process.env.SEND_MODE;
    process.env.META_GRAPH_ACCESS_TOKEN = 'test-token';
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '17840000000000000';

    const result = await publishInstagramPost({ calendar: CALENDAR, content: CONTENT });

    expect(instagramPublishMode()).toBe('mock');
    expect(result.publishedUrl).toContain('/p/ig_mock_');
    expect(result.externalPostId?.startsWith('ig_mock_')).toBe(true);
    expect(graphCalls(fetchSpy)).toEqual([]);
  });

  it('sandbox stays on the mock branch even when a token is present', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    process.env.SEND_MODE = 'sandbox';
    process.env.META_GRAPH_ACCESS_TOKEN = 'test-token';
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '17840000000000000';

    const result = await publishInstagramPost({ calendar: CALENDAR, content: CONTENT });

    expect(result.publishedUrl).toContain('/p/ig_mock_');
    expect(graphCalls(fetchSpy)).toEqual([]);
  });

  it('live SEND_MODE calls Graph when credentials exist', async () => {
    process.env.SEND_MODE = 'live';
    process.env.META_GRAPH_ACCESS_TOKEN = 'test-token';
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '17840000000000000';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('graph.facebook.com') && url.includes('media_publish')) {
        return json({ id: 'media-1' });
      }
      if (url.includes('graph.facebook.com') && url.includes('/media')) {
        return json({ id: 'container-1' });
      }
      if (url.includes('graph.facebook.com') && url.includes('status_code')) {
        return json({ status_code: 'FINISHED' });
      }
      if (url.includes('graph.facebook.com')) {
        return json({ permalink: 'https://www.instagram.com/p/media-1/' });
      }
      return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    });

    const result = await publishInstagramPost({ calendar: CALENDAR, content: CONTENT });

    expect(instagramPublishMode()).toBe('live');
    expect(result.publishedUrl).toBe('https://www.instagram.com/p/media-1/');
    expect(graphCalls(fetchSpy).length).toBeGreaterThan(0);
  });

  it('a studio share calls Graph when the organization saved credentials, even if SEND_MODE is unset', async () => {
    delete process.env.SEND_MODE;
    delete process.env.META_GRAPH_ACCESS_TOKEN;
    delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('graph.facebook.com') && url.includes('media_publish')) {
        return json({ id: 'media-1' });
      }
      if (url.includes('graph.facebook.com') && url.includes('/media')) {
        return json({ id: 'container-1' });
      }
      if (url.includes('graph.facebook.com') && url.includes('status_code')) {
        return json({ status_code: 'FINISHED' });
      }
      if (url.includes('graph.facebook.com')) {
        return json({ permalink: 'https://www.instagram.com/p/media-1/' });
      }
      return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    });

    const result = await publishInstagramPost({
      calendar: CALENDAR,
      content: CONTENT,
      live: true,
      credentials: { token: 'org-token', accountId: '17840000000000000' },
    });

    expect(result.publishedUrl).toBe('https://www.instagram.com/p/media-1/');
    expect(graphCalls(fetchSpy).some((url) => url.includes('org-token'))).toBe(true);
  });

  it('refuses to publish an email child to a network', () => {
    expect(instagramTestPublishBlock('email')).toBe('Email is not published to a network.');
    expect(instagramTestPublishBlock('instagram')).toBeNull();
  });
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function graphCalls(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes('graph.facebook.com'));
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

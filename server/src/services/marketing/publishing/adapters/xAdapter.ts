/**
 * X (Twitter) API v2 — stub POST /2/tweets; production needs OAuth 2.0 user context + media upload if needed.
 */
import type { AdapterPublishSuccess, CalendarRecordForPublish, ContentPayloadForPublish } from '../types.js';
import { withTransientRetry, errorFromResponse } from '../adapterUtils.js';

export interface XAdapterInput {
  calendar: CalendarRecordForPublish;
  content: ContentPayloadForPublish;
}

export async function publishXTweet(input: XAdapterInput): Promise<AdapterPublishSuccess> {
  const text = (input.content.body ?? input.content.title).replace(/\s+/g, ' ').trim().slice(0, 280);

  return withTransientRetry(async () => {
    const token = process.env.X_BEARER_TOKEN ?? process.env.TWITTER_BEARER_TOKEN;

    if (token && process.env.X_FORCE_REAL === '1') {
      const res = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw errorFromResponse(res, t);
      }
      const json = (await res.json()) as { data?: { id: string } };
      const id = json.data?.id ?? input.calendar.id;
      return {
        publishedUrl: `https://twitter.com/i/web/status/${id}`,
        externalPostId: id,
      };
    }

    console.log('[xAdapter] MOCK tweet', { calendarId: input.calendar.id, len: text.length });
    const mockId = `mock-${input.calendar.id}`;
    return {
      publishedUrl: `https://twitter.com/i/web/status/${mockId}`,
      externalPostId: mockId,
    };
  }, { maxAttempts: 3 });
}

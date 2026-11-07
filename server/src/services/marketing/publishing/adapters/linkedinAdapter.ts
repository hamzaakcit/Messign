/**
 * LinkedIn organic share — stubbed UGC POST; replace with LinkedIn Marketing API / w_member_social.
 * https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/ugc-post-api
 */
import type { AdapterPublishSuccess, CalendarRecordForPublish, ContentPayloadForPublish } from '../types.js';
import { AdapterHttpError } from '../types.js';
import { withTransientRetry, errorFromResponse, isSendModeLive } from '../adapterUtils.js';

export interface LinkedInAdapterInput {
  calendar: CalendarRecordForPublish;
  content: ContentPayloadForPublish;
}

/**
 * Mock: POST to LinkedIn UGC endpoint. Wire OAuth + `LINKEDIN_ACCESS_TOKEN` in production.
 * Retries 429/503 via {@link withTransientRetry}.
 */
export async function publishLinkedInOrganicShare(input: LinkedInAdapterInput): Promise<AdapterPublishSuccess> {
  const text = (input.content.body ?? input.content.body_html ?? '').replace(/<[^>]+>/g, '').slice(0, 3000);
  const title = input.content.title.slice(0, 500);

  return withTransientRetry(async () => {
    const mockUrl = process.env.LINKEDIN_API_BASE?.trim() || 'https://api.linkedin.com/v2';
    const token = process.env.LINKEDIN_ACCESS_TOKEN;

    if (process.env.LINKEDIN_MOCK_TRANSIENT_503 === '1') {
      throw new AdapterHttpError('Simulated LinkedIn 503', 503);
    }
    if (process.env.LINKEDIN_MOCK_HARD_401 === '1') {
      throw new AdapterHttpError('401 Unauthorized', 401);
    }

    if (token && isSendModeLive()) {
      const res = await fetch(`${mockUrl}/ugcPosts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author: process.env.LINKEDIN_AUTHOR_URN ?? 'urn:li:organization:0',
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: `${title}\n\n${text}` },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw errorFromResponse(res, t);
      }
      const json = (await res.json()) as { id?: string };
      return {
        publishedUrl: `https://www.linkedin.com/feed/update/${json.id ?? input.calendar.id}`,
        externalPostId: json.id ?? input.calendar.id,
      };
    }

    // Dev / no token: deterministic mock
    const id = `urn:li:ugcPost:mock-${input.calendar.id}`;
    console.log('[linkedinAdapter] MOCK publish', { calendarId: input.calendar.id, title: title.slice(0, 80) });
    return {
      publishedUrl: `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}`,
      externalPostId: id,
    };
  }, { maxAttempts: 3, baseDelayMs: 500 });
}

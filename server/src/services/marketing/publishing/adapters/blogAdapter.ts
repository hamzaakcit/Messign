/**
 * Blog / CMS — stub webhook to Webflow/WordPress or internal Knowledge Hub draft publish.
 */
import type { AdapterPublishSuccess, CalendarRecordForPublish, ContentPayloadForPublish } from '../types.js';
import { withTransientRetry } from '../adapterUtils.js';
import { errorFromResponse } from '../adapterUtils.js';

export interface BlogAdapterInput {
  calendar: CalendarRecordForPublish;
  content: ContentPayloadForPublish;
}

export async function publishBlogOrCms(input: BlogAdapterInput): Promise<AdapterPublishSuccess> {
  const webhook = process.env.MARKETING_BLOG_WEBHOOK_URL?.trim();
  const khInternal = process.env.MARKETING_KH_PUBLISH_URL?.trim();

  return withTransientRetry(async () => {
    const payload = {
      calendar_id: input.calendar.id,
      workspace_id: input.calendar.workspace_id,
      title: input.content.title,
      body: input.content.body,
      body_html: input.content.body_html,
      content_type: input.content.content_type,
    };

    const target = webhook ?? khInternal;
    if (target) {
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(process.env.MARKETING_BLOG_WEBHOOK_SECRET ? { 'X-Webhook-Secret': process.env.MARKETING_BLOG_WEBHOOK_SECRET } : {}) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text();
        throw errorFromResponse(res, t);
      }
      const json = (await res.json().catch(() => ({}))) as { url?: string; id?: string };
      return {
        publishedUrl: json.url ?? `${target}#${input.calendar.id}`,
        externalPostId: json.id ?? input.calendar.id,
      };
    }

    console.log('[blogAdapter] MOCK publish to Knowledge Hub / CMS', {
      calendarId: input.calendar.id,
      title: input.content.title.slice(0, 60),
    });
    return {
      publishedUrl: `https://app.messign.example/knowledge/published/${input.calendar.content_id}`,
      externalPostId: `kh-mock-${input.calendar.id}`,
    };
  }, { maxAttempts: 3 });
}

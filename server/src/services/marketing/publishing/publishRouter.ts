/**
 * Routes a calendar row + content payload to the correct channel adapter (strategy / switch).
 */
import type { AdapterPublishSuccess, CalendarRecordForPublish, ContentPayloadForPublish } from './types.js';
import { publishLinkedInOrganicShare } from './adapters/linkedinAdapter.js';
import { publishEmailCampaign } from './adapters/emailAdapter.js';
import { publishXTweet } from './adapters/xAdapter.js';
import { publishBlogOrCms } from './adapters/blogAdapter.js';

/** Normalize UI / LLM channel labels to internal adapter keys */
export function normalizeChannelKey(channel: string): string {
  const u = channel.toLowerCase().trim();
  if (u === 'twitter' || u === 'x') return 'x';
  if (u === 'linkedin' || u.startsWith('linkedin')) return 'linkedin';
  if (u === 'email' || u === 'mail' || u === 'newsletter') return 'email';
  if (['blog', 'webflow', 'wordpress', 'knowledge', 'cms', 'landing'].includes(u)) return 'blog';
  return u;
}

/**
 * Main entry used by {@link ../marketingPublisherService.ts} — one outbound post per invocation.
 */
export async function publishContent(
  calendar: CalendarRecordForPublish,
  content: ContentPayloadForPublish,
): Promise<AdapterPublishSuccess> {
  const key = normalizeChannelKey(calendar.channel || content.channel || 'blog');

  switch (key) {
    case 'linkedin':
      return publishLinkedInOrganicShare({ calendar, content });
    case 'email':
      return publishEmailCampaign({ calendar, content });
    case 'x':
      return publishXTweet({ calendar, content });
    case 'blog':
      return publishBlogOrCms({ calendar, content });
    default:
      console.warn(`[publishRouter] Unrecognized channel "${calendar.channel}" — using blog/CMS adapter as safe default`);
      return publishBlogOrCms({ calendar, content });
  }
}

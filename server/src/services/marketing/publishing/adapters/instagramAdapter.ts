// ============================================================================
// Instagram Publisher Adapter
// ============================================================================
// Publishes Instagram posts via the Meta Graph API (Container → Publish flow).
// Currently a structured stub — swap the mock section for real API calls
// when Meta Business credentials are configured.
//
// File: server/src/services/marketing/publishing/adapters/instagramAdapter.ts
// ============================================================================

import type {
  AdapterPublishSuccess,
  CalendarRecordForPublish,
  ContentPayloadForPublish,
} from '../types.js';
import { ensurePublicInstagramImageUrl } from '../instagramPublicImage.js';
import { validateInstagramImageUrlStruct, verifyInstagramImageUrlReachable } from './instagramImageUrl.js';
import { isSendModeLive } from '../adapterUtils.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const META_GRAPH_API_VERSION = 'v19.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

function metaCredentials(): { token: string; accountId: string } {
  return {
    token: process.env.META_GRAPH_ACCESS_TOKEN ?? '',
    accountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? '',
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstagramAdapterInput {
  calendar: CalendarRecordForPublish;
  content: ContentPayloadForPublish & {
    image_url?: string | null;
    image_prompt?: string | null;
    visual_description?: string | null;
  };
  /** Saved for this organization. Env credentials are the fallback. */
  credentials?: { token: string; accountId: string };
  /** Studio share: a bad image throws instead of skipping. SEND_MODE still decides whether Graph is called. */
  live?: boolean;
}

interface MetaContainerResponse {
  id: string;
}

interface MetaPublishResponse {
  id: string;
}

// ---------------------------------------------------------------------------
// Main publish function
// ---------------------------------------------------------------------------

export async function publishInstagramPost(
  input: InstagramAdapterInput,
): Promise<AdapterPublishSuccess> {
  const caption = instagramCaptionFromBody(stripHtml(input.content.body ?? input.content.body_html ?? ''));
  const imageUrl = input.content.image_url ?? null;

  if (!imageUrl?.trim()) {
    console.warn('[PUB] Skipping Instagram publish — no image_url (generate in cockpit or set image_url)');
    return { skipped: true, publishedUrl: undefined, externalPostId: undefined };
  }

  // Every network send goes through SEND_MODE, including a studio share with saved credentials.
  if (!isSendModeLive()) {
    return publishMock({ caption, imageUrl, calendarId: input.calendar.id });
  }

  const hosted = await ensurePublicInstagramImageUrl(imageUrl);
  const struct = validateInstagramImageUrlStruct(hosted);
  if (!struct.ok) {
    if (input.live) throw new Error(struct.reason);
    console.warn('[instagramAdapter] Skipping publish — bad image_url', { reason: struct.reason, preview: hosted.slice(0, 120) });
    return { skipped: true, publishedUrl: undefined, externalPostId: undefined };
  }

  const reachable = await verifyInstagramImageUrlReachable(hosted);
  if (!reachable.ok) {
    if (input.live) throw new Error(reachable.reason);
    console.warn('[instagramAdapter] Skipping publish — image not fetchable (Meta needs public HTTPS image)', {
      reason: reachable.reason,
      preview: hosted.slice(0, 120),
    });
    return { skipped: true, publishedUrl: undefined, externalPostId: undefined };
  }

  const saved = input.credentials;
  const fromEnv = metaCredentials();
  const token = saved?.token || fromEnv.token;
  const accountId = saved?.accountId || fromEnv.accountId;
  if (token && accountId) {
    return publishViaMeta({ caption, imageUrl: hosted, calendarId: input.calendar.id, token, accountId });
  }

  return publishMock({ caption, imageUrl, calendarId: input.calendar.id });
}

// ---------------------------------------------------------------------------
// Meta Graph API implementation
// ---------------------------------------------------------------------------

async function publishViaMeta(args: {
  caption: string;
  imageUrl: string;
  calendarId: string;
  token: string;
  accountId: string;
}): Promise<AdapterPublishSuccess> {
  // Step 1: Create media container
  const containerUrl = new URL(
    `${META_GRAPH_BASE}/${args.accountId}/media`,
  );
  containerUrl.searchParams.set('image_url', args.imageUrl);
  containerUrl.searchParams.set('caption', args.caption);
  containerUrl.searchParams.set('access_token', args.token);

  const containerRes = await fetch(containerUrl.toString(), { method: 'POST', signal: AbortSignal.timeout(30_000) });
  if (!containerRes.ok) {
    const err = await containerRes.text().catch(() => 'unknown');
    throw new Error(`Meta container creation failed (${containerRes.status}): ${err}`);
  }
  const container = (await containerRes.json()) as MetaContainerResponse;

  // Step 2: Wait for container processing (Meta needs time for image processing)
  await waitForContainerReady(container.id, args.token);

  // Step 3: Publish the container
  const publishUrl = new URL(
    `${META_GRAPH_BASE}/${args.accountId}/media_publish`,
  );
  publishUrl.searchParams.set('creation_id', container.id);
  publishUrl.searchParams.set('access_token', args.token);

  const publishRes = await fetch(publishUrl.toString(), { method: 'POST', signal: AbortSignal.timeout(30_000) });
  if (!publishRes.ok) {
    const err = await publishRes.text().catch(() => 'unknown');
    throw new Error(`Meta publish failed (${publishRes.status}): ${err}`);
  }
  const published = (await publishRes.json()) as MetaPublishResponse;

  // Step 4: Fetch permalink
  const permalink = await fetchPermalink(published.id, args.token);

  console.log('[instagramAdapter] Published via Meta Graph API', {
    calendarId: args.calendarId,
    mediaId: published.id,
    permalink,
  });

  return {
    publishedUrl: permalink,
    externalPostId: published.id,
  };
}

async function waitForContainerReady(containerId: string, token: string, maxWaitMs = 30_000): Promise<void> {
  const start = Date.now();
  const pollInterval = 2000;

  while (Date.now() - start < maxWaitMs) {
    const statusUrl = new URL(`${META_GRAPH_BASE}/${containerId}`);
    statusUrl.searchParams.set('fields', 'status_code');
    statusUrl.searchParams.set('access_token', token);

    const res = await fetch(statusUrl.toString(), { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const data = (await res.json()) as { status_code?: string };
      if (data.status_code === 'FINISHED') return;
      if (data.status_code === 'ERROR') {
        throw new Error(`Container processing failed: ${JSON.stringify(data)}`);
      }
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error('Container processing timed out');
}

async function fetchPermalink(mediaId: string, token: string): Promise<string> {
  const url = new URL(`${META_GRAPH_BASE}/${mediaId}`);
  url.searchParams.set('fields', 'permalink');
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    return `https://www.instagram.com/p/unknown_${mediaId}/`;
  }

  const data = (await res.json()) as { permalink?: string };
  return data.permalink ?? `https://www.instagram.com/p/${mediaId}/`;
}

// ---------------------------------------------------------------------------
// Mock publisher (dev/staging)
// ---------------------------------------------------------------------------

function publishMock(args: {
  caption: string;
  imageUrl: string;
  calendarId: string;
}): AdapterPublishSuccess {
  const mockId = `ig_mock_${args.calendarId.replace(/-/g, '').slice(0, 12)}`;
  const permalink = `https://www.instagram.com/p/${mockId}/`;

  console.log('[instagramAdapter] MOCK publish', {
    calendarId: args.calendarId,
    captionPreview: args.caption.slice(0, 200),
    imageUrl: args.imageUrl,
    permalink,
  });

  return {
    publishedUrl: permalink,
    externalPostId: mockId,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The draft body holds the whole strategist output: a "[DRAFT — Pending Review]" line, the caption, and internal
 * sections (A/B hook notes, review notes, checks). Only the caption (with its hashtags) may go public.
 * Throws if internal markers are still present after cutting, so an internal note can never be posted.
 */
export function instagramCaptionFromBody(raw: string): string {
  let text = raw.replace(/\[DRAFT\s*[—-]\s*Pending Review\]\s*This has not been published\.?/gi, '');
  text = text.replace(/\*\*Caption\*\*/i, '');
  const internal = text.search(/\*\*\s*(A\/B|Notes for review|Checks|Scheduling|Product truth)/i);
  if (internal >= 0) text = text.slice(0, internal);
  text = text.replace(/\*\*/g, '').trim();
  if (/\[DRAFT|Notes for review|Pending Review|A\/B hook/i.test(text)) {
    throw new Error('Caption still contains internal draft notes; not publishing.');
  }
  if (!text) throw new Error('Caption is empty; not publishing.');
  return text;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

export default { publishInstagramPost };

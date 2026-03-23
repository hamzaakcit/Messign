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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const META_ACCESS_TOKEN = process.env.META_GRAPH_ACCESS_TOKEN ?? '';
const INSTAGRAM_BUSINESS_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? '';
const META_GRAPH_API_VERSION = 'v19.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

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
  const caption = stripHtml(input.content.body ?? input.content.body_html ?? '');
  const imageUrl = input.content.image_url ?? null;

  if (!imageUrl?.trim()) {
    console.warn('[PUB] Skipping Instagram publish — no image_url (generate in cockpit or set image_url)');
    return { skipped: true, publishedUrl: undefined, externalPostId: undefined };
  }

  // ── Production path: Meta Graph API ─────────────────────────────
  if (META_ACCESS_TOKEN && INSTAGRAM_BUSINESS_ACCOUNT_ID) {
    return publishViaMeta({ caption, imageUrl, calendarId: input.calendar.id });
  }

  // ── Dev/staging path: structured mock ───────────────────────────
  return publishMock({ caption, imageUrl, calendarId: input.calendar.id });
}

// ---------------------------------------------------------------------------
// Meta Graph API implementation
// ---------------------------------------------------------------------------

async function publishViaMeta(args: {
  caption: string;
  imageUrl: string;
  calendarId: string;
}): Promise<AdapterPublishSuccess> {
  // Step 1: Create media container
  const containerUrl = new URL(
    `${META_GRAPH_BASE}/${INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`,
  );
  containerUrl.searchParams.set('image_url', args.imageUrl);
  containerUrl.searchParams.set('caption', args.caption);
  containerUrl.searchParams.set('access_token', META_ACCESS_TOKEN);

  const containerRes = await fetch(containerUrl.toString(), { method: 'POST', signal: AbortSignal.timeout(30_000) });
  if (!containerRes.ok) {
    const err = await containerRes.text().catch(() => 'unknown');
    throw new Error(`Meta container creation failed (${containerRes.status}): ${err}`);
  }
  const container = (await containerRes.json()) as MetaContainerResponse;

  // Step 2: Wait for container processing (Meta needs time for image processing)
  await waitForContainerReady(container.id);

  // Step 3: Publish the container
  const publishUrl = new URL(
    `${META_GRAPH_BASE}/${INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish`,
  );
  publishUrl.searchParams.set('creation_id', container.id);
  publishUrl.searchParams.set('access_token', META_ACCESS_TOKEN);

  const publishRes = await fetch(publishUrl.toString(), { method: 'POST', signal: AbortSignal.timeout(30_000) });
  if (!publishRes.ok) {
    const err = await publishRes.text().catch(() => 'unknown');
    throw new Error(`Meta publish failed (${publishRes.status}): ${err}`);
  }
  const published = (await publishRes.json()) as MetaPublishResponse;

  // Step 4: Fetch permalink
  const permalink = await fetchPermalink(published.id);

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

async function waitForContainerReady(containerId: string, maxWaitMs = 30_000): Promise<void> {
  const start = Date.now();
  const pollInterval = 2000;

  while (Date.now() - start < maxWaitMs) {
    const statusUrl = new URL(`${META_GRAPH_BASE}/${containerId}`);
    statusUrl.searchParams.set('fields', 'status_code');
    statusUrl.searchParams.set('access_token', META_ACCESS_TOKEN);

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

async function fetchPermalink(mediaId: string): Promise<string> {
  const url = new URL(`${META_GRAPH_BASE}/${mediaId}`);
  url.searchParams.set('fields', 'permalink');
  url.searchParams.set('access_token', META_ACCESS_TOKEN);

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

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

export default { publishInstagramPost };

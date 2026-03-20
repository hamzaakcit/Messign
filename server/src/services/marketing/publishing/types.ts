/**
 * Shared types for marketing channel adapters and the publisher router.
 */

export interface CalendarRecordForPublish {
  id: string;
  workspace_id: string;
  content_id: string;
  campaign_id: string | null;
  scheduled_at: string;
  channel: string;
  status: string;
}

export interface ContentPayloadForPublish {
  title: string;
  body: string | null;
  body_html: string | null;
  content_type: string;
  channel: string | null;
  /** Required for Instagram feed posts (Graph API container flow). */
  image_url?: string | null;
  image_prompt?: string | null;
  visual_description?: string | null;
}

/** Normalized adapter output — router persists URL + external id to calendar row */
export interface AdapterPublishSuccess {
  publishedUrl?: string;
  externalPostId?: string;
}

/** Thrown by adapters to signal HTTP-like semantics for retry policy */
export class AdapterHttpError extends Error {
  readonly statusCode: number;

  readonly bodySnippet?: string;

  constructor(message: string, statusCode: number, bodySnippet?: string) {
    super(message);
    this.name = 'AdapterHttpError';
    this.statusCode = statusCode;
    this.bodySnippet = bodySnippet;
  }

  get isTransient(): boolean {
    return this.statusCode === 429 || this.statusCode === 503 || this.statusCode === 502;
  }

  get isHard(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500 && !this.isTransient;
  }
}

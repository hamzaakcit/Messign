/**
 * Types for POST /content/:id/resolve-email-images (aligned with server Phase 1 response).
 */

export type EmailImageSlotStatus =
  | 'stock'
  | 'generated'
  | 'stock_fallback'
  | 'unsplash_fallback'
  | 'timeout'
  | 'skipped';

export interface EmailImageSlotResult {
  status: EmailImageSlotStatus;
  error?: string;
}

/** Present when server runs with dev/debug (see EMAIL_RESOLVE_DEBUG) — prompts sent to image generation. */
export interface EmailResolveDebugPayload {
  campaignPrefix?: string;
  effectivePromptBySection?: Record<number, string>;
  effectivePromptByItem?: Record<string, string>;
}

export interface ResolveEmailImagesResponse {
  images: Record<number, string>;
  itemImages?: Record<string, string>;
  errors: string[];
  resolveRunId?: string;
  sectionResults?: Record<number, EmailImageSlotResult>;
  itemResults?: Record<string, EmailImageSlotResult>;
  partial?: boolean;
  idempotencyKey?: string;
  idempotencyReplayed?: boolean;
  debug?: EmailResolveDebugPayload;
}

/** POST resolve-email-images `body.regenerate` — regenerate slots that already have `imageUrl`. */
export interface EmailResolveRegeneratePayload {
  force_all?: boolean;
  regenerate_section_orders?: number[];
  regenerate_item_keys?: string[];
  section_prompt_overrides?: Record<string, string>;
  item_prompt_overrides?: Record<string, string>;
}

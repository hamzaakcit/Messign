/**
 * Assembles user messages for Lucy Marketing channel modals (structured prompts, same agent as composer prefill).
 */

export type MarketingChannelAgentModalId = 'linkedin' | 'x' | 'blog' | 'ads' | 'email' | 'metrics';

export const MARKETING_CHANNEL_AGENT_MODAL_TITLES: Record<MarketingChannelAgentModalId, string> = {
  linkedin: 'LinkedIn post',
  x: 'X (Twitter) post',
  blog: 'Blog outline',
  ads: 'Ad copy',
  email: 'Email (VA2 brief)',
  metrics: 'Metrics analysis',
};

const MIN_TOPIC = 2;
const MIN_METRICS_FOCUS = 8;
const MIN_EMAIL_FIELD = 4;

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

export interface LinkedInAgentFormValues {
  topic: string;
  audience: string;
  tone: string;
}

export function validateLinkedInAgentForm(
  v: LinkedInAgentFormValues,
): Partial<Record<keyof LinkedInAgentFormValues, string>> {
  const errors: Partial<Record<keyof LinkedInAgentFormValues, string>> = {};
  if (!v.topic?.trim() || v.topic.trim().length < MIN_TOPIC) {
    errors.topic = `Topic is required (at least ${MIN_TOPIC} characters)`;
  }
  return errors;
}

export function buildLinkedInAgentMessage(v: LinkedInAgentFormValues): string {
  const topic = v.topic.trim();
  const audience = v.audience?.trim();
  const tone = v.tone?.trim();
  let msg = `Draft a short LinkedIn post (under 220 words) about ${topic}`;
  if (audience) msg += ` for audience: ${audience}`;
  msg += '. Strong hook in line 1–2, 2–3 short paragraphs, 0–2 emoji max, one clear CTA. No fluff.';
  if (tone) msg += ` Tone preference: ${tone}.`;
  return msg;
}

// ---------------------------------------------------------------------------
// X (Twitter)
// ---------------------------------------------------------------------------

export interface XAgentFormValues {
  topic: string;
  tone: string;
}

export function validateXAgentForm(v: XAgentFormValues): Partial<Record<keyof XAgentFormValues, string>> {
  const errors: Partial<Record<keyof XAgentFormValues, string>> = {};
  if (!v.topic?.trim() || v.topic.trim().length < MIN_TOPIC) {
    errors.topic = `Topic is required (at least ${MIN_TOPIC} characters)`;
  }
  return errors;
}

export function buildXAgentMessage(v: XAgentFormValues): string {
  const topic = v.topic.trim();
  const tone = v.tone?.trim();
  let msg = `Draft one X post about ${topic} (under 260 characters), plain language, one hook + one CTA or question. Say it is for X/Twitter.`;
  if (tone) msg += ` Tone: ${tone}.`;
  return msg;
}

// ---------------------------------------------------------------------------
// Blog
// ---------------------------------------------------------------------------

export interface BlogAgentFormValues {
  topic: string;
  angle: string;
}

export function validateBlogAgentForm(v: BlogAgentFormValues): Partial<Record<keyof BlogAgentFormValues, string>> {
  const errors: Partial<Record<keyof BlogAgentFormValues, string>> = {};
  if (!v.topic?.trim() || v.topic.trim().length < MIN_TOPIC) {
    errors.topic = `Topic is required (at least ${MIN_TOPIC} characters)`;
  }
  return errors;
}

export function buildBlogAgentMessage(v: BlogAgentFormValues): string {
  const topic = v.topic.trim();
  const angle = v.angle?.trim();
  let msg = `Outline a short blog post about ${topic}: title, 5–7 bullet outline, and a 2–3 sentence excerpt only—keep the full article out unless I ask.`;
  if (angle) msg += ` Angle / positioning: ${angle}.`;
  return msg;
}

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------

export interface AdsAgentFormValues {
  productTopic: string;
  goal: string;
  platform: string;
}

export function validateAdsAgentForm(v: AdsAgentFormValues): Partial<Record<keyof AdsAgentFormValues, string>> {
  const errors: Partial<Record<keyof AdsAgentFormValues, string>> = {};
  if (!v.productTopic?.trim() || v.productTopic.trim().length < MIN_TOPIC) {
    errors.productTopic = `Product or topic is required (at least ${MIN_TOPIC} characters)`;
  }
  return errors;
}

export function buildAdsAgentMessage(v: AdsAgentFormValues): string {
  const product = v.productTopic.trim();
  const goal = v.goal?.trim();
  const platform = v.platform?.trim();
  let msg = `Draft tight ad copy variants (headline + primary text + CTA) for ${product}, channel-agnostic, under 120 words total.`;
  if (goal) msg += ` Campaign goal: ${goal}.`;
  if (platform) msg += ` Preferred placement if relevant: ${platform}.`;
  return msg;
}

// ---------------------------------------------------------------------------
// Email (VA2)
// ---------------------------------------------------------------------------

export interface EmailVa2AgentFormValues {
  audience: string;
  offer: string;
  notes: string;
}

export function validateEmailVa2AgentForm(
  v: EmailVa2AgentFormValues,
): Partial<Record<keyof EmailVa2AgentFormValues, string>> {
  const errors: Partial<Record<keyof EmailVa2AgentFormValues, string>> = {};
  if (!v.audience?.trim() || v.audience.trim().length < MIN_EMAIL_FIELD) {
    errors.audience = `Audience is required (at least ${MIN_EMAIL_FIELD} characters)`;
  }
  if (!v.offer?.trim() || v.offer.trim().length < MIN_EMAIL_FIELD) {
    errors.offer = `Offer / topic is required (at least ${MIN_EMAIL_FIELD} characters)`;
  }
  return errors;
}

export function buildEmailVa2AgentMessage(v: EmailVa2AgentFormValues): string {
  const audience = v.audience.trim();
  const offer = v.offer.trim();
  const notes = v.notes?.trim();
  const parts = [
    'Channel: email. Output a Visual Architect v2 Design Manifest as JSON in ```json``` fences for Messign\'s email builder.',
    `Audience: ${audience}. Offer / campaign: ${offer}.`,
    'Include hero, at least one image_text, footer. Keep subject and all copy on my topic — do not substitute Messign product pitching unless I asked for it.',
    'If I want the animated paper-plane sweep in the builder, set "motionOverlay": "paper_plane_sweep" (or legacy "easterEgg": "paper_plane").',
  ];
  if (notes) parts.splice(2, 0, `Additional notes: ${notes}`);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface MetricsAgentFormValues {
  focus: string;
}

export function validateMetricsAgentForm(
  v: MetricsAgentFormValues,
): Partial<Record<keyof MetricsAgentFormValues, string>> {
  const errors: Partial<Record<keyof MetricsAgentFormValues, string>> = {};
  if (!v.focus?.trim() || v.focus.trim().length < MIN_METRICS_FOCUS) {
    errors.focus = `Describe what to analyze (at least ${MIN_METRICS_FOCUS} characters)`;
  }
  return errors;
}

export function buildMetricsAgentMessage(v: MetricsAgentFormValues): string {
  const focus = v.focus.trim();
  return `Summarize our latest campaign performance and ROI in bullets: headline insight, 3–5 bullets with numbers only from data, one next step. User focus: ${focus}`;
}

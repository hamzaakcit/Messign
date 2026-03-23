/**
 * Groq/OpenAI tool schemas validate enum values strictly; models often emit channel labels
 * (e.g. "x", "twitter") instead of our canonical source_type. Normalize before Zod + handlers.
 */
export const CANONICAL_REPURPOSE_SOURCE_TYPES = [
  'blog_post',
  'social_post',
  'email',
  'landing_page',
  'webinar_transcript',
  'product_update',
] as const;

export type CanonicalRepurposeSourceType = (typeof CANONICAL_REPURPOSE_SOURCE_TYPES)[number];

export function normalizeRepurposeSourceType(raw: unknown): CanonicalRepurposeSourceType {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
    return 'email';
  }
  if (typeof raw !== 'string') {
    return 'email';
  }
  const t = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((CANONICAL_REPURPOSE_SOURCE_TYPES as readonly string[]).includes(t)) {
    return t as CanonicalRepurposeSourceType;
  }
  const aliases: Record<string, CanonicalRepurposeSourceType> = {
    x: 'social_post',
    twitter: 'social_post',
    twitter_thread: 'social_post',
    linkedin: 'social_post',
    instagram: 'social_post',
    facebook: 'social_post',
    tiktok: 'social_post',
    threads: 'social_post',
    social_media: 'social_post',
    social: 'social_post',
    short_form: 'social_post',
    short_form_post: 'social_post',
    article: 'blog_post',
    blog: 'blog_post',
    medium_post: 'blog_post',
    medium: 'blog_post',
    newsletter: 'email',
    newsletter_email: 'email',
    mail: 'email',
    website: 'landing_page',
    web_page: 'landing_page',
    landing: 'landing_page',
    lp: 'landing_page',
    page: 'landing_page',
    site: 'landing_page',
    webinar: 'webinar_transcript',
    recording: 'webinar_transcript',
    transcript: 'webinar_transcript',
    changelog: 'product_update',
    release_notes: 'product_update',
    product_announcement: 'product_update',
    feature_update: 'product_update',
  };
  const mapped = aliases[t];
  if (mapped) return mapped;
  if (t === 'x' || t.includes('twitter') || t.includes('linkedin') || t.includes('instagram')) {
    return 'social_post';
  }
  if (t.includes('social') || t.includes('tiktok') || t.includes('threads')) return 'social_post';
  if (t.includes('blog') || t.includes('article')) return 'blog_post';
  if (t.includes('email') || t.includes('mail') || t.includes('newsletter')) return 'email';
  if (t.includes('landing') || (t.includes('page') && !t.includes('blog'))) return 'landing_page';
  if (t.includes('webinar') || t.includes('transcript')) return 'webinar_transcript';
  if (t.includes('changelog') || t.includes('release') || t.includes('product')) return 'product_update';
  return 'social_post';
}

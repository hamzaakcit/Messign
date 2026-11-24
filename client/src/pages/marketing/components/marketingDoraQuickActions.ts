/**
 * Lucy's composer templates: email only. Instagram goes through the New offer page; LinkedIn, X, blog, ads and
 * metrics are frozen channels (ADR-001) and have no template.
 */

export type MarketingComposerIconKey =
  | 'linkedin'
  | 'mail'
  | 'x'
  | 'blog'
  | 'ads'
  | 'metrics';

export interface MarketingComposerQuickAction {
  id: string;
  label: string;
  /** Prefills the chat composer */
  text: string;
  /** Tailwind gradient + border classes (non-Instagram / non-Email upgraded set uses stronger blues/purples) */
  accent: string;
  icon: MarketingComposerIconKey;
  /** When true, use slightly stronger styling in the rail (LinkedIn, X, blog, ads, metrics — not Email/Instagram) */
  upgraded?: boolean;
  /** Hover / accessible description of what gets prefilled */
  hint: string;
}

/** Instagram goes through the New offer page; not included here. */
export const MARKETING_COMPOSER_QUICK_ACTIONS: MarketingComposerQuickAction[] = [
  {
    id: 'email',
    label: 'Email',
    icon: 'mail',
    accent: 'from-emerald-500/25 to-teal-600/15 border-emerald-500/20',
    hint: 'VA2 email design manifest JSON for the Unlayer builder — replace bracketed campaign details, then send.',
    text:
      'Channel: email. Output a Visual Architect v2 Design Manifest as JSON in ```json``` fences for Messign\'s email builder. My campaign/topic: [describe audience + offer]. Include hero, at least one image_text, footer. Keep subject and all copy on my topic — do not substitute Messign product pitching unless I asked for it. If I want the animated paper-plane sweep in the builder, set "motionOverlay": "paper_plane_sweep" (or legacy "easterEgg": "paper_plane").',
  },
  {
    id: 'email_newsletter_depth',
    label: 'Email · Newsletter depth',
    icon: 'mail',
    accent: 'from-emerald-500/22 to-cyan-700/14 border-emerald-500/18',
    hint: 'VA2 manifest tuned for B2B SaaS–style newsletter depth (image_text alternation, value_prop).',
    text:
      'Channel: email. Output Visual Architect v2 Design Manifest JSON in ```json``` fences. Goal: **newsletter depth** like a pro template gallery — executive or tech theme, airy layoutDensity, hero + **two or more** image_text rows alternating image_left / image_right, value_prop or social_proof before footer, distinct imagePrompt per slot. Topic: [your digest focus]. metadata.visual_density rich, target_image_slots 6 unless I say otherwise.',
  },
  {
    id: 'email_flash_grid',
    label: 'Email · Flash grid',
    icon: 'mail',
    accent: 'from-amber-500/22 to-rose-700/14 border-amber-500/20',
    hint: 'Promo email with product_grid waves + urgency CTA.',
    text:
      'Channel: email. Output VA2 Design Manifest JSON in ```json``` fences. Goal: **flash sale / dual product_grid** — hero + product_grid wave + divider + second product_grid or image_text + social_proof metrics + CTA with urgencyText. Topic: [offer + deadline]. warm or luxury theme, layoutDensity compact or airy, metadata.visual_density rich, distinct imagePrompt per SKU.',
  },
  {
    id: 'email_event_invite',
    label: 'Email · Event invite',
    icon: 'mail',
    accent: 'from-violet-500/22 to-indigo-800/14 border-violet-400/25',
    hint: 'Webinar or event with date/time, agenda value_prop, registration CTA.',
    text:
      'Channel: email. Output VA2 Design Manifest JSON in ```json``` fences. Goal: **event invitation** — subject/preheader with date, time, timezone; hero (split optional) → value_prop agenda or text_block → image_text (speaker/venue) → CTA registration URL → footer. Topic: [event name + audience]. engage category tone, metadata.target_image_slots 6.',
  },
];

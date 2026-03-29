/**
 * Shared composer templates for Lucy Marketing (rail + drawer).
 * Instagram stays on its own modal; structured modals use marketingChannelAgentBuilders.
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

/** Instagram uses {@link InstagramAgentPromptModal}; not included here. */
export const MARKETING_COMPOSER_QUICK_ACTIONS: MarketingComposerQuickAction[] = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: 'linkedin',
    upgraded: true,
    accent:
      'from-blue-500/30 to-indigo-600/20 border-blue-400/35 shadow-sm shadow-blue-500/10',
    hint: 'Prefills a LinkedIn post template (hook, short paragraphs, CTA). Edit [topic] then send.',
    text:
      'Draft a short LinkedIn post (under 220 words) about [topic]: strong hook in line 1–2, 2–3 short paragraphs, 0–2 emoji max, one clear CTA. No fluff.',
  },
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
  {
    id: 'x',
    label: 'X',
    icon: 'x',
    upgraded: true,
    accent: 'from-slate-600/35 to-zinc-800/25 border-slate-400/30 shadow-sm shadow-slate-500/10',
    hint: 'Prefills an X/Twitter-length post template (under 260 characters).',
    text:
      'Draft one X post about [topic] (under 260 characters), plain language, one hook + one CTA or question. Say it is for X/Twitter.',
  },
  {
    id: 'blog',
    label: 'Blog',
    icon: 'blog',
    upgraded: true,
    accent: 'from-violet-500/28 to-purple-700/18 border-violet-400/30 shadow-sm shadow-violet-500/10',
    hint: 'Outline + excerpt template for a blog post; expand in composer if needed.',
    text:
      'Outline a short blog post about [topic]: title, 5–7 bullet outline, and a 2–3 sentence excerpt only—keep the full article out unless I ask.',
  },
  {
    id: 'ads',
    label: 'Ads',
    icon: 'ads',
    upgraded: true,
    accent: 'from-amber-500/25 to-orange-700/18 border-amber-400/28 shadow-sm shadow-amber-500/10',
    hint: 'Headline + primary text + CTA variants for paid social or display-style copy.',
    text:
      'Draft tight ad copy variants (headline + primary text + CTA) for [product/topic], channel-agnostic, under 120 words total.',
  },
  {
    id: 'metrics',
    label: 'Metrics',
    icon: 'metrics',
    upgraded: true,
    accent: 'from-cyan-500/22 to-sky-800/20 border-cyan-400/28 shadow-sm shadow-cyan-500/10',
    hint: 'Asks Lucy to summarize campaign performance and ROI from your data in bullets.',
    text:
      'Summarize our latest campaign performance and ROI in bullets: headline insight, 3–5 bullets with numbers only from data, one next step.',
  },
];

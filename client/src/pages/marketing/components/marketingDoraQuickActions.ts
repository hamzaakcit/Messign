/**
 * Lucy's composer tiles: one Email tile. Newsletter, flash sale and event invite are a Layout choice inside its form,
 * not tiles of their own (they opened the same form). Instagram goes through the New offer page; LinkedIn, X, blog,
 * ads and metrics are frozen channels (ADR-001) and have no tile.
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
    hint: 'Describe the audience and the offer, pick a layout, and Lucy drafts the email design.',
    text:
      'Channel: email. Output a Visual Architect v2 Design Manifest as JSON in ```json``` fences for Messign\'s email builder. My campaign/topic: [describe audience + offer]. Include hero, at least one image_text, footer. Keep subject and all copy on my topic — do not substitute Messign product pitching unless I asked for it. If I want the animated paper-plane sweep in the builder, set "motionOverlay": "paper_plane_sweep" (or legacy "easterEgg": "paper_plane").',
  },
];

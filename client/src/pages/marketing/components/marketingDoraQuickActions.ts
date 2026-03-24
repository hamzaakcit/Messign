/**
 * Shared composer templates for Marketing Dora (rail + drawer).
 * Instagram stays on its own modal; Email templates stay concise per product preference.
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
    text:
      'Draft a short LinkedIn post (under 220 words) about [topic]: strong hook in line 1–2, 2–3 short paragraphs, 0–2 emoji max, one clear CTA. No fluff.',
  },
  {
    id: 'email',
    label: 'Email',
    icon: 'mail',
    accent: 'from-emerald-500/25 to-teal-600/15 border-emerald-500/20',
    text:
      'Draft a concise marketing email: subject (~55 chars), one-sentence preheader, body under 180 words with a single primary CTA.',
  },
  {
    id: 'x',
    label: 'X',
    icon: 'x',
    upgraded: true,
    accent: 'from-slate-600/35 to-zinc-800/25 border-slate-400/30 shadow-sm shadow-slate-500/10',
    text:
      'Draft one X post about [topic] (under 260 characters), plain language, one hook + one CTA or question. Say it is for X/Twitter.',
  },
  {
    id: 'blog',
    label: 'Blog',
    icon: 'blog',
    upgraded: true,
    accent: 'from-violet-500/28 to-purple-700/18 border-violet-400/30 shadow-sm shadow-violet-500/10',
    text:
      'Outline a short blog post about [topic]: title, 5–7 bullet outline, and a 2–3 sentence excerpt only—keep the full article out unless I ask.',
  },
  {
    id: 'ads',
    label: 'Ads',
    icon: 'ads',
    upgraded: true,
    accent: 'from-amber-500/25 to-orange-700/18 border-amber-400/28 shadow-sm shadow-amber-500/10',
    text:
      'Draft tight ad copy variants (headline + primary text + CTA) for [product/topic], channel-agnostic, under 120 words total.',
  },
  {
    id: 'metrics',
    label: 'Metrics',
    icon: 'metrics',
    upgraded: true,
    accent: 'from-cyan-500/22 to-sky-800/20 border-cyan-400/28 shadow-sm shadow-cyan-500/10',
    text:
      'Summarize our latest campaign performance and ROI in bullets: headline insight, 3–5 bullets with numbers only from data, one next step.',
  },
];

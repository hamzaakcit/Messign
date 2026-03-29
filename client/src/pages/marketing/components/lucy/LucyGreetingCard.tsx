import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { lucyTokens } from '../../lib/lucyVisualTokens';
import { LUCY_UI_GREETING } from '../../lib/lucyUiGreeting';
import { LucyHeroLogo } from './LucyHeroLogo';

export interface LucyGreetingChip {
  label: string;
  /** Prefills composer or sends when user picks a chip */
  text: string;
}

const DEFAULT_CHIPS: LucyGreetingChip[] = [
  {
    label: 'Draft a campaign',
    text:
      'Draft a campaign brief: objective, audience, channel mix, timeline, success metrics, and budget range (or allocation %).',
  },
  {
    label: 'Write a post',
    text:
      'Draft a short LinkedIn post (under 220 words) about [topic]: strong hook in line 1–2, 2–3 short paragraphs, 0–2 emoji max, one clear CTA. No fluff.',
  },
  {
    label: 'Analyze metrics',
    text:
      'Summarize our latest campaign performance and ROI in bullets: headline insight, 3–5 bullets with numbers only from data, one next step.',
  },
  {
    label: 'Email sequence',
    text:
      'Draft a concise marketing email: subject (~55 chars), one-sentence preheader, body under 180 words with a single primary CTA.',
  },
];

const CHIP_CLASS = cn(
  'dp-font text-xs font-semibold rounded-full px-3.5 py-2 cursor-pointer transition-all duration-200',
  'border border-violet-500/25 bg-gradient-to-b from-violet-950/50 to-slate-950/80 text-violet-100/95',
  'shadow-sm shadow-black/25 ring-1 ring-violet-500/10 hover:brightness-110 hover:border-violet-400/35',
);

export interface LucyGreetingCardProps {
  chips?: LucyGreetingChip[];
  onChipSelect?: (text: string) => void;
  heroSize?: number;
  /** Use full width of the parent (e.g. marketing home split column). */
  wide?: boolean;
}

/**
 * Marketing empty-state card with Lucy hero and optional quick chips.
 */
export function LucyGreetingCard({
  chips = DEFAULT_CHIPS,
  onChipSelect,
  heroSize = 180,
  wide = false,
}: LucyGreetingCardProps): JSX.Element {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        maxWidth: wide ? '100%' : 520,
        margin: '0 auto',
        padding: 24,
        borderRadius: 24,
        background: 'linear-gradient(145deg, rgba(15,23,42,0.85) 0%, rgba(2,6,23,0.92) 100%)',
        border: '1px solid rgba(124,58,237,0.14)',
        backdropFilter: 'blur(20px)',
        textAlign: 'center',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(16px)',
        transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4), 0 0 60px rgba(124,58,237,0.08)',
      }}
    >
      <LucyHeroLogo size={heroSize} />

      <div style={{ marginTop: 20 }}>
        <p
          className="dp-font"
          style={{
            fontSize: 12,
            color: lucyTokens.colors.textSecondary,
            lineHeight: 1.45,
            margin: '0 0 8px',
          }}
        >
          {LUCY_UI_GREETING.subheadline}
        </p>
        <p
          className="dp-font"
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: lucyTokens.colors.textPrimary,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {LUCY_UI_GREETING.message}
        </p>
      </div>

      {onChipSelect && (
        <div className="flex flex-wrap gap-2 justify-center mt-6">
          {chips.map((c) => (
            <button key={c.label} type="button" className={CHIP_CLASS} onClick={() => onChipSelect(c.text)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

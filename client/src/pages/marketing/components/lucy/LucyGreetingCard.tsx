import { useEffect, useState } from 'react';
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

export interface LucyGreetingCardProps {
  chips?: LucyGreetingChip[];
  onChipSelect?: (text: string) => void;
  heroSize?: number;
}

/**
 * Marketing empty-state card with Lucy hero and optional quick chips.
 */
export function LucyGreetingCard({
  chips = DEFAULT_CHIPS,
  onChipSelect,
  heroSize = 180,
}: LucyGreetingCardProps): JSX.Element {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        maxWidth: 520,
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
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              className="dp-font"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#A855F7',
                background: 'rgba(124,58,237,0.08)',
                border: '1px solid rgba(124,58,237,0.2)',
                borderRadius: 20,
                padding: '6px 14px',
                cursor: 'pointer',
                transition: 'all 0.25s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(124,58,237,0.16)';
                e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(124,58,237,0.08)';
                e.currentTarget.style.borderColor = 'rgba(124,58,237,0.2)';
              }}
              onClick={() => onChipSelect(c.text)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

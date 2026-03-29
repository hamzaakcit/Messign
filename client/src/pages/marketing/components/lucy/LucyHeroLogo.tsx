import { useEffect, useState } from 'react';
import { lucyTokens } from '../../lib/lucyVisualTokens';
import { LucyPilotSVG } from './LucyPilotSVG';

export interface LucyHeroLogoProps {
  size?: number;
}

/**
 * Primary Lucy mark: Lucy v2 pilot (wild hair, purple) in a glass panel with wordmark.
 */
export function LucyHeroLogo({ size = 280 }: LucyHeroLogoProps): JSX.Element {
  const titleSize = Math.min(36, Math.max(16, size * 0.13));
  const tagSize = Math.min(13, Math.max(10, size * 0.045));
  const pilotPx = Math.round(Math.min(size * 0.52, size - 32));
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: -20,
            background: lucyTokens.gradients.lucyGlow,
            opacity: hovered ? 0.85 : 0.45,
            transition: 'opacity 0.5s ease',
            borderRadius: '50%',
            filter: 'blur(30px)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 32,
            background: 'linear-gradient(145deg, rgba(15,23,42,0.9) 0%, rgba(2,6,23,0.95) 100%)',
            border: `1px solid ${hovered ? lucyTokens.colors.borderHover : lucyTokens.colors.border}`,
            backdropFilter: 'blur(20px)',
            transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
            boxShadow: hovered
              ? '0 0 40px rgba(124,58,237,0.18), inset 0 1px 0 rgba(255,255,255,0.05)'
              : '0 0 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            filter: hovered ? 'drop-shadow(0 0 14px rgba(168,85,247,0.45))' : 'none',
            transition: 'filter 0.4s ease, transform 0.4s ease',
            transform: hovered ? 'scale(1.04)' : 'scale(1)',
          }}
        >
          <LucyPilotSVG size={pilotPx} title="Lucy — your CMO" />
        </div>

        {hovered && (
          <div
            style={{
              position: 'absolute',
              inset: -4,
              borderRadius: 36,
              border: '2px solid rgba(124,58,237,0.28)',
              animation: 'lucy-pulse-ring 1.5s ease-out infinite',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      <div style={{ textAlign: 'center' }}>
        <h1
          className="dp-font"
          style={{
            fontSize: titleSize,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            background: lucyTokens.gradients.text,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Lucy
        </h1>
        <p
          className="dp-font"
          style={{
            fontSize: tagSize,
            fontWeight: 500,
            color: lucyTokens.colors.textSecondary,
            margin: '4px 0 0',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Your CMO
        </p>
      </div>
    </div>
  );
}

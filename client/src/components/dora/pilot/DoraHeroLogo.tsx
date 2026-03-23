import { useState } from 'react';
import { PilotPlaneSVG } from './PilotPlaneSVG';

interface DoraHeroLogoProps {
  size?: number;
  showLabel?: boolean;
}

export function DoraHeroLogo({ size = 140, showLabel = true }: DoraHeroLogoProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        cursor: 'default',
        userSelect: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * 1.8,
          height: size * 1.4,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(59,130,246,0.15) 0%, rgba(139,92,246,0.08) 40%, transparent 70%)',
          filter: 'blur(20px)',
          transition: 'all 0.6s ease',
          opacity: hovered ? 1 : 0.6,
          pointerEvents: 'none',
        }} />

        {hovered && [0, 1, 2].map(i => (
          <div key={i} style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: size * 0.6,
            height: size * 0.6,
            borderRadius: '50%',
            border: '1px solid rgba(59,130,246,0.2)',
            transform: 'translate(-50%, -50%)',
            animation: `dp-ring-expand 2s ease-out infinite ${i * 0.6}s`,
            pointerEvents: 'none',
          }} />
        ))}

        <div style={{
          animation: 'dp-breathe 4s ease-in-out infinite',
          transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
          transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <PilotPlaneSVG size={size} showGoggleGlint isActive={hovered} />
        </div>
      </div>

      <div style={{
        width: size * 1.2,
        height: 3,
        borderRadius: 2,
        background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.3), rgba(139,92,246,0.2), transparent)',
        transition: 'opacity 0.3s',
        opacity: hovered ? 1 : 0.4,
      }} />

      {showLabel && (
        <div style={{ textAlign: 'center' }}>
          <div className="dp-font" style={{
            fontSize: 18,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #00D9D5, #3B82F6, #8B5CF6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '0.02em',
          }}>
            Dora
          </div>
          <div className="dp-font" style={{
            fontSize: 11,
            color: '#64748b',
            marginTop: 2,
            letterSpacing: '0.05em',
          }}>
            Your AI Pilot
          </div>
        </div>
      )}
    </div>
  );
}

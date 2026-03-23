import { useState } from 'react';
import { PilotPlaneSVG } from './PilotPlaneSVG';

interface DoraSidebarLogoProps {
  size?: number;
  onClick?: () => void;
}

export function DoraSidebarLogo({ size = 34, onClick }: DoraSidebarLogoProps) {
  const [rolling, setRolling] = useState(false);

  const handleClick = () => {
    if (rolling) return;
    setRolling(true);
    onClick?.();
    setTimeout(() => setRolling(false), 600);
  };

  return (
    <button
      onClick={handleClick}
      style={{
        width: size + 12,
        height: size + 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15,23,42,0.6)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(59,130,246,0.15)',
        borderRadius: 12,
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
        padding: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(59,130,246,0.35)';
        e.currentTarget.style.boxShadow = '0 0 16px rgba(59,130,246,0.2)';
        e.currentTarget.style.transform = 'scale(1.06)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(59,130,246,0.15)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'scale(1)';
      }}
      title="Dora AI — click for a barrel roll!"
    >
      <div style={{
        position: 'absolute',
        inset: -4,
        borderRadius: 14,
        background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        animation: rolling
          ? 'dp-barrel-roll 0.6s cubic-bezier(0.25,0.1,0.25,1) forwards'
          : 'dp-tilt 3s ease-in-out infinite',
      }}>
        <PilotPlaneSVG size={size} showGoggleGlint />
      </div>
    </button>
  );
}

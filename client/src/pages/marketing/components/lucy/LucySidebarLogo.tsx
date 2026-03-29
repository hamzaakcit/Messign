import { useState } from 'react';
import { lucyTokens } from '../../lib/lucyVisualTokens';
import { LucyPilotSVG } from './LucyPilotSVG';

export interface LucySidebarLogoProps {
  collapsed?: boolean;
  onClick?: () => void;
}

/**
 * Compact rail / sidebar Lucy mark (Lucy v2 pilot).
 */
export function LucySidebarLogo({ collapsed = false, onClick }: LucySidebarLogoProps): JSX.Element {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Lucy — your CMO copilot"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 10,
        padding: '6px 8px',
        borderRadius: 12,
        cursor: onClick ? 'pointer' : 'default',
        background: hovered ? 'rgba(124,58,237,0.1)' : 'transparent',
        border: `1px solid ${hovered ? 'rgba(168,85,247,0.25)' : 'transparent'}`,
        transition: 'all 0.3s ease',
      }}
    >
      <LucyPilotSVG size={22} />

      {!collapsed && (
        <span
          className="dp-font"
          style={{
            fontSize: 13,
            fontWeight: 700,
            background: lucyTokens.gradients.text,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Lucy
        </span>
      )}
    </div>
  );
}

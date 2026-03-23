import { useId } from 'react';

interface PilotPlaneSVGProps {
  size?: number;
  isActive?: boolean;
  showEngineGlow?: boolean;
  showGoggleGlint?: boolean;
  showFace?: boolean;
  hatColor?: string;
  style?: React.CSSProperties;
}

export function PilotPlaneSVG({
  size = 48,
  isActive: _isActive = false,
  showEngineGlow = false,
  showGoggleGlint = false,
  showFace = false,
  hatColor = '#1e293b',
  style = {},
}: PilotPlaneSVGProps) {
  const uid = useId().replace(/:/g, '_');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      style={{ overflow: 'visible', ...style }}
    >
      <defs>
        <linearGradient id={`pg_${uid}`} x1="8" y1="16" x2="56" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00D9D5" />
          <stop offset="0.5" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id={`pgd_${uid}`} x1="8" y1="16" x2="56" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0891b2" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id={`hat_${uid}`} x1="20" y1="8" x2="38" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor={hatColor} />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id={`lens_${uid}`} x1="28" y1="16" x2="38" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#06b6d4" stopOpacity="0.8" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.6" />
        </linearGradient>
        <radialGradient id={`eng_${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop stopColor="#00D9D5" stopOpacity="0.9" />
          <stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {showEngineGlow && (
        <g>
          <circle cx="12" cy="30" r="3" fill={`url(#eng_${uid})`}
            style={{ animation: 'dp-engine-glow 0.8s ease-in-out infinite' }} />
          <circle cx="10" cy="34" r="2.5" fill={`url(#eng_${uid})`}
            style={{ animation: 'dp-engine-glow 0.8s ease-in-out infinite 0.2s' }} />
        </g>
      )}

      {/* Plane body */}
      <path d="M10 32L52 14L44 32L52 50L10 32Z" fill={`url(#pg_${uid})`} />
      <path d="M10 32L44 32" stroke={`url(#pgd_${uid})`} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 31L50 15L43 31" fill="rgba(255,255,255,0.25)" />
      <path d="M12 33L43 33L50 49" fill="rgba(0,0,0,0.1)" />
      <path d="M28 26L44 32" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
      <path d="M28 38L44 32" stroke="rgba(0,0,0,0.08)" strokeWidth="0.8" />

      {/* Aviator hat */}
      <g>
        <ellipse cx="30" cy="18" rx="11" ry="7" fill={`url(#hat_${uid})`} />
        <path d="M19 19Q22 22 30 22Q38 22 41 19" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M24 13Q30 10 36 13" stroke="#475569" strokeWidth="0.8" fill="none" />
        <path d="M20 19L17 24Q18 26 20 25L21 21" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
        <path d="M40 19L43 24Q42 26 40 25L39 21" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
      </g>

      {/* Goggles */}
      <g>
        <path d="M21 20Q30 23 39 20" stroke="#64748b" strokeWidth="1.5" fill="none" />
        <ellipse cx="26" cy="21" rx="4.5" ry="3.5" fill="none" stroke="#94a3b8" strokeWidth="1.2" />
        <ellipse cx="35" cy="21" rx="4.5" ry="3.5" fill="none" stroke="#94a3b8" strokeWidth="1.2" />
        <path d="M30 21.5Q30.5 20 31 21.5" stroke="#94a3b8" strokeWidth="0.8" fill="none" />
        <ellipse cx="26" cy="21" rx="3.5" ry="2.5" fill={`url(#lens_${uid})`} />
        <ellipse cx="35" cy="21" rx="3.5" ry="2.5" fill={`url(#lens_${uid})`} />

        {showGoggleGlint && (
          <rect x="33" y="19" width="1.5" height="4" rx="0.75"
            fill="rgba(255,255,255,0.9)"
            style={{ animation: 'dp-glint 4s ease-in-out infinite', transformOrigin: '34px 21px' }}
          />
        )}

        {showFace && (
          <>
            <g style={{ transformOrigin: '26px 21.5px', animation: 'dp-blink 3.5s ease-in-out infinite 1.5s' }}>
              <circle cx="26" cy="21.5" r="1.8" fill="#0f172a" />
              <circle cx="26.7" cy="20.7" r="0.6" fill="white" />
            </g>
            <g style={{ transformOrigin: '35px 21.5px', animation: 'dp-blink 3.5s ease-in-out infinite 1.5s' }}>
              <circle cx="35" cy="21.5" r="1.8" fill="#0f172a" />
              <circle cx="35.7" cy="20.7" r="0.6" fill="white" />
            </g>
            <path d="M28 27Q31 30.5 34 27" stroke="#94a3b8" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            <ellipse cx="23" cy="25.5" rx="2.8" ry="1.5" fill="rgba(236,72,153,0.13)" />
            <ellipse cx="38" cy="25.5" rx="2.8" ry="1.5" fill="rgba(236,72,153,0.13)" />
          </>
        )}
      </g>

      {/* Exhaust ports */}
      <circle cx="12" cy="30" r="1.2" fill="#0f172a" stroke="#334155" strokeWidth="0.5" />
      <circle cx="11" cy="34" r="1" fill="#0f172a" stroke="#334155" strokeWidth="0.5" />
    </svg>
  );
}

import { useId } from 'react';

export type FacePhase = 'hidden' | 'entrance' | 'wink' | 'idle' | 'thinking';

interface DoraPilotFaceProps {
  size?: number;
  phase?: FacePhase;
  style?: React.CSSProperties;
}

export function DoraPilotFace({
  size = 200,
  phase = 'idle',
  style = {},
}: DoraPilotFaceProps) {
  const uid = useId().replace(/:/g, '');

  const isFlying = phase === 'entrance';
  const isThinking = phase === 'thinking';
  const showWink = phase === 'wink';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ overflow: 'visible', ...style }}
    >
      <defs>
        <linearGradient id={`pg${uid}`} x1="10" y1="20" x2="80" y2="75" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00D9D5" />
          <stop offset="0.5" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id={`pgd${uid}`} x1="10" y1="20" x2="80" y2="75" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0891b2" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id={`hat${uid}`} x1="30" y1="12" x2="58" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e293b" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
        <radialGradient id={`lens${uid}`} cx="0.4" cy="0.35" r="0.65">
          <stop stopColor="#67e8f9" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#06b6d4" stopOpacity="0.7" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.5" />
        </radialGradient>
        <radialGradient id={`eng${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop stopColor="#00D9D5" stopOpacity="0.9" />
          <stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`scarf${uid}`} x1="30" y1="42" x2="55" y2="50">
          <stop stopColor="#ef4444" />
          <stop offset="1" stopColor="#dc2626" />
        </linearGradient>
      </defs>

      {/* Engine exhaust */}
      {(isFlying || isThinking) && (
        <g opacity="0.7">
          <circle cx="16" cy="48" fill={`url(#eng${uid})`}
            style={{ animation: 'dp-engine-glow 0.6s ease-in-out infinite' }}>
            <animate attributeName="r" values="2;4;2" dur="0.6s" repeatCount="indefinite" />
          </circle>
          <circle cx="14" cy="53" fill={`url(#eng${uid})`}
            style={{ animation: 'dp-engine-glow 0.6s ease-in-out infinite 0.15s' }}>
            <animate attributeName="r" values="1.5;3;1.5" dur="0.6s" begin="0.15s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {/* Plane body */}
      <path d="M14 50L78 22L65 50L78 78L14 50Z" fill={`url(#pg${uid})`} />
      <path d="M14 50L65 50" stroke={`url(#pgd${uid})`} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M17 49L75 23L63 49" fill="rgba(255,255,255,0.22)" />
      <path d="M17 51L63 51L75 77" fill="rgba(0,0,0,0.08)" />
      <path d="M40 40L65 50" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" />
      <path d="M40 60L65 50" stroke="rgba(0,0,0,0.06)" strokeWidth="0.6" />
      <circle cx="16" cy="48" r="1.8" fill="#0f172a" stroke="#334155" strokeWidth="0.5" />
      <circle cx="15" cy="53" r="1.4" fill="#0f172a" stroke="#334155" strokeWidth="0.4" />

      {/* Aviator scarf */}
      <g>
        <path d="M32 45Q38 48 44 46L46 50Q40 53 33 50Z"
          fill={`url(#scarf${uid})`} opacity="0.85" />
        <path d="M33 50Q28 54 24 52Q22 56 18 55"
          stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"
          style={{
            transformOrigin: '33px 50px',
            animation: isFlying ? 'wind-ruffle 0.4s ease-in-out infinite' : 'wind-ruffle 3s ease-in-out infinite',
          }} />
      </g>

      {/* Aviator hat */}
      <g style={phase === 'entrance' ? {
        animation: 'hat-settle 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards',
        animationDelay: '1.4s',
      } : undefined}>
        <ellipse cx="45" cy="28" rx="16" ry="10" fill={`url(#hat${uid})`} />
        <ellipse cx="43" cy="25" rx="10" ry="5" fill="rgba(255,255,255,0.04)" />
        <path d="M28 30Q33 36 45 36Q57 36 62 30"
          stroke="#475569" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M29 30Q34 35.5 45 35.5Q56 35.5 61 30"
          stroke="#334155" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M36 21Q45 17 54 21" stroke="#475569" strokeWidth="0.6" fill="none" strokeDasharray="2 1.5" />
        <circle cx="45" cy="19" r="1.8" fill="#334155" stroke="#475569" strokeWidth="0.5" />
        <path d="M30 30L25 37Q26 40 29 39L31 34" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
        <path d="M60 30L65 37Q64 40 61 39L59 34" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
        <path d="M29 38Q37 42 45 42" stroke="#475569" strokeWidth="0.5" fill="none" opacity="0.5" />
      </g>

      {/* Goggles / Eyes */}
      <g>
        <path d="M29 32Q45 37 61 32" stroke="#94a3b8" strokeWidth="1.8" fill="none" />

        {/* LEFT EYE */}
        <g>
          <ellipse cx="38" cy="34" rx="7" ry="5.5" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.2" />
          <ellipse cx="38" cy="34" rx="5.5" ry="4" fill={`url(#lens${uid})`}
            style={{
              transformOrigin: '38px 34px',
              animation: 'face-blink 4.5s ease-in-out infinite',
            }} />
          <g style={{
            transformOrigin: '38px 34px',
            animation: 'face-blink 4.5s ease-in-out infinite',
          }}>
            <g style={{ animation: 'pupil-look 6s ease-in-out infinite' }}>
              <circle cx="39" cy="34" r="2.2" fill="#0f172a" />
              <circle cx="39" cy="34" r="1.4" fill="#1e293b" />
              <circle cx="40" cy="33" r="0.7" fill="rgba(255,255,255,0.85)" />
              <circle cx="38" cy="35" r="0.35" fill="rgba(255,255,255,0.4)" />
            </g>
          </g>
          <path d="M32 31Q35 29 41 30" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" fill="none" />
        </g>

        {/* RIGHT EYE */}
        <g>
          <ellipse cx="53" cy="34" rx="7" ry="5.5" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.2" />
          <ellipse cx="53" cy="34" rx="5.5" ry="4" fill={`url(#lens${uid})`}
            style={{
              transformOrigin: '53px 34px',
              animation: showWink
                ? 'wink-right 2s ease-in-out 1'
                : 'face-blink 4.5s ease-in-out infinite 0.05s',
            }} />
          <g style={{
            transformOrigin: '53px 34px',
            animation: showWink
              ? 'wink-right 2s ease-in-out 1'
              : 'face-blink 4.5s ease-in-out infinite 0.05s',
          }}>
            <g style={{ animation: 'pupil-look 6s ease-in-out infinite' }}>
              <circle cx="54" cy="34" r="2.2" fill="#0f172a" />
              <circle cx="54" cy="34" r="1.4" fill="#1e293b" />
              <circle cx="55" cy="33" r="0.7" fill="rgba(255,255,255,0.85)" />
              <circle cx="53" cy="35" r="0.35" fill="rgba(255,255,255,0.4)" />
            </g>
          </g>
          <path d="M47 31Q50 29 56 30" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" fill="none" />

          <rect x="50" y="31" width="2" height="5.5" rx="1"
            fill="rgba(255,255,255,0.8)"
            style={{ animation: 'goggle-glint 5s ease-in-out infinite 2s', transformOrigin: '51px 34px' }}
          />
        </g>

        {/* Nose bridge */}
        <path d="M44 35Q45.5 33 47 35" stroke="#94a3b8" strokeWidth="0.8" fill="none" />
      </g>

      {/* Mouth / Smile */}
      <g style={phase === 'entrance' ? {
        animation: 'smile-appear 2s cubic-bezier(0.16,1,0.3,1) forwards',
      } : { opacity: 1 }}>
        <path d="M40 42Q45 46 51 42"
          stroke="#e2e8f0" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        <ellipse cx="34" cy="40" rx="2.5" ry="1.5" fill="rgba(244,114,182,0.15)" />
        <ellipse cx="57" cy="40" rx="2.5" ry="1.5" fill="rgba(244,114,182,0.15)" />
      </g>
    </svg>
  );
}

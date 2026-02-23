import { useState, useEffect, useId, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   DORA PILOT — The Messign Paper Plane Persona

   Character: A paper plane wearing an aviator hat with goggles.
   The AI that "delivers" answers — a pilot who flies through data.

   4 VARIANTS (each with unique animation):
   ─────────────────────────────────────────
   1. SIDEBAR LOGO     — Tiny, idle tilt-hover. Clicks → quick barrel roll
   2. MAIN PAGE HERO   — Large, breathing glow + hat goggle glint
   3. PROCESSING/THINK — Boomerang flight loop with trail particles
   4. CHAT HEADER      — Small, gentle bob. Thinking → engines glow

   Brand colors: Cyan #00D9D5 → Blue #3B82F6 → Violet #8B5CF6
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
   THE PILOT PLANE SVG — Shared across all variants
   ═══════════════════════════════════════════════════════════════════════════ */

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
            {/* Left eye — pupil + gleam with blink */}
            <g style={{ transformOrigin: '26px 21.5px', animation: 'dp-blink 3.5s ease-in-out infinite 1.5s' }}>
              <circle cx="26" cy="21.5" r="1.8" fill="#0f172a" />
              <circle cx="26.7" cy="20.7" r="0.6" fill="white" />
            </g>
            {/* Right eye — pupil + gleam with blink */}
            <g style={{ transformOrigin: '35px 21.5px', animation: 'dp-blink 3.5s ease-in-out infinite 1.5s' }}>
              <circle cx="35" cy="21.5" r="1.8" fill="#0f172a" />
              <circle cx="35.7" cy="20.7" r="0.6" fill="white" />
            </g>
            {/* Smile */}
            <path d="M28 27Q31 30.5 34 27" stroke="#94a3b8" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            {/* Cheek blush */}
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


/* ═══════════════════════════════════════════════════════════════════════════
   VARIANT 1: SIDEBAR LOGO
   Small (32-36px). Idle: gentle tilt oscillation.
   Click: barrel roll. Hover: slight scale + glow intensify.
   ═══════════════════════════════════════════════════════════════════════════ */

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


/* ═══════════════════════════════════════════════════════════════════════════
   VARIANT 2: MAIN PAGE HERO
   Large (120-160px). Center of the AI assistant landing/empty state.
   Breathing glow, goggle glint, subtle float, plus a "runway" strip below.
   ═══════════════════════════════════════════════════════════════════════════ */

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


/* ═══════════════════════════════════════════════════════════════════════════
   VARIANT 3: PROCESSING / THINKING
   Boomerang flight with trail particles, speed lines, and expanding rings.
   ═══════════════════════════════════════════════════════════════════════════ */

const TRAIL_COLORS = ['#00D9D5', '#3B82F6', '#8B5CF6', '#06b6d4'];

interface DoraProcessingLogoProps {
  size?: number;
  label?: string;
}

export function DoraProcessingLogo({ size = 56, label = 'Dora is thinking...' }: DoraProcessingLogoProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{
        position: 'relative',
        width: size * 4.5,
        height: size * 2.2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: size * 0.5,
            height: size * 0.5,
            borderRadius: '50%',
            border: `1px solid ${TRAIL_COLORS[i]}`,
            opacity: 0.3,
            transform: 'translate(-50%, -50%)',
            animation: `dp-ring-expand 2.5s ease-out infinite ${i * 0.8}s`,
            pointerEvents: 'none',
          }} />
        ))}

        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`t${i}`} style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 4 + (i % 3),
            height: 4 + (i % 3),
            borderRadius: '50%',
            background: TRAIL_COLORS[i % 4],
            boxShadow: `0 0 6px ${TRAIL_COLORS[i % 4]}80`,
            animation: `dp-trail 1.2s ease-out infinite ${i * 0.12}s`,
            pointerEvents: 'none',
          }} />
        ))}

        {[28, 38, 48, 58, 68].map((top, i) => (
          <div key={`s${i}`} style={{
            position: 'absolute',
            left: 'calc(50% - 10px)',
            top: `${top}%`,
            height: 2,
            borderRadius: 1,
            background: TRAIL_COLORS[i % 3],
            opacity: 0.5,
            animation: `dp-streak 1s ease-out infinite ${i * 0.15}s`,
            pointerEvents: 'none',
          }} />
        ))}

        <div style={{
          animation: 'dp-boomerang 2.2s cubic-bezier(0.25,0.1,0.25,1) infinite',
          filter: 'drop-shadow(0 0 12px rgba(59,130,246,0.5))',
        }}>
          <PilotPlaneSVG size={size} showEngineGlow isActive />
        </div>
      </div>

      <div style={{
        width: 160,
        height: 3,
        borderRadius: 2,
        background: 'rgba(30,41,59,0.6)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: 2,
          background: 'linear-gradient(90deg, transparent 0%, #3B82F6 25%, #8B5CF6 50%, #3B82F6 75%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'dp-shimmer 1.5s linear infinite',
        }} />
      </div>

      <div className="dp-font" style={{
        fontSize: 12,
        color: '#94a3b8',
        fontWeight: 500,
        letterSpacing: '0.02em',
      }}>
        {label}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   VARIANT 4: CHAT HEADER
   Small (36-40px), sits in the chat header bar. Idle: gentle bob.
   Thinking: engine glow + subtle cyan pulse ring behind.
   ═══════════════════════════════════════════════════════════════════════════ */

interface DoraChatAvatarProps {
  size?: number;
  isThinking?: boolean;
}

export function DoraChatAvatar({ size = 38, isThinking = false }: DoraChatAvatarProps) {
  return (
    <div style={{
      position: 'relative',
      width: size + 10,
      height: size + 10,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      {isThinking && (
        <div style={{
          position: 'absolute',
          inset: -2,
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, transparent, rgba(0,217,213,0.5), rgba(59,130,246,0.4), rgba(139,92,246,0.3), transparent)',
          animation: 'dp-barrel-roll 2.5s linear infinite',
        }} />
      )}

      <div style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: isThinking
          ? 'linear-gradient(135deg, #0c1929, #0f172a)'
          : 'linear-gradient(135deg, #0f172a, #1e293b)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: isThinking
          ? '0 0 20px rgba(59,130,246,0.25), inset 0 0 12px rgba(0,217,213,0.05)'
          : '0 2px 8px rgba(0,0,0,0.3)',
        border: `1.5px solid ${isThinking ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.12)'}`,
        transition: 'all 0.5s ease',
        overflow: 'visible',
      }}>
        <div style={{
          animation: isThinking ? 'none' : 'dp-bob 3s ease-in-out infinite',
          display: 'flex',
        }}>
          <PilotPlaneSVG
            size={size * 0.7}
            showEngineGlow={isThinking}
            showGoggleGlint={!isThinking}
            style={{ marginTop: -2 }}
          />
        </div>
      </div>

      <div style={{
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: isThinking ? 10 : 8,
        height: isThinking ? 10 : 8,
        borderRadius: '50%',
        background: isThinking ? '#3B82F6' : '#22c55e',
        border: '2px solid #0f172a',
        transition: 'all 0.3s',
        boxShadow: isThinking
          ? '0 0 8px rgba(59,130,246,0.6)'
          : '0 0 6px rgba(34,197,94,0.4)',
        animation: isThinking ? 'dp-engine-glow 1s ease-in-out infinite' : 'none',
      }} />
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   DORA PILOT FACE — The living character SVG (100×100)

   A paper plane with a FACE: big expressive goggle-eyes with pupils that
   look around, blinking/winking eyelids, a friendly smile, aviator hat
   with button and ear flaps, a red scarf that flutters in the wind,
   and exhaust ports with engine glow.

   Phases: "hidden" | "entrance" | "wink" | "idle" | "thinking"
   ═══════════════════════════════════════════════════════════════════════════ */

type FacePhase = 'hidden' | 'entrance' | 'wink' | 'idle' | 'thinking';

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


/* ═══════════════════════════════════════════════════════════════════════════
   ENTRANCE TRAIL EFFECTS
   Speed lines + trail particles that appear during the fly-in
   ═══════════════════════════════════════════════════════════════════════════ */

function EntranceTrails({ active }: { active: boolean }) {
  if (!active) return null;

  const colors = ['#00D9D5', '#3B82F6', '#8B5CF6', '#06b6d4'];

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={`sl${i}`} style={{
          position: 'absolute',
          left: `${15 + i * 8}%`,
          top: `${30 + (i % 3) * 15}%`,
          height: 2,
          borderRadius: 1,
          background: `linear-gradient(90deg, ${colors[i % 4]}, transparent)`,
          opacity: 0,
          '--line-w': `${40 + i * 15}px`,
          '--line-tx': `${-80 - i * 20}px`,
          animation: `speed-line 0.6s ease-out forwards ${0.2 + i * 0.08}s`,
        } as React.CSSProperties} />
      ))}

      {Array.from({ length: 12 }).map((_, i) => (
        <div key={`tp${i}`} style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 3 + (i % 3) * 2,
          height: 3 + (i % 3) * 2,
          borderRadius: '50%',
          background: colors[i % 4],
          boxShadow: `0 0 6px ${colors[i % 4]}`,
          '--tx': `${-30 - i * 12}px`,
          '--ty': `${(i % 2 === 0 ? -1 : 1) * (8 + i * 3)}px`,
          animation: `trail-particle 0.8s ease-out forwards ${0.8 + i * 0.06}s`,
          opacity: 0,
        } as React.CSSProperties} />
      ))}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   VARIANT 5: WELCOME HERO — Cinematic entrance

   Phases:
   1. HIDDEN    (0-0.3s)     — Nothing visible
   2. ENTRANCE  (0.3-2.5s)   — Plane swoops in from bottom-left with trails
   3. WINK      (2.6-4.2s)   — Settles, winks at the user
   4. IDLE      (4.2s+)      — Gentle float, breathing glow, eyes look around

   Greeting: typewriter text types in during the entrance.
   ═══════════════════════════════════════════════════════════════════════════ */

interface DoraWelcomeHeroProps {
  userName?: string;
  /** px size of the character face. Default 140 for compact one-page layout. */
  faceSize?: number;
  onEntranceComplete?: () => void;
}

export function DoraWelcomeHero({
  userName = '',
  faceSize = 140,
  onEntranceComplete,
}: DoraWelcomeHeroProps) {
  const [phase, setPhase] = useState<FacePhase>('hidden');
  const [showTrails, setShowTrails] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [showSubtext, setShowSubtext] = useState(false);

  const getGreeting = useCallback(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => {
      setPhase('entrance');
      setShowTrails(true);
    }, 300));

    timers.push(setTimeout(() => setShowTrails(false), 2200));
    timers.push(setTimeout(() => setPhase('wink'), 2600));
    timers.push(setTimeout(() => setPhase('idle'), 4200));

    timers.push(setTimeout(() => {
      const g = userName ? `${getGreeting()}, ${userName}` : getGreeting();
      let i = 0;
      const typeTimer = setInterval(() => {
        setGreeting(g.slice(0, i + 1));
        i++;
        if (i >= g.length) clearInterval(typeTimer);
      }, 50);
    }, 2000));

    timers.push(setTimeout(() => setShowSubtext(true), 3000));
    timers.push(setTimeout(() => onEntranceComplete?.(), 3600));

    return () => timers.forEach(clearTimeout);
  }, [userName, getGreeting, onEntranceComplete]);

  const fullGreeting = userName ? `${getGreeting()}, ${userName}` : getGreeting();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      position: 'relative',
      /* no min-height — parent controls available space */
    }}>
      {/* Ambient background glows — pointer-events:none so they don't affect layout */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: 500, height: 340,
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(ellipse, rgba(59,130,246,0.07) 0%, rgba(139,92,246,0.04) 30%, transparent 65%)',
          filter: 'blur(40px)',
        }} />
      </div>

      {/* Character */}
      <div style={{ position: 'relative' }}>
        <EntranceTrails active={showTrails} />

        {/* Glow orb behind character */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: faceSize * 1.8, height: faceSize * 1.4,
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(ellipse, rgba(59,130,246,0.12) 0%, rgba(139,92,246,0.06) 40%, transparent 70%)',
          filter: 'blur(20px)',
          opacity: phase === 'hidden' ? 0 : 1,
          transition: 'opacity 1s ease 1.5s',
          pointerEvents: 'none',
        }} />

        <div style={{
          opacity: phase === 'hidden' ? 0 : 1,
          animation: phase === 'entrance'
            ? 'entrance-fly 2.2s cubic-bezier(0.16,1,0.3,1) forwards'
            : (phase === 'idle' || phase === 'wink')
              ? 'idle-float 6s ease-in-out infinite, idle-breathe-glow 4s ease-in-out infinite'
              : 'none',
        }}>
          <DoraPilotFace size={faceSize} phase={phase} />
        </div>

        {/* Runway strip */}
        <div style={{
          width: faceSize * 1.3,
          height: 2,
          borderRadius: 2,
          margin: '6px auto 0',
          background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.25), rgba(139,92,246,0.15), transparent)',
          opacity: phase === 'hidden' ? 0 : 1,
          transition: 'opacity 0.8s ease 2s',
          animation: phase !== 'hidden' ? 'runway-glow 3s ease-in-out infinite' : 'none',
        }} />
      </div>

      {/* Greeting text — compact, no min-height reservation */}
      <div style={{ textAlign: 'center', marginTop: 10 }}>
        <div className="dp-font" style={{
          fontSize: 22,
          fontWeight: 300,
          color: '#e2e8f0',
          letterSpacing: '-0.01em',
          height: 30,
          animation: phase !== 'hidden' ? 'text-glow 4s ease-in-out infinite' : 'none',
        }}>
          {greeting && (
            <span>
              {greeting}
              <span style={{
                display: 'inline-block',
                width: 2,
                height: 22,
                background: '#3B82F6',
                marginLeft: 2,
                verticalAlign: 'text-bottom',
                opacity: greeting.length >= fullGreeting.length ? undefined : 1,
                animation: greeting.length >= fullGreeting.length ? 'face-blink 1s step-end infinite' : 'none',
              }} />
            </span>
          )}
        </div>

        <div style={{
          opacity: showSubtext ? 1 : 0,
          transform: showSubtext ? 'translateY(0)' : 'translateY(8px)',
          transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
          marginTop: 5,
        }}>
          <div className="dp-font" style={{ fontSize: 13, color: '#94a3b8', fontWeight: 400 }}>
            I'm{' '}
            <span style={{
              fontWeight: 700,
              background: 'linear-gradient(135deg, #00D9D5, #3B82F6, #8B5CF6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Dora</span>
            {' '}— your AI pilot. Ask me anything about Messign.
          </div>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   VARIANT 6: PROCESSING DUAL — Two planes orbiting each other

   When Dora is thinking, two pilot planes orbit around a central energy
   glow in opposite directions, like dual processors syncing up.
   ═══════════════════════════════════════════════════════════════════════════ */

interface DoraProcessingDualProps {
  size?: number;
}

export function DoraProcessingDual({ size = 22 }: DoraProcessingDualProps) {
  return (
    <div style={{
      position: 'relative',
      width: size * 4,
      height: size * 2.8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      {/* Central energy glow */}
      <div style={{
        position: 'absolute',
        width: size * 1.2,
        height: size * 1.2,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.35), rgba(139,92,246,0.15), transparent)',
        animation: 'dp-energy-pulse 2s ease-in-out infinite',
        pointerEvents: 'none',
      }} />

      {/* Spark connection line */}
      <div style={{
        position: 'absolute',
        width: size * 2.4,
        height: 2,
        borderRadius: 1,
        background: 'linear-gradient(90deg, transparent, rgba(0,217,213,0.4), rgba(59,130,246,0.5), rgba(139,92,246,0.4), transparent)',
        animation: 'dp-spark-line 1.5s ease-in-out infinite',
        pointerEvents: 'none',
      }} />

      {/* Expanding ring at center */}
      <div style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1px solid rgba(59,130,246,0.25)',
        animation: 'dp-ring-expand 2s ease-out infinite',
        pointerEvents: 'none',
      }} />

      {/* Plane A — orbits clockwise */}
      <div style={{
        position: 'absolute',
        animation: 'dp-dual-a 2.8s ease-in-out infinite',
        filter: 'drop-shadow(0 0 6px rgba(0,217,213,0.5))',
      }}>
        <PilotPlaneSVG size={size} showEngineGlow />
      </div>

      {/* Plane B — orbits counter-clockwise, mirrored */}
      <div style={{
        position: 'absolute',
        animation: 'dp-dual-b 2.8s ease-in-out infinite',
        filter: 'drop-shadow(0 0 6px rgba(139,92,246,0.5))',
      }}>
        <PilotPlaneSVG size={size} showEngineGlow />
      </div>
    </div>
  );
}

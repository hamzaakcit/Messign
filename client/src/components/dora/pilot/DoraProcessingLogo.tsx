import { PilotPlaneSVG } from './PilotPlaneSVG';

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

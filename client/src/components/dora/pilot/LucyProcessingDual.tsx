import { LucyPilotSVG } from '@/pages/marketing/components/lucy/LucyPilotSVG';

interface LucyProcessingDualProps {
  size?: number;
}

/**
 * Same motion layout as {@link DoraProcessingDual} — purple / Lucy mark for marketing Lucy rail.
 */
export function LucyProcessingDual({ size = 22 }: LucyProcessingDualProps): JSX.Element {
  return (
    <div
      style={{
        position: 'relative',
        width: size * 4,
        height: size * 2.8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: size * 1.2,
          height: size * 1.2,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.4), rgba(168,85,247,0.18), transparent)',
          animation: 'dp-energy-pulse 2s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          width: size * 2.4,
          height: 2,
          borderRadius: 1,
          background:
            'linear-gradient(90deg, transparent, rgba(168,85,247,0.45), rgba(192,38,211,0.5), rgba(124,58,237,0.45), transparent)',
          animation: 'dp-spark-line 1.5s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: '50%',
          border: '1px solid rgba(168,85,247,0.35)',
          animation: 'dp-ring-expand 2s ease-out infinite',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          animation: 'dp-dual-a 2.8s ease-in-out infinite',
          filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.55))',
        }}
      >
        <LucyPilotSVG size={size} />
      </div>

      <div
        style={{
          position: 'absolute',
          animation: 'dp-dual-b 2.8s ease-in-out infinite',
          filter: 'drop-shadow(0 0 6px rgba(192,38,211,0.5))',
        }}
      >
        <LucyPilotSVG size={size} />
      </div>
    </div>
  );
}

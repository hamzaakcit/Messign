import { PilotPlaneSVG } from './PilotPlaneSVG';

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
      <div style={{
        position: 'absolute',
        width: size * 1.2,
        height: size * 1.2,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.35), rgba(139,92,246,0.15), transparent)',
        animation: 'dp-energy-pulse 2s ease-in-out infinite',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'absolute',
        width: size * 2.4,
        height: 2,
        borderRadius: 1,
        background: 'linear-gradient(90deg, transparent, rgba(0,217,213,0.4), rgba(59,130,246,0.5), rgba(139,92,246,0.4), transparent)',
        animation: 'dp-spark-line 1.5s ease-in-out infinite',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1px solid rgba(59,130,246,0.25)',
        animation: 'dp-ring-expand 2s ease-out infinite',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'absolute',
        animation: 'dp-dual-a 2.8s ease-in-out infinite',
        filter: 'drop-shadow(0 0 6px rgba(0,217,213,0.5))',
      }}>
        <PilotPlaneSVG size={size} showEngineGlow />
      </div>

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

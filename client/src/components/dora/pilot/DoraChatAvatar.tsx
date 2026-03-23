import { PilotPlaneSVG } from './PilotPlaneSVG';

interface DoraChatAvatarProps {
  size?: number;
  isThinking?: boolean;
}

export function DoraChatAvatar({ size = 38, isThinking = false }: DoraChatAvatarProps) {
  return (
    <div style={{
      position: 'relative',
      width: size + 10,
      height: size + 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      {isThinking && (
        <div style={{
          position: 'absolute',
          inset: -4,
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg, transparent, rgba(0,217,213,0.45), rgba(59,130,246,0.35), rgba(139,92,246,0.25), transparent)',
          animation: 'dp-barrel-roll 2.5s linear infinite',
        }} />
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: isThinking ? 'none' : 'dp-bob 3s ease-in-out infinite',
        filter: isThinking
          ? 'drop-shadow(0 0 8px rgba(0,217,213,0.6)) drop-shadow(0 0 16px rgba(59,130,246,0.35))'
          : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
        transition: 'filter 0.5s ease',
      }}>
        <PilotPlaneSVG
          size={size}
          showEngineGlow={isThinking}
          showGoggleGlint={!isThinking}
        />
      </div>

      <div style={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: size * 0.75,
        height: 5,
        borderRadius: '50%',
        background: isThinking
          ? 'radial-gradient(ellipse, rgba(59,130,246,0.45) 0%, transparent 70%)'
          : 'radial-gradient(ellipse, rgba(0,217,213,0.25) 0%, transparent 70%)',
        filter: 'blur(2px)',
        transition: 'background 0.5s ease',
      }} />

      <div style={{
        position: 'absolute',
        bottom: 6,
        right: 0,
        width: isThinking ? 9 : 7,
        height: isThinking ? 9 : 7,
        borderRadius: '50%',
        background: isThinking ? '#3B82F6' : '#22c55e',
        border: '2px solid rgba(15,23,42,0.8)',
        transition: 'all 0.3s',
        boxShadow: isThinking
          ? '0 0 8px rgba(59,130,246,0.6)'
          : '0 0 6px rgba(34,197,94,0.4)',
        animation: isThinking ? 'dp-engine-glow 1s ease-in-out infinite' : 'none',
      }} />
    </div>
  );
}

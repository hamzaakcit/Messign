import { useState, useEffect, useCallback } from 'react';
import { DoraPilotFace } from './DoraPilotFace';
import type { FacePhase } from './DoraPilotFace';

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
    return userName ? `Welcome back, ${userName}!` : 'Welcome back!';
  }, [userName]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let typeTimer: ReturnType<typeof setInterval> | undefined;

    timers.push(setTimeout(() => {
      setPhase('entrance');
      setShowTrails(true);
    }, 300));

    timers.push(setTimeout(() => setShowTrails(false), 2200));
    timers.push(setTimeout(() => setPhase('wink'), 2600));
    timers.push(setTimeout(() => setPhase('idle'), 4200));

    timers.push(setTimeout(() => {
      const g = getGreeting();
      let i = 0;
      typeTimer = setInterval(() => {
        setGreeting(g.slice(0, i + 1));
        i++;
        if (i >= g.length && typeTimer) clearInterval(typeTimer);
      }, 50);
    }, 2000));

    timers.push(setTimeout(() => setShowSubtext(true), 3000));
    timers.push(setTimeout(() => onEntranceComplete?.(), 3600));

    return () => {
      timers.forEach(clearTimeout);
      if (typeTimer) clearInterval(typeTimer);
    };
  }, [getGreeting]);

  const fullGreeting = getGreeting();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      position: 'relative',
    }}>
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

      <div style={{ position: 'relative' }}>
        <EntranceTrails active={showTrails} />

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

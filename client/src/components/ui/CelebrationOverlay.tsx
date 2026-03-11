import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';

const PARTICLE_COUNT = 35;
const DURATION_MS = 2500;
const COOLDOWN_MS = 30000;

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

function createParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: 50 + (Math.random() - 0.5) * 20,
    y: 50 + (Math.random() - 0.5) * 20,
    angle: Math.random() * 360,
    delay: Math.random() * 200,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    size: 6 + Math.random() * 8,
    duration: 2000 + Math.random() * 800,
  }));
}

export function CelebrationOverlay() {
  const [particles, setParticles] = useState<ReturnType<typeof createParticles>>([]);
  const [visible, setVisible] = useState(false);
  const lastTriggerRef = { current: 0 };

  const trigger = useCallback(() => {
    const now = Date.now();
    if (now - lastTriggerRef.current < COOLDOWN_MS) return;
    lastTriggerRef.current = now;
    setParticles(createParticles());
    setVisible(true);
    const t = setTimeout(() => setVisible(false), DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const s = getSocket();
    const handlers = [
      'celebration:deal-won',
      'celebration:badge-earned',
      'celebration:okr-kr-completed',
      'celebration:sprint-completed',
    ];
    handlers.forEach((ev) => s.on(ev, trigger));
    return () => handlers.forEach((ev) => s.off(ev));
  }, [trigger]);

  if (!visible || particles.length === 0) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden"
      aria-hidden
    >
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            transform: `translate(-50%, -50%) rotate(${p.angle}deg)`,
            animation: `celebrationConfetti ${p.duration}ms ease-out ${p.delay}ms forwards`,
          }}
        />
      ))}
    </div>
  );
}

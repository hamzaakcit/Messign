import { useEffect, useRef, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Zap } from 'lucide-react';
import type { Badge as BadgeType } from '@/types';
import { getRarityTheme, RARITY_XP, type RarityKey } from '@/lib/badgeRarity';
import { cn } from '@/lib/utils';

export interface BadgeUnlockCelebrationProps {
  badge: BadgeType | null;
  icon: LucideIcon;
  isOpen: boolean;
  onClose: () => void;
}

interface ConfettiParticle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

export function BadgeUnlockCelebration({
  badge,
  icon: Icon,
  isOpen,
  onClose,
}: BadgeUnlockCelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<ConfettiParticle[]>([]);
  const animationRef = useRef<number>(0);

  const rarity = badge ? (badge.rarity?.toLowerCase() || 'common') as RarityKey : 'common';
  const theme = getRarityTheme(rarity);
  const xpReward = badge ? RARITY_XP[rarity] : 0;

  const createConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const colors = [
      `rgb(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b})`,
      `rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.8)`,
      '#ffffff',
      '#fbbf24',
    ];

    const particles: ConfettiParticle[] = [];
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    for (let i = 0; i < 120; i++) {
      const angle = (Math.PI * 2 * i) / 120 + Math.random();
      const speed = 8 + Math.random() * 12;
      particles.push({
        x: centerX,
        y: centerY,
        size: 4 + Math.random() * 6,
        speedY: Math.cos(angle) * speed - 10,
        speedX: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)]!,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 15,
        opacity: 1,
      });
    }

    particlesRef.current = particles;
  }, [theme.rgb.r, theme.rgb.g, theme.rgb.b]);

  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    createConfetti();

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gravity = 0.4;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter((p) => {
        p.speedY += gravity;
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotationSpeed;
        if (p.y > canvas.height) p.opacity -= 0.03;

        if (p.opacity <= 0) return false;

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
        return true;
      });

      if (particlesRef.current.length > 0) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animate();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [isOpen, createConfetti]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-[60]"
        style={{ width: '100%', height: '100%' }}
        aria-hidden
      />

      <div
        className="fixed inset-0 z-[61] flex items-center justify-center bg-black/85 backdrop-blur-md transition-opacity duration-500"
        role="dialog"
        aria-modal="true"
        aria-label="Achievement unlocked"
      >
        <div className="flex flex-col items-center max-w-full px-4">
          <p
            className="text-sm font-semibold tracking-[0.2em] uppercase text-app-text/60 mb-6 animate-[fadeIn_0.5s_ease_0.3s_both]"
            style={{ letterSpacing: '0.2em' }}
          >
            🎉 Achievement Unlocked! 🎉
          </p>

          <div
            className={cn(
              'relative w-[320px] max-w-full rounded-[24px] overflow-hidden flex flex-col items-center py-10 px-8',
              'border-2 shadow-2xl',
              'animate-[iconPop_0.6s_cubic-bezier(0.34,1.56,0.64,1)_forwards]'
            )}
            style={{
              background: `linear-gradient(135deg, rgba(${theme.rgb.r},${theme.rgb.g},${theme.rgb.b},0.25) 0%, rgba(20,20,28,0.95) 60%)`,
              borderColor: `rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.5)`,
              boxShadow: `0 20px 80px rgba(0,0,0,0.6), 0 0 80px ${theme.glow}`,
            }}
          >
            {/* Shine overlay */}
            <div
              className="absolute inset-0 pointer-events-none overflow-hidden opacity-30"
              aria-hidden
            >
              <div className="absolute -inset-full bg-gradient-to-br from-transparent via-white/20 to-transparent animate-badge-shine" />
            </div>

            {/* Icon container with pulse rings */}
            <div className="relative mb-8">
              {[0, 0.5, 1].map((delay) => (
                <div
                  key={delay}
                  className="absolute inset-[-10px] rounded-full border-[3px] animate-badge-pulse-ring"
                  style={{
                    borderColor: `rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.6)`,
                    animationDelay: `${delay * 0.5}s`,
                  }}
                />
              ))}
              <div
                className={cn(
                  'relative w-28 h-28 rounded-full flex items-center justify-center',
                  rarity === 'legendary' && 'animate-legendary-pulse'
                )}
                style={{
                  background: `radial-gradient(circle, rgba(${theme.rgb.r},${theme.rgb.g},${theme.rgb.b},0.35), rgba(${theme.rgb.r},${theme.rgb.g},${theme.rgb.b},0.1))`,
                  border: `3px solid rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.7)`,
                  boxShadow: `0 0 48px ${theme.glow}`,
                }}
              >
                <Icon className="w-14 h-14 text-app-text" strokeWidth={2} />
              </div>
            </div>

            {badge && (
              <>
                <h3 className="relative text-2xl font-bold text-app-text mb-2 text-center drop-shadow-lg">
                  {badge.name}
                </h3>
                <span
                  className="relative inline-block px-5 py-1.5 text-sm font-semibold uppercase tracking-wider rounded-full mb-4"
                  style={{
                    color: theme.primary,
                    background: `rgba(${theme.rgb.r}, ${theme.rgb.g}, ${theme.rgb.b}, 0.2)`,
                    boxShadow: `0 0 20px ${theme.glow}`,
                  }}
                >
                  {badge.rarity}
                </span>
                <p className="relative text-sm text-app-text/75 text-center mb-4 max-w-[260px] leading-relaxed">
                  {badge.description}
                </p>
                <div className="relative flex items-center justify-center gap-2 text-amber-400 font-semibold text-base mb-2">
                  <Zap className="w-5 h-5" />
                  <span>+{xpReward} MP</span>
                </div>
              </>
            )}

            <button
              type="button"
              className="relative mt-8 px-10 py-3.5 rounded-xl font-semibold text-app-text border-2 border-white/30 bg-app-surface-tertiary hover:bg-app-hover transition-all duration-300 animate-[fadeIn_0.6s_ease_1s_both]"
              onClick={onClose}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

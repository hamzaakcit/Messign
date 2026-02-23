import { useState, useEffect, useRef, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface MessignLogoAnimatedProps {
  size?: number;
  autoPlay?: boolean;
  playOnHover?: boolean;
  loop?: boolean;
  /** Delay between loops in ms */
  loopDelay?: number;
  className?: string;
}

const TRAIL_COLORS = ['#00D9D5', '#3B82F6', '#8B5CF6', '#06b6d4'] as const;

export function MessignLogoAnimated({
  size = 60,
  autoPlay = true,
  playOnHover = false,
  loop = true,
  loopDelay = 5000,
  className = '',
}: MessignLogoAnimatedProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'flying'>('idle');
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rawId = useId();
  const planeGradId = `plane-grad-${rawId.replace(/:/g, '')}`;
  const planeGradDarkId = `plane-dark-${rawId.replace(/:/g, '')}`;

  const triggerAnimation = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setPhase('flying');

    setTimeout(() => {
      setPhase('idle');
      setIsAnimating(false);
    }, 2000);
  };

  // Auto-play on mount
  useEffect(() => {
    if (!autoPlay) return;
    const t = setTimeout(triggerAnimation, 1000);
    return () => clearTimeout(t);
  }, [autoPlay]);

  // Loop after delay when back to idle
  useEffect(() => {
    if (!loop || phase !== 'idle' || isAnimating) return;
    loopTimerRef.current = setTimeout(triggerAnimation, loopDelay);
    return () => {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, [phase, loop, loopDelay, isAnimating]);

  return (
    <div
      className={`relative cursor-pointer ${className}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => playOnHover && triggerAnimation()}
      onClick={() => triggerAnimation()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && triggerAnimation()}
      aria-label="Play logo animation"
    >
      {/* Trail particles - visible during flight */}
      <AnimatePresence>
        {phase === 'flying' && (
          <>
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 4 + (i % 3),
                  height: 4 + (i % 3),
                  left: size / 2,
                  top: size / 2,
                  background: `linear-gradient(135deg, ${TRAIL_COLORS[i % 4]}, transparent)`,
                }}
                initial={{
                  opacity: 0,
                  x: 0,
                  y: 0,
                  scale: 0,
                }}
                animate={{
                  opacity: [0, 0.8, 0],
                  x: [0, -20 - i * 8, -40 - i * 12],
                  y: [0, i % 2 ? 5 : -5, i % 2 ? 10 : -10],
                  scale: [0, 1, 0],
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.8,
                  delay: i * 0.05,
                  ease: 'easeOut',
                }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Glow effect */}
      <motion.div
        className="absolute inset-0 rounded-xl blur-xl pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
        }}
        animate={{
          opacity: phase === 'flying' ? 0.6 : 0.25,
          scale: phase === 'flying' ? 1.5 : 1,
        }}
        transition={{ duration: 0.3 }}
      />

      {/* Main container — always paper plane */}
      <motion.div
        className="relative w-full h-full"
        animate={{
          x: phase === 'flying' ? [0, 150, 200, 150, 50, -20, 0] : 0,
          y: phase === 'flying' ? [0, -30, 0, 30, 20, 10, 0] : 0,
          rotate: phase === 'flying' ? [0, -10, 0, 180, 200, 350, 360] : 0,
          scale: phase === 'flying' ? [1, 0.8, 0.6, 0.6, 0.8, 1, 1] : 1,
        }}
        transition={{
          duration: phase === 'flying' ? 2 : 0.4,
          ease: phase === 'flying' ? [0.25, 0.1, 0.25, 1] : 'easeInOut',
          times: phase === 'flying' ? [0, 0.2, 0.4, 0.6, 0.75, 0.9, 1] : undefined,
        }}
      >
        {/* Paper Plane — always visible */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            viewBox="0 0 48 48"
            fill="none"
            className="w-full h-full"
            style={{ filter: 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.5))' }}
            aria-hidden
          >
            <defs>
              <linearGradient id={planeGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00D9D5" />
                <stop offset="50%" stopColor="#3B82F6" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
              <linearGradient id={planeGradDarkId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0891b2" />
                <stop offset="50%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>
            </defs>
            <path
              d="M6 24L42 8L36 24L42 40L6 24Z"
              fill={`url(#${planeGradId})`}
            />
            <path
              d="M6 24L36 24"
              stroke={`url(#${planeGradDarkId})`}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path d="M8 23L40 9L35 23" fill="rgba(255,255,255,0.3)" />
            <path d="M8 25L35 25L40 39" fill="rgba(0,0,0,0.1)" />
          </svg>
        </div>
      </motion.div>

      {/* Speed lines during flight */}
      <AnimatePresence>
        {phase === 'flying' && (
          <motion.div
            className="absolute inset-0 pointer-events-none overflow-visible"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={`speed-${i}`}
                className="absolute h-0.5 rounded-full"
                style={{
                  background: `linear-gradient(90deg, transparent, ${['#00D9D5', '#3B82F6', '#8B5CF6'][i % 3]})`,
                  top: `${30 + i * 10}%`,
                  left: 0,
                }}
                initial={{ width: 0, opacity: 0 }}
                animate={{
                  width: [0, 30, 0],
                  opacity: [0, 0.6, 0],
                  x: [-20, -60, -100],
                }}
                transition={{
                  duration: 0.5,
                  delay: i * 0.1,
                  repeat: 3,
                  repeatDelay: 0.3,
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

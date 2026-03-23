import { useState, useEffect, useId, useRef, useCallback } from 'react';
import styles from './MessignLogoAnimated.module.css';

export interface MessignLogoAnimatedCSSProps {
  size?: number;
  autoPlay?: boolean;
  loopDelay?: number;
  className?: string;
}

export function MessignLogoAnimatedCSS({
  size = 60,
  autoPlay = true,
  loopDelay = 5000,
  className = '',
}: MessignLogoAnimatedCSSProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [showPlane, setShowPlane] = useState(false);
  const rawId = useId().replace(/:/g, '');
  const logoGradId = `logo-grad-${rawId}`;
  const planeGradId = `plane-css-${rawId}`;
  const animTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAnimTimers = useCallback(() => {
    animTimers.current.forEach(clearTimeout);
    animTimers.current = [];
  }, []);

  useEffect(() => clearAnimTimers, [clearAnimTimers]);

  const triggerAnimation = useCallback(() => {
    if (isAnimating) return;
    clearAnimTimers();
    setIsAnimating(true);

    animTimers.current.push(setTimeout(() => setShowPlane(true), 200));
    animTimers.current.push(setTimeout(() => setShowPlane(false), 2600));
    animTimers.current.push(setTimeout(() => setIsAnimating(false), 3000));
  }, [isAnimating, clearAnimTimers]);

  useEffect(() => {
    if (!autoPlay) return;
    const t = setTimeout(triggerAnimation, 1500);
    return () => clearTimeout(t);
  }, [autoPlay, triggerAnimation]);

  useEffect(() => {
    if (isAnimating || !autoPlay) return;
    const t = setTimeout(triggerAnimation, loopDelay);
    return () => clearTimeout(t);
  }, [isAnimating, autoPlay, loopDelay, triggerAnimation]);

  return (
    <div
      className={`${styles.container} ${className}`}
      style={{ width: size, height: size }}
      onClick={triggerAnimation}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && triggerAnimation()}
      aria-label="Play logo animation"
    >
      <div className={`${styles.glow} ${isAnimating ? styles.glowActive : ''}`} />

      {isAnimating && showPlane && (
        <div className={styles.trailContainer}>
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className={styles.particle}
              style={{
                animationDelay: `${i * 0.08}s`,
                ['--particle-color' as string]: ['#00D9D5', '#3B82F6', '#8B5CF6', '#6366F1'][i % 4],
              }}
            />
          ))}
        </div>
      )}

      <div className={`${styles.logoWrapper} ${isAnimating ? styles.flying : ''}`}>
        <div className={`${styles.logo} ${showPlane ? styles.hidden : ''}`}>
          <svg viewBox="0 0 40 40" fill="none" className={styles.logoSvg} aria-hidden>
            <defs>
              <linearGradient id={logoGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="50%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="40" height="40" rx="10" fill={`url(#${logoGradId})`} />
            <path d="M8 28L8 16L14 24" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 24L20 14L26 24" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M26 24L32 16L32 28" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className={`${styles.plane} ${showPlane ? styles.visible : ''}`}>
          <svg viewBox="0 0 48 48" fill="none" className={styles.planeSvg} aria-hidden>
            <defs>
              <linearGradient id={planeGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00D9D5" />
                <stop offset="50%" stopColor="#3B82F6" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
            </defs>
            <path d="M4 24L44 6L36 24L44 42L4 24Z" fill={`url(#${planeGradId})`} />
            <path d="M4 24L36 24" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
            <path d="M6 23L42 7L35 23" fill="rgba(255,255,255,0.25)" />
          </svg>
        </div>
      </div>

      {isAnimating && showPlane && (
        <div className={styles.speedLines}>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={styles.speedLine}
              style={{
                top: `${25 + i * 12}%`,
                animationDelay: `${i * 0.1}s`,
                ['--line-color' as string]: ['#00D9D5', '#3B82F6', '#8B5CF6'][i % 3],
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

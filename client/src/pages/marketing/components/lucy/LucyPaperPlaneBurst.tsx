import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { LoginPaperPlaneGraphic } from '@/components/login/LoginPaperPlaneGraphic';

const PLANE_COUNT = 32;
const CLEANUP_BUFFER_MS = 400;

export interface LucyPaperPlaneBurstProps {
  /** When false, nothing is rendered. */
  active: boolean;
  /** Changes per burst so plane paths are stable within a wave but differ across clicks. */
  burstId: number;
  /** Called after the last plane finishes (or after reduced-motion flash). */
  onComplete?: () => void;
}

interface PlaneConfig {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  rotateStart: number;
  rotateEnd: number;
  scale: number;
  delay: number;
  duration: number;
}

/** Deterministic PRNG for reproducible bursts per `burstId` (tests + consistent paths). */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function buildPlaneConfigs(burstId: number): PlaneConfig[] {
  const rand = seededRandom(burstId * 9973 + 42);
  const configs: PlaneConfig[] = [];

  for (let i = 0; i < PLANE_COUNT; i += 1) {
    const edge = Math.floor(rand() * 4);
    let startX: number;
    let startY: number;

    if (edge === 0) {
      startX = -8 - rand() * 6;
      startY = rand() * 100;
    } else if (edge === 1) {
      startX = 108 + rand() * 6;
      startY = rand() * 100;
    } else if (edge === 2) {
      startX = rand() * 100;
      startY = -8 - rand() * 6;
    } else {
      startX = rand() * 100;
      startY = 108 + rand() * 6;
    }

    const endX = rand() * 100;
    const endY = rand() * 100;
    const rotateStart = -25 + rand() * 50;
    const rotateEnd = rotateStart + (-40 + rand() * 80);

    configs.push({
      id: i,
      startX,
      startY,
      endX,
      endY,
      rotateStart,
      rotateEnd,
      scale: 0.45 + rand() * 0.65,
      delay: rand() * 1.4,
      duration: 2.2 + rand() * 1.8,
    });
  }

  return configs;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = (): void => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return reduced;
}

/**
 * Full-viewport paper-plane burst for the Lucy CMO home. Pointer-events-none overlay.
 */
export function LucyPaperPlaneBurst({
  active,
  burstId,
  onComplete,
}: LucyPaperPlaneBurstProps): JSX.Element | null {
  const prefersReducedMotion = usePrefersReducedMotion();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const planes = useMemo(() => buildPlaneConfigs(burstId), [burstId]);

  const maxEndMs = useMemo(() => {
    let max = 0;
    for (const p of planes) {
      const end = (p.delay + p.duration) * 1000;
      if (end > max) max = end;
    }
    return max + CLEANUP_BUFFER_MS;
  }, [planes]);

  useEffect(() => {
    if (!active) return undefined;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ms = reduced ? 320 : maxEndMs;
    const t = window.setTimeout(() => {
      onCompleteRef.current?.();
    }, ms);

    return () => window.clearTimeout(t);
  }, [active, burstId, maxEndMs]);

  if (!active) return null;

  if (prefersReducedMotion) {
    return (
      <div
        className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center overflow-hidden"
        aria-hidden
        data-testid="lucy-paper-plane-burst"
      >
        <LoginPaperPlaneGraphic className="h-10 w-10 opacity-80" />
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
      aria-hidden
      data-testid="lucy-paper-plane-burst"
    >
      {planes.map((p) => {
        const deltaX = `${p.endX - p.startX}vw`;
        const deltaY = `${p.endY - p.startY}vh`;

        return (
          <motion.div
            key={`${burstId}-${p.id}`}
            className="absolute will-change-transform"
            style={{
              left: `${p.startX}%`,
              top: `${p.startY}%`,
            }}
            initial={{
              x: 0,
              y: 0,
              rotate: p.rotateStart,
              scale: p.scale,
              opacity: 0.92,
            }}
            animate={{
              x: deltaX,
              y: deltaY,
              rotate: p.rotateEnd,
              scale: p.scale * 0.85,
              opacity: 0,
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: [0.22, 0.61, 0.36, 1],
            }}
          >
            <LoginPaperPlaneGraphic className="h-8 w-8 md:h-10 md:w-10" />
          </motion.div>
        );
      })}
    </div>
  );
}

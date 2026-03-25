import { useEffect, useRef, useCallback, useState } from 'react';

interface MousePosition {
  x: number; // -1 to 1
  y: number; // -1 to 1
}

/**
 * Tracks mouse position normalized to -1..1 relative to a ref element's center.
 * Returns { x: 0, y: 0 } when mouse is at center of the element.
 */
export function useMousePosition() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MousePosition>({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const latestEvent = useRef<{ clientX: number; clientY: number } | null>(null);

  const update = useCallback(() => {
    const el = ref.current;
    const ev = latestEvent.current;
    if (!el || !ev) return;

    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const x = Math.max(-1, Math.min(1, (ev.clientX - cx) / (rect.width / 2)));
    const y = Math.max(-1, Math.min(1, (ev.clientY - cy) / (rect.height / 2)));

    setPos({ x, y });
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      latestEvent.current = { clientX: e.clientX, clientY: e.clientY };
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [update]);

  return { ref, ...pos };
}

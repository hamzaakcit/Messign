import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

/**
 * Dora-style ambient spotlight that follows the pointer. Fixed layer above the
 * login dim overlay so the gradient stays visible (pure CSS variables + one listener).
 */
export function LoginCursorGlow(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = (clientX: number, clientY: number): void => {
      const x = (clientX / window.innerWidth) * 100;
      const y = (clientY / window.innerHeight) * 100;
      el.style.setProperty('--login-lx', `${x}%`);
      el.style.setProperty('--login-ly', `${y}%`);
    };

    const onMove = (e: MouseEvent): void => {
      apply(e.clientX, e.clientY);
    };

    apply(window.innerWidth * 0.5, window.innerHeight * 0.35);
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const layerStyle: CSSProperties = {
    zIndex: 5,
    ['--login-lx' as string]: '50%',
    ['--login-ly' as string]: '35%',
    background: `
      radial-gradient(
        ellipse 85% 60% at var(--login-lx) var(--login-ly),
        rgba(56, 189, 248, 0.22) 0%,
        rgba(139, 92, 246, 0.12) 42%,
        transparent 68%
      )
    `,
  };

  return (
    <div ref={ref} className="fixed inset-0 pointer-events-none" style={layerStyle} aria-hidden />
  );
}

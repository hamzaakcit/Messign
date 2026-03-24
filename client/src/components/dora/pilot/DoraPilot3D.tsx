import { Suspense, useRef, useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment } from '@react-three/drei';
import type { WebGLRenderer } from 'three';
import { DoraPlaneMesh } from './DoraPlaneMesh';
import { EXPORT_SIZES } from './dora3dConfig';

export interface DoraPilot3DProps {
  /** Container width in CSS pixels. */
  width?: number;
  /** Container height in CSS pixels. */
  height?: number;
  /** Show the "Export PNG" button (dev / asset-generation use). */
  showExport?: boolean;
  /** Additional CSS class on the outer wrapper. */
  className?: string;
}

/**
 * Interactive React Three Fiber canvas with the Dora pilot paper-plane mascot.
 * Designed to be lazy-loaded so pages that don't need 3D don't pay for it.
 */
export function DoraPilot3D({
  width = 320,
  height = 320,
  showExport = false,
  className = '',
}: DoraPilot3DProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderer | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const handleCreated = useCallback(
    (state: { gl: WebGLRenderer }) => {
      glRef.current = state.gl;
      canvasRef.current = state.gl.domElement;
    },
    [],
  );

  const exportPng = useCallback(
    async (size: keyof typeof EXPORT_SIZES = 'square') => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { width: w, height: h } = EXPORT_SIZES[size];
      const offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(canvas, 0, 0, w, h);
      offscreen.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dora-pilot-3d-${size}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    },
    [],
  );

  return (
    <div
      className={className}
      style={{ width, height, position: 'relative' }}
      aria-label="Dora AI mascot — interactive 3D paper plane"
    >
      <Canvas
        gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
        camera={{ position: [0, 0.5, 3], fov: 40 }}
        dpr={[1, 2]}
        onCreated={handleCreated}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 5, 3]} intensity={1.2} castShadow />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} />

        <Suspense fallback={null}>
          <DoraPlaneMesh reduceMotion={reduceMotion} />
          <ContactShadows
            position={[0, -0.6, 0]}
            opacity={0.35}
            scale={4}
            blur={2.5}
          />
          <Environment preset="city" />
        </Suspense>
      </Canvas>

      {showExport && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            display: 'flex',
            gap: 4,
          }}
        >
          <button
            onClick={() => void exportPng('square')}
            style={{
              fontSize: 11,
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(15,23,42,0.7)',
              color: '#94a3b8',
              cursor: 'pointer',
            }}
          >
            1080×1080
          </button>
          <button
            onClick={() => void exportPng('portrait')}
            style={{
              fontSize: 11,
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(15,23,42,0.7)',
              color: '#94a3b8',
              cursor: 'pointer',
            }}
          >
            1080×1350
          </button>
        </div>
      )}
    </div>
  );
}

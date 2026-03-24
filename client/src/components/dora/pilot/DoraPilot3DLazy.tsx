import { lazy, Suspense } from 'react';
import type { DoraPilot3DProps } from './DoraPilot3D';

const DoraPilot3DImpl = lazy(() =>
  import('./DoraPilot3D').then((m) => ({ default: m.DoraPilot3D })),
);

/**
 * Code-split wrapper for DoraPilot3D. Pages that import this pay nothing until
 * the component actually mounts — keeps the main chunk free of Three.js.
 */
export function DoraPilot3DLazy(props: DoraPilot3DProps): JSX.Element {
  return (
    <Suspense
      fallback={
        <div
          style={{
            width: props.width ?? 320,
            height: props.height ?? 320,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b',
            fontSize: 13,
          }}
        >
          Loading 3D…
        </div>
      }
    >
      <DoraPilot3DImpl {...props} />
    </Suspense>
  );
}

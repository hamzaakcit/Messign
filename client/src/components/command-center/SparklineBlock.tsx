import { useLayoutEffect, useRef, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

interface SparklineBlockProps {
  points: { label: string; value: number }[];
  color?: string;
  height?: number;
}

/**
 * Small line chart for dense dashboard tiles; uses measured width so Recharts gets non-zero dimensions.
 */
export function SparklineBlock({ points, color = '#38bdf8', height = 80 }: SparklineBlockProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.max(0, Math.floor(entries[0]?.contentRect.width ?? 0)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length === 0) return null;

  const data = points.map((p) => ({ name: p.label, v: p.value }));

  return (
    <div ref={containerRef} className="w-full min-w-0 mt-1" style={{ height }} aria-hidden>
      {width > 0 ? (
        <ResponsiveContainer width={width} height={height}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '6px',
                fontSize: '11px',
              }}
            />
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="w-full h-full rounded bg-app-bg/30" />
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { DoraProcessingDual, LucyProcessingDual } from './DoraPilot';

const CYCLING_MESSAGES = [
  'Analyzing your question...',
  'Querying company data...',
  'Synthesizing answer...',
];

export type ThinkingIndicatorVariant = 'static' | 'cycling';

interface ThinkingIndicatorProps {
  /**
   * `static` — one line (default). Avoids rotating status copy while v2 / slow streams wait for first token.
   * `cycling` — legacy rotating messages (~2.2s each).
   */
  variant?: ThinkingIndicatorVariant;
  /** Override label when variant is `static` */
  label?: string;
  /** Marketing Lucy rail uses Lucy marks; default Dora elsewhere. */
  brand?: 'dora' | 'lucy';
}

function ThinkingIndicatorShell({
  children,
  brand = 'dora',
}: {
  children: React.ReactNode;
  brand?: 'dora' | 'lucy';
}) {
  const lucy = brand === 'lucy';
  return (
    <div
      className="dora-fade-up"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0,
        padding: '8px 16px 8px 10px',
        background: 'rgba(15, 23, 42, 0.5)',
        border: lucy ? '1px solid rgba(168, 85, 247, 0.12)' : '1px solid rgba(56, 189, 248, 0.08)',
        borderRadius: 16,
        backdropFilter: 'blur(12px)',
      }}
    >
      {lucy ? <LucyProcessingDual size={20} /> : <DoraProcessingDual size={20} />}
      <div
        style={{
          width: 1,
        height: 24,
        background: lucy ? 'rgba(168, 85, 247, 0.15)' : 'rgba(56, 189, 248, 0.12)',
          marginLeft: 4,
          marginRight: 14,
          flexShrink: 0,
        }}
      />
      {children}
    </div>
  );
}

function ThinkingIndicatorStatic({ label, brand }: { label: string; brand: 'dora' | 'lucy' }) {
  return (
    <ThinkingIndicatorShell brand={brand}>
      <span
        className="dora-font dora-chat-text-secondary"
        style={{ fontSize: 13, whiteSpace: 'nowrap' }}
      >
        {label}
      </span>
    </ThinkingIndicatorShell>
  );
}

function ThinkingIndicatorCycling({ brand }: { brand: 'dora' | 'lucy' }) {
  const [messageIdx, setMessageIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = setTimeout(() => {
        setMessageIdx((prev) => (prev + 1) % CYCLING_MESSAGES.length);
        setVisible(true);
      }, 250);
    }, 2200);
    return () => {
      clearInterval(interval);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  return (
    <ThinkingIndicatorShell brand={brand}>
      <span
        className="dora-font dora-chat-text-secondary"
        style={{
          fontSize: 13,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s ease',
          whiteSpace: 'nowrap',
        }}
      >
        {CYCLING_MESSAGES[messageIdx]}
      </span>
    </ThinkingIndicatorShell>
  );
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  variant = 'static',
  label = 'Working on your answer…',
  brand = 'dora',
}) => {
  if (variant === 'cycling') {
    return <ThinkingIndicatorCycling brand={brand} />;
  }
  return <ThinkingIndicatorStatic label={label} brand={brand} />;
};

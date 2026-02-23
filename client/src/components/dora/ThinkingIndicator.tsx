import React from 'react';
import { DoraProcessingDual } from './DoraPilot';

interface ThinkingIndicatorProps {
  statusText?: string;
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  statusText = 'Analyzing your question',
}) => (
  <div
    className="dora-fade-up"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 0',
    }}
  >
    <DoraProcessingDual size={20} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11.5,
          color: 'var(--dora-text-2, #94a3b8)',
        }}
      >
        <span style={{ color: 'var(--dora-primary, #38bdf8)', fontWeight: 500 }}>
          Reasoning
        </span>
        <span>&middot;</span>
        <span style={{ fontSize: 10, color: 'var(--dora-text-3, #64748b)' }}>
          {statusText}
        </span>
      </div>
      <div
        style={{
          height: 2,
          width: 140,
          borderRadius: 2,
          overflow: 'hidden',
          background: 'rgba(148,163,184,0.08)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: '60%',
            background: 'linear-gradient(90deg, var(--dora-primary, #38bdf8), var(--dora-accent, #8b5cf6))',
            borderRadius: 2,
            backgroundSize: '200% 100%',
            animation: 'dora-shimmer 1.5s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  </div>
);

import React, { useState, useEffect } from 'react';
import { DoraProcessingDual } from './DoraPilot';

const CYCLING_MESSAGES = [
  'Analyzing your question...',
  'Querying company data...',
  'Synthesizing answer...',
];

export const ThinkingIndicator: React.FC = () => {
  const [messageIdx, setMessageIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMessageIdx((prev) => (prev + 1) % CYCLING_MESSAGES.length);
        setVisible(true);
      }, 250);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="dora-fade-up"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0,
        padding: '8px 16px 8px 10px',
        background: 'rgba(15, 23, 42, 0.5)',
        border: '1px solid rgba(56, 189, 248, 0.08)',
        borderRadius: 16,
        backdropFilter: 'blur(12px)',
      }}
    >
      <DoraProcessingDual size={20} />

      {/* Divider */}
      <div style={{
        width: 1,
        height: 24,
        background: 'rgba(56, 189, 248, 0.12)',
        marginLeft: 4,
        marginRight: 14,
        flexShrink: 0,
      }} />

      {/* Cycling status text */}
      <span
        style={{
          fontSize: 13,
          color: '#94a3b8',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s ease',
          whiteSpace: 'nowrap',
        }}
      >
        {CYCLING_MESSAGES[messageIdx]}
      </span>
    </div>
  );
};

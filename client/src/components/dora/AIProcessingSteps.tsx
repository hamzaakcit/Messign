import React from 'react';
import type { ProcessingStep } from '@/types/knowledge-hub/ai';
import { DoraProcessingDual } from './DoraPilot';

interface AIProcessingStepsProps {
  steps: ProcessingStep[];
}

function StepIcon({ status }: { status: ProcessingStep['status'] }) {
  if (status === 'completed') {
    return (
      <div
        className="dora-step-check"
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'rgba(34, 197, 94, 0.2)',
          border: '1.5px solid rgba(34, 197, 94, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6.5L4.5 9L10 3"
            stroke="rgb(34, 197, 94)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  if (status === 'active') {
    return (
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: '1.5px solid rgba(56, 189, 248, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          animation: 'dora-step-pulse 1.8s ease-in-out infinite',
          background: 'rgba(56, 189, 248, 0.1)',
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'rgb(56, 189, 248)',
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: '1.5px solid rgba(148, 163, 184, 0.25)',
        flexShrink: 0,
      }}
    />
  );
}

export const AIProcessingSteps: React.FC<AIProcessingStepsProps> = ({ steps }) => {
  if (steps.length === 0) return null;

  return (
    <div className="dora-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          padding: '10px 16px 10px 10px',
          background: 'rgba(15, 23, 42, 0.5)',
          border: '1px solid rgba(56, 189, 248, 0.08)',
          borderRadius: 16,
          backdropFilter: 'blur(12px)',
          maxWidth: 340,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            marginBottom: steps.length > 0 ? 8 : 0,
          }}
        >
          <DoraProcessingDual size={16} />
          <div
            style={{
              width: 1,
              height: 20,
              background: 'rgba(56, 189, 248, 0.12)',
              marginLeft: 4,
              marginRight: 12,
              flexShrink: 0,
            }}
          />
          <span
            className="dora-font dora-chat-text-secondary"
            style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}
          >
            Processing your request
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4 }}>
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            return (
              <div
                key={step.phase}
                className="dora-fade-up"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingLeft: 8,
                  position: 'relative',
                }}
              >
                {!isLast && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 15.5,
                      top: 18,
                      width: 1,
                      height: 'calc(100% + 4px)',
                      background:
                        step.status === 'completed'
                          ? 'rgba(34, 197, 94, 0.2)'
                          : 'rgba(148, 163, 184, 0.12)',
                    }}
                  />
                )}
                <StepIcon status={step.status} />
                <span
                  className="dora-font"
                  style={{
                    fontSize: 12,
                    color:
                      step.status === 'active'
                        ? 'rgb(186, 230, 253)'
                        : step.status === 'completed'
                          ? 'rgba(148, 163, 184, 0.7)'
                          : 'rgba(148, 163, 184, 0.4)',
                    fontWeight: step.status === 'active' ? 500 : 400,
                    whiteSpace: 'nowrap',
                    transition: 'color 0.3s ease',
                  }}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes dora-step-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.3); }
          50% { box-shadow: 0 0 0 4px rgba(56, 189, 248, 0); }
        }
        .dora-step-check {
          animation: dora-step-appear 0.3s ease-out;
        }
        @keyframes dora-step-appear {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

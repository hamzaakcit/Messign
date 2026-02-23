import { useId } from 'react';

interface Props {
  size?: number;
  className?: string;
}

export function AiAssistantIcon({ size = 22, className = '' }: Props) {
  const id = useId().replace(/:/g, '');
  const gradId = `ai-nav-grad-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: 'drop-shadow(0 0 4px rgba(99,102,241,0.5))' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <g transform="translate(10,11)">
        <path
          d="M0,-7 L7,3 L1.5,0.5 L0,6 L-1.5,0.5 L-7,3 Z"
          fill={`url(#${gradId})`}
          opacity="0.95"
        />
        <path d="M0,-7 L7,3 L1.5,0.5 Z" fill="rgba(255,255,255,0.2)" />
      </g>
      {/* Plus badge */}
      <g transform="translate(17,4)">
        <circle r="3" fill="#0f172a" stroke={`url(#${gradId})`} strokeWidth="0.8" />
        <line x1="-1.2" y1="0" x2="1.2" y2="0" stroke="white" strokeWidth="0.9" strokeLinecap="round" />
        <line x1="0" y1="-1.2" x2="0" y2="1.2" stroke="white" strokeWidth="0.9" strokeLinecap="round" />
      </g>
    </svg>
  );
}

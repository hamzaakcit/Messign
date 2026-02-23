import { useId } from 'react';

interface Props {
  size?: number;
  active?: boolean;
  className?: string;
}

export function KnowledgeHubIcon({ size = 22, active = false, className = '' }: Props) {
  const id = useId().replace(/:/g, '');
  const gradId = `kh-grad-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        filter: active ? 'drop-shadow(0 0 6px rgba(59,130,246,0.4))' : 'none',
      }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <g transform="translate(11,11)">
        <path
          d="M-1,-6 L-1,6 Q-1,7 -2,7 L-7,7 Q-8,7 -8,6 L-8,-4 Q-8,-5 -7,-6 L-2,-6 Q-1,-6 -1,-5Z"
          fill={active ? `url(#${gradId})` : '#4b5563'}
          opacity="0.9"
        />
        <path
          d="M1,-6 L1,6 Q1,7 2,7 L7,7 Q8,7 8,6 L8,-4 Q8,-5 7,-6 L2,-6 Q1,-6 1,-5Z"
          fill={active ? `url(#${gradId})` : '#4b5563'}
          opacity="0.7"
        />
        <rect x="-1" y="-6" width="2" height="13" rx="0.3" fill={active ? `url(#${gradId})` : '#374151'} opacity="0.5" />
        {size >= 24 && (
          <>
            <line x1="-7" y1="-3" x2="-3" y2="-3" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" strokeLinecap="round" />
            <line x1="-7" y1="0" x2="-4" y2="0" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" strokeLinecap="round" />
            <line x1="-7" y1="3" x2="-3" y2="3" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" strokeLinecap="round" />
          </>
        )}
      </g>
    </svg>
  );
}

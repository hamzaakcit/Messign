import { useId } from 'react';

export interface LucyPilotSVGProps {
  /** Viewport size in px (viewBox 64×64). */
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Lucy v2 mark — same paper-plane + aviator DNA as Dora, purple-dominant, wild hair, speed lines, sparks.
 */
export function LucyPilotSVG({ size = 64, className, title }: LucyPilotSVGProps): JSX.Element {
  const raw = useId().replace(/:/g, '_');
  const id = `lp_${raw}`;
  const pg = `${id}_pg`;
  const pgd = `${id}_pgd`;
  const hat = `${id}_hat`;
  const lens = `${id}_lens`;
  const hair = `${id}_hair`;
  const hair2 = `${id}_hair2`;
  const hair3 = `${id}_hair3`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden={title ? false : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={pg} x1="8" y1="16" x2="56" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C3AED" />
          <stop offset="0.55" stopColor="#9333EA" />
          <stop offset="1" stopColor="#C026D3" />
        </linearGradient>
        <linearGradient id={pgd} x1="8" y1="16" x2="56" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5B21B6" />
          <stop offset="0.5" stopColor="#7E22CE" />
          <stop offset="1" stopColor="#A21CAF" />
        </linearGradient>
        <linearGradient id={hat} x1="20" y1="8" x2="38" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e293b" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id={lens} x1="28" y1="16" x2="38" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A855F7" stopOpacity="0.9" />
          <stop offset="1" stopColor="#D946EF" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id={hair} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#7C3AED" />
          <stop offset="0.5" stopColor="#A855F7" />
          <stop offset="1" stopColor="#D946EF" />
        </linearGradient>
        <linearGradient id={hair2} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#9333EA" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
        <linearGradient id={hair3} x1="0" y1="0" x2="1" y2="0.8">
          <stop stopColor="#6D28D9" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>

      <g opacity={0.3}>
        <line x1="2" y1="22" x2="14" y2="22" stroke="#A855F7" strokeWidth="0.6" strokeLinecap="round">
          <animate attributeName="opacity" values="0.5;0.1;0.5" dur="0.8s" repeatCount="indefinite" />
        </line>
        <line x1="0" y1="28" x2="8" y2="28" stroke="#9333EA" strokeWidth="0.5" strokeLinecap="round">
          <animate attributeName="opacity" values="0.3;0.6;0.3" dur="0.6s" repeatCount="indefinite" />
        </line>
        <line x1="3" y1="38" x2="9" y2="38" stroke="#A855F7" strokeWidth="0.5" strokeLinecap="round">
          <animate attributeName="opacity" values="0.4;0.1;0.4" dur="0.9s" repeatCount="indefinite" />
        </line>
        <line x1="1" y1="44" x2="7" y2="44" stroke="#C026D3" strokeWidth="0.4" strokeLinecap="round">
          <animate attributeName="opacity" values="0.2;0.5;0.2" dur="0.7s" repeatCount="indefinite" />
        </line>
      </g>

      <path d="M10 32L52 14L44 32L52 50L10 32Z" fill={`url(#${pg})`} />
      <path d="M10 32L44 32" stroke={`url(#${pgd})`} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 31L50 15L43 31" fill="rgba(255,255,255,0.2)" />
      <path d="M12 33L43 33L50 49" fill="rgba(0,0,0,0.12)" />
      <path d="M28 26L44 32" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />
      <path d="M28 38L44 32" stroke="rgba(0,0,0,0.1)" strokeWidth="0.8" />

      <g>
        <path
          d="M22 14 Q16 8 8 6 Q12 4 18 7 Q14 2 6 1"
          fill="none"
          stroke={`url(#${hair})`}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M26 12 Q22 4 18 0 Q24 2 28 6"
          fill="none"
          stroke={`url(#${hair2})`}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M24 15 Q18 10 10 10 Q14 8 20 11"
          fill="none"
          stroke={`url(#${hair3})`}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path d="M28 11 Q26 2 22 -2" fill="none" stroke="#A855F7" strokeWidth="1.2" strokeLinecap="round" />
        <path
          d="M20 16 Q12 14 4 15 Q8 12 14 13"
          fill="none"
          stroke="#9333EA"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M21 18 Q14 20 6 22"
          fill="none"
          stroke={`url(#${hair})`}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M23 13 Q17 6 12 3"
          fill="none"
          stroke="#D946EF"
          strokeWidth="0.8"
          strokeLinecap="round"
          opacity={0.7}
        />
      </g>

      <g>
        <ellipse cx="30" cy="18" rx="11" ry="7" fill={`url(#${hat})`} />
        <path d="M19 19Q22 22 30 22Q38 22 41 19" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M24 13Q30 10 36 13" stroke="#475569" strokeWidth="0.8" fill="none" />
        <path d="M20 19L17 24Q18 26 20 25L21 21" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
        <path d="M40 19L43 24Q42 26 40 25L39 21" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
      </g>

      <g>
        <path d="M21 20Q30 23 39 20" stroke="#7C3AED" strokeWidth="1.5" fill="none" />
        <ellipse cx="26" cy="21" rx="4.5" ry="3.5" fill="none" stroke="#c4b5fd" strokeWidth="1.2" />
        <ellipse cx="35" cy="21" rx="4.5" ry="3.5" fill="none" stroke="#c4b5fd" strokeWidth="1.2" />
        <path d="M30 21.5Q30.5 20 31 21.5" stroke="#c4b5fd" strokeWidth="0.8" fill="none" />
        <ellipse cx="26" cy="21" rx="3.5" ry="2.5" fill={`url(#${lens})`} />
        <ellipse cx="35" cy="21" rx="3.5" ry="2.5" fill={`url(#${lens})`} />

        <g opacity={0.7}>
          <path
            d="M25 19.5 L24.5 21 L26 20.5 L25.5 22.5"
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M34 19.5 L33.5 21 L35 20.5 L34.5 22.5"
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        <g stroke="#A855F7" strokeWidth="0.7" strokeLinecap="round">
          <line x1="23" y1="18.5" x2="22" y2="16.5" />
          <line x1="25.5" y1="17.8" x2="25.2" y2="15.8" />
          <line x1="28" y1="18.5" x2="29" y2="16.5" />
        </g>
        <g stroke="#A855F7" strokeWidth="0.7" strokeLinecap="round">
          <line x1="32" y1="18.5" x2="31" y2="16.5" />
          <line x1="34.5" y1="17.8" x2="34.8" y2="15.8" />
          <line x1="37" y1="18.5" x2="38" y2="16.5" />
        </g>
      </g>

      <circle cx="12" cy="30" r="1.2" fill="#0f172a" stroke="#7C3AED" strokeWidth="0.5" />
      <circle cx="11" cy="34" r="1" fill="#0f172a" stroke="#9333EA" strokeWidth="0.5" />

      <g transform="translate(51, 11)">
        <path
          d="M0 -2.5 L0.8 -0.3 L-0.8 0.3 L0 2.5"
          fill="none"
          stroke="#FBBF24"
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <animate attributeName="opacity" values="1;0.2;0.8;0.1;1" dur="1.2s" repeatCount="indefinite" />
        </path>
      </g>
      <g transform="translate(54, 48)">
        <path
          d="M0 -2 L0.6 -0.2 L-0.6 0.2 L0 2"
          fill="none"
          stroke="#D946EF"
          strokeWidth="0.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <animate attributeName="opacity" values="0.6;1;0.3;0.9;0.6" dur="1.5s" repeatCount="indefinite" />
        </path>
      </g>
      <g transform="translate(53, 14)">
        <path
          d="M-1.5 0 L0 -1 L1.5 0"
          fill="none"
          stroke="#A855F7"
          strokeWidth="0.5"
          strokeLinecap="round"
        >
          <animate attributeName="opacity" values="0.8;0.1;0.8" dur="0.9s" repeatCount="indefinite" />
        </path>
      </g>
    </svg>
  );
}

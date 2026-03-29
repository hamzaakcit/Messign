import { useId } from 'react';

export interface LoginPaperPlaneGraphicProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Vector login hero plane — avoids raster halos/fringing from PNGs on dark backgrounds.
 * ViewBox matches the proportions of `scripts/generate-login-paper-plane-fal.mjs` fallback art.
 */
export function LoginPaperPlaneGraphic({
  className,
  style,
}: LoginPaperPlaneGraphicProps): JSX.Element {
  const uid = useId().replace(/:/g, '_');

  return (
    <svg
      data-testid="login-paper-plane"
      className={className}
      style={style}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`lp_wing_${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="45%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id={`lp_fold_${uid}`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#93c5fd" />
        </linearGradient>
        <linearGradient id={`lp_hi_${uid}`} x1="12%" y1="18%" x2="78%" y2="46%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.06" />
        </linearGradient>
        <filter
          id={`lp_soft_${uid}`}
          x="-25%"
          y="-25%"
          width="150%"
          height="150%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#020617" floodOpacity="0.4" />
        </filter>
      </defs>
      <g filter={`url(#lp_soft_${uid})`}>
        <path
          d="M13 50 L88 19 L74 50 L88 81 Z"
          fill={`url(#lp_wing_${uid})`}
          stroke={`url(#lp_fold_${uid})`}
          strokeWidth="1.1"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path d="M19 47 L78 22 L71 46 Z" fill={`url(#lp_hi_${uid})`} />
        <path d="M22 53 L71 53 L81 74 Z" fill="#0f172a" fillOpacity="0.14" />
        <path
          d="M13 50 L72 50"
          stroke={`url(#lp_fold_${uid})`}
          strokeWidth="1.35"
          strokeLinecap="round"
          opacity={0.88}
        />
      </g>
    </svg>
  );
}

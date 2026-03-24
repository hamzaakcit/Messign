import { cn } from '@/lib/utils';

export interface MessignLogoProps {
  /** dark = for dark backgrounds (white text, glow), light = for light backgrounds (dark text) */
  variant: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  showTagline?: boolean;
  animate?: boolean;
  /** When set, use this image for the logo (e.g. /logo.png) instead of the SVG. Use for exact brand asset. */
  logoSrc?: string;
  className?: string;
}

const SIZES = {
  sm: { icon: 32, text: 'text-lg', tagline: 'text-[10px]', gap: 'gap-2' },
  md: { icon: 40, text: 'text-xl', tagline: 'text-xs', gap: 'gap-2.5' },
  lg: { icon: 48, text: 'text-2xl', tagline: 'text-sm', gap: 'gap-3' },
  xl: { icon: 56, text: 'text-3xl', tagline: 'text-base', gap: 'gap-3.5' },
} as const;

/* Reference: icon gradient left cyan → center blue → right purple */
const GRADIENT_BG = 'linear-gradient(to right, #00D9D5 0%, #3B82F6 50%, #8B5CF6 100%)';
const GLOW_GRADIENT = 'linear-gradient(135deg, #00D9D5 0%, #3B82F6 50%, #8B5CF6 100%)';

export function MessignLogo({
  variant,
  size = 'md',
  showText = true,
  showTagline = false,
  animate = true,
  logoSrc,
  className = '',
}: MessignLogoProps) {
  const config = SIZES[size];
  const isDark = variant === 'dark';
  const textColor = isDark ? 'text-app-text' : 'text-[#1a2b4a]';
  const taglineColor = isDark ? 'text-app-muted' : 'text-app-muted';

  if (logoSrc) {
    const heightMap = { sm: 32, md: 40, lg: 48, xl: 56 } as const;
    const h = heightMap[size];
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <img
          src={logoSrc}
          alt="Messign"
          className="object-contain"
          style={{ maxHeight: h, height: h, width: 'auto' }}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex items-center', config.gap, className)}>
      {/* Logo Icon */}
      <div
        className={cn('relative shrink-0', animate && 'group')}
        style={{ width: config.icon, height: config.icon }}
      >
        {/* Glow effect for dark mode */}
        {isDark && (
          <div
            className="absolute inset-0 rounded-xl blur-lg opacity-50 transition-opacity duration-300 group-hover:opacity-75"
            style={{ background: GLOW_GRADIENT }}
            aria-hidden
          />
        )}

        {/* Icon container with gradient background */}
        <div
          className={cn(
            'relative w-full h-full rounded-xl overflow-hidden',
            animate && 'transition-transform duration-300 group-hover:scale-105'
          )}
          style={{
            background: GRADIENT_BG,
            boxShadow: isDark
              ? '0 4px 20px rgba(59, 130, 246, 0.3)'
              : '0 4px 12px rgba(59, 130, 246, 0.2)',
          }}
        >
          <svg
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full p-2"
            aria-hidden
          >
            {/* Left stroke */}
            <path
              d="M8 28L8 16L14 24"
              stroke="white"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={animate ? 'animate-draw-stroke' : ''}
            />
            {/* Middle stroke */}
            <path
              d="M14 24L20 14L26 24"
              stroke="white"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={animate ? 'animate-draw-stroke animation-delay-100' : ''}
            />
            {/* Right stroke */}
            <path
              d="M26 24L32 16L32 28"
              stroke="white"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={animate ? 'animate-draw-stroke animation-delay-200' : ''}
            />
          </svg>
        </div>
      </div>

      {/* Text */}
      {showText && (
        <div className="flex flex-col min-w-0">
          <span className={cn('font-semibold tracking-tight', config.text, textColor)}>
            Messign
            {isDark && (
              <span className="font-normal text-app-muted ml-1">Workspace</span>
            )}
          </span>
          {showTagline && (
            <span className={cn(config.tagline, taglineColor, '-mt-0.5')}>
              Your Message, Perfectly Designed
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export interface MessignIconProps {
  size?: number;
  variant?: 'dark' | 'light';
  animate?: boolean;
  className?: string;
}

/** Standalone icon for favicons, compact spaces. */
export function MessignIcon({
  size = 40,
  variant = 'dark',
  animate = true,
  className = '',
}: MessignIconProps) {
  const isDark = variant === 'dark';

  return (
    <div
      className={cn('relative shrink-0', animate && 'group', className)}
      style={{ width: size, height: size }}
    >
      {isDark && (
        <div
          className="absolute inset-0 rounded-xl blur-md opacity-40 transition-opacity group-hover:opacity-60"
          style={{ background: GLOW_GRADIENT }}
          aria-hidden
        />
      )}
      <div
        className={cn(
          'relative w-full h-full rounded-xl overflow-hidden',
          animate && 'transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg'
        )}
        style={{
          background: GRADIENT_BG,
          boxShadow: isDark
            ? '0 4px 20px rgba(99, 102, 241, 0.4)'
            : '0 2px 10px rgba(99, 102, 241, 0.25)',
        }}
      >
        <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-2" aria-hidden>
          <path
            d="M8 28L8 16L14 24"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 24L20 14L26 24"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M26 24L32 16L32 28"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

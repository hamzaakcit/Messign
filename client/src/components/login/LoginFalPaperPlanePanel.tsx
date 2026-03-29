import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { resolvePublicAssetUrl } from '@/lib/resolvePublicAssetUrl';
import { LoginCrewHero } from '@/components/login/LoginCrewHero';

const VIDEO_WEBM = '/login/paperplane-loop.webm';
const VIDEO_MP4 = '/login/paperplane-loop.mp4';

export interface LoginFalPaperPlanePanelProps {
  /** Fires once after the left wing entrance animation completes (welcome headline sync). */
  onHeroMotionReady?: () => void;
}

/**
 * Left wing (60% on md+): optional looping video under a gradient, Dora + Lucy only.
 * Hidden below `md` — mobile uses cockpit-only layout.
 */
export function LoginFalPaperPlanePanel({
  onHeroMotionReady,
}: LoginFalPaperPlanePanelProps): JSX.Element {
  const webmUrl = resolvePublicAssetUrl(VIDEO_WEBM);
  const mp4Url = resolvePublicAssetUrl(VIDEO_MP4);

  const [videoEnabled, setVideoEnabled] = useState(true);
  const firedReady = useRef(false);

  const onVideoError = useCallback(() => {
    setVideoEnabled(false);
  }, []);

  const handleShellComplete = (): void => {
    if (!firedReady.current && onHeroMotionReady) {
      firedReady.current = true;
      onHeroMotionReady();
    }
  };

  return (
    <div
      className="relative hidden h-full min-h-0 w-full flex-[0_0_60%] flex-col items-center justify-center overflow-hidden md:flex"
      style={{ background: '#121212' }}
      aria-hidden
    >
      {videoEnabled ? (
        <video
          data-testid="login-hero-video"
          className="absolute inset-0 h-full w-full object-cover opacity-90"
          autoPlay
          muted
          loop
          playsInline
          onError={onVideoError}
        >
          <source src={webmUrl} type="video/webm" />
          <source src={mp4Url} type="video/mp4" />
        </video>
      ) : null}

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: videoEnabled
            ? 'linear-gradient(180deg, rgba(18,18,18,0.75) 0%, rgba(18,18,18,0.55) 40%, rgba(18,18,18,0.92) 100%)'
            : 'radial-gradient(ellipse 90% 70% at 50% 38%, rgba(59, 130, 246, 0.14) 0%, transparent 55%), linear-gradient(168deg, #0a0a0a 0%, #121212 48%, #0a0a0a 100%)',
        }}
      />

      <div
        className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-1/4 h-64 w-64 rounded-full bg-blue-900/10 blur-3xl"
        aria-hidden
      />

      <motion.div
        className="relative z-[1] flex min-h-0 w-full max-w-[min(92vw,560px)] flex-col items-center justify-center px-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={handleShellComplete}
      >
        <p
          className="mb-10 max-w-md text-center text-[11px] font-medium uppercase tracking-[0.28em] text-white/55"
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          Your Ambition, Taken Flight.
        </p>

        <div className="relative w-full overflow-visible">
          <LoginCrewHero />
        </div>
      </motion.div>
    </div>
  );
}

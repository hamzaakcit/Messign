import { DoraPilotFace } from '@/components/dora/DoraPilot';
import { LucyPilotSVG } from '@/pages/marketing/components/lucy/LucyPilotSVG';

/**
 * Login left wing: Dora and Lucy pilot marks only (no center plane).
 */
export function LoginCrewHero(): JSX.Element {
  return (
    <div
      className="flex w-full max-w-[min(92vw,480px)] flex-row items-end justify-center gap-10 px-4 sm:gap-16"
      data-testid="login-crew-hero"
    >
      <figure className="flex flex-col items-center sm:w-[96px]">
        <figcaption className="mb-2 text-[9px] font-medium uppercase tracking-[0.22em] text-white/40">
          Dora
        </figcaption>
        <div
          className="drop-shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
          style={{ width: 88, height: 88 }}
        >
          <DoraPilotFace size={88} phase="idle" />
        </div>
      </figure>

      <figure className="flex flex-col items-center sm:w-[96px]">
        <figcaption className="mb-2 text-[9px] font-medium uppercase tracking-[0.22em] text-white/40">
          Lucy
        </figcaption>
        <div className="drop-shadow-[0_10px_28px_rgba(0,0,0,0.45)]">
          <LucyPilotSVG size={88} title="Lucy" />
        </div>
      </figure>
    </div>
  );
}

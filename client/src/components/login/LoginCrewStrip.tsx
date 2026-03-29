import { DoraPilotFace } from '@/components/dora/DoraPilot';
import { LucyPilotSVG } from '@/pages/marketing/components/lucy/LucyPilotSVG';

/**
 * Compact Dora + Lucy strip for narrow viewports (left hero is hidden below `md`).
 */
export function LoginCrewStrip(): JSX.Element {
  return (
    <div
      className="mb-5 flex items-center justify-center gap-6 md:hidden"
      aria-hidden
      data-testid="login-crew-strip"
    >
      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-white/35">Dora</span>
        <div className="drop-shadow-lg" style={{ width: 52, height: 52 }}>
          <DoraPilotFace size={52} phase="idle" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-white/35">Lucy</span>
        <div className="drop-shadow-lg">
          <LucyPilotSVG size={52} title="Lucy" />
        </div>
      </div>
    </div>
  );
}

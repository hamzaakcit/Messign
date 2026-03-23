// Re-export barrel — all components moved to ./pilot/ for single-responsibility modules.
// This file kept for backward compatibility; all existing imports continue to work.
export {
  PilotPlaneSVG,
  DoraSidebarLogo,
  DoraHeroLogo,
  DoraProcessingLogo,
  DoraChatAvatar,
  DoraPilotFace,
  DoraWelcomeHero,
  DoraProcessingDual,
} from './pilot';
export type { FacePhase } from './pilot';

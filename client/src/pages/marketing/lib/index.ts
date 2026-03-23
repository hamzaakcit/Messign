// ─────────────────────────────────────────────────────────────────────────────
// Messign Visual Architect — Public API · v2.0
// ─────────────────────────────────────────────────────────────────────────────

export type {
  UnlayerBody,
  UnlayerContentBlock,
  UnlayerTextBlock,
  UnlayerImageBlock,
  UnlayerButtonBlock,
  UnlayerDividerBlock,
  UnlayerSocialBlock,
  UnlayerHtmlBlock,
  UnlayerBackgroundImage,
} from './types/unlayer.types';

export type {
  LayoutPreset,
  ColorTheme,
  HeroImageStyle,
  VisualStyle,
  LayoutDensity,
  CTAStyle,
  Alignment,
} from './types/designManifest.types';
export { validateManifest as validateLegacyManifest } from './types/designManifest.types';

export {
  SPACING,
  LUXURY_SPACING,
  TYPOGRAPHY,
  RADII,
  DEFAULT_BORDER_RADIUS,
  MIN_ROW_PADDING,
  BUTTON_DEFAULTS,
  BUTTON_PILL,
  BUTTON_SHARP,
  IMAGE_DEFAULTS,
  CONTENT_WIDTH,
  COLOR_PALETTES,
  GOOGLE_FONTS,
  MESSIGN_BRAND,
  resolvePalette,
  resolveRowPadding,
  buildArtDirectionSuffix,
  enhanceImagePrompt,
} from './designTokens';
export type { ColorPalette, GoogleFontConfig, ArtDirectionModifier } from './designTokens';

export {
  buildLogoHeaderRow,
  buildHeroRow,
  buildHeadlineRow,
  buildBodyRow,
  buildFeatureGridRow,
  buildCTARow,
  buildImageTextRow,
  buildDividerRow,
  buildTestimonialRow,
  buildSocialRow,
  buildFooterRow,
  buildProductGrid,
  getVa2Builder,
  getRegisteredSectionTypes,
} from './blockBuilders';

export {
  assembleLegacyDesign,
  assembleDesign,
  validateManifest,
  buildSafeMinimalist,
  withUnlayerCounters,
} from './designAssembler';
export type { ResolvedAssets, UnlayerDesignWithCounters } from './designAssembler';

export { parseManifestFromLLMOutput, cleanJsonString, mightContainManifest } from './manifestParser';
export type { ManifestParseResult } from './manifestParser';

export {
  emailAiDraftToDesign,
  emailAiDraftToDesignSync,
  buildEmailDesignFromAiDraft,
  parseStructuredEmailDraft,
  cloneMinimalEmptyDesign,
  cloneConversionEmptyDesign,
  extractBrandEmailColors,
  plainTextFromHtml,
  splitBodyWithCtas,
  parseLinesToSegments,
} from './emailAiDraftToDesign';
export type {
  EmailAiDraftToDesignOptions,
  EmailDesignResult,
  VisualArchitectConfig,
  ImageResolver,
  ImageGenerationRequest,
  ParsedEmailDraft,
  BrandEmailColors,
  EmailLayoutStyle,
  BuildEmailDesignOptions,
} from './emailAiDraftToDesign';

export {
  buildOverlayRow,
  generateOverlayHTML,
  injectOverlays,
  removeAllOverlays,
  getActiveOverlays,
  hasOverlays,
  VA2_THEME_FILTERS,
  MOTION_PRESETS,
  generateKeyframes,
  buildPhaseOverlayRow,
  calculateDepthProgression,
} from './overlayEngine';
export type {
  OverlayConfig,
  OverlayMotionConfig,
  OverlayPosition,
  MotionType,
  ThemeFilterMapping,
  OverlayPhase,
  OverlayInjectionPlan,
  PhaseMotionType,
} from './overlayEngine';

export {
  buildMultiPhaseOverlay,
  buildPaperPlaneEffect,
  applyPaperPlaneToLegacyDesign,
  isValidEasterEgg,
  EASTER_EGG_OPTIONS,
} from './specialEffects';
export type { EasterEggType } from './specialEffects';

export {
  getPlaneAssetUrl,
  buildFallbackPlaneSVG,
  resolvePlaneAssetAsync,
  setCachedPlaneUrl,
  hasCachedPlaneUrl,
  onPlaneAssetResolved,
  PLANE_WIDTH,
  PLANE_HEIGHT,
} from './paperPlaneAssets';

export * from './types';

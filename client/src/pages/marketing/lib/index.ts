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
  VA2_IMAGE_GEN_DIMENSIONS,
  VA2_IMAGE_TEXT_DISPLAY_WIDTH_PX,
  VA2_IMAGE_TEXT_COLUMN_WIDTH_PX,
  VA2_IMAGE_TEXT_STACKED_WIDTH_PX,
  VA2_PRODUCT_IMAGE_DISPLAY_PX,
  HERO_PHOTO_MIN_HEIGHT_PX,
  VA2_SECTION_HORIZONTAL_GUTTER_PX,
  CONTENT_WIDTH,
  COLOR_PALETTES,
  GOOGLE_FONTS,
  MESSIGN_BRAND,
  resolvePalette,
  resolveRowPadding,
  buildArtDirectionSuffix,
  enhanceImagePrompt,
  mergeBrandIntoTheme,
  clampAccentForWcagAaOnSurfaces,
  getTheme,
} from './designTokens';
export type { ColorPalette, GoogleFontConfig, ArtDirectionModifier, BrandThemeOverrides } from './designTokens';

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
  assembleDesignFull,
  runEmailAssemblyPipeline,
  utmParamsFromManifestMetadata,
  normalizePreheaderForEmail,
  validateManifest,
  formatManifestValidationWarningsAsStrings,
  buildSafeMinimalist,
  withUnlayerCounters,
} from './designAssembler';
export type { ResolvedAssets, UnlayerDesignWithCounters, AutoFooterDefaults, AssembleDesignOptions } from './designAssembler';
export { validateCopyQuality, type CopyQualityWarning } from './validateCopyQuality.js';
export { normalizeVa2SectionContent } from './va2ManifestNormalize';
export { legacyFlatManifestToVa2, legacyColorThemeToVa2Theme } from './legacyFlatToVa2';
export {
  getEmailAssemblyPathMetrics,
  resetEmailAssemblyPathMetricsForTests,
} from './emailAssemblyPathMetrics';
export {
  truncateInboxLine,
  TYPICAL_SUBJECT_MAX,
  TYPICAL_PREHEADER_MAX,
  evaluateInboxCopy,
  RECOMMENDED_PREHEADER_MIN_CHARS,
  RECOMMENDED_PREHEADER_MAX_CHARS,
} from './emailInboxPreview';
export { enforceAccessibility, contrastRatio, stripEmailHiddenPreheader } from './accessibilityEnforcer';
export { countImageSlotsInManifest } from './emailManifestImageSlots';
export {
  enrichManifestForVisualDensity,
  MIN_CAMPAIGN_IMAGE_SLOTS,
  MAX_CAMPAIGN_IMAGE_SLOTS,
  DEFAULT_CAMPAIGN_IMAGE_SLOTS,
  resolveTargetImageSlots,
} from './enrichManifestVisuals';
export {
  estimateUnlayerDesignHtmlWeight,
  ESTIMATED_HTML_EXPORT_WARN_KB,
} from './estimateUnlayerDesignHtmlWeight';
export type { UnlayerDesignHtmlWeightEstimate } from './estimateUnlayerDesignHtmlWeight';
export {
  resolveAssetsForVa2Manifest,
  mergeResolvedAssetsIntoVa2Manifest,
} from './resolveVa2ManifestImages';

export {
  parseManifestFromLLMOutput,
  cleanJsonString,
  mightContainManifest,
  applyDensityToManifestSections,
} from './manifestParser';
export type { ManifestParseResult } from './manifestParser';

export {
  emailAiDraftToDesign,
  emailAiDraftToDesignSync,
  buildEmailDesignFromAiDraft,
  parseStructuredEmailDraft,
  cloneMinimalEmptyDesign,
  cloneConversionEmptyDesign,
  extractBrandEmailColors,
  extractBrandLogoUrl,
  extractBrandFooterDefaults,
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
  BrandFooterDefaults,
  EmailLayoutStyle,
  BuildEmailDesignOptions,
} from './emailAiDraftToDesign';

export {
  DEFAULT_EMAIL_HEADER_LOGO_PATH,
  getDefaultEmailHeaderLogoUrl,
  resolveLogoUrlForEmailAssembly,
  buildEmailBrandOverridesForAssembly,
} from './emailBrandHeaderOverrides';

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
  estimateEmailHeightForOverlay,
} from './specialEffects';
export type { EasterEggType, BuildMultiPhaseOverlayOptions } from './specialEffects';

export {
  resolveMotionOverlayFromManifest,
  manifestToPaperPlaneUiEffect,
  paperPlaneUiEffectToManifestFields,
  isValidMotionOverlayValue,
  isValidOverlayIntensityValue,
} from './motionOverlayManifest';
export type {
  MotionOverlayMode,
  OverlayIntensity,
  PaperPlaneUiEffect,
  ResolvedMotionOverlay,
} from './motionOverlayManifest';

export { trackVa2EmailTelemetry, trackVa2EmailResolveTelemetry } from './emailMarketingTelemetry';
export type { Va2EmailResolveTelemetryPayload } from './emailMarketingTelemetry';
export type { ResolveEmailImagesResponse, EmailImageSlotStatus, EmailImageSlotResult } from './emailResolveTypes';

export {
  getPlaneAssetUrl,
  getDefaultStaticPlaneAssetUrl,
  preloadPaperPlaneAssets,
  resolvePlaneAssetAsync,
  setCachedPlaneUrl,
  hasCachedPlaneUrl,
  onPlaneAssetResolved,
  normalizeBrandHexForOverlay,
  PLANE_WIDTH,
  PLANE_HEIGHT,
} from './paperPlaneAssets';
export type { ResolvePlaneAssetOptions } from './paperPlaneAssets';

export * from './types';

export {
  buildInstagramAgentMessage,
  validateInstagramAgentForm,
  MIN_INSTAGRAM_IMAGE_DESCRIPTION_LENGTH,
} from './buildInstagramAgentMessage';
export type { InstagramAgentFormValues } from './buildInstagramAgentMessage';

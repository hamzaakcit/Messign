// Barrel re-export — keeps all existing `from './blockBuilders'` imports working.

export { uid, pad, wrapHtml, makeRow, makeColumn, resolveButtonStyle } from './shared';

export type { BlockBuilderOptions, BlockBuilder } from './types';

export { createSingleColumnRow, createTwoColumnRow } from './va2Shared';

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
} from './legacyBuilders';
export type { HeroConfig, FeatureGridConfig, ImageTextConfig } from './legacyBuilders';

export { buildPreheader, buildHeroSection } from './heroBuilder';

export { buildTextBlock, buildImageBlock, buildValuePropGrid, buildStatsCounter, buildLogoBar } from './contentBuilders';

export { buildCTASection, buildDividerBlock } from './ctaBuilder';

export { buildTestimonialCard, buildSocialProofBar, buildFooterBlock } from './socialBuilders';

export { buildProductGrid } from './productBuilder';

export { buildImageTextSection } from './imageTextBuilder';

export { getVa2Builder, getRegisteredSectionTypes } from './registry';

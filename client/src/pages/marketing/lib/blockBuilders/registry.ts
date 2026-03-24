import type { SectionType } from '../types/manifestTypes';
import type { BlockBuilder } from './types';
import { buildPreheader, buildHeroSection } from './heroBuilder';
import { buildValuePropGrid, buildTextBlock, buildImageBlock } from './contentBuilders';
import { buildCTASection, buildDividerBlock } from './ctaBuilder';
import { buildTestimonialCard, buildSocialProofBar, buildFooterBlock } from './socialBuilders';
import { buildProductGrid } from './productBuilder';
import { buildImageTextSection } from './imageTextBuilder';

/**
 * Registry mapping section types to their builder functions.
 * Used by the design assembler to look up the correct builder per section.
 */
const VA2_BUILDER_REGISTRY: Record<SectionType, BlockBuilder> = {
  preheader: buildPreheader as BlockBuilder,
  hero: buildHeroSection as BlockBuilder,
  value_prop: buildValuePropGrid as BlockBuilder,
  testimonial: buildTestimonialCard as BlockBuilder,
  social_proof: buildSocialProofBar as BlockBuilder,
  text_block: buildTextBlock as BlockBuilder,
  image: buildImageBlock as BlockBuilder,
  image_text: buildImageTextSection as BlockBuilder,
  cta: buildCTASection as BlockBuilder,
  divider: buildDividerBlock as BlockBuilder,
  footer: buildFooterBlock as BlockBuilder,
  product_grid: buildProductGrid as BlockBuilder,
};

/**
 * Get the VA2 block builder for a section type.
 * Returns undefined if no builder exists for the given type.
 */
export function getVa2Builder(type: SectionType | string): BlockBuilder | undefined {
  return VA2_BUILDER_REGISTRY[type as SectionType];
}

/**
 * Get all registered VA2 section types.
 */
export function getRegisteredSectionTypes(): SectionType[] {
  return Object.keys(VA2_BUILDER_REGISTRY) as SectionType[];
}

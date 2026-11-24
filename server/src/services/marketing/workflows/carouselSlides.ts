/**
 * Carousel slide edits. A post can hold at most five slides.
 * Regenerating one slide leaves the others unchanged.
 * Roles, in order: cover, product, detail, proof, close.
 */

import {
  CAROUSEL_SLIDE_ROLES,
  type CarouselSlideRole,
} from '../../../dal/marketing/instagramTypes.js';

export const MAX_CAROUSEL_SLIDES = 5;

export interface CarouselSlideRecord {
  index: number;
  image_url: string;
  prompt: string;
  storage_key?: string | null;
  role?: CarouselSlideRole;
  claim?: string;
}

export interface CarouselSlideUpdate {
  image_url: string;
  prompt: string;
  storage_key?: string | null;
  claim?: string;
}

export interface CarouselRolePrompt {
  index: number;
  role: CarouselSlideRole;
  claim: string;
  prompt: string;
}

/**
 * Role for a slide index. Null past the fifth slide.
 */
export function carouselRole(index: number): CarouselSlideRole | null {
  return CAROUSEL_SLIDE_ROLES[index] ?? null;
}

/**
 * True when Fal echoed a prompt that does not name the product.
 * A missing prompt field is left to the request check.
 */
export function returnedPromptOmitsProduct(
  returned: string | null | undefined,
  product: string,
): boolean {
  const named = product.trim();
  if (!named || returned == null) return false;
  return !returned.toLocaleLowerCase('tr').includes(named.toLocaleLowerCase('tr'));
}

/**
 * Keep the prompt, and add the product name when it is missing.
 */
export function promptWithProduct(prompt: string, product: string): string {
  const named = product.trim();
  const scene = prompt.trim();
  if (!named) return scene;
  if (scene.toLocaleLowerCase('tr').includes(named.toLocaleLowerCase('tr'))) return scene;
  return scene ? `${scene}\n${named}` : named;
}

/**
 * Five slide prompts. Each one names the product. Price stays out.
 */
export function buildCarouselRolePrompts(input: {
  product: string;
  place: string;
  claim?: string;
}): CarouselRolePrompt[] {
  const product = input.product.trim();
  const place = input.place.trim();
  const claim = input.claim?.trim() ?? '';
  const atPlace = place ? ` at ${place}` : '';
  const lines = [
    `Cover still of ${product}${atPlace}.`,
    `${product} as the hero${atPlace}.`,
    `Close detail of ${product}${atPlace}.`,
    `${product} in the shop${atPlace}.`,
    `${product} ready at the end of the row${atPlace}.`,
  ];
  return CAROUSEL_SLIDE_ROLES.map((role, index) => ({
    index,
    role,
    claim,
    prompt: lines[index] ?? product,
  }));
}

/**
 * Flags that select the Flux Pro still. No reference photo, so Ultra stays off.
 */
export function carouselProRequest(product: string, place: string): {
  instagram_feed: true;
  scene_product?: string;
  scene_place?: string;
} {
  const namedProduct = product.trim();
  const namedPlace = place.trim();
  return {
    instagram_feed: true,
    ...(namedProduct ? { scene_product: namedProduct } : {}),
    ...(namedPlace ? { scene_place: namedPlace } : {}),
  };
}

/**
 * Whether `slideIndex` may be regenerated or appended.
 * Index equal to the current length appends a slide. A sixth slide is rejected.
 */
export function carouselEditAllowed(length: number, slideIndex: number): string | null {
  if (!Number.isInteger(slideIndex) || slideIndex < 0) {
    return 'Slide index must be a whole number.';
  }
  if (slideIndex > length) return 'Slide is out of range.';
  if (slideIndex === length && length >= MAX_CAROUSEL_SLIDES) {
    return 'A carousel can have at most 5 slides.';
  }
  return null;
}

/**
 * Indexes for a regenerate-all request. More than five slides is rejected.
 * A single image with no carousel rows regenerates index 0.
 */
export function regenAllSlideIndexes(length: number): { ok: true; indexes: number[] } | { ok: false; error: string } {
  const count = length <= 0 ? 1 : length;
  if (count > MAX_CAROUSEL_SLIDES) {
    return { ok: false, error: 'A carousel can have at most 5 slides.' };
  }
  return { ok: true, indexes: Array.from({ length: count }, (_, index) => index) };
}

/**
 * Replace one slide, or append when `slideIndex` equals the current length.
 * Other slides are copied through unchanged. The hero image is slide 0.
 */
export function applyCarouselSlideEdit(
  slides: readonly CarouselSlideRecord[],
  slideIndex: number,
  update: CarouselSlideUpdate,
): { ok: true; slides: CarouselSlideRecord[]; updatesHero: boolean } | { ok: false; error: string } {
  const blocked = carouselEditAllowed(slides.length, slideIndex);
  if (blocked) return { ok: false, error: blocked };

  if (slideIndex === slides.length) {
    return {
      ok: true,
      updatesHero: slideIndex === 0,
      slides: [
        ...slides.map((slide, index) => stampSlide(slide, index)),
        stampSlide(
          {
            index: slideIndex,
            image_url: update.image_url,
            prompt: update.prompt,
            storage_key: update.storage_key ?? null,
            claim: update.claim,
          },
          slideIndex,
          update.claim,
        ),
      ],
    };
  }

  return {
    ok: true,
    updatesHero: slideIndex === 0,
    slides: slides.map((slide, index) =>
      index === slideIndex
        ? stampSlide(
            {
              ...slide,
              index: slide.index ?? index,
              image_url: update.image_url,
              prompt: update.prompt,
              storage_key: update.storage_key ?? slide.storage_key ?? null,
            },
            index,
            update.claim ?? slide.claim,
          )
        : stampSlide(slide, index),
    ),
  };
}

function stampSlide(
  slide: CarouselSlideRecord,
  index: number,
  claim?: string,
): CarouselSlideRecord {
  const role = carouselRole(index) ?? 'close';
  return {
    index,
    image_url: slide.image_url,
    prompt: slide.prompt,
    storage_key: slide.storage_key ?? null,
    role,
    claim: (claim ?? slide.claim ?? '').trim(),
  };
}

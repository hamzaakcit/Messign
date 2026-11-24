/**
 * Which children an offer recipe is allowed to create.
 * Product drop: Instagram and email. Occasion: email, Instagram on by default.
 * Cart: email only.
 */

export type OfferRecipe = 'product_drop' | 'occasion' | 'cart';

export type RecipeChannel = 'instagram' | 'email';

const RECIPES: readonly OfferRecipe[] = ['product_drop', 'occasion', 'cart'];

/** Read `recipe:product_drop|occasion|cart` from content tags. */
export function recipeFromTags(tags: readonly string[] | null | undefined): OfferRecipe | null {
  if (!tags) return null;
  for (const tag of tags) {
    if (!tag.startsWith('recipe:')) continue;
    const value = tag.slice('recipe:'.length);
    if (RECIPES.includes(value as OfferRecipe)) return value as OfferRecipe;
  }
  return null;
}

/** Occasion can turn the Instagram slot off. Other recipes ignore this flag. */
export function includeInstagramFromTags(tags: readonly string[] | null | undefined): boolean {
  return !tags?.includes('ig_slot:off');
}

/**
 * Channels to create for a recipe, in slot order.
 * Cart never includes Instagram. Product drop always includes both.
 */
export function planRecipeChildren(
  recipe: OfferRecipe,
  options?: { includeInstagram?: boolean },
): RecipeChannel[] {
  if (recipe === 'cart') return ['email'];
  if (recipe === 'product_drop') return ['instagram', 'email'];
  return options?.includeInstagram === false ? ['email'] : ['email', 'instagram'];
}

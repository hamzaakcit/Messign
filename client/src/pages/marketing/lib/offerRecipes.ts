/**
 * Which children an offer recipe is allowed to create.
 * Kept in step with `server/src/services/marketing/offerRecipes.ts`.
 */

export type OfferRecipe = 'product_drop' | 'occasion' | 'cart';

export type RecipeChannel = 'instagram' | 'email';

/**
 * Channels to create for a recipe.
 * Cart never includes Instagram. Product drop always includes both.
 * Occasion includes Instagram unless `includeInstagram` is false.
 */
export function planRecipeChildren(
  recipe: OfferRecipe,
  options?: { includeInstagram?: boolean },
): RecipeChannel[] {
  if (recipe === 'cart') return ['email'];
  if (recipe === 'product_drop') return ['instagram', 'email'];
  return options?.includeInstagram === false ? ['email'] : ['email', 'instagram'];
}

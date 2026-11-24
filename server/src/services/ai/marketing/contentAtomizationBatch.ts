/**
 * Content atomization after approval.
 * Jobs follow the offer recipe. Cart does not queue an Instagram job.
 * There is no X or LinkedIn fan-out.
 */

import {
  planRecipeChildren,
  recipeFromTags,
  includeInstagramFromTags,
  type OfferRecipe,
  type RecipeChannel,
} from '../../marketing/offerRecipes.js';

export type AtomizationJobKind = 'unlayer_email_v2' | 'instagram_carousel' | 'x_post' | 'linkedin_post';

export interface ContentAtomizationBatchInput {
  contentId: string;
  organizationId: string;
  /** Source channel for the approved asset (e.g. instagram, email) */
  channel: string;
  /** Hero / key visual when available */
  heroImageUrl?: string | null;
  /** Offer or child tags. `recipe:*` selects the jobs. */
  tags?: readonly string[] | null;
}

export interface ContentAtomizationBatchResult {
  batchId: string;
  jobs: Array<{ kind: AtomizationJobKind; status: 'queued' | 'skipped'; note?: string }>;
}

function jobForChannel(channel: RecipeChannel): ContentAtomizationBatchResult['jobs'][number] {
  if (channel === 'email') {
    return { kind: 'unlayer_email_v2', status: 'queued', note: 'Journey email child' };
  }
  return { kind: 'instagram_carousel', status: 'queued', note: 'One Instagram child' };
}

/** Jobs for a known recipe. Unknown recipes queue nothing. */
export function atomizationJobsForRecipe(
  recipe: OfferRecipe | null,
  options?: { includeInstagram?: boolean },
): ContentAtomizationBatchResult['jobs'] {
  if (!recipe) return [];
  return planRecipeChildren(recipe, options).map(jobForChannel);
}

/**
 * Queue only the children the recipe allows.
 */
export async function runContentAtomizationAfterApproval(
  input: ContentAtomizationBatchInput,
): Promise<ContentAtomizationBatchResult> {
  const batchId = `atom_${input.contentId.slice(0, 8)}_${Date.now().toString(36)}`;
  const recipe = recipeFromTags(input.tags);
  const jobs = atomizationJobsForRecipe(recipe, {
    includeInstagram: includeInstagramFromTags(input.tags),
  });
  console.log('[contentAtomization] batch scheduled', { batchId, recipe, jobs: jobs.map((job) => job.kind) });
  return { batchId, jobs };
}

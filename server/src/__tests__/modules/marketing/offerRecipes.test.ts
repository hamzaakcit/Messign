import { describe, expect, it } from 'vitest';
import { atomizationJobsForRecipe } from '../../../services/ai/marketing/contentAtomizationBatch.js';
import { planRecipeChildren } from '../../../services/marketing/offerRecipes.js';
import { journeyEmailCreateInput } from '../../../services/marketing/journeyEmailDraft.js';

describe('offer recipes', () => {
  it('gives a product drop one Instagram child and one email', () => {
    expect(planRecipeChildren('product_drop')).toEqual(['instagram', 'email']);
    const jobs = atomizationJobsForRecipe('product_drop');
    expect(jobs.filter((job) => job.kind === 'instagram_carousel')).toHaveLength(1);
    expect(jobs.filter((job) => job.kind === 'unlayer_email_v2')).toHaveLength(1);
    expect(jobs.some((job) => job.kind === 'x_post' || job.kind === 'linkedin_post')).toBe(false);
  });

  it('gives a cart reminder zero Instagram rows', () => {
    expect(planRecipeChildren('cart')).toEqual(['email']);
    const jobs = atomizationJobsForRecipe('cart');
    expect(jobs.some((job) => job.kind === 'instagram_carousel')).toBe(false);
    expect(jobs.map((job) => job.kind)).toEqual(['unlayer_email_v2']);

    const email = journeyEmailCreateInput({
      id: 'offer-cart',
      title: 'Left in the basket',
      userBrief: 'The peony bouquet is still in the basket. The old note said ₺7.',
      tags: ['recipe:cart'],
    });
    expect(email.channel).toBe('email');
    expect(email.body).toContain('A public Instagram post is a different recipe');
    expect(email.body.split('\n').some((line) => line.startsWith('Price:'))).toBe(false);
    expect(email.tags.some((tag) => tag.startsWith('ig_format:'))).toBe(false);
  });

  it('keeps Instagram on for an occasion unless the slot is turned off', () => {
    expect(planRecipeChildren('occasion')).toEqual(['email', 'instagram']);
    expect(planRecipeChildren('occasion', { includeInstagram: false })).toEqual(['email']);
    expect(atomizationJobsForRecipe(null)).toEqual([]);
  });
});

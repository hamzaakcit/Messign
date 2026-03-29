import { describe, it, expect } from 'vitest';
import { validateManifest, runEmailAssemblyPipeline } from '@/pages/marketing/lib/designAssembler';
import b2bTechValuePropCaseRhythmManifest from '@/pages/marketing/unlayerTemplates/starters/b2bTechValuePropCaseRhythm.json';
import webinarAgendaSignupManifest from '@/pages/marketing/unlayerTemplates/starters/webinarAgendaSignup.json';
import b2bSaaSNewsletterDeepManifest from '@/pages/marketing/unlayerTemplates/starters/b2bSaaSNewsletterDeep.json';
import eventsSummitDeepManifest from '@/pages/marketing/unlayerTemplates/starters/eventsSummitDeep.json';
import onboardingLifecycleDeepManifest from '@/pages/marketing/unlayerTemplates/starters/onboardingLifecycleDeep.json';
import transactionalLifecycleCompactManifest from '@/pages/marketing/unlayerTemplates/starters/transactionalLifecycleCompact.json';
import b2bThoughtLeadershipNurtureManifest from '@/pages/marketing/unlayerTemplates/starters/b2bThoughtLeadershipNurture.json';
import d2cAbandonedCartRecoveryManifest from '@/pages/marketing/unlayerTemplates/starters/d2cAbandonedCartRecovery.json';
import saasProductReleaseChangelogManifest from '@/pages/marketing/unlayerTemplates/starters/saasProductReleaseChangelog.json';
import referralLoyaltyProgramNudgeManifest from '@/pages/marketing/unlayerTemplates/starters/referralLoyaltyProgramNudge.json';
import partnerCoMarketingWebinarManifest from '@/pages/marketing/unlayerTemplates/starters/partnerCoMarketingWebinar.json';
import d2cSeasonalGiftGuideManifest from '@/pages/marketing/unlayerTemplates/starters/d2cSeasonalGiftGuide.json';
import b2bSplitHeroProductStoryManifest from '@/pages/marketing/unlayerTemplates/starters/b2bSplitHeroProductStory.json';
import d2cEditorialTallLookbookManifest from '@/pages/marketing/unlayerTemplates/starters/d2cEditorialTallLookbook.json';
import onboardingProgressMilestoneManifest from '@/pages/marketing/unlayerTemplates/starters/onboardingProgressMilestone.json';
import b2bCustomerWinStoryManifest from '@/pages/marketing/unlayerTemplates/starters/b2bCustomerWinStory.json';
import realEstateOpenHouseListingManifest from '@/pages/marketing/unlayerTemplates/starters/realEstateOpenHouseListing.json';
import nonprofitImpactGivingCampaignManifest from '@/pages/marketing/unlayerTemplates/starters/nonprofitImpactGivingCampaign.json';
import foodHospitalityChefTableNightManifest from '@/pages/marketing/unlayerTemplates/starters/foodHospitalityChefTableNight.json';
import musicEntertainmentTourNightManifest from '@/pages/marketing/unlayerTemplates/starters/musicEntertainmentTourNight.json';

/**
 * Golden regression: fixed manifest must validate and assemble without drift in core metrics.
 */
describe('VA2 golden manifest assembly (Phase 2)', () => {
  it('validates and assembles b2bTechValuePropCaseRhythm starter with stable a11y score and row count', () => {
    const v = validateManifest(b2bTechValuePropCaseRhythmManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    const rowCount = result.design?.body.rows.length ?? 0;
    expect(rowCount).toBeGreaterThan(4);
    expect(result.metadata.sectionCount).toBeGreaterThan(3);
    expect(result.metadata.accessibilityScore).toBeDefined();
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: rowCount,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 6,
        "rows": 9,
        "score": 100,
        "sections": 9,
      }
    `);
  });

  it('validates and assembles webinarAgendaSignup starter (split hero + compact density)', () => {
    const v = validateManifest(webinarAgendaSignupManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    const rowCount = result.design?.body.rows.length ?? 0;
    expect(rowCount).toBeGreaterThan(2);
    expect(result.metadata.sectionCount).toBeGreaterThan(2);
    expect(result.metadata.accessibilityScore).toBeDefined();
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: rowCount,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 6,
        "rows": 8,
        "score": 100,
        "sections": 8,
      }
    `);
  });

  it('validates and assembles b2bSaaSNewsletterDeep starter (Phase 4 depth)', () => {
    const v = validateManifest(b2bSaaSNewsletterDeepManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    const rowCount = result.design?.body.rows.length ?? 0;
    expect(rowCount).toBeGreaterThan(6);
    expect(result.metadata.sectionCount).toBeGreaterThan(6);
    expect(result.metadata.accessibilityScore).toBeDefined();
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: rowCount,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 9,
        "rows": 13,
        "score": 100,
        "sections": 13,
      }
    `);
  });

  it('validates and assembles eventsSummitDeep starter (Phase 5)', () => {
    const v = validateManifest(eventsSummitDeepManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    const rowCount = result.design?.body.rows.length ?? 0;
    expect(rowCount).toBeGreaterThan(5);
    expect(result.metadata.sectionCount).toBeGreaterThan(5);
    expect(result.metadata.accessibilityScore).toBeDefined();
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: rowCount,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 5,
        "rows": 9,
        "score": 100,
        "sections": 9,
      }
    `);
  });

  it('validates and assembles onboardingLifecycleDeep starter (Phase 6)', () => {
    const v = validateManifest(onboardingLifecycleDeepManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    const rowCount = result.design?.body.rows.length ?? 0;
    expect(rowCount).toBeGreaterThan(6);
    expect(result.metadata.sectionCount).toBeGreaterThan(6);
    expect(result.metadata.accessibilityScore).toBeDefined();
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: rowCount,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 7,
        "rows": 9,
        "score": 100,
        "sections": 9,
      }
    `);
  });

  it('validates and assembles transactionalLifecycleCompact starter (Phase 6 minimal)', () => {
    const v = validateManifest(transactionalLifecycleCompactManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);
  });

  it('validates and assembles b2bThoughtLeadershipNurture starter (Phase 7)', () => {
    const v = validateManifest(b2bThoughtLeadershipNurtureManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    const rowCount = result.design?.body.rows.length ?? 0;
    expect(rowCount).toBeGreaterThan(5);
    expect(result.metadata.accessibilityScore).toBeDefined();
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: rowCount,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 6,
        "rows": 10,
        "score": 100,
        "sections": 10,
      }
    `);
  });

  it('validates and assembles d2cAbandonedCartRecovery starter (Phase 7)', () => {
    const v = validateManifest(d2cAbandonedCartRecoveryManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 5,
        "rows": 9,
        "score": 96,
        "sections": 9,
      }
    `);
  });

  it('validates and assembles saasProductReleaseChangelog starter (Phase 8)', () => {
    const v = validateManifest(saasProductReleaseChangelogManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    expect(v.warnings.some((w) => w.field === 'metadata.visual_density')).toBe(false);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 6,
        "rows": 9,
        "score": 100,
        "sections": 9,
      }
    `);
  });

  it('validates and assembles referralLoyaltyProgramNudge starter (Phase 8)', () => {
    const v = validateManifest(referralLoyaltyProgramNudgeManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 5,
        "rows": 8,
        "score": 100,
        "sections": 8,
      }
    `);
  });

  it('validates and assembles partnerCoMarketingWebinar starter (Phase 9)', () => {
    const v = validateManifest(partnerCoMarketingWebinarManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 6,
        "rows": 10,
        "score": 100,
        "sections": 10,
      }
    `);
  });

  it('validates and assembles d2cSeasonalGiftGuide starter (Phase 9)', () => {
    const v = validateManifest(d2cSeasonalGiftGuideManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 8,
        "rows": 12,
        "score": 90,
        "sections": 12,
      }
    `);
  });

  it('validates and assembles b2bSplitHeroProductStory starter (Phase 11)', () => {
    const v = validateManifest(b2bSplitHeroProductStoryManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 6,
        "rows": 8,
        "score": 100,
        "sections": 8,
      }
    `);
  });

  it('validates and assembles d2cEditorialTallLookbook starter (Phase 11)', () => {
    const v = validateManifest(d2cEditorialTallLookbookManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 8,
        "rows": 11,
        "score": 84,
        "sections": 11,
      }
    `);
  });

  it('validates and assembles onboardingProgressMilestone starter (Phase 12)', () => {
    const v = validateManifest(onboardingProgressMilestoneManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 5,
        "rows": 7,
        "score": 100,
        "sections": 7,
      }
    `);
  });

  it('validates and assembles b2bCustomerWinStory starter (Phase 12)', () => {
    const v = validateManifest(b2bCustomerWinStoryManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 4,
        "rows": 9,
        "score": 100,
        "sections": 9,
      }
    `);
  });

  it('validates and assembles realEstateOpenHouseListing starter (Phase 13)', () => {
    const v = validateManifest(realEstateOpenHouseListingManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 8,
        "rows": 9,
        "score": 96,
        "sections": 9,
      }
    `);
  });

  it('validates and assembles nonprofitImpactGivingCampaign starter (Phase 13)', () => {
    const v = validateManifest(nonprofitImpactGivingCampaignManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 6,
        "rows": 10,
        "score": 100,
        "sections": 10,
      }
    `);
  });

  it('validates and assembles foodHospitalityChefTableNight starter (Phase 13)', () => {
    const v = validateManifest(foodHospitalityChefTableNightManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 6,
        "rows": 9,
        "score": 96,
        "sections": 9,
      }
    `);
  });

  it('validates and assembles musicEntertainmentTourNight starter (Phase 13)', () => {
    const v = validateManifest(musicEntertainmentTourNightManifest as unknown);
    expect(v.valid).toBe(true);
    expect(v.errors).toHaveLength(0);
    const manifest = v.normalizedManifest;
    expect(manifest).toBeDefined();

    const result = runEmailAssemblyPipeline(manifest!);
    expect(result.success).toBe(true);
    expect(result.metadata.accessibilityScore).toBeGreaterThanOrEqual(70);

    expect({
      rows: result.design?.body.rows.length ?? 0,
      sections: result.metadata.sectionCount,
      score: result.metadata.accessibilityScore,
      imageSlots: result.metadata.imageSlotCount,
    }).toMatchInlineSnapshot(`
      {
        "imageSlots": 6,
        "rows": 10,
        "score": 100,
        "sections": 10,
      }
    `);
  });
});

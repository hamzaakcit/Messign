import type { UnlayerDisplayMode, UnlayerStarterTemplate } from './types';
import minimalDesign from './starters/minimal.json';
import emailConversionBase from './starters/emailConversionBase.json';
import productLaunchManifest from './starters/productLaunch.json';
import weeklyNewsletterManifest from './starters/weeklyNewsletter.json';
import flashSaleManifest from './starters/flashSale.json';
import eventInvitationManifest from './starters/eventInvitation.json';
import customerOnboardingManifest from './starters/customerOnboarding.json';
import caseStudyManifest from './starters/caseStudy.json';
import seasonalCampaignManifest from './starters/seasonalCampaign.json';
import reEngagementManifest from './starters/reEngagement.json';
import featureAnnouncementManifest from './starters/featureAnnouncement.json';
import minimalistCtaManifest from './starters/minimalistCta.json';
import transactionalReceiptManifest from './starters/transactionalReceipt.json';
import webinarReplayManifest from './starters/webinarReplay.json';
import richEditorialEmailManifest from './starters/richEditorialEmail.json';
import d2cFlashSaleGridHeavyManifest from './starters/d2cFlashSaleGridHeavy.json';
import lifestyleNewsletterDualImageTextManifest from './starters/lifestyleNewsletterDualImageText.json';
import b2bTechValuePropCaseRhythmManifest from './starters/b2bTechValuePropCaseRhythm.json';
import webinarAgendaSignupManifest from './starters/webinarAgendaSignup.json';
import communityMeetupKickoffManifest from './starters/communityMeetupKickoff.json';
import b2bSaaSNewsletterDeepManifest from './starters/b2bSaaSNewsletterDeep.json';
import d2cEcommerceLookbookManifest from './starters/d2cEcommerceLookbook.json';
import eventsSummitDeepManifest from './starters/eventsSummitDeep.json';
import d2cSeasonalFlashDeepManifest from './starters/d2cSeasonalFlashDeep.json';
import onboardingLifecycleDeepManifest from './starters/onboardingLifecycleDeep.json';
import transactionalLifecycleCompactManifest from './starters/transactionalLifecycleCompact.json';
import b2bThoughtLeadershipNurtureManifest from './starters/b2bThoughtLeadershipNurture.json';
import d2cAbandonedCartRecoveryManifest from './starters/d2cAbandonedCartRecovery.json';
import saasProductReleaseChangelogManifest from './starters/saasProductReleaseChangelog.json';
import referralLoyaltyProgramNudgeManifest from './starters/referralLoyaltyProgramNudge.json';
import partnerCoMarketingWebinarManifest from './starters/partnerCoMarketingWebinar.json';
import d2cSeasonalGiftGuideManifest from './starters/d2cSeasonalGiftGuide.json';
import b2bSplitHeroProductStoryManifest from './starters/b2bSplitHeroProductStory.json';
import d2cEditorialTallLookbookManifest from './starters/d2cEditorialTallLookbook.json';
import onboardingProgressMilestoneManifest from './starters/onboardingProgressMilestone.json';
import b2bCustomerWinStoryManifest from './starters/b2bCustomerWinStory.json';
import realEstateOpenHouseListingManifest from './starters/realEstateOpenHouseListing.json';
import nonprofitImpactGivingCampaignManifest from './starters/nonprofitImpactGivingCampaign.json';
import foodHospitalityChefTableNightManifest from './starters/foodHospitalityChefTableNight.json';
import musicEntertainmentTourNightManifest from './starters/musicEntertainmentTourNight.json';

const minimal = minimalDesign as Record<string, unknown>;
const conversionBase = emailConversionBase as Record<string, unknown>;

/**
 * Custom starters: add `import myDesign from './starters/foo.json'` and register `{ id, title, design: myDesign }`.
 * HTML-only exports (Unlayer "Export HTML" zip) cannot be loaded in the current embed — export **design JSON** from
 * Unlayer (saved design / API) and bundle a `.json` file here instead.
 *
 * **Architect layering** uses `htmlImportUrl` pointing at `public/marketing/unlayer/templates/architect-layering-2026/blueprint.html`
 * so `UnlayerEditor` imports the reference HTML (MJML parity). Prefer exporting native design JSON later if you need
 * full in-editor block editability without HTML import.
 *
 * **VA2 manifest templates** (productLaunch, flashSale, etc.) use the `manifest` field. These are passed through
 * `runEmailAssemblyPipeline()` at load time to produce Unlayer-compatible design JSON with full theming.
 */
function list(mode: UnlayerDisplayMode): UnlayerStarterTemplate[] {
  const blank: UnlayerStarterTemplate = {
    id: 'blank',
    title: 'Blank canvas',
    design: null,
    category: 'general',
    description: 'Start from scratch',
  };

  const architectLayering: UnlayerStarterTemplate = {
    id: 'email-architect-layering',
    title: 'Architect layering (env BG + asymmetric)',
    design: {},
    htmlImportUrl: '/marketing/unlayer/templates/architect-layering-2026/blueprint.html',
    category: 'general',
    description: 'Advanced HTML import with layered backgrounds',
  };

  const starters: Record<UnlayerDisplayMode, UnlayerStarterTemplate[]> = {
    email: [
      blank,
      {
        id: 'email-simple',
        title: 'Simple message',
        design: minimal,
        category: 'general',
        description: 'Minimal single-block starter',
      },
      {
        id: 'email-conversion',
        title: 'Conversion layout',
        design: conversionBase,
        category: 'sales',
        description: 'Hero image + content sections',
      },
      architectLayering,
      {
        id: 'email-product-launch',
        title: 'Product Launch',
        design: null,
        manifest: productLaunchManifest as Record<string, unknown>,
        category: 'announce',
        description: 'Announce a new product with hero, features, and CTA',
      },
      {
        id: 'email-weekly-newsletter',
        title: 'Weekly Newsletter',
        design: null,
        manifest: weeklyNewsletterManifest as Record<string, unknown>,
        category: 'nurture',
        description: 'Recurring digest with articles and updates',
      },
      {
        id: 'email-flash-sale',
        title: 'Flash Sale',
        design: null,
        manifest: flashSaleManifest as Record<string, unknown>,
        category: 'sales',
        description: 'Time-limited promo with product grid',
      },
      {
        id: 'email-event-invitation',
        title: 'Event Invitation',
        design: null,
        manifest: eventInvitationManifest as Record<string, unknown>,
        category: 'engage',
        description: 'Webinar or conference invite with RSVP',
      },
      {
        id: 'email-customer-onboarding',
        title: 'Customer Onboarding',
        design: null,
        manifest: customerOnboardingManifest as Record<string, unknown>,
        category: 'nurture',
        description: 'Welcome flow with guided steps',
      },
      {
        id: 'email-case-study',
        title: 'Case Study',
        design: null,
        manifest: caseStudyManifest as Record<string, unknown>,
        category: 'nurture',
        description: 'Success story with testimonial and results',
      },
      {
        id: 'email-seasonal-campaign',
        title: 'Seasonal Campaign',
        design: null,
        manifest: seasonalCampaignManifest as Record<string, unknown>,
        category: 'sales',
        description: 'Holiday or seasonal promo with product grid',
      },
      {
        id: 'email-re-engagement',
        title: 'Re-engagement',
        design: null,
        manifest: reEngagementManifest as Record<string, unknown>,
        category: 'engage',
        description: 'Win back inactive subscribers',
      },
      {
        id: 'email-feature-announcement',
        title: 'Feature Announcement',
        design: null,
        manifest: featureAnnouncementManifest as Record<string, unknown>,
        category: 'announce',
        description: 'Ship new features with highlights',
      },
      {
        id: 'email-minimalist-cta',
        title: 'Minimalist CTA',
        design: null,
        manifest: minimalistCtaManifest as Record<string, unknown>,
        category: 'general',
        description: 'Single focused action — no hero, no images',
      },
      {
        id: 'email-transactional-receipt',
        title: 'Transactional receipt',
        design: null,
        manifest: transactionalReceiptManifest as Record<string, unknown>,
        category: 'general',
        description: 'Order confirmation with line items and invoice CTA',
      },
      {
        id: 'email-webinar-replay',
        title: 'Webinar replay',
        design: null,
        manifest: webinarReplayManifest as Record<string, unknown>,
        category: 'engage',
        description: 'Hero + replay CTA + social proof metrics',
      },
      {
        id: 'email-rich-editorial',
        title: 'Rich editorial (framed sections)',
        design: null,
        manifest: richEditorialEmailManifest as Record<string, unknown>,
        category: 'announce',
        description: 'Hero + dividers + image_text + inset text + testimonial + framed CTA',
      },
      {
        id: 'email-d2c-flash-grid-heavy',
        title: 'D2C flash sale (dual product grids)',
        design: null,
        manifest: d2cFlashSaleGridHeavyManifest as Record<string, unknown>,
        category: 'sales',
        description: 'Hero + two product_grid waves + social proof — high slot count',
      },
      {
        id: 'email-lifestyle-dual-image-text',
        title: 'Lifestyle newsletter (2× image_text + quote)',
        design: null,
        manifest: lifestyleNewsletterDualImageTextManifest as Record<string, unknown>,
        category: 'nurture',
        description: 'Warm editorial: alternating image_text rows and testimonial',
      },
      {
        id: 'email-b2b-tech-value-case',
        title: 'B2B tech (value_prop + case rhythm)',
        design: null,
        manifest: b2bTechValuePropCaseRhythmManifest as Record<string, unknown>,
        category: 'announce',
        description: 'Tech theme: value_prop grid, case snapshot, integration image_text',
      },
      {
        id: 'email-webinar-agenda-signup',
        title: 'Webinar — agenda + signup',
        design: null,
        manifest: webinarAgendaSignupManifest as Record<string, unknown>,
        category: 'engage',
        description: 'Compact layout: split hero, agenda value_prop, registration CTA',
      },
      {
        id: 'email-community-meetup-kickoff',
        title: 'Community meetup (airy)',
        design: null,
        manifest: communityMeetupKickoffManifest as Record<string, unknown>,
        category: 'engage',
        description: 'Local event invite: editorial hero, why-come grid, RSVP',
      },
      {
        id: 'email-b2b-saas-newsletter-deep',
        title: 'B2B SaaS newsletter (deep)',
        design: null,
        manifest: b2bSaaSNewsletterDeepManifest as Record<string, unknown>,
        category: 'nurture',
        description: 'Compact digest: value_prop, alternating image_text, product_grid proof, metrics, testimonial',
      },
      {
        id: 'email-d2c-ecommerce-lookbook',
        title: 'D2C ecommerce lookbook',
        design: null,
        manifest: d2cEcommerceLookbookManifest as Record<string, unknown>,
        category: 'sales',
        description: 'Dual product grids, alternating image_text, social proof — editorial retail depth',
      },
      {
        id: 'email-events-summit-deep',
        title: 'Events — summit / webinar (deep)',
        design: null,
        manifest: eventsSummitDeepManifest as Record<string, unknown>,
        category: 'engage',
        description: 'Airy agenda: editorial hero, value_prop takeaways, agenda band, speaker image_text, metrics',
      },
      {
        id: 'email-d2c-seasonal-flash-deep',
        title: 'D2C seasonal flash (dual grids)',
        design: null,
        manifest: d2cSeasonalFlashDeepManifest as Record<string, unknown>,
        category: 'sales',
        description: 'Compact: two product_grid waves with divider + inset text_block + urgency CTA',
      },
      {
        id: 'email-onboarding-lifecycle-deep',
        title: 'Onboarding — lifecycle (deep)',
        design: null,
        manifest: onboardingLifecycleDeepManifest as Record<string, unknown>,
        category: 'nurture',
        description: 'Welcome series depth: hero, dual image_text, value_prop, standalone image, CTA progression',
      },
      {
        id: 'email-transactional-lifecycle-compact',
        title: 'Transactional — lifecycle (compact)',
        design: null,
        manifest: transactionalLifecycleCompactManifest as Record<string, unknown>,
        category: 'general',
        description: 'Minimal visual_density: receipt-style summary, divider, band copy, flush CTA',
      },
      {
        id: 'email-b2b-thought-leadership-nurture',
        title: 'B2B — thought leadership (nurture)',
        design: null,
        manifest: b2bThoughtLeadershipNurtureManifest as Record<string, unknown>,
        category: 'nurture',
        description: 'Editorial hero, band text, image_text, value_prop, testimonial, CTA — research newsletter depth',
      },
      {
        id: 'email-d2c-abandoned-cart-recovery',
        title: 'D2C — abandoned cart recovery',
        design: null,
        manifest: d2cAbandonedCartRecoveryManifest as Record<string, unknown>,
        category: 'sales',
        description: 'Hero + product_grid + social_proof metrics + urgency CTA; UTM-ready URLs',
      },
      {
        id: 'email-saas-product-release-changelog',
        title: 'SaaS — product release / changelog',
        design: null,
        manifest: saasProductReleaseChangelogManifest as Record<string, unknown>,
        category: 'announce',
        description: 'Release highlights: hero, band TL;DR, value_prop, image_text, CTA — UTM-ready',
      },
      {
        id: 'email-referral-loyalty-program-nudge',
        title: 'Referral / loyalty program nudge',
        design: null,
        manifest: referralLoyaltyProgramNudgeManifest as Record<string, unknown>,
        category: 'engage',
        description: 'Hero + value_prop how-it-works + social_proof + CTA; referral campaign',
      },
      {
        id: 'email-partner-co-marketing-webinar',
        title: 'Partner co-marketing — joint webinar',
        design: null,
        manifest: partnerCoMarketingWebinarManifest as Record<string, unknown>,
        category: 'engage',
        description: 'Split hero, value_prop pillars, image_text joint story, band agenda, metrics, joint CTA',
      },
      {
        id: 'email-d2c-seasonal-gift-guide',
        title: 'D2C — seasonal gift guide',
        design: null,
        manifest: d2cSeasonalGiftGuideManifest as Record<string, unknown>,
        category: 'sales',
        description: 'Editorial hero, dual product_grid waves, image_text, flush editor note — curated retail',
      },
      {
        id: 'email-b2b-split-hero-product-story',
        title: 'B2B — split hero product story',
        design: null,
        manifest: b2bSplitHeroProductStoryManifest as Record<string, unknown>,
        category: 'announce',
        description: 'Split hero, image_text, value_prop cards — platform narrative',
      },
      {
        id: 'email-d2c-editorial-tall-lookbook',
        title: 'D2C — editorial tall lookbook',
        design: null,
        manifest: d2cEditorialTallLookbookManifest as Record<string, unknown>,
        category: 'sales',
        description: 'editorial_tall hero, dual product_grid waves, image_text — magazine retail',
      },
      {
        id: 'email-onboarding-progress-milestone',
        title: 'Onboarding — progress milestone',
        design: null,
        manifest: onboardingProgressMilestoneManifest as Record<string, unknown>,
        category: 'nurture',
        description: 'Milestone celebration: hero, value_prop checklist, image_text invite',
      },
      {
        id: 'email-b2b-customer-win-story',
        title: 'B2B — customer win story',
        design: null,
        manifest: b2bCustomerWinStoryManifest as Record<string, unknown>,
        category: 'announce',
        description: 'editorial_tall hero, metrics, image_text, testimonial, case CTA',
      },
      {
        id: 'email-real-estate-open-house',
        title: 'Real estate — open house + comps',
        design: null,
        manifest: realEstateOpenHouseListingManifest as Record<string, unknown>,
        category: 'real_estate',
        description: 'Split hero, value_prop, image_text, product_grid comps, RSVP CTA',
      },
      {
        id: 'email-nonprofit-impact-giving',
        title: 'Nonprofit — impact + match',
        design: null,
        manifest: nonprofitImpactGivingCampaignManifest as Record<string, unknown>,
        category: 'nonprofit',
        description: 'editorial_tall hero, metrics, value_prop, image_text, testimonial, donate CTA',
      },
      {
        id: 'email-food-chefs-table',
        title: 'Food — chef’s table night',
        design: null,
        manifest: foodHospitalityChefTableNightManifest as Record<string, unknown>,
        category: 'food',
        description: 'editorial_tall hero, menu product_grid, pairings image_text, booking CTA',
      },
      {
        id: 'email-music-tour-announce',
        title: 'Music — tour dates + fan presale',
        design: null,
        manifest: musicEntertainmentTourNightManifest as Record<string, unknown>,
        category: 'music',
        description: 'split hero, date value_prop, image_text, metrics, presale CTA',
      },
    ],
    web: [
      blank,
      {
        id: 'web-simple',
        title: 'Simple section',
        design: minimal,
      },
    ],
    popup: [
      blank,
      {
        id: 'popup-simple',
        title: 'Simple popup',
        design: minimal,
      },
    ],
    document: [
      blank,
      {
        id: 'document-simple',
        title: 'Simple document',
        design: minimal,
      },
    ],
  };

  return starters[mode];
}

/** Bump when `list()` output changes so cached arrays refresh in dev/HMR. */
const LIST_VERSION = 18;
const cache: Partial<Record<UnlayerDisplayMode, { version: number; data: UnlayerStarterTemplate[] }>> = {};

export function getStarterTemplates(mode: UnlayerDisplayMode): UnlayerStarterTemplate[] {
  const entry = cache[mode];
  if (!entry || entry.version !== LIST_VERSION) {
    cache[mode] = { version: LIST_VERSION, data: list(mode) };
  }
  return cache[mode]!.data;
}

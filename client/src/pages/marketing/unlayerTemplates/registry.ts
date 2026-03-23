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
 * `assembleDesign()` at load time to produce Unlayer-compatible design JSON with full theming.
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
const LIST_VERSION = 7;
const cache: Partial<Record<UnlayerDisplayMode, { version: number; data: UnlayerStarterTemplate[] }>> = {};

export function getStarterTemplates(mode: UnlayerDisplayMode): UnlayerStarterTemplate[] {
  const entry = cache[mode];
  if (!entry || entry.version !== LIST_VERSION) {
    cache[mode] = { version: LIST_VERSION, data: list(mode) };
  }
  return cache[mode]!.data;
}

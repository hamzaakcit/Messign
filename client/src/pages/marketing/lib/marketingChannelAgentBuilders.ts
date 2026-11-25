/**
 * Assembles the user message for Lucy's email brief modal (the composer's email templates).
 * UX-08: the LinkedIn, X, blog, ads and metrics forms were unreachable and are gone.
 */

export type MarketingChannelAgentModalId = 'email';

export const MARKETING_CHANNEL_AGENT_MODAL_TITLES: Record<MarketingChannelAgentModalId, string> = {
  email: 'Email brief',
};

const MIN_EMAIL_FIELD = 4;

// ---------------------------------------------------------------------------
// Email (VA2)
// ---------------------------------------------------------------------------

export type EmailLayout = 'standard' | 'newsletter' | 'flash' | 'event';

/**
 * The email shapes Lucy can be asked for. Each adds one goal sentence to the request; "standard" adds nothing. These
 * were four separate tiles that all opened the same form and dropped the difference: now the choice is in the form and
 * it reaches the request.
 */
export const EMAIL_LAYOUTS: ReadonlyArray<{ id: EmailLayout; label: string; hint: string; goal: string }> = [
  { id: 'standard', label: 'Standard', hint: 'A hero, one picture-and-text block and a footer.', goal: '' },
  {
    id: 'newsletter',
    label: 'Newsletter',
    hint: 'Several stories, pictures alternating left and right.',
    goal: 'Goal: **newsletter depth**: airy layoutDensity, hero + two or more image_text rows alternating image_left / image_right, value_prop or social_proof before footer, a distinct imagePrompt per slot, metadata.visual_density rich, target_image_slots 6.',
  },
  {
    id: 'flash',
    label: 'Flash sale',
    hint: 'Product grids, a deadline and an urgent button.',
    goal: 'Goal: **flash sale**: hero + product_grid wave + divider + a second product_grid or image_text + social_proof metrics + a CTA with urgencyText, warm or luxury theme, a distinct imagePrompt per product.',
  },
  {
    id: 'event',
    label: 'Event invite',
    hint: 'Date and time, what happens, and a sign-up button.',
    goal: 'Goal: **event invitation**: subject and preheader with date, time and timezone; hero, then a value_prop agenda or text_block, then image_text (speaker or venue), then a CTA with the registration URL, then footer; engage category tone.',
  },
];

export interface EmailVa2AgentFormValues {
  audience: string;
  offer: string;
  notes: string;
  /** Defaults to standard. */
  layout?: EmailLayout;
}

export function validateEmailVa2AgentForm(
  v: EmailVa2AgentFormValues,
): Partial<Record<'audience' | 'offer', string>> {
  const errors: Partial<Record<'audience' | 'offer', string>> = {};
  if (!v.audience?.trim() || v.audience.trim().length < MIN_EMAIL_FIELD) {
    errors.audience = `Audience is required (at least ${MIN_EMAIL_FIELD} characters)`;
  }
  if (!v.offer?.trim() || v.offer.trim().length < MIN_EMAIL_FIELD) {
    errors.offer = `Offer / topic is required (at least ${MIN_EMAIL_FIELD} characters)`;
  }
  return errors;
}

export function buildEmailVa2AgentMessage(v: EmailVa2AgentFormValues): string {
  const audience = v.audience.trim();
  const offer = v.offer.trim();
  const notes = v.notes?.trim();
  const parts = [
    'Channel: email. Output a Visual Architect v2 Design Manifest as JSON in ```json``` fences for Messign\'s email builder.',
    `Audience: ${audience}. Offer / campaign: ${offer}.`,
    'Include hero, at least one image_text, footer. Keep subject and all copy on my topic — do not substitute Messign product pitching unless I asked for it.',
    'If I want the animated paper-plane sweep in the builder, set "motionOverlay": "paper_plane_sweep" (or legacy "easterEgg": "paper_plane").',
  ];
  const goal = EMAIL_LAYOUTS.find((row) => row.id === (v.layout ?? 'standard'))?.goal;
  if (goal) parts.splice(2, 0, goal);
  if (notes) parts.splice(goal ? 3 : 2, 0, `Additional notes: ${notes}`);
  return parts.join(' ');
}

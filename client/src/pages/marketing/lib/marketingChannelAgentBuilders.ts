/**
 * Assembles the user message for Lucy's email brief modal (the composer's email templates).
 * UX-08: the LinkedIn, X, blog, ads and metrics forms were unreachable and are gone.
 */

export type MarketingChannelAgentModalId = 'email';

export const MARKETING_CHANNEL_AGENT_MODAL_TITLES: Record<MarketingChannelAgentModalId, string> = {
  email: 'Email (VA2 brief)',
};

const MIN_EMAIL_FIELD = 4;

// ---------------------------------------------------------------------------
// Email (VA2)
// ---------------------------------------------------------------------------

export interface EmailVa2AgentFormValues {
  audience: string;
  offer: string;
  notes: string;
}

export function validateEmailVa2AgentForm(
  v: EmailVa2AgentFormValues,
): Partial<Record<keyof EmailVa2AgentFormValues, string>> {
  const errors: Partial<Record<keyof EmailVa2AgentFormValues, string>> = {};
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
  if (notes) parts.splice(2, 0, `Additional notes: ${notes}`);
  return parts.join(' ');
}

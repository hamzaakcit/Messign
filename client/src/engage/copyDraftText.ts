/**
 * Pure helpers for the AI copy drafts queue (WP-24): what a refusal code means in words, which steps of a journey can
 * take a draft, and the brief's length rule. The server enforces all of this too; these keep the form honest before a
 * request is made.
 */

export const BRIEF_MIN = 10;
export const BRIEF_MAX = 1000;

const KINDS: Record<string, string> = {
  email: 'email address',
  phone: 'phone number',
  iban: 'IBAN',
  national_id: 'national ID number',
  card_number: 'card number',
};

/** A refusal code from the server, in words for the marketer. Unknown codes fall back to a generic line. */
export function reasonText(code: string): string {
  if (code.startsWith('personal_data:')) {
    const kind = code.slice('personal_data:'.length);
    return `The copy contains a ${KINDS[kind] ?? 'personal detail'}. Remove it; the copy must not name or contact anyone.`;
  }
  switch (code) {
    case 'template_invalid': return 'The copy uses markup or placeholders the template language does not allow (for example scripts or unknown placeholders).';
    case 'variable_not_allowed': return 'Only the first name and, for marketing mail, the unsubscribe link can be personalised.';
    case 'variable_needs_default': return 'The first name needs a fallback, for example "there".';
    case 'unsubscribe_missing': return 'Marketing mail needs the unsubscribe link.';
    case 'unsubscribe_not_allowed': return 'Transactional mail must not carry the unsubscribe link.';
    case 'link_not_allowed': return 'The copy contains a link or web address. Leave links out; the shop adds its own links in the template editor.';
    case 'greeting_repeated': return 'The copy greets the reader twice. The first-name placeholder already greets, so remove the greeting word before it.';
    case 'output_not_valid': return 'The answer could not be used. Try again, with a clearer brief.';
    default: return 'The draft did not pass the checks.';
  }
}

export interface MessageStepOption { id: string; label: string; purpose: 'marketing' | 'transactional'; template: string }

/** The message steps of a journey definition, in order: the only steps a draft can be asked for. */
export function messageSteps(definition: Record<string, unknown> | undefined): MessageStepOption[] {
  const steps = Array.isArray(definition?.steps) ? (definition!.steps as Array<Record<string, unknown>>) : [];
  return steps
    .filter((s) => s.type === 'message' && typeof s.id === 'string' && typeof s.template === 'string')
    .map((s) => ({
      id: s.id as string,
      label: `${s.id as string} · ${s.purpose === 'transactional' ? 'transactional' : 'marketing'} · ${s.template as string}`,
      purpose: s.purpose === 'transactional' ? 'transactional' : 'marketing',
      template: s.template as string,
    }));
}

/** Why a brief cannot be sent yet, or null when it can. Length is counted in characters, after trimming. */
export function briefProblem(brief: string): string | null {
  const n = brief.trim().length;
  if (n < BRIEF_MIN) return `Describe the message in at least ${BRIEF_MIN} characters.`;
  if (n > BRIEF_MAX) return `Keep the brief to ${BRIEF_MAX} characters or fewer.`;
  return null;
}

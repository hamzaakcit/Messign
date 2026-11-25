/**
 * The one place for explanatory text on the marketing page (ADR-026). `tip` is shown in an InfoTooltip and must be
 * one sentence of at most {@link HELP_TIP_MAX} characters; `body`, when present, opens in the HelpDrawer via
 * "Learn more". Components refer to an id, never to inline prose.
 */
export interface HelpEntry {
  title: string;
  tip: string;
  body?: string;
}

export const HELP_TIP_MAX = 120;

export const HELP = {
  emailApplyAiDraft: {
    title: 'Apply AI draft',
    tip: 'Builds the layout from your draft text, so the copy decides the structure.',
  },
  emailUseTemplate: {
    title: 'Use template',
    tip: 'Starts from a designed template and fills in your subject and body.',
  },
  emailBuilderEdits: {
    title: 'Edits in the builder',
    tip: 'Your builder edits stay until you regenerate the images or switch the theme.',
    body:
      'Changes you make in the email builder are kept in the saved design.\n\n' +
      "Regenerating the AI images rebuilds the email from Lucy's plan, and switching the theme starts a new layout. " +
      'Both replace the edits you made in the builder.',
  },
  emailMotionFallback: {
    title: 'Motion in email',
    tip: 'Readers who turn off motion see a still image instead of the animation.',
    body:
      'The paper-plane animation is CSS inside the email.\n\n' +
      'Recipients whose device asks for reduced motion see a still image, and some email apps remove the animation ' +
      'entirely, so the email has to read well without it.',
  },
  emailNoSavedDesign: {
    title: 'No saved design',
    tip: 'This item has HTML but no saved design, so the builder opens empty.',
    body:
      'Older items were saved as HTML only, and the builder cannot edit HTML directly.\n\n' +
      'Rebuild it in the builder and press "Apply HTML & design" once. From then on it opens with its design. ' +
      'The saved HTML stays below for reference.',
  },
  ultraReference: {
    title: 'Reference photo',
    tip: 'The still keeps only what is in the reference photo; a higher strength cannot add missing objects.',
  },
  shopContentSetup: {
    title: 'Content setup',
    tip: 'Each shop keeps its own brand, language, Instagram handle and product rows.',
  },
} satisfies Record<string, HelpEntry>;

export type HelpId = keyof typeof HELP;

export function helpEntry(id: HelpId): HelpEntry {
  return HELP[id];
}

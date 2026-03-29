/**
 * Assembles the Marketing agent user message for Instagram drafts, including a
 * valid [IMAGE_PROMPT] block for the image pipeline.
 */

/** Minimum character length for hero image description (matches server regenerate-image). */
export const MIN_INSTAGRAM_IMAGE_DESCRIPTION_LENGTH = 10;

/** When a reference photo is attached, shorter edit instructions are allowed. */
export const MIN_INSTAGRAM_IMAGE_DESCRIPTION_WITH_REFERENCE_LENGTH = 5;

export interface InstagramAgentFormValues {
  /** What the post should be about (replaces a bare [topic] placeholder). */
  topic: string;
  /** Visual brief inside [IMAGE_PROMPT] — subject, lighting, mood, style. */
  heroImageDescription: string;
  /** Optional tone hint for the strategist (e.g. professional, playful). */
  tone?: string;
  /** Feed = square; story/reel = vertical 9:16 guidance in the image block. */
  format?: 'feed' | 'story' | 'reel';
  /** Public HTTPS URL after upload — server strips this block and sets Kontext reference on the content row. */
  referenceImageUrl?: string | null;
}

/**
 * Builds the full user message string sent to the Marketing agent for an Instagram request.
 * Trims fields; callers should validate required lengths before invoking.
 *
 * @param values Form fields from the Instagram quick-prompt modal.
 * @returns A single message ready for `sendMessage` or the composer.
 */
export function buildInstagramAgentMessage(values: InstagramAgentFormValues): string {
  const topic = values.topic.trim();
  const hero = values.heroImageDescription.trim();
  const tone = values.tone?.trim();
  const format = values.format ?? 'feed';
  const refUrl = values.referenceImageUrl?.trim() ?? '';

  const toneLine =
    tone && tone.length > 0
      ? ` Tone preference for the caption: ${tone}.`
      : '';

  const aspectNote =
    format === 'feed'
      ? 'Square 1:1 aspect ratio for the Instagram feed. No legible text in the image unless I ask.'
      : 'Vertical 9:16 aspect ratio, full-bleed composition suitable for Stories/Reels. No legible text in the image unless I ask.';

  const imageBlockBody = [hero, aspectNote].filter(Boolean).join('\n\n');

  const refBlock =
    refUrl.length > 0
      ? ['[REFERENCE_IMAGE_URL]', refUrl, '[/REFERENCE_IMAGE_URL]', ''].join('\n')
      : '';

  return (
    refBlock +
    [
      `Draft an Instagram post about: ${topic}.${toneLine}`,
      '',
      'Include: a strong hook (first line), short paragraphs with line breaks, a clear CTA, 10–15 relevant hashtags, and a separate block exactly in this format for the hero image:',
      '',
      '[IMAGE_PROMPT]',
      imageBlockBody,
      '[/IMAGE_PROMPT]',
    ].join('\n')
  );
}

/**
 * Client-side validation for the Instagram agent form before send.
 *
 * @param values Raw form values.
 * @returns Field-level error messages; empty object means valid.
 */
export function validateInstagramAgentForm(values: InstagramAgentFormValues): Partial<
  Record<keyof InstagramAgentFormValues, string>
> {
  const errors: Partial<Record<keyof InstagramAgentFormValues, string>> = {};
  if (!values.topic?.trim()) {
    errors.topic = 'Topic is required';
  }
  const hero = values.heroImageDescription?.trim() ?? '';
  const hasRef = Boolean(values.referenceImageUrl?.trim());
  const minLen = hasRef
    ? MIN_INSTAGRAM_IMAGE_DESCRIPTION_WITH_REFERENCE_LENGTH
    : MIN_INSTAGRAM_IMAGE_DESCRIPTION_LENGTH;
  if (hero.length < minLen) {
    errors.heroImageDescription = hasRef
      ? `Describe how to use or edit the photo (at least ${minLen} characters)`
      : `Image description must be at least ${MIN_INSTAGRAM_IMAGE_DESCRIPTION_LENGTH} characters`;
  }
  return errors;
}

/**
 * Target language names for Dora translate (passed to the API as `targetLocale`).
 * Keep labels user-facing; locale strings match what the LLM prompt expects.
 */
export const DORA_TRANSLATE_LOCALES: ReadonlyArray<{ label: string; locale: string }> = [
  { label: 'Spanish', locale: 'Spanish' },
  { label: 'French', locale: 'French' },
  { label: 'German', locale: 'German' },
  { label: 'Portuguese', locale: 'Portuguese' },
  { label: 'Japanese', locale: 'Japanese' },
  { label: 'Chinese (Simplified)', locale: 'Simplified Chinese' },
  { label: 'Arabic', locale: 'Arabic' },
];

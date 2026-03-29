/**
 * Short support-oriented explanations for common VA2 accessibility strings from {@link accessibilityEnforcer}.
 */
export function explainVa2AccessibilityHint(line: string): string | undefined {
  const l = line.toLowerCase();
  if (l.includes('contrast') && (l.includes('hero') || l.includes('photo') || l.includes('background'))) {
    return 'Text on a photo row: the checker compares headline/CTA colors to the hero background. Try a different theme, shorter headline, or ensure the hero uses a dark scrim so copy stays legible.';
  }
  if (l.includes('alt') && l.includes('image')) {
    return 'Alt text describes the image for screen readers — it should not duplicate the headline verbatim.';
  }
  if (l.includes('link') && l.includes('color')) {
    return 'Link color is checked against the row background; brand accent colors may need a stronger contrast in some themes.';
  }
  return undefined;
}

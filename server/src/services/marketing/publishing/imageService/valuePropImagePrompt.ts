/**
 * Builds image prompts for value_prop items when the manifest omits imagePrompt.
 * Must anchor on campaign subject/preheader so models do not invent unrelated scenes
 * (e.g. cartoon children) from generic section headings like "Why it matters".
 */

export interface ValuePropManifestLike {
  subject?: string;
  preheader?: string;
}

/**
 * Returns a non-empty prompt for a value_prop row, using item.imagePrompt when long enough.
 */
export function buildValuePropItemImagePrompt(
  item: Record<string, unknown>,
  manifest: ValuePropManifestLike,
): string {
  const prompt = typeof item.imagePrompt === 'string' ? String(item.imagePrompt).trim() : '';
  if (prompt.length >= 5) return prompt;

  const heading = typeof item.heading === 'string' ? String(item.heading).trim() : '';
  const desc = typeof item.description === 'string' ? String(item.description).trim().slice(0, 220) : '';
  const sub = (manifest.subject ?? '').trim();
  const pre = (manifest.preheader ?? '').trim();
  const topicAnchor = [sub, pre].filter(Boolean).join(' — ').slice(0, 200);
  const label = heading.length >= 2 ? heading : 'Feature';

  if (!topicAnchor) {
    return [
      `Minimal abstract vector icon for "${label}"`,
      desc ? ` — ${desc}` : '',
      '. Flat geometric shapes only — no human figures, no cartoon characters, no children, no legible text, clean background.',
    ].join('');
  }

  return [
    `Abstract vector icon or diagram for "${label}" in the context of this campaign: ${topicAnchor}`,
    desc ? `. Detail: ${desc}` : '',
    '. Use only geometric shapes, simple UI/device silhouettes, charts, network lines, or neutral objects —',
    ' no human faces, no cartoon people or children, no mascots, no unrelated narrative scenes, no legible text.',
  ].join('');
}

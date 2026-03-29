/**
 * Shared campaign anchor prepended to raw image prompts during email resolve so models
 * stay aligned with subject, preview line, and hero intent.
 */

export interface CampaignImageManifestLike {
  theme?: string;
  subject?: string;
  preheader?: string;
  metadata?: { audience?: string };
  sections?: Array<{
    type: string;
    order: number;
    content: Record<string, unknown>;
  }>;
  artDirection?: { imageStyle?: string; colorNotes?: string };
}

const KEYWORD_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'for',
  'to',
  'of',
  'in',
  'on',
  'at',
  'with',
  'your',
  'our',
  'how',
  'more',
  'this',
  'that',
  'from',
  'are',
  'was',
  'has',
  'have',
  'been',
  'will',
  'can',
  'you',
  'its',
  'their',
]);

/**
 * Short prefix listing campaign fields. Empty string when nothing to anchor.
 */
export function buildCampaignImageContextPrefix(manifest: CampaignImageManifestLike): string {
  const lines: string[] = [];
  const sub = (manifest.subject ?? '').trim();
  const pre = (manifest.preheader ?? '').trim();
  if (sub) lines.push(`Email subject: ${sub}`);
  if (pre) lines.push(`Preheader: ${pre}`);
  const hero = manifest.sections?.find((s) => s.type === 'hero')?.content;
  const hl = hero && typeof hero.headline === 'string' ? hero.headline.trim() : '';
  if (hl) lines.push(`Hero headline: ${hl}`);
  const theme = (manifest.theme ?? '').trim();
  if (theme) lines.push(`Theme: ${theme}`);
  const art = manifest.artDirection?.imageStyle?.trim();
  if (art) lines.push(`Art direction: ${art}`);
  if (lines.length === 0) return '';
  return [
    'CAMPAIGN CONTEXT — visuals must align with this email (subject, preview, hero intent):',
    ...lines.map((l) => `- ${l}`),
    '',
    'SEMANTIC RULE — images must illustrate the same industry, product, channel, or problem as above.',
    '- Use recognizable props: devices, dashboards, workspace objects, or clear environmental cues tied to that topic.',
    '- Do not substitute unrelated scenes (random people, cartoon characters, family imagery, decorative abstract mush, generic conference-room or “team meeting” stock) when the copy is about a specific product, retail/fashion campaign, or location.',
    '- No readable text, fake headlines, or garbled lettering in the image — blank or softly blurred UI only.',
    '',
  ].join('\n');
}

/**
 * Extracts topic keywords for raster models (Fal Flux) without pasting full subject lines,
 * reducing embedded fake headlines and UI text in generated images.
 */
export function extractTopicKeywordsForRasterContext(text: string, maxTerms: number): string[] {
  const t = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return [];
  const words = t.split(' ').filter((w) => w.length >= 3 && !KEYWORD_STOPWORDS.has(w));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= maxTerms) break;
  }
  return out;
}

/**
 * Text blob for keyword extraction — must include hero copy so Fal/Flux sees the same topic as the email body
 * (subject/preheader alone often omit product words that only appear in the hero headline or imagePrompt).
 */
function pushSectionImagePrompts(
  sections: CampaignImageManifestLike['sections'],
  parts: string[],
  maxExtraChars: number,
): void {
  if (!sections?.length) return;
  let budget = maxExtraChars;
  for (const sec of sections) {
    if (budget <= 0) break;
    const c = sec.content;
    if (!c || typeof c !== 'object') continue;
    const row = c as Record<string, unknown>;
    const ip = typeof row.imagePrompt === 'string' ? row.imagePrompt.trim() : '';
    if (ip) {
      const slice = ip.slice(0, Math.min(220, budget));
      parts.push(slice);
      budget -= slice.length;
    }
    if (sec.type === 'value_prop' && Array.isArray(row.items)) {
      for (const it of row.items as Record<string, unknown>[]) {
        if (budget <= 0) break;
        const pi = typeof it?.imagePrompt === 'string' ? String(it.imagePrompt).trim() : '';
        if (pi) {
          const slice = pi.slice(0, Math.min(160, budget));
          parts.push(slice);
          budget -= slice.length;
        }
      }
    }
    if (sec.type === 'product_grid' && Array.isArray(row.items)) {
      for (const it of row.items as Record<string, unknown>[]) {
        if (budget <= 0) break;
        const pi = typeof it?.imagePrompt === 'string' ? String(it.imagePrompt).trim() : '';
        if (pi) {
          const slice = pi.slice(0, Math.min(120, budget));
          parts.push(slice);
          budget -= slice.length;
        }
      }
    }
  }
}

/**
 * Text blob for keyword extraction — subject, preheader, audience, hero copy, plus **non-hero** image prompts
 * so vertical-specific terms (e.g. footwear, apparel) surface even when the subject line is generic.
 */
export function buildCampaignTopicBlobForRasterModels(manifest: CampaignImageManifestLike): string {
  const parts: string[] = [];
  const sub = (manifest.subject ?? '').trim();
  const pre = (manifest.preheader ?? '').trim();
  if (sub) parts.push(sub);
  if (pre) parts.push(pre);
  const aud = manifest.metadata?.audience?.trim();
  if (aud) parts.push(aud);

  const hero = manifest.sections?.find((s) => s.type === 'hero')?.content;
  if (hero && typeof hero === 'object') {
    const h = hero as Record<string, unknown>;
    const headline = typeof h.headline === 'string' ? h.headline.trim() : '';
    const subhead = typeof h.subheadline === 'string' ? h.subheadline.trim() : '';
    const imagePrompt = typeof h.imagePrompt === 'string' ? h.imagePrompt.trim().slice(0, 500) : '';
    if (headline) parts.push(headline);
    if (subhead) parts.push(subhead);
    if (imagePrompt) parts.push(imagePrompt);
  }

  pushSectionImagePrompts(manifest.sections, parts, 2000);

  return parts.join(' ');
}

/**
 * Semantic campaign anchor for Fal / Flux: topic keywords and theme only — no literal inbox headline strings.
 * Keywords are derived from subject, preheader, audience, and **hero** headline/subhead/imagePrompt so the hero
 * image matches the on-email topic (e.g. footwear campaign when copy says "red shoes").
 */
export function buildCampaignImageContextForRasterModels(manifest: CampaignImageManifestLike): string {
  const blob = buildCampaignTopicBlobForRasterModels(manifest);
  const keywords = extractTopicKeywordsForRasterContext(blob, 28);
  const theme = (manifest.theme ?? '').trim();
  const art = manifest.artDirection?.imageStyle?.trim();
  const lines: string[] = [];
  if (keywords.length > 0) {
    lines.push(`Topic keywords: ${keywords.join(', ')}`);
  }
  if (theme) lines.push(`Theme: ${theme}`);
  if (art) lines.push(`Art direction: ${art}`);
  if (lines.length === 0) return '';
  return [
    'CAMPAIGN CONTEXT — align visuals with this industry and channel (do not render text, logos, or headlines):',
    ...lines.map((l) => `- ${l}`),
    '',
    'SEMANTIC RULE — match the topic using props, environments, objects, or abstract tech shapes.',
    '- No readable text, fake headlines, UI mockups, screenshots, or embedded marketing copy.',
    '- Prefer crisp professional photography or clean abstract forms; avoid mushy blur, gradient-only mush, and generic stock faces.',
    '- When topic keywords imply retail, fashion, footwear, accessories, or a named product, depict that category clearly (recognizable product or setting) — not a vague blurry interior unrelated to the offer.',
    '',
  ].join('\n');
}

/**
 * Prepends campaign context to a prompt for AI generation only (not for `[STOCK]` keyword routing).
 */
export function applyCampaignPrefixToPrompt(rawPrompt: string, campaignPrefix: string): string {
  const p = rawPrompt.trim();
  if (!campaignPrefix.trim()) return p;
  return `${campaignPrefix.trim()}\n${p}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest Parser — Extract DesignManifest from LLM output
// Messign Visual Architect · v2.0
// ─────────────────────────────────────────────────────────────────────────────

import type { DesignManifest, ManifestSection } from './types/manifestTypes';
import { parseStructuredEmailDraft } from './emailAiDraftToDesign';

export interface ManifestParseResult {
  isManifest: boolean;
  manifests: DesignManifest[];
  sourceChannel?: string;
  raw?: string;
}

/**
 * Quick check whether a string likely contains a VA2 manifest JSON.
 * Avoids full parsing for obvious non-manifest content.
 */
export function mightContainManifest(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('"version"') &&
    lower.includes('"sections"') &&
    lower.includes('"theme"')
  );
}

/**
 * Clean a JSON string that may have been wrapped in markdown fences
 * or contain trailing commas and other common LLM formatting issues.
 */
export function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch?.[1]) {
    cleaned = fenceMatch[1].trim();
  }

  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  return cleaned;
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isManifestLike(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const record = obj as Record<string, unknown>;
  return (
    typeof record.theme === 'string' &&
    Array.isArray(record.sections) &&
    record.sections.length > 0
  );
}

function escapeHtmlMerge(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * When the user picks a starter template ("Use template") but already has AI email copy,
 * merge that copy into the manifest: hero headlines, subject/preheader, hero image prompt,
 * replace first text_block or insert one after hero, and drop generic value_prop / product_grid rows.
 */
export function mergeUserEmailDraftIntoTemplateManifest(
  manifest: DesignManifest,
  rawBody: string,
): DesignManifest {
  const parsed = parseStructuredEmailDraft(rawBody);
  const bodyText = parsed.body.trim();
  const hasSubstance =
    (Boolean(parsed.subject) && String(parsed.subject).length > 2) || bodyText.length > 15;
  if (!hasSubstance) return manifest;

  const m = structuredClone(manifest);
  if (parsed.subject) {
    m.subject = parsed.subject;
    if (parsed.preview) m.preheader = parsed.preview;
  }

  const hero = m.sections.find((s) => s.type === 'hero');
  if (hero?.content && typeof hero.content === 'object') {
    const c = hero.content as Record<string, unknown>;
    if (parsed.subject) c.headline = parsed.subject;
    if (parsed.preview) c.subheadline = parsed.preview;
    const blob = `${parsed.subject ?? ''} ${bodyText}`;
    const kw = extractKeywords(blob);
    if (kw.length && typeof c.imagePrompt === 'string') {
      c.imagePrompt = `Theme and mood: ${kw.slice(0, 8).join(', ')}. ${String(c.imagePrompt)}`;
    }
  }

  if (bodyText.length < 30) {
    return m;
  }

  const paras = splitIntoParagraphs(bodyText);
  const bodyHtml = paras
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55;">${escapeHtmlMerge(p)}</p>`)
    .join('');

  let stripped = m.sections.filter(
    (s) => s.type !== 'value_prop' && s.type !== 'product_grid',
  );

  const firstTextIdx = stripped.findIndex((s) => s.type === 'text_block');
  if (firstTextIdx >= 0) {
    const s = stripped[firstTextIdx];
    stripped = [...stripped];
    stripped[firstTextIdx] = {
      ...s,
      content: { ...(s.content as Record<string, unknown>), body: bodyHtml },
    };
  } else {
    const heroIdx = stripped.findIndex((s) => s.type === 'hero');
    if (heroIdx >= 0) {
      stripped = [
        ...stripped.slice(0, heroIdx + 1),
        {
          type: 'text_block',
          order: 0,
          content: { body: bodyHtml, alignment: 'left' as const },
        },
        ...stripped.slice(heroIdx + 1),
      ];
    }
  }

  m.sections = stripped.map((s, i) => ({ ...s, order: i + 1 }));
  return m;
}

/** Normalize raw starter JSON (from registry) into a {@link DesignManifest}. */
export function normalizeManifest(raw: Record<string, unknown>): DesignManifest {
  const sections = (raw.sections as Array<Record<string, unknown>>).map(
    (s: Record<string, unknown>, i: number) => ({
      type: (s.type as string) || 'text_block',
      order: typeof s.order === 'number' ? s.order : i,
      content: (s.content as Record<string, unknown>) || {},
      variant: typeof s.variant === 'string' ? s.variant : undefined,
      spacing: typeof s.spacing === 'string' ? s.spacing : undefined,
    }),
  );

  const rawMeta =
    raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : {};

  return {
    version: typeof raw.version === 'string' ? raw.version : '2.0',
    theme: (raw.theme as string) || 'minimal',
    subject: typeof raw.subject === 'string' ? raw.subject : '',
    preheader: typeof raw.preheader === 'string' ? raw.preheader : (typeof raw.subject === 'string' ? raw.subject : ''),
    sections,
    metadata: {
      channel: typeof rawMeta.channel === 'string' ? rawMeta.channel : 'email',
      tone: typeof rawMeta.tone === 'string' ? rawMeta.tone : '',
      audience: typeof rawMeta.audience === 'string' ? rawMeta.audience : '',
      campaign_id: typeof rawMeta.campaign_id === 'string' ? rawMeta.campaign_id : undefined,
      brand_profile_id: typeof rawMeta.brand_profile_id === 'string' ? rawMeta.brand_profile_id : undefined,
      ab_variant:
        rawMeta.ab_variant === 'A' || rawMeta.ab_variant === 'B'
          ? (rawMeta.ab_variant as 'A' | 'B')
          : undefined,
    },
    artDirection: raw.artDirection as DesignManifest['artDirection'],
    easterEgg: typeof raw.easterEgg === 'string'
      ? (raw.easterEgg as DesignManifest['easterEgg'])
      : undefined,
  } as DesignManifest;
}

/**
 * Parse LLM output text and extract VA2 DesignManifest(s).
 *
 * Handles:
 * - Raw JSON object
 * - JSON wrapped in markdown code fences
 * - JSON embedded in prose text
 * - Multiple manifests (A/B variants) as a JSON array
 */
export function parseManifestFromLLMOutput(text: string): ManifestParseResult {
  if (!text || typeof text !== 'string') {
    return { isManifest: false, manifests: [] };
  }

  const cleaned = cleanJsonString(text);
  const manifests: DesignManifest[] = [];
  let sourceChannel: string | undefined;

  const parsed = tryParseJson(cleaned);

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (isManifestLike(item)) {
        const manifest = normalizeManifest(item as Record<string, unknown>);
        manifests.push(manifest);
        if (!sourceChannel && manifest.metadata?.channel) {
          sourceChannel = manifest.metadata.channel;
        }
      }
    }
  } else if (isManifestLike(parsed)) {
    const manifest = normalizeManifest(parsed as Record<string, unknown>);
    manifests.push(manifest);
    sourceChannel = manifest.metadata?.channel;
  }

  if (manifests.length > 0) {
    return { isManifest: true, manifests, sourceChannel, raw: text };
  }

  const jsonBlocks = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g);
  if (jsonBlocks) {
    for (const block of jsonBlocks) {
      const inner = cleanJsonString(block);
      const innerParsed = tryParseJson(inner);

      if (Array.isArray(innerParsed)) {
        for (const item of innerParsed) {
          if (isManifestLike(item)) {
            const manifest = normalizeManifest(item as Record<string, unknown>);
            manifests.push(manifest);
            if (!sourceChannel && manifest.metadata?.channel) {
              sourceChannel = manifest.metadata.channel;
            }
          }
        }
      } else if (isManifestLike(innerParsed)) {
        const manifest = normalizeManifest(innerParsed as Record<string, unknown>);
        manifests.push(manifest);
        if (!sourceChannel) sourceChannel = manifest.metadata?.channel;
      }
    }
  }

  if (manifests.length > 0) {
    return { isManifest: true, manifests, sourceChannel, raw: text };
  }

  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    const slice = text.slice(braceStart, braceEnd + 1);
    const sliceParsed = tryParseJson(cleanJsonString(slice));
    if (isManifestLike(sliceParsed)) {
      const manifest = normalizeManifest(sliceParsed as Record<string, unknown>);
      manifests.push(manifest);
      sourceChannel = manifest.metadata?.channel;
    }
  }

  return {
    isManifest: manifests.length > 0,
    manifests,
    sourceChannel,
    raw: text,
  };
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
  'was', 'one', 'our', 'out', 'has', 'have', 'with', 'this', 'that', 'from',
  'they', 'been', 'said', 'each', 'will', 'their', 'what', 'about', 'would',
  'make', 'like', 'just', 'over', 'such', 'take', 'than', 'them', 'very',
  'some', 'into', 'could', 'other', 'were', 'more', 'after', 'also', 'made',
  'your', 'here', 'know', 'when', 'which', 'does', 'these', 'dear', 'best',
  'recipient', 'company', 'name', 'hello', 'draft', 'pending', 'review',
  'published', 'based', 'provided', 'information', 'create',
]);

function extractKeywords(text: string, max = 6): string[] {
  const words = text
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  const unique = [...new Set(words)];
  return unique.slice(0, max);
}

function buildImagePromptFromContext(keywords: string[], context: string): string {
  const topicPhrase = keywords.slice(0, 4).join(', ');
  const snippet = context.replace(/<[^>]+>/g, '').slice(0, 80).trim();
  return `[STOCK] Professional editorial photograph related to ${topicPhrase}. Scene: ${snippet}. Warm natural lighting, shallow depth of field, modern clean composition, no text overlays.`;
}

function splitIntoParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

const CTA_PATTERN = /\[(?:CTA|Insert CTA|Button)[:\s]*([^\]]+)\]/i;

/**
 * Synthesize a VA2 DesignManifest from a plain-text email draft.
 * Converts SUBJECT/PREVIEW/BODY (or raw prose) into a structured manifest
 * with hero, text_block, image, divider, cta, and footer sections.
 * Image sections get `imagePrompt` fields that the resolve-email-images
 * endpoint will use to generate AI images.
 */
export function synthesizeManifestFromPlainText(raw: string): DesignManifest {
  const parsed = parseStructuredEmailDraft(raw);
  const subject = parsed.subject || 'Your Update';
  const preview = parsed.preview || subject;
  const body = parsed.body || raw;
  const keywords = extractKeywords(`${subject} ${body}`);

  const sections: ManifestSection[] = [];
  let order = 1;

  sections.push({
    type: 'hero',
    order: order++,
    content: {
      headline: subject,
      subheadline: preview !== subject ? preview : undefined,
      ctaText: 'Learn More',
      ctaUrl: '#',
      imagePrompt: `[STOCK] Wide cinematic shot related to ${keywords.slice(0, 3).join(', ')}. Professional corporate atmosphere, vibrant colors, modern design, high resolution, no text overlays.`,
      alignment: 'center',
    },
  });

  const paragraphs = splitIntoParagraphs(body);
  let textBlockBuffer: string[] = [];

  const flushTextBlock = (): void => {
    if (textBlockBuffer.length === 0) return;
    const html = textBlockBuffer
      .map((p) => `<p>${p}</p>`)
      .join('');
    sections.push({
      type: 'text_block',
      order: order++,
      content: { body: html, alignment: 'left' },
    });
    textBlockBuffer = [];
  };

  let imageCount = 0;
  const maxImages = 3;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    const ctaMatch = CTA_PATTERN.exec(para);
    if (ctaMatch) {
      flushTextBlock();
      sections.push({
        type: 'cta',
        order: order++,
        content: {
          buttonText: ctaMatch[1].trim() || 'Get Started',
          buttonUrl: '#',
          variant: 'pill',
        },
      });
      const remaining = para.replace(CTA_PATTERN, '').trim();
      if (remaining) textBlockBuffer.push(remaining);
      continue;
    }

    textBlockBuffer.push(para);

    const shouldInsertImage =
      imageCount < maxImages &&
      textBlockBuffer.length >= 2 &&
      i < paragraphs.length - 1;

    if (shouldInsertImage) {
      const useImageText = imageCount % 2 === 0;
      const imageLayout = imageCount % 2 === 0 ? 'image_left' : 'image_right';
      const nextPara = i + 1 < paragraphs.length ? paragraphs[i + 1] : '';

      if (useImageText && nextPara) {
        flushTextBlock();
        sections.push({
          type: 'image_text',
          order: order++,
          content: {
            body: `<p>${nextPara}</p>`,
            imagePrompt: buildImagePromptFromContext(keywords, paragraphs[i]),
            altText: `Visual related to ${keywords[0] || 'content'}`,
            layout: imageLayout,
          },
        });
        i++;
      } else {
        flushTextBlock();
        sections.push({
          type: 'divider',
          order: order++,
          content: {},
        });
        sections.push({
          type: 'image',
          order: order++,
          content: {
            imagePrompt: buildImagePromptFromContext(keywords, paragraphs[i]),
            altText: `Visual related to ${keywords[0] || 'content'}`,
            width: 'full',
          },
        });
        sections.push({
          type: 'divider',
          order: order++,
          content: {},
        });
      }
      imageCount++;
    }
  }

  flushTextBlock();

  if (!sections.some((s) => s.type === 'cta')) {
    sections.push({
      type: 'cta',
      order: order++,
      content: {
        buttonText: 'Learn More',
        buttonUrl: '#',
        variant: 'pill',
      },
    });
  }

  sections.push({
    type: 'footer',
    order: order++,
    content: {
      companyName: '[Company Name]',
      address: '[Company Address]',
      links: [{ text: 'Privacy Policy', url: '#' }, { text: 'Unsubscribe', url: '#' }],
    },
  });

  return {
    version: '2.0',
    theme: 'minimal',
    subject,
    preheader: preview,
    sections,
    metadata: { channel: 'email' },
    artDirection: {
      imageStyle: `Professional editorial style related to ${keywords.slice(0, 3).join(', ')}`,
    },
  };
}

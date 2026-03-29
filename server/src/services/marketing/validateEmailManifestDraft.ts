import { z } from 'zod';

const sectionSchema = z.object({
  type: z.string().min(1),
  order: z.number(),
  content: z.record(z.unknown()),
});

const manifestSchema = z.object({
  theme: z.string().min(1),
  subject: z.string().min(1),
  preheader: z.string(),
  sections: z.array(sectionSchema).min(1),
  metadata: z
    .object({
      visual_density: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

/**
 * Heuristic: draft text likely contains a VA2 JSON manifest (used before strict parse).
 */
export function looksLikeVa2EmailManifest(draft: string): boolean {
  const t = draft.trim();
  if (!t.includes('sections') || !t.includes('subject')) return false;
  return /\{[\s\S]*"sections"[\s\S]*\}/.test(t) || /```(?:json)?/i.test(t);
}

function tryParseJsonObject(text: string): unknown {
  const cleaned = text.trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* try fenced blocks */
  }
  const blocks = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/g);
  if (blocks) {
    for (const block of blocks) {
      const inner = block.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '');
      try {
        const p = JSON.parse(inner.trim());
        if (p && typeof p === 'object' && !Array.isArray(p)) return p;
      } catch {
        /* next */
      }
    }
  }
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      return JSON.parse(text.slice(braceStart, braceEnd + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Parse and validate a Strategist-produced email DesignManifest so gatekeepers can run on flattened copy.
 */
export function parseAndValidateEmailManifestDraft(
  draft: string,
): { ok: true; manifest: Record<string, unknown> } | { ok: false; errors: string[] } {
  const raw = tryParseJsonObject(draft);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['Could not parse a JSON object from the draft'] };
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.errors.map((e) => `${e.path.join('.') || 'manifest'}: ${e.message}`),
    };
  }
  return { ok: true, manifest: raw as Record<string, unknown> };
}

/**
 * Flatten manifest copy for Product Truth / brand / compliance (subject, preheader, section payloads).
 */
export function flattenEmailManifestForGatekeepers(manifest: Record<string, unknown>): string {
  const lines: string[] = [];
  const subject = typeof manifest.subject === 'string' ? manifest.subject : '';
  const preheader = typeof manifest.preheader === 'string' ? manifest.preheader : '';
  lines.push(`Subject: ${subject}`, `Preheader: ${preheader}`);
  const sections = Array.isArray(manifest.sections) ? manifest.sections : [];
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    const sec = s as Record<string, unknown>;
    const ty = typeof sec.type === 'string' ? sec.type : 'section';
    const content = sec.content;
    if (content && typeof content === 'object') {
      lines.push(`Section ${ty}: ${JSON.stringify(content)}`);
    }
  }
  return lines.join('\n\n');
}

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
  // Quick copy quality scan — non-blocking, logging only
  logCopyQualityIssues(raw as Record<string, unknown>);

  return { ok: true, manifest: raw as Record<string, unknown> };
}

/**
 * Structured copy quality check — returns actionable issues for the retry loop.
 * Unlike logCopyQualityIssues (logging-only), this scans ALL text fields in ALL sections.
 */
export function checkCopyQualityForRetry(manifest: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const sections = Array.isArray(manifest.sections) ? manifest.sections : [];

  // --- Kill-list scan across ALL text fields in ALL sections ---
  // ONLY include patterns worth an 80s retry penalty. Common marketing words
  // (seamless, optimize, streamline) stay in the prompt kill-list and client
  // warnings but do NOT trigger server-side retries.
  const killPatterns: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /unlock the (full )?potential/i, replacement: 'a specific outcome' },
    { pattern: /we'?re (excited|thrilled) to (announce|share)/i, replacement: 'lead with what changed, not your feelings' },
    { pattern: /in today'?s fast[- ]paced world/i, replacement: 'delete — adds nothing' },
    { pattern: /game[- ]chang(er|ing)/i, replacement: 'state the measurable impact' },
    { pattern: /\bsynergy\b/i, replacement: 'describe the specific collaboration or integration' },
    { pattern: /\brevolutionary\b/i, replacement: 'state what changed and the before/after' },
  ];

  // Collect all text from all sections + top-level fields
  const allTexts: string[] = [];
  if (typeof manifest.subject === 'string') allTexts.push(manifest.subject);
  if (typeof manifest.preheader === 'string') allTexts.push(manifest.preheader);

  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    const content = (s as Record<string, unknown>).content;
    if (!content || typeof content !== 'object') continue;
    const c = content as Record<string, unknown>;
    for (const key of ['headline', 'subheadline', 'body', 'description', 'buttonText', 'urgencyText']) {
      if (typeof c[key] === 'string') allTexts.push(c[key] as string);
    }
    // value_prop items
    if (Array.isArray(c.items)) {
      for (const item of c.items) {
        if (!item || typeof item !== 'object') continue;
        const it = item as Record<string, unknown>;
        for (const key of ['heading', 'description']) {
          if (typeof it[key] === 'string') allTexts.push(it[key] as string);
        }
      }
    }
  }

  for (const { pattern, replacement } of killPatterns) {
    for (const text of allTexts) {
      if (pattern.test(text)) {
        issues.push(`Kill-list word "${text.match(pattern)?.[0]}" found. Replace with: ${replacement}`);
        break; // one issue per pattern is enough
      }
    }
  }

  // --- P.S. section check ---
  const nonFooterSections = sections.filter(
    (s: unknown) => s && typeof s === 'object' && (s as Record<string, unknown>).type !== 'footer',
  );
  const lastNonFooter = nonFooterSections[nonFooterSections.length - 1] as Record<string, unknown> | undefined;
  const hasPsTextBlock =
    lastNonFooter?.type === 'text_block' ||
    (lastNonFooter?.type === 'image_text' &&
      typeof (lastNonFooter?.content as Record<string, unknown>)?.body === 'string' &&
      ((lastNonFooter?.content as Record<string, unknown>)?.body as string).length >= 50);
  if (!hasPsTextBlock) {
    issues.push(
      'Missing P.S. section. Add a text_block section immediately before footer with a conversational P.S. line (urgency, restated benefit, or human aside).',
    );
  }

  // --- Subject variants check ---
  const metadata = manifest.metadata as Record<string, unknown> | undefined;
  const subjectVariants = Array.isArray(metadata?.subject_variants) ? metadata.subject_variants : [];
  if (subjectVariants.length < 2) {
    issues.push(
      'Missing metadata.subject_variants. Generate 3 subject line candidates: best → subject field, other two → metadata.subject_variants (array of exactly 2 strings). Use curiosity-gap, benefit-first, and pattern-interrupt strategies.',
    );
  }

  // --- Concrete numbers check (hero, value_prop, image_text, social_proof) ---
  const numberPattern = /\d+[%$€£KkMm+]|\d{2,}|\$\d|\d+\s*(percent|hours?|minutes?|days?|weeks?|months?|years?|users?|customers?|teams?|companies)/i;
  const numberSectionTypes = new Set(['hero', 'value_prop', 'image_text', 'social_proof']);
  let sectionsWithNumbers = 0;
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    const sType = (s as Record<string, unknown>).type;
    if (typeof sType !== 'string' || !numberSectionTypes.has(sType)) continue;
    const content = (s as Record<string, unknown>).content;
    if (!content || typeof content !== 'object') continue;
    const c = content as Record<string, unknown>;
    const fieldsToCheck = [c.headline, c.subheadline, c.body, c.description];
    // value_prop items
    if (Array.isArray(c.items)) {
      for (const item of c.items) {
        if (item && typeof item === 'object') {
          const it = item as Record<string, unknown>;
          fieldsToCheck.push(it.heading, it.description);
        }
      }
    }
    if (fieldsToCheck.some((f) => typeof f === 'string' && numberPattern.test(f))) {
      sectionsWithNumbers++;
    }
  }
  if (sectionsWithNumbers < 1) {
    issues.push(
      `Only ${sectionsWithNumbers} section(s) contain concrete numbers. Add specific data (percentages, counts, timeframes, dollar amounts) to at least 2 of: hero headline/subheadline, value_prop headings, image_text body, social_proof content. Example: "91% of teams" not "most teams".`,
    );
  }

  if (issues.length > 0) {
    console.warn(`[COPY QUALITY RETRY] ${issues.length} issue(s) that should trigger retry:`, issues);
  }
  return issues;
}

/** Server-side copy quality spot check — logs issues for observability. Non-blocking. */
function logCopyQualityIssues(manifest: Record<string, unknown>): void {
  const issues: string[] = [];
  const subject = typeof manifest.subject === 'string' ? manifest.subject : '';
  const preheader = typeof manifest.preheader === 'string' ? manifest.preheader : '';

  const killPatterns = [
    /unlock the (full )?potential/i,
    /we'?re (excited|thrilled) to (announce|share)/i,
    /in today'?s fast[- ]paced world/i,
    /\bleverage\b/i,
    /comprehensive (solution|suite)/i,
    /game[- ]chang(er|ing)/i,
    /\bsynergy\b/i,
    /\brevolutionary\b/i,
    /cutting[- ]edge/i,
    /\bseamless(ly)?\b/i,
  ];

  const sections = Array.isArray(manifest.sections) ? manifest.sections : [];
  const firstSection = sections[0] as Record<string, unknown> | undefined;
  const firstContent = (firstSection?.content ?? {}) as Record<string, unknown>;
  const headline = typeof firstContent.headline === 'string' ? firstContent.headline : '';
  const textsToCheck = [subject, preheader, headline];

  for (const pattern of killPatterns) {
    for (const text of textsToCheck) {
      if (pattern.test(text)) {
        issues.push(`Kill-list phrase: "${text.slice(0, 60)}" matches ${pattern.source}`);
      }
    }
  }

  const ctaSection = sections.find(
    (s: unknown) => s && typeof s === 'object' && (s as Record<string, unknown>).type === 'cta',
  ) as Record<string, unknown> | undefined;
  const ctaContent = (ctaSection?.content ?? {}) as Record<string, unknown>;
  const buttonText = typeof ctaContent.buttonText === 'string' ? ctaContent.buttonText.trim() : '';
  if (/^(click here|learn more|submit|sign up|see details|read more)$/i.test(buttonText)) {
    issues.push(`Generic CTA: "${buttonText}"`);
  }

  if (subject.length > 70) {
    issues.push(`Subject too long: ${subject.length} chars (aim for <60)`);
  }

  if (issues.length > 0) {
    console.warn(`[COPY QUALITY] ⚠️ ${issues.length} issue(s) in generated manifest:`, issues);
  }
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

import { TYPICAL_SUBJECT_MAX } from './emailInboxPreview';

/**
 * Copy Quality Gate — validates copywriting quality in VA2 manifests.
 * Surfaces warnings in Va2DiagnosticsPanel alongside structural validation.
 *
 * This is a QUALITY gate, not a BLOCKING gate. All issues are warnings,
 * not errors. The user can proceed with generic copy if they choose —
 * but they'll know about it.
 *
 * Phase 6 of the email copywriting quality system.
 */

export interface CopyQualityWarning {
  /** Unique id for toast deduplication (matches existing notifyAssemblyQuality pattern) */
  id: string;
  /** Which manifest field triggered the warning */
  field: string;
  /** Human-readable warning message */
  message: string;
  /** Severity: 'low' = suggestion, 'medium' = likely issue, 'high' = almost certainly generic */
  severity: 'low' | 'medium' | 'high';
  /** Category for grouping in diagnostics panel */
  category: 'kill_list' | 'structure' | 'specificity';
}

// ---------------------------------------------------------------------------
// Kill List — mirrors Phase 2 prompt kill list for defense-in-depth
// ---------------------------------------------------------------------------

const KILL_LIST_PHRASES: { pattern: RegExp; reason: string }[] = [
  { pattern: /i hope this email finds you well/i, reason: 'Filler opening — provides no value to the reader' },
  { pattern: /in today'?s fast[- ]paced world/i, reason: 'Cliché opener — every AI writes this' },
  { pattern: /we'?re (excited|thrilled) to (announce|share)/i, reason: "Writer's emotion, not reader's benefit" },
  { pattern: /stay ahead of the curve/i, reason: 'Vague motivational language — no specificity' },
  { pattern: /take .{1,30} to the next level/i, reason: 'Generic improvement claim — what level? how?' },
  { pattern: /don'?t miss out(?!\s+on\s+\w)/i, reason: 'Lazy urgency — must specify what they miss and by when' },
  /** Word-boundary only — avoids matching arbitrary substrings inside URLs or tokens. */
  { pattern: /\brevolutioniz\w*\b/i, reason: 'Hyperbolic — nothing in an email is a revolution' },
  { pattern: /game[- ]chang/i, reason: 'Overused hype word — kills credibility' },
  { pattern: /cutting[- ]edge/i, reason: 'Undifferentiated tech jargon' },
  { pattern: /state[- ]of[- ]the[- ]art/i, reason: 'Undifferentiated tech jargon' },
  { pattern: /\bsynergy\b/i, reason: 'Corporate buzzword — nobody talks like this' },
  { pattern: /\bleverage\b(?! (ratio|point))/i, reason: 'Corporate verb — use a concrete action instead' },
  { pattern: /empower your team/i, reason: 'Vague feel-good language — what specifically changes?' },
  { pattern: /unlock the (full )?potential/i, reason: 'Vague promise with no mechanism' },
  { pattern: /comprehensive (solution|suite|platform)/i, reason: 'Means nothing — every product claims comprehensiveness' },
  { pattern: /seamless(ly)? integrat/i, reason: 'Every SaaS claims seamless integration — not differentiating' },
  { pattern: /end[- ]to[- ]end solution/i, reason: 'Vague scope claim — what specifically is covered?' },
  { pattern: /\brobust\b/i, reason: 'Empty adjective that adds no information' },
  { pattern: /innovative solution/i, reason: 'Self-praise that the reader will never believe' },
  { pattern: /world[- ]class/i, reason: 'Meaningless superlative — says nothing measurable' },
];

// CTA-specific kill list — checked only against buttonText fields
const CTA_KILL_LIST: { pattern: RegExp; reason: string }[] = [
  { pattern: /^click here$/i, reason: 'Describes the finger action, not the value — rewrite as verb + outcome' },
  { pattern: /^learn more$/i, reason: 'Vague destination — learn more about what?' },
  { pattern: /^submit$/i, reason: 'Sounds like homework or a hostage situation' },
  { pattern: /^sign up$/i, reason: 'Generic — sign up for what? what do I get?' },
  { pattern: /^read more$/i, reason: 'Passive — what will I read? why should I care?' },
  { pattern: /^get started$/i, reason: 'Started with what? add specificity: "Start my free trial"' },
  { pattern: /^register$/i, reason: 'Bureaucratic — rewrite as what the reader gains by registering' },
  { pattern: /^download$/i, reason: 'Tells the action, not the value — download what? "Get the playbook" is better' },
  { pattern: /^buy now$/i, reason: 'Pushy without context — name what they are buying or the benefit' },
  { pattern: /^order now$/i, reason: 'Same as "buy now" — add what they are getting' },
];

// Generic value prop headings — checked only against value_prop heading fields
const GENERIC_VALUE_PROP_HEADINGS: RegExp[] = [
  /^powerful analytics$/i,
  /^seamless integration$/i,
  /^easy to use$/i,
  /^(24\/7|round[- ]the[- ]clock) support$/i,
  /^advanced (features|technology|security)$/i,
  /^scalable? (solution|platform|infrastructure)$/i,
  /^customizab(le|ility)$/i,
  /^fast performance$/i,
  /^reliable (platform|service|infrastructure)$/i,
  /^secure (platform|solution|by design)$/i,
  /^user[- ]friendly (interface|design|experience)$/i,
  /^real[- ]time (data|insights|analytics|monitoring)$/i,
  /^smart automation$/i,
  /^ai[- ]powered/i,
  /^cloud[- ](based|native)$/i,
  /^(complete|total|full) (visibility|control|solution)$/i,
];

// ---------------------------------------------------------------------------
// Structural copy checks
// ---------------------------------------------------------------------------

interface ManifestLike {
  subject?: string;
  preheader?: string;
  metadata?: {
    subject_variants?: string[];
    visual_density?: string;
    [key: string]: unknown;
  };
  sections?: Array<{
    type?: string;
    order?: number;
    content?: {
      headline?: string;
      subheadline?: string;
      body?: string;
      buttonText?: string;
      ctaText?: string;
      urgencyText?: string;
      items?: Array<{
        heading?: string;
        description?: string;
        name?: string;
        [key: string]: unknown;
      }>;
      columns?: number;
      quote?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

export function validateCopyQuality(manifest: ManifestLike): CopyQualityWarning[] {
  const warnings: CopyQualityWarning[] = [];
  let killIdx = 0;
  const w = (
    id: string,
    field: string,
    message: string,
    severity: CopyQualityWarning['severity'],
    category: CopyQualityWarning['category'],
  ) => {
    warnings.push({ id, field, message, severity, category });
  };

  // -----------------------------------------------------------------------
  // 1. Kill list scan — all text fields
  // -----------------------------------------------------------------------
  const textFields = extractTextFields(manifest);
  for (const { field, value } of textFields) {
    for (const { pattern, reason } of KILL_LIST_PHRASES) {
      if (pattern.test(value)) {
        const match = value.match(pattern)?.[0] || '';
        killIdx += 1;
        w(
          `kill_${field}_${killIdx}`,
          field,
          `Generic phrase detected: "${match}" — ${reason}`,
          'high',
          'kill_list',
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // 2. CTA-specific kill list
  // -----------------------------------------------------------------------
  const ctaFields = extractCtaFields(manifest);
  for (const { field, value } of ctaFields) {
    const trimmed = value.trim();
    for (const { pattern, reason } of CTA_KILL_LIST) {
      if (pattern.test(trimmed)) {
        w(
          `cta_kill_${field.replace(/[^a-zA-Z0-9]+/g, '_')}`,
          field,
          `Generic CTA: "${trimmed}" — ${reason}`,
          'high',
          'kill_list',
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // 3. Subject line checks
  // -----------------------------------------------------------------------
  if (manifest.subject) {
    const subjectLen = manifest.subject.trim().length;
    if (subjectLen > TYPICAL_SUBJECT_MAX) {
      w(
        'subject_length',
        'subject',
        `Subject is ${subjectLen} characters (typical mobile truncation ~${TYPICAL_SUBJECT_MAX}; varies by client). Consider tightening or front-loading key words.`,
        'medium',
        'structure',
      );
    }
    if (/^(newsletter|update|digest)\b/i.test(manifest.subject) && !/\?|—|:|\d/.test(manifest.subject)) {
      w(
        'subject_skippable',
        'subject',
        'Subject starts with "Newsletter/Update/Digest" without a hook — signals skippable content.',
        'medium',
        'structure',
      );
    }
  }

  // -----------------------------------------------------------------------
  // 4. Subject / preheader repetition check
  // -----------------------------------------------------------------------
  if (manifest.subject && manifest.preheader) {
    const subjectWords = new Set(
      manifest.subject
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((sw) => sw.length > 3),
    );
    const preheaderWords = manifest.preheader
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((pw) => pw.length > 3);
    const overlap = preheaderWords.filter((pw) => subjectWords.has(pw));
    const overlapRatio = subjectWords.size > 0 ? overlap.length / subjectWords.size : 0;
    if (overlapRatio > 0.5) {
      w(
        'preheader_repeats_subject',
        'preheader',
        `Preheader repeats ${Math.round(overlapRatio * 100)}% of subject line words. Preheader should add NEW information.`,
        'medium',
        'structure',
      );
    }
  }

  // -----------------------------------------------------------------------
  // 5. Preheader length (mirrors existing client warning but adds copy context)
  // -----------------------------------------------------------------------
  if (manifest.preheader && manifest.metadata?.visual_density !== 'minimal') {
    if (manifest.preheader.trim().length < 40) {
      w(
        'preheader_short',
        'preheader',
        `Preheader is ${manifest.preheader.trim().length} characters (min 40 for non-minimal density). Short preheaders waste inbox preview real estate.`,
        'low',
        'structure',
      );
    }
  }

  // -----------------------------------------------------------------------
  // 6. Subject variants check
  // -----------------------------------------------------------------------
  if (!manifest.metadata?.subject_variants || manifest.metadata.subject_variants.length < 2) {
    w(
      'missing_subject_variants',
      'metadata.subject_variants',
      'Missing subject line variants. The model should generate 3 candidates and include 2 alternates.',
      'low',
      'structure',
    );
  }

  // -----------------------------------------------------------------------
  // 7. P.S. section check — text_block/text before footer, or image_text with substantive body
  // -----------------------------------------------------------------------
  if (manifest.sections && manifest.sections.length > 0) {
    const sorted = [...manifest.sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const footerIndex = sorted.findIndex((s) => s.type === 'footer');
    if (footerIndex > 0) {
      const lastContentIndex = footerIndex - 1;
      const lastContentSection = sorted[lastContentIndex];
      const lastType = lastContentSection?.type ?? 'unknown';
      const bodyRaw = lastContentSection?.content?.body;
      const psBody = typeof bodyRaw === 'string' ? bodyRaw.trim() : '';

      if (lastType === 'text_block' || lastType === 'text') {
        if (psBody.length < 50) {
          w(
            'weak_ps',
            `sections[${lastContentIndex}].content.body`,
            `P.S. section is only ${psBody.length} characters. A good P.S. adds urgency, a bonus, or a restated benefit — needs substance.`,
            'low',
            'structure',
          );
        }
      } else if (lastType === 'image_text') {
        if (psBody.length >= 50) {
          // VA2 often ends on image+copy; long body counts as a P.S.-style closing note.
        } else if (psBody.length > 0) {
          w(
            'weak_ps',
            `sections[${lastContentIndex}].content.body`,
            `Closing image_text body is ${psBody.length} characters (min 50 for a substantive P.S.-style note). Add copy or insert a text_block before the footer.`,
            'low',
            'structure',
          );
        } else {
          w(
            'missing_ps',
            'sections',
            `No P.S. section found. The last section before footer is image_text with no body — add body copy (50+ chars) or a text_block P.S. before the footer.`,
            'medium',
            'structure',
          );
        }
      } else {
        w(
          'missing_ps',
          'sections',
          `No P.S. section found. The last section before footer is "${lastType}" — use a text_block P.S., or image_text with at least 50 characters of body copy before the footer.`,
          'medium',
          'structure',
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // 8. Lead section check — first narrative section shouldn't start with "We"
  // -----------------------------------------------------------------------
  if (manifest.sections && manifest.sections.length > 0) {
    const sorted = [...manifest.sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const firstNarrative = sorted.find((s) =>
      s.type === 'hero' || s.type === 'text_block' || s.type === 'text' || s.type === 'image_text',
    );
    if (firstNarrative) {
      const leadText =
        firstNarrative.content?.headline ||
        firstNarrative.content?.body ||
        firstNarrative.content?.subheadline ||
        '';
      if (/^we\b/i.test(leadText.trim())) {
        w(
          'lead_starts_with_we',
          'sections.lead.content',
          'Lead section starts with "We" — flips focus to the sender. Consider starting with "You", a story, or a pain point.',
          'medium',
          'specificity',
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // 9. Value prop heading specificity check
  // -----------------------------------------------------------------------
  if (manifest.sections) {
    for (const section of manifest.sections) {
      if (section.type === 'value_prop' && section.content?.items) {
        for (let i = 0; i < section.content.items.length; i++) {
          const item = section.content.items[i];
          const heading = item.heading || item.name || '';
          for (const pattern of GENERIC_VALUE_PROP_HEADINGS) {
            if (pattern.test(heading.trim())) {
              w(
                `generic_vp_heading_${i}`,
                `value_prop.items[${i}].heading`,
                `Generic value prop heading: "${heading}" — this is a category label, not a benefit. Name the outcome or mechanism.`,
                'medium',
                'specificity',
              );
            }
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // 10. Body copy specificity — check for at least one number in value sections
  // -----------------------------------------------------------------------
  if (manifest.sections) {
    const valueSections = manifest.sections.filter(
      (s) => s.type === 'value_prop' || s.type === 'image_text' || s.type === 'social_proof',
    );
    if (valueSections.length > 0) {
      const allValueText = valueSections
        .map((s) => {
          const c = s.content;
          if (!c) return '';
          const parts = [c.body, c.headline, c.subheadline].filter(Boolean) as string[];
          if (c.items) {
            parts.push(...c.items.map((item) => `${item.heading || ''} ${item.description || ''}`));
          }
          return parts.join(' ');
        })
        .join(' ');

      if (!/\d/.test(allValueText)) {
        w(
          'no_numbers_in_value',
          'sections (value/proof)',
          'No numbers found in any value prop, image_text, or social proof sections. Specificity requires concrete data — percentages, timeframes, counts.',
          'medium',
          'specificity',
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // 11. Word count estimate (rough — across all body/description fields)
  // -----------------------------------------------------------------------
  const allBodyText = extractAllBodyText(manifest);
  const wordCount = allBodyText.split(/\s+/).filter((bw) => bw.length > 0).length;
  if (wordCount > 250) {
    w(
      'word_count_high',
      'all body fields',
      `Estimated body word count: ${wordCount} (target: under 200 unless brief requests long-form). Consider cutting.`,
      'low',
      'structure',
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FieldValue {
  field: string;
  value: string;
}

function extractTextFields(manifest: ManifestLike): FieldValue[] {
  const fields: FieldValue[] = [];

  if (manifest.subject) fields.push({ field: 'subject', value: manifest.subject });
  if (manifest.preheader) fields.push({ field: 'preheader', value: manifest.preheader });

  if (manifest.metadata?.subject_variants) {
    for (let i = 0; i < manifest.metadata.subject_variants.length; i++) {
      fields.push({ field: `metadata.subject_variants[${i}]`, value: manifest.metadata.subject_variants[i] });
    }
  }

  if (manifest.sections) {
    for (let i = 0; i < manifest.sections.length; i++) {
      const s = manifest.sections[i];
      const c = s.content;
      if (!c) continue;
      const prefix = `sections[${i}].content`;
      if (c.headline) fields.push({ field: `${prefix}.headline`, value: c.headline });
      if (c.subheadline) fields.push({ field: `${prefix}.subheadline`, value: c.subheadline });
      if (c.body) fields.push({ field: `${prefix}.body`, value: c.body });
      if (c.urgencyText) fields.push({ field: `${prefix}.urgencyText`, value: c.urgencyText });
      if (c.quote) fields.push({ field: `${prefix}.quote`, value: c.quote });
      if (c.items) {
        for (let j = 0; j < c.items.length; j++) {
          const item = c.items[j];
          if (item.heading) fields.push({ field: `${prefix}.items[${j}].heading`, value: item.heading });
          if (item.description) fields.push({ field: `${prefix}.items[${j}].description`, value: item.description });
          if (item.name) fields.push({ field: `${prefix}.items[${j}].name`, value: item.name });
        }
      }
    }
  }

  return fields;
}

function extractCtaFields(manifest: ManifestLike): FieldValue[] {
  const fields: FieldValue[] = [];
  if (manifest.sections) {
    for (let i = 0; i < manifest.sections.length; i++) {
      const s = manifest.sections[i];
      const c = s.content;
      if (!c) continue;
      const prefix = `sections[${i}].content`;
      if (c.buttonText) fields.push({ field: `${prefix}.buttonText`, value: c.buttonText });
      if (c.ctaText) fields.push({ field: `${prefix}.ctaText`, value: c.ctaText });
    }
  }
  return fields;
}

function extractAllBodyText(manifest: ManifestLike): string {
  const parts: string[] = [];
  if (manifest.sections) {
    for (const s of manifest.sections) {
      const c = s.content;
      if (!c) continue;
      if (c.headline) parts.push(c.headline);
      if (c.subheadline) parts.push(c.subheadline);
      if (c.body) parts.push(c.body);
      if (c.items) {
        for (const item of c.items) {
          if (item.heading) parts.push(item.heading);
          if (item.description) parts.push(item.description);
        }
      }
    }
  }
  return parts.join(' ');
}

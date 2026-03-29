/**
 * Server-side VA2 DesignManifest checks (automation / API parity with client normalize).
 */

export interface EmailManifestValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface EmailManifestValidationResult {
  valid: boolean;
  errors: EmailManifestValidationIssue[];
  warnings: EmailManifestValidationIssue[];
}

const THEMES = new Set([
  'executive',
  'startup',
  'luxury',
  'minimal',
  'bold',
  'nature',
  'tech',
  'warm',
]);

/**
 * Validates a VA2 email manifest shape before assembly or image resolve.
 */
export function validateEmailManifestInput(manifest: unknown): EmailManifestValidationResult {
  const errors: EmailManifestValidationIssue[] = [];
  const warnings: EmailManifestValidationIssue[] = [];

  if (!manifest || typeof manifest !== 'object') {
    errors.push({ field: 'manifest', message: 'Manifest must be a JSON object', severity: 'error' });
    return { valid: false, errors, warnings };
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m.version !== 'string' || !m.version.trim()) {
    errors.push({ field: 'version', message: 'version is required (e.g. "2.0")', severity: 'error' });
  }

  if (typeof m.theme !== 'string' || !m.theme.trim()) {
    errors.push({ field: 'theme', message: 'theme is required', severity: 'error' });
  } else if (!THEMES.has(m.theme.trim())) {
    warnings.push({
      field: 'theme',
      message: `Unknown theme "${m.theme}" — client may fall back to a safe default`,
      severity: 'warning',
    });
  }

  if (typeof m.subject !== 'string' || !m.subject.trim()) {
    errors.push({ field: 'subject', message: 'subject is required for email', severity: 'error' });
  }

  if (typeof m.preheader !== 'string') {
    warnings.push({
      field: 'preheader',
      message: 'preheader missing — inbox preview may be weak',
      severity: 'warning',
    });
  } else if (m.preheader.trim().length > 0 && m.preheader.trim().length < 80) {
    warnings.push({
      field: 'preheader',
      message: 'preheader is short — aim for ~100+ characters for inbox preview quality',
      severity: 'warning',
    });
  }

  const sections = m.sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    errors.push({ field: 'sections', message: 'sections must be a non-empty array', severity: 'error' });
  } else {
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (!s || typeof s !== 'object') {
        errors.push({ field: `sections[${i}]`, message: 'Each section must be an object', severity: 'error' });
        continue;
      }
      const sec = s as Record<string, unknown>;
      if (typeof sec.type !== 'string' || !sec.type.trim()) {
        errors.push({ field: `sections[${i}].type`, message: 'section type is required', severity: 'error' });
      }
      if (typeof sec.order !== 'number' || !Number.isFinite(sec.order)) {
        errors.push({ field: `sections[${i}].order`, message: 'section order must be a number', severity: 'error' });
      }
      if (!sec.content || typeof sec.content !== 'object') {
        errors.push({ field: `sections[${i}].content`, message: 'section content must be an object', severity: 'error' });
      }
    }
  }

  const valid = errors.length === 0;
  return { valid, errors, warnings };
}

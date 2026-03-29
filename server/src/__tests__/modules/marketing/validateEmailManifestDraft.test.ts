import { describe, it, expect } from 'vitest';
import {
  flattenEmailManifestForGatekeepers,
  looksLikeVa2EmailManifest,
  parseAndValidateEmailManifestDraft,
} from '../../../services/marketing/validateEmailManifestDraft.js';

describe('validateEmailManifestDraft', () => {
  it('detects manifest-like drafts', () => {
    expect(looksLikeVa2EmailManifest('hello')).toBe(false);
    expect(looksLikeVa2EmailManifest('{"subject":"S","sections":[]}')).toBe(true);
    expect(
      looksLikeVa2EmailManifest(
        `{"subject":"S","preheader":"${'p'.repeat(100)}","theme":"minimal","sections":[{"type":"hero","order":1,"content":{}}]}`,
      ),
    ).toBe(true);
  });

  it('parses fenced JSON and validates', () => {
    const draft = `\`\`\`json
{
  "theme": "minimal",
  "subject": "Hello",
  "preheader": "${'x'.repeat(100)}",
  "sections": [
    { "type": "hero", "order": 1, "content": { "headline": "H" } }
  ],
  "metadata": { "visual_density": "minimal", "channel": "email" }
}
\`\`\``;
    const r = parseAndValidateEmailManifestDraft(draft);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manifest.theme).toBe('minimal');
      const flat = flattenEmailManifestForGatekeepers(r.manifest);
      expect(flat).toContain('Subject: Hello');
      expect(flat).toContain('Section hero');
    }
  });

  it('returns errors for invalid manifest', () => {
    const r = parseAndValidateEmailManifestDraft('{"sections":[]}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });
});

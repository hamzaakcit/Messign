import { describe, it, expect } from 'vitest';
import { normalizePreheaderForEmail } from './designAssembler';

describe('normalizePreheaderForEmail', () => {
  it('leaves long preheaders unchanged (truncated to max)', () => {
    const long = `${'x'.repeat(120)}`;
    expect(normalizePreheaderForEmail(long, 'Sub').length).toBeLessThanOrEqual(200);
    expect(normalizePreheaderForEmail(long, 'Sub').startsWith('xxx')).toBe(true);
  });

  it('pads short preheaders to meet minimum length', () => {
    const out = normalizePreheaderForEmail('Hi', 'Summer sale');
    expect(out.length).toBeGreaterThanOrEqual(100);
  });

  it('uses subject when preheader empty', () => {
    const out = normalizePreheaderForEmail('', 'Launch week');
    expect(out).toContain('Launch');
    expect(out.length).toBeGreaterThanOrEqual(100);
  });
});

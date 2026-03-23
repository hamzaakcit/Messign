import { describe, it, expect } from 'vitest';
import {
  validateImageGenerationInput,
  validateRasterImageBuffer,
} from '../../../services/marketing/publishing/imageService.js';

const validInput = {
  org_id: '00000000-0000-0000-0000-000000000001',
  content_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  prompt: 'A paper plane over water',
};

describe('validateImageGenerationInput', () => {
  it('accepts trimmed UUIDs and prompt', () => {
    const r = validateImageGenerationInput({
      ...validInput,
      org_id: '  ' + validInput.org_id + '  ',
      prompt: '  hello  ',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized.org_id).toBe(validInput.org_id);
      expect(r.normalized.prompt).toBe('hello');
    }
  });

  it('rejects bad org_id', () => {
    const r = validateImageGenerationInput({ ...validInput, org_id: 'not-a-uuid' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/org_id/i);
  });

  it('rejects empty prompt', () => {
    const r = validateImageGenerationInput({ ...validInput, prompt: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/i);
  });

  it('rejects oversize prompt', () => {
    const r = validateImageGenerationInput({
      ...validInput,
      prompt: 'x'.repeat(12_001),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exceeds/i);
  });

  it('rejects unknown resolution', () => {
    const r = validateImageGenerationInput({
      ...validInput,
      resolution: '512x512' as '1024x1024',
    });
    expect(r.ok).toBe(false);
  });
});

describe('validateRasterImageBuffer', () => {
  it('accepts minimal PNG signature', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.alloc(20).fill(0)]);
    expect(validateRasterImageBuffer(buf).ok).toBe(true);
  });

  it('accepts JPEG', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(20).fill(0)]);
    expect(validateRasterImageBuffer(buf).ok).toBe(true);
  });

  it('rejects random bytes', () => {
    const buf = Buffer.alloc(200, 7);
    const r = validateRasterImageBuffer(buf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/recognized/i);
  });

});

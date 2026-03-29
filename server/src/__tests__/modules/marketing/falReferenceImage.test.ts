import { describe, it, expect, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { prepareReferenceImageDataUriForFal } from '../../../services/marketing/publishing/imageService/falReferenceImage.js';

describe('prepareReferenceImageDataUriForFal', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns a JPEG data URI Fal can consume', async () => {
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg()
      .toBuffer();

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength),
    })) as unknown as typeof fetch;

    const prepared = await prepareReferenceImageDataUriForFal('https://example.com/ref.jpg');
    expect(prepared.dataUri.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(prepared.dataUri.length).toBeGreaterThan(100);
    expect(prepared.width).toBeGreaterThan(0);
    expect(prepared.height).toBeGreaterThan(0);
  });

  it('retries with Supabase service-role URL when anonymous GET fails', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://abc123.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');

    const jpeg = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    const publicUrl =
      'https://abc123.supabase.co/storage/v1/object/public/marketing-images/org/x/ref.jpg';

    let calls = 0;
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      calls += 1;
      const u = typeof url === 'string' ? url : url.toString();
      if (calls === 1) {
        expect(u).toContain('/object/public/');
        return { ok: false, status: 403 } as Response;
      }
      expect(u).toContain('/object/marketing-images/');
      expect(u).not.toContain('/object/public/');
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength),
      } as Response;
    }) as unknown as typeof fetch;

    const prepared = await prepareReferenceImageDataUriForFal(publicUrl);
    expect(prepared.dataUri.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(calls).toBe(2);
  });
});

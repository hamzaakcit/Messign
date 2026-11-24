import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveLocalMarketingUpload } from '../../../services/marketing/publishing/imageService/storage.js';

const previous = process.env.UPLOAD_DIR;
let dir = '';

afterEach(async () => {
  if (previous == null) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = previous;
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('local marketing upload', () => {
  it('writes the photo under uploads and returns a same-origin path', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'mkt-upload-'));
    process.env.UPLOAD_DIR = dir;
    const url = await saveLocalMarketingUpload(Buffer.from('webp'), 'org/reference/lucy_1.webp');
    expect(url).toBe('/uploads/marketing/org/reference/lucy_1.webp');
    const saved = await readFile(path.join(dir, 'marketing', 'org', 'reference', 'lucy_1.webp'));
    expect(saved.toString()).toBe('webp');
  });
});
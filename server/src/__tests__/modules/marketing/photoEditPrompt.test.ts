import { describe, it, expect } from 'vitest';
import { buildAdditivePhotoEditPrompt } from '../../../services/marketing/publishing/imageService/photoEditPrompt.js';

describe('buildAdditivePhotoEditPrompt', () => {
  it('includes expanded realism rules (shadows, anti-vector)', () => {
    const p = buildAdditivePhotoEditPrompt('Add a small red paper plane on the path');
    expect(p.toLowerCase()).toMatch(/contact shadow|ambient occlusion/);
    expect(p.toLowerCase()).toMatch(/vector|sticker|clip-art|neon/);
    expect(p.toLowerCase()).toMatch(/low-poly|anti-cg/);
    expect(p).toContain('Add a small red paper plane');
    expect(p).toContain('USER EDIT:');
  });

  it('adds folded-paper prop block when instruction mentions paper plane', () => {
    const p = buildAdditivePhotoEditPrompt('Small paper-plane above the path');
    expect(p).toMatch(/PROP \(folded paper\)/);
    expect(p.toLowerCase()).toMatch(/wing|fold/);
  });

  it('appends photoreal style block by default', () => {
    const p = buildAdditivePhotoEditPrompt('Bear near desk');
    expect(p).toMatch(/STYLE PRESET \(photoreal\)/);
  });

  it('uses editorial style when style_preset is editorial', () => {
    const p = buildAdditivePhotoEditPrompt('Add confetti', { style_preset: 'editorial' });
    expect(p).toMatch(/STYLE PRESET \(editorial\)/);
  });

  it('stays within 8000 chars', () => {
    const long = 'x'.repeat(9000);
    const p = buildAdditivePhotoEditPrompt(long);
    expect(p.length).toBeLessThanOrEqual(8000);
  });
});

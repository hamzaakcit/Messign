import { describe, it, expect } from 'vitest';
import {
  resolveMotionOverlayFromManifest,
  manifestToPaperPlaneUiEffect,
  paperPlaneUiEffectToManifestFields,
} from '@/pages/marketing/lib/motionOverlayManifest';

describe('motionOverlayManifest', () => {
  it('resolveMotionOverlayFromManifest prefers motionOverlay over easterEgg', () => {
    expect(
      resolveMotionOverlayFromManifest({
        motionOverlay: 'paper_plane_sweep',
        overlayIntensity: 'subtle',
      }),
    ).toEqual({
      enabled: true,
      mode: 'paper_plane_sweep',
      intensity: 'subtle',
    });
  });

  it('resolveMotionOverlayFromManifest maps legacy easterEgg', () => {
    expect(resolveMotionOverlayFromManifest({ easterEgg: 'paper_plane' })).toEqual({
      enabled: true,
      mode: 'paper_plane_sweep',
      intensity: 'signature',
    });
  });

  it('manifestToPaperPlaneUiEffect maps intensity', () => {
    expect(
      manifestToPaperPlaneUiEffect({
        motionOverlay: 'paper_plane_sweep',
        overlayIntensity: 'subtle',
      }),
    ).toBe('paper_plane_subtle');
  });

  it('paperPlaneUiEffectToManifestFields round-trips', () => {
    expect(paperPlaneUiEffectToManifestFields('paper_plane_signature')).toEqual({
      motionOverlay: 'paper_plane_sweep',
      overlayIntensity: 'signature',
      easterEgg: 'paper_plane',
    });
  });
});

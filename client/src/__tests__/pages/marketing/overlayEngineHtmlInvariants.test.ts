import { describe, it, expect } from 'vitest';
import {
  generateOverlayHTML,
  buildPhaseOverlayRow,
  MOTION_PRESETS,
} from '@/pages/marketing/lib/overlayEngine';

describe('overlayEngine HTML invariants (Outlook + non-MSO)', () => {
  it('generateOverlayHTML includes MSO conditional and VML stub plus non-MSO content gate', () => {
    const html = generateOverlayHTML({
      assetUrl: 'https://cdn.example.com/plane.png',
      width: 60,
      height: 40,
      position: { top: 12, left: 0 },
      motion: { ...MOTION_PRESETS.float },
      va2Theme: 'tech',
    });
    expect(html).toContain('<!--[if mso]>');
    expect(html).toContain('urn:schemas-microsoft-com:vml');
    expect(html).toContain('<!--[if !mso]><!-->');
    expect(html).toContain('<!--<![endif]-->');
    expect(html).toContain('pointer-events:none');
  });

  it('buildPhaseOverlayRow embeds non-MSO gate and phase wrapper classes in exported HTML', () => {
    const row = buildPhaseOverlayRow(
      '<img src="https://cdn.example.com/p.png" width="48" height="32" alt="" />',
      {
        index: 0,
        totalPhases: 3,
        entryDirection: 'left',
        animationDelay: '0s',
        shadowDepth: 1,
        scale: 1,
        tiltDeg: 2,
        motionType: 'glide',
      },
      'tech',
      'test-overlay',
      'signature',
    );
    const html = row.columns[0]?.contents[0]?.values.html;
    expect(typeof html).toBe('string');
    expect(html).toContain('<!--[if !mso]><!-->');
    expect(html).toContain('<!--<![endif]-->');
    expect(html).toContain('ov-phase-test-overlay-p0');
  });
});

import { describe, it, expect } from 'vitest';
import { contrastRatio, enforceAccessibility, stripEmailHiddenPreheader } from './accessibilityEnforcer';
import type { UnlayerDesign } from './types/unlayerTypes';

describe('stripEmailHiddenPreheader', () => {
  it('removes canonical hidden preheader div so min font-size ignores 1px', () => {
    const hidden =
      '<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">x</div>';
    const body = '<p style="font-size:16px">Hi</p>';
    expect(stripEmailHiddenPreheader(hidden + body)).toBe(body);
  });
});

describe('contrastRatio', () => {
  it('matches WCAG formula for known pair', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThan(4.4);
    expect(contrastRatio('#767676', '#ffffff')).toBeLessThan(5);
  });
});

describe('enforceAccessibility rgba text colors', () => {
  it('detects low contrast for rgba() inline text color', () => {
    const d = {
      body: {
        values: { backgroundColor: '#ffffff' },
        rows: [
          {
            columns: [
              {
                contents: [
                  {
                    type: 'text',
                    values: {
                      html: '<p style="color:rgba(200,200,200,0.95);font-size:16px">Muted</p>',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    expect(r.warnings.some((w) => w.includes('Text/background contrast'))).toBe(true);
  });
});

describe('enforceAccessibility', () => {
  it('returns zero score when there are no rows', () => {
    const d = {
      body: { rows: [], values: { backgroundColor: '#ffffff' } },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    expect(r.score).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('does not warn on 1px hidden preheader when body is 16px in the same html block', () => {
    const hidden =
      '<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">Preview</div>';
    const body = '<p style="color:#111111;font-size:16px">Visible body</p>';
    const d = {
      body: {
        values: { backgroundColor: '#ffffff' },
        rows: [
          {
            values: { backgroundColor: '#ffffff' },
            columns: [
              {
                contents: [
                  {
                    type: 'html',
                    values: {
                      html: hidden + body,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    expect(r.warnings.some((w) => w.includes('below 13px'))).toBe(false);
  });

  it('skips font-size body check for preheader class and preheader-row', () => {
    const d = {
      body: {
        values: { backgroundColor: '#ffffff' },
        rows: [
          {
            values: {
              backgroundColor: '#ffffff',
              _meta: { htmlClassNames: 'preheader-row' },
            },
            columns: [
              {
                contents: [
                  {
                    type: 'html',
                    values: {
                      html:
                        '<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">&nbsp;</div>',
                      _meta: { htmlClassNames: 'preheader' },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    expect(r.warnings.some((w) => w.includes('below 13px'))).toBe(false);
  });

  it('skips text contrast on preheader row (hidden snippet uses white on body bg)', () => {
    const d = {
      body: {
        values: { backgroundColor: '#F9FAFB' },
        rows: [
          {
            values: {
              backgroundColor: '#F9FAFB',
              _meta: { htmlClassNames: 'preheader-row' },
            },
            columns: [
              {
                contents: [
                  {
                    type: 'html',
                    values: {
                      html:
                        '<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">Preview</div>',
                      _meta: { htmlClassNames: 'preheader' },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    expect(r.warnings.some((w) => w.includes('Text/background contrast'))).toBe(false);
  });

  it('does not flag sub-14px text in footer-unsubscribe blocks', () => {
    const d = {
      body: {
        values: { backgroundColor: '#ffffff' },
        rows: [
          {
            columns: [
              {
                contents: [
                  {
                    type: 'html',
                    values: {
                      html: '<p style="color:#333333;font-size:11px">Legal line</p>',
                      _meta: { htmlClassNames: 'footer-unsubscribe' },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    expect(r.warnings.some((w) => w.includes('below 13px'))).toBe(false);
  });

  it('does not warn for 13px body text (common email size)', () => {
    const d = {
      body: {
        values: { backgroundColor: '#ffffff' },
        rows: [
          {
            columns: [
              {
                contents: [
                  {
                    type: 'text',
                    values: {
                      html: '<p style="color:#111111;font-size:13px">Body</p>',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    expect(r.warnings.some((w) => w.includes('below 13px'))).toBe(false);
  });

  it('does not flag 1:1 contrast when text and column background are the same hex', () => {
    const d = {
      body: {
        values: { backgroundColor: '#ffffff' },
        rows: [
          {
            columns: [
              {
                values: { backgroundColor: '#FFFFFF' },
                contents: [
                  {
                    type: 'html',
                    values: {
                      html: '<p style="color:#ffffff;font-size:16px">Same as bg</p>',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    expect(r.warnings.some((w) => w.includes('Text/background contrast'))).toBe(false);
  });

  it('does not flag hero text on photo rows against page background (false low contrast)', () => {
    const d = {
      body: {
        values: { backgroundColor: '#F9FAFB' },
        rows: [
          {
            values: {
              backgroundColor: '#111827',
              backgroundImage: { url: 'https://example.com/h.jpg', fullWidth: true },
              _meta: { htmlClassNames: 'hero-section' },
            },
            columns: [
              {
                contents: [
                  {
                    type: 'html',
                    values: {
                      html: '<h1 style="color:#ffffff;font-size:36px">Hello</h1>',
                      _meta: { htmlClassNames: 'hero-headline hero-text-panel' },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    expect(r.warnings.some((w) => w.includes('Text/background contrast'))).toBe(false);
  });

  it('resolves first hex from gradient body background for inherited row contrast', () => {
    const d = {
      body: {
        values: {
          backgroundColor: 'linear-gradient(180deg, #f3f4f6 0%, #e5e7eb 100%)',
        },
        rows: [
          {
            columns: [
              {
                contents: [
                  {
                    type: 'text',
                    values: {
                      html: '<p style="color:#cccccc;font-size:16px">Low</p>',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    const contrastMsgs = r.warnings.filter((w) => w.includes('Text/background contrast'));
    expect(contrastMsgs.length).toBeGreaterThan(0);
    expect(contrastMsgs[0]).toContain('#f3f4f6');
  });

  it('checks Unlayer buttonColors and uses column bg when button fill is transparent', () => {
    const d = {
      body: {
        values: { backgroundColor: '#ffffff' },
        rows: [
          {
            columns: [
              {
                values: { backgroundColor: '#ffffff' },
                contents: [
                  {
                    type: 'button',
                    values: {
                      text: 'Go',
                      buttonColors: {
                        color: '#cccccc',
                        backgroundColor: 'transparent',
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    expect(r.warnings.some((w) => w.includes('Button label contrast'))).toBe(true);
  });

  it('warns once when a phantom overlay row is present', () => {
    const d = {
      body: {
        values: { backgroundColor: '#ffffff' },
        rows: [
          {
            values: { _isOverlay: true, backgroundColor: 'transparent' },
            columns: [],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    expect(r.warnings.some((w) => w.includes('Decorative motion overlay'))).toBe(true);
  });

  it('does not run copy contrast/font checks on overlay row HTML/CSS', () => {
    const noisyOverlayHtml =
      '<style>.x{color:#cccccc}</style><div style="font-size:1px">x</div><p style="color:#eeeeee;font-size:10px">bad</p>';
    const d = {
      body: {
        values: { backgroundColor: '#ffffff' },
        rows: [
          {
            values: { _isOverlay: true, backgroundColor: '#ffffff' },
            columns: [
              {
                values: { backgroundColor: '#ffffff' },
                contents: [
                  {
                    type: 'html',
                    values: { html: noisyOverlayHtml },
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    expect(r.warnings.some((w) => w.includes('Decorative motion overlay'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('below 13px'))).toBe(false);
    expect(r.warnings.some((w) => w.includes('Text/background contrast'))).toBe(false);
  });

  it('dedupes text contrast warnings for the same color pair across blocks', () => {
    const lowContrastHtml =
      '<p style="color:#cccccc;font-size:16px">A</p><p style="color:#cccccc;font-size:16px">B</p>';
    const d = {
      body: {
        values: { backgroundColor: '#ffffff' },
        rows: [
          {
            columns: [
              {
                contents: [
                  { type: 'text', values: { html: lowContrastHtml } },
                  { type: 'text', values: { html: lowContrastHtml } },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as UnlayerDesign;
    const r = enforceAccessibility(d);
    const contrastMsgs = r.warnings.filter((w) => w.includes('Text/background contrast'));
    expect(contrastMsgs.length).toBe(1);
  });
});

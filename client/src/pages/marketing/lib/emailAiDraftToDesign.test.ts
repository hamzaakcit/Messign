import { describe, it, expect } from 'vitest';
import {
  buildEmailDesignFromAiDraft,
  cloneConversionEmptyDesign,
  cloneMinimalEmptyDesign,
  extractBrandEmailColors,
  parseLinesToSegments,
  splitBodyWithCtas,
} from './emailAiDraftToDesign';

describe('splitBodyWithCtas', () => {
  it('extracts Insert CTA button placeholder', () => {
    const parts = splitBodyWithCtas('Hello\n\n[Insert CTA button: Get Started]\n\nThanks');
    expect(parts).toEqual([
      { kind: 'text', text: 'Hello\n\n' },
      { kind: 'cta', label: 'Get Started' },
      { kind: 'text', text: '\n\nThanks' },
    ]);
  });

  it('extracts [CTA: label] form', () => {
    const parts = splitBodyWithCtas('Intro [CTA: Book now] outro');
    expect(parts).toEqual([
      { kind: 'text', text: 'Intro ' },
      { kind: 'cta', label: 'Book now' },
      { kind: 'text', text: ' outro' },
    ]);
  });
});

describe('parseLinesToSegments', () => {
  it('groups bullet lines into one list segment', () => {
    const segs = parseLinesToSegments('Intro line\n\n- one\n- two\n\nClosing');
    expect(segs).toEqual([
      { type: 'paragraph', text: 'Intro line' },
      { type: 'bullets', items: ['one', 'two'] },
      { type: 'paragraph', text: 'Closing' },
    ]);
  });

  it('handles numbered lists', () => {
    const segs = parseLinesToSegments('1. first\n2. second');
    expect(segs).toEqual([{ type: 'bullets', items: ['first', 'second'] }]);
  });
});

describe('buildEmailDesignFromAiDraft', () => {
  it('creates multiple rows with unique ids for subject preview body and CTA', () => {
    const raw = `SUBJECT: Hello
PREVIEW: Sub
BODY: Para one.

- bullet a
- bullet b

[Insert CTA button: Go]

Thanks.`;
    const design = buildEmailDesignFromAiDraft(raw);
    const body = design.body as { rows: Array<{ id: string }> };
    expect(body.rows.length).toBeGreaterThanOrEqual(5);
    const ids = body.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('row-1');
    expect(ids[1]).toBe('row-2');
    const counters = design.counters as { u_row: number; u_column: number; u_content_text: number };
    expect(counters.u_row).toBe(body.rows.length);
    expect(counters.u_column).toBe(body.rows.length);
  });

  it('includes list markup in a separate row from paragraphs', () => {
    const raw = `BODY: Line one.

- x
- y`;
    const design = buildEmailDesignFromAiDraft(raw);
    const body = design.body as {
      rows: Array<{ columns: Array<{ contents: Array<{ type: string; values: { text?: string } }> }> }>;
    };
    const textHtmls = body.rows.flatMap((r) =>
      r.columns[0].contents.filter((c) => c.type === 'text').map((c) => c.values.text ?? ''),
    );
    const ulRow = textHtmls.find((t) => t.includes('<ul'));
    const hasLi = textHtmls.some((t) => t.includes('<li'));
    expect(ulRow).toBeDefined();
    expect(hasLi).toBe(true);
  });

  it('starts with an image hero row and uses heroImageUrl when provided', () => {
    const raw = 'SUBJECT: Test\nBODY: Hello';
    const design = buildEmailDesignFromAiDraft(raw, {
      heroImageUrl: 'https://example.com/hero.jpg',
      contentId: 'cid-1',
    });
    const body = design.body as {
      rows: Array<{ columns: Array<{ contents: Array<{ type: string; values: Record<string, unknown> }> }> }>;
    };
    expect(body.rows[0].columns[0].contents[0].type).toBe('image');
    const src = body.rows[0].columns[0].contents[0].values.src as { url: string };
    expect(src.url).toBe('https://example.com/hero.jpg');
  });

  it('uses automotive stock hero when draft is about cars', () => {
    const raw = 'SUBJECT: Weekend deals\nBODY: The best cars for your commute.';
    const design = buildEmailDesignFromAiDraft(raw, { contentId: 'content-1' });
    const body = design.body as {
      rows: Array<{ columns: Array<{ contents: Array<{ type: string; values: Record<string, unknown> }> }> }>;
    };
    const src = body.rows[0].columns[0].contents[0].values.src as { url: string };
    expect(src.url).toContain('photo-1492144534655');
  });

  it('uses wildlife stock hero when draft mentions panthers (conversion layout)', () => {
    const raw = 'SUBJECT: Exploring panthers\nBODY: As we delve into big cats.';
    const design = buildEmailDesignFromAiDraft(raw, { contentId: 'content-1' });
    const body = design.body as {
      rows: Array<{ columns: Array<{ contents: Array<{ type: string; values: Record<string, unknown> }> }> }>;
    };
    const src = body.rows[0].columns[0].contents[0].values.src as { url: string };
    expect(src.url).toContain('1474511320723');
  });

  it('messign-architect has no image rows, crushed headline, and topic-default environmental body background', () => {
    const raw = 'SUBJECT: Hello world\nBODY: Para one.';
    const design = buildEmailDesignFromAiDraft(raw, {
      layoutStyle: 'messign-architect',
      contentId: 'c-arch',
    });
    const body = design.body as {
      rows: Array<{ columns: Array<{ contents: Array<{ type: string; values: { text?: string } }> }> }>;
      values: { backgroundImage?: { url?: string } };
    };
    const counters = design.counters as { u_content_image?: number };
    for (const r of body.rows) {
      for (const c of r.columns[0]?.contents ?? []) {
        expect(c.type).not.toBe('image');
      }
    }
    expect(counters.u_content_image).toBe(0);
    const bgUrl = body.values.backgroundImage?.url ?? '';
    expect(bgUrl).toContain('photo-1557683316');
    expect(bgUrl).toContain('w=2400');
    const textHtmls = body.rows.flatMap((r) =>
      r.columns[0].contents.filter((c) => c.type === 'text').map((c) => c.values.text ?? ''),
    );
    const headline = textHtmls.find((t) => t.includes('Hello world'));
    expect(headline).toBeDefined();
    expect(headline).toContain('49px');
    expect(headline).toContain('line-height:100%');
  });

  it('messign-architect uses plants body background when draft mentions cactus', () => {
    const raw = 'SUBJECT: Desert garden\nBODY: Tips for growing cactus and succulents at home.';
    const design = buildEmailDesignFromAiDraft(raw, {
      layoutStyle: 'messign-architect',
      contentId: 'c-cactus',
    });
    const body = design.body as { values: { backgroundImage?: { url?: string } } };
    const bgUrl = body.values.backgroundImage?.url ?? '';
    expect(bgUrl).toContain('photo-1542601906990');
    expect(bgUrl).toContain('w=2400');
  });

  it('messign-architect uses heroImageUrl as body background when provided', () => {
    const raw = 'SUBJECT: X\nBODY: Y';
    const design = buildEmailDesignFromAiDraft(raw, {
      layoutStyle: 'messign-architect',
      contentId: 'c-hero',
      heroImageUrl: 'https://example.com/saved-env.jpg',
    });
    const body = design.body as { values: { backgroundImage?: { url?: string } } };
    expect(body.values.backgroundImage?.url).toBe('https://example.com/saved-env.jpg');
  });
});

describe('cloneMinimalEmptyDesign', () => {
  it('returns design with one row and placeholder text', () => {
    const d = cloneMinimalEmptyDesign();
    const body = d.body as { rows: unknown[] };
    expect(body.rows.length).toBe(1);
    const text = (body.rows[0] as { columns: Array<{ contents: Array<{ values: { text: string } }> }> }).columns[0]
      .contents[0].values.text;
    expect(text).toContain('Start building');
  });
});

describe('extractBrandEmailColors', () => {
  it('reads flat keys', () => {
    const c = extractBrandEmailColors({ primary_color: '#FF00AA', accent_color: '#00FF00' });
    expect(c?.primary).toBe('#FF00AA');
    expect(c?.accent).toBe('#00FF00');
  });

  it('reads nested colors object', () => {
    const c = extractBrandEmailColors({ colors: { primary: '#111111', accent: '#222222' } });
    expect(c?.primary).toBe('#111111');
    expect(c?.accent).toBe('#222222');
  });

  it('returns undefined when no hex keys', () => {
    expect(extractBrandEmailColors({ tone: 'friendly' })).toBeUndefined();
  });
});

describe('cloneConversionEmptyDesign', () => {
  it('returns the same structure as emailConversionBase (hero image + dark body) for a valid Unlayer load', () => {
    const d = cloneConversionEmptyDesign();
    const body = d.body as {
      rows: Array<{ columns: Array<{ contents: Array<{ type: string }> }> }>;
    };
    expect(body.rows.length).toBe(1);
    expect(body.rows[0].columns[0].contents[0].type).toBe('image');
    const counters = d.counters as { u_row: number; u_content_image: number; u_content_text: number };
    expect(counters.u_content_image).toBe(1);
    expect(counters.u_content_text).toBe(0);
  });
});

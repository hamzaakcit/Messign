import { describe, it, expect } from 'vitest';
import { TYPICAL_SUBJECT_MAX } from '@/pages/marketing/lib/emailInboxPreview';
import { validateCopyQuality } from '@/pages/marketing/lib/validateCopyQuality';

describe('validateCopyQuality', () => {
  it('returns multiple warning categories for a deliberately weak manifest', () => {
    const bad = {
      version: '2.0',
      theme: 'executive',
      subject: 'Introducing Our New Platform Features That Will Revolutionize Your Workflow Today',
      preheader: 'Introducing Our New Platform Features — learn more about our platform features today',
      metadata: {
        subject_variants: ['Alt one'],
        visual_density: 'rich',
      },
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'We are excited to announce our new product',
            subheadline: 'Stay ahead of the curve with our innovative solution',
            ctaText: 'Click here',
            imagePrompt: 'x'.repeat(80),
          },
        },
        {
          type: 'value_prop',
          order: 2,
          content: {
            columns: 3,
            items: [
              {
                heading: 'Powerful Analytics',
                description: 'Great insights for your team without any numbers here.',
              },
            ],
          },
        },
        {
          type: 'cta',
          order: 3,
          content: {
            buttonText: 'Learn more',
            buttonUrl: 'https://example.com',
            variant: 'pill',
          },
        },
        {
          type: 'footer',
          order: 4,
          content: {
            companyName: 'Co',
            address: '1 St',
            links: [{ text: 'Unsubscribe', url: '#' }],
          },
        },
      ],
    };

    const w = validateCopyQuality(bad);
    const cats = new Set(w.map((x) => x.category));
    expect(w.length).toBeGreaterThan(5);
    expect(cats.has('kill_list')).toBe(true);
    expect(cats.has('structure')).toBe(true);
    expect(cats.has('specificity')).toBe(true);
    expect(w.some((x) => x.message.includes('P.S.'))).toBe(true);
    expect(w.some((x) => x.message.includes('Learn more'))).toBe(true);
  });

  it('does not warn when subject length is within typical mobile truncation', () => {
    const subject = 'x'.repeat(TYPICAL_SUBJECT_MAX);
    const w = validateCopyQuality({
      subject,
      sections: [{ type: 'footer', order: 1, content: { companyName: 'C', address: 'A' } }],
    });
    expect(w.filter((x) => x.id === 'subject_length')).toEqual([]);
  });

  it('returns no warnings for a minimal clean manifest shaped like golden Example A', () => {
    const clean = {
      subject: 'Your deploy pipeline has a blind spot',
      preheader:
        "We found it in 2,100 teams' CI/CD setups. Takes 4 minutes to fix — or 4 hours to debug later.",
      metadata: {
        subject_variants: ['Alt A', 'Alt B'],
        visual_density: 'rich',
      },
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'The step your pipeline is missing.',
            subheadline: '2,100 engineering teams had the same gap.',
            ctaText: 'See the 4-minute fix',
            ctaUrl: 'https://example.com/x',
            imagePrompt: 'x'.repeat(80),
          },
        },
        {
          type: 'value_prop',
          order: 2,
          content: {
            columns: 3,
            items: [
              {
                heading: 'Config drift caught pre-deploy',
                description: '91% failure reduction across 2,100 teams.',
              },
            ],
          },
        },
        {
          type: 'cta',
          order: 3,
          content: {
            buttonText: 'Add the scan to my pipeline',
            buttonUrl: 'https://example.com/x',
            variant: 'pill',
          },
        },
        {
          type: 'text_block',
          order: 4,
          content: {
            body:
              'P.S. — We are running a live teardown this Thursday at 1 PM ET. Reply teardown for the link — not on our website yet.',
          },
        },
        {
          type: 'footer',
          order: 5,
          content: {
            companyName: 'Co',
            address: '1 St',
            links: [{ text: 'Unsubscribe', url: '#' }],
          },
        },
      ],
    };

    expect(validateCopyQuality(clean)).toEqual([]);
  });

  it('accepts image_text before footer when body is at least 50 characters (P.S.-style closing)', () => {
    const withImageTextPs = {
      subject: 'Your deploy pipeline has a blind spot',
      preheader:
        "We found it in 2,100 teams' CI/CD setups. Takes 4 minutes to fix — or 4 hours to debug later.",
      metadata: {
        subject_variants: ['Alt A', 'Alt B'],
        visual_density: 'rich',
      },
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'The step your pipeline is missing.',
            subheadline: '2,100 engineering teams had the same gap.',
            ctaText: 'See the 4-minute fix',
            ctaUrl: 'https://example.com/x',
            imagePrompt: 'x'.repeat(80),
          },
        },
        {
          type: 'value_prop',
          order: 2,
          content: {
            columns: 3,
            items: [
              {
                heading: 'Config drift caught pre-deploy',
                description: '91% failure reduction across 2,100 teams.',
              },
            ],
          },
        },
        {
          type: 'cta',
          order: 3,
          content: {
            buttonText: 'Add the scan to my pipeline',
            buttonUrl: 'https://example.com/x',
            variant: 'pill',
          },
        },
        {
          type: 'image_text',
          order: 4,
          content: {
            body:
              'P.S. — We are running a live teardown this Thursday at 1 PM ET. Reply teardown for the link — not on our website yet.',
            imagePrompt: 'x'.repeat(80),
          },
        },
        {
          type: 'footer',
          order: 5,
          content: {
            companyName: 'Co',
            address: '1 St',
            links: [{ text: 'Unsubscribe', url: '#' }],
          },
        },
      ],
    };

    expect(validateCopyQuality(withImageTextPs)).toEqual([]);
  });

  it('does not warn on preheader when it adds several words not in the subject (even if all subject keywords repeat)', () => {
    const subject = 'Spring sale starts Friday';
    const preheader =
      'Spring sale starts Friday — free shipping over $50, member early access, and new markdowns in every category.';
    const w = validateCopyQuality({
      subject,
      preheader,
      metadata: { subject_variants: ['A', 'B'] },
      sections: [{ type: 'footer', order: 1, content: { companyName: 'C', address: 'A' } }],
    });
    expect(w.some((x) => x.id === 'preheader_repeats_subject')).toBe(false);
  });

  it('satisfies numbers check when stats live only in hero (no digits in value_prop)', () => {
    const w = validateCopyQuality({
      subject: 'Ship faster',
      preheader: 'Cut lead time without hiring — see how teams save 6 hours per sprint.',
      metadata: { subject_variants: ['A', 'B'] },
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: '6 hours back every sprint',
            subheadline: 'Measured across 120 teams in Q1.',
            ctaText: 'See the playbook',
            imagePrompt: 'x'.repeat(80),
          },
        },
        {
          type: 'value_prop',
          order: 2,
          content: {
            columns: 2,
            items: [
              { heading: 'Fewer handoffs', description: 'One workflow from ticket to deploy.' },
              { heading: 'Clearer ownership', description: 'No more guessing who moves next.' },
            ],
          },
        },
        {
          type: 'footer',
          order: 3,
          content: { companyName: 'Co', address: '1 St', links: [{ text: 'Unsubscribe', url: '#' }] },
        },
      ],
    });
    expect(w.some((x) => x.id === 'no_numbers_in_value')).toBe(false);
  });

  it('downgrades "we\'re excited to share" kill phrase to medium severity', () => {
    const w = validateCopyQuality({
      subject: 'Update',
      preheader: "We're excited to share what is new.",
      metadata: { subject_variants: ['A', 'B'] },
      sections: [{ type: 'footer', order: 1, content: { companyName: 'C', address: 'A' } }],
    });
    const kill = w.find((x) => x.message.includes('excited') && x.message.includes('share'));
    expect(kill?.severity).toBe('medium');
  });
});

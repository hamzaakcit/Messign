import { describe, it, expect } from 'vitest';
import {
  buildCampaignImageContextPrefix,
  buildCampaignImageContextForRasterModels,
  buildCampaignTopicBlobForRasterModels,
  extractTopicKeywordsForRasterContext,
  applyCampaignPrefixToPrompt,
} from '../../../services/marketing/publishing/imageService/campaignImageContext.js';

describe('campaignImageContext', () => {
  it('buildCampaignImageContextPrefix includes subject, preheader, hero headline, theme, art direction', () => {
    const p = buildCampaignImageContextPrefix({
      subject: 'Your order is on the way',
      preheader: 'Track delivery in one tap',
      theme: 'executive',
      artDirection: { imageStyle: 'soft daylight editorial' },
      sections: [
        { type: 'hero', order: 1, content: { headline: 'Shipped today' } },
      ],
    });
    expect(p).toContain('Email subject: Your order is on the way');
    expect(p).toContain('Preheader: Track delivery in one tap');
    expect(p).toContain('Hero headline: Shipped today');
    expect(p).toContain('Theme: executive');
    expect(p).toContain('Art direction: soft daylight editorial');
    expect(p).toContain('CAMPAIGN CONTEXT');
    expect(p).toContain('SEMANTIC RULE');
    expect(p).toContain('garbled');
  });

  it('applyCampaignPrefixToPrompt prepends when prefix non-empty', () => {
    expect(applyCampaignPrefixToPrompt('raw prompt', 'PREFIX\n')).toBe('PREFIX\nraw prompt');
  });

  it('returns raw only when prefix empty', () => {
    expect(applyCampaignPrefixToPrompt('  raw  ', '')).toBe('raw');
  });

  it('buildCampaignImageContextForRasterModels uses topic keywords, not full subject lines', () => {
    const p = buildCampaignImageContextForRasterModels({
      subject: 'Unlock the Power of A2P SMS Messaging',
      preheader: 'Learn how A2P SMS can help you reach customers',
      theme: 'luxury',
      artDirection: { imageStyle: 'editorial' },
      sections: [],
    });
    expect(p).toContain('Topic keywords:');
    expect(p).toContain('unlock');
    expect(p).toContain('a2p');
    expect(p).toContain('sms');
    expect(p).not.toContain('Email subject:');
    expect(p).not.toContain('Unlock the Power of A2P SMS Messaging');
    expect(p).toContain('Theme: luxury');
    expect(p).toContain('Art direction: editorial');
  });

  it('buildCampaignTopicBlobForRasterModels includes hero headline and imagePrompt so product words reach Fal', () => {
    const blob = buildCampaignTopicBlobForRasterModels({
      subject: 'This week from Messign',
      preheader: 'Style picks inside',
      theme: 'luxury',
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'Step into Style with Our Red Shoes',
            subheadline: 'Discover the perfect pair',
            imagePrompt:
              'Wide editorial photograph of premium red leather sneakers on a clean studio surface, soft daylight, no text',
          },
        },
      ],
    });
    expect(blob.toLowerCase()).toContain('red');
    expect(blob.toLowerCase()).toContain('shoes');
    const p = buildCampaignImageContextForRasterModels({
      subject: 'This week from Messign',
      preheader: 'Style picks inside',
      theme: 'luxury',
      artDirection: { imageStyle: 'editorial' },
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'Step into Style with Our Red Shoes',
            subheadline: 'Discover the perfect pair',
            imagePrompt:
              'Wide editorial photograph of premium red leather sneakers on a clean studio surface, soft daylight, no text',
          },
        },
      ],
    });
    expect(p).toContain('Topic keywords:');
    expect(p).toContain('shoes');
    expect(p).toContain('red');
  });

  it('extractTopicKeywordsForRasterContext dedupes and caps terms', () => {
    const k = extractTopicKeywordsForRasterContext('sms sms a2p business messaging', 3);
    expect(k).toEqual(['sms', 'a2p', 'business']);
  });

  it('buildCampaignTopicBlobForRasterModels pulls imagePrompts from non-hero sections for vertical keywords', () => {
    const blob = buildCampaignTopicBlobForRasterModels({
      subject: 'Weekly digest',
      preheader: 'What you missed',
      metadata: { audience: 'Retail marketers' },
      sections: [
        {
          type: 'hero',
          order: 1,
          content: {
            headline: 'Your weekend picks',
            imagePrompt: 'Soft abstract gradient background for email hero, no products',
          },
        },
        {
          type: 'image_text',
          order: 2,
          content: {
            imagePrompt:
              'Handcrafted ceramic pour-over coffee dripper on oak counter, morning light, specialty third-wave cafe retail',
          },
        },
        {
          type: 'product_grid',
          order: 3,
          content: {
            items: [
              {
                name: 'Mug',
                imagePrompt: 'Matte stoneware espresso cup on slate, cafe merchandise photography',
              },
            ],
          },
        },
      ],
    });
    expect(blob.toLowerCase()).toContain('pour-over');
    expect(blob.toLowerCase()).toContain('stoneware');
  });
});

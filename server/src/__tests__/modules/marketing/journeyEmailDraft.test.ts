import { describe, expect, it } from 'vitest';
import {
  emailOptOutBlocksReview,
  journeyDraftPiiError,
  journeyEmailCreateInput,
  journeyTemplateRefFromTags,
  reviewBlockedByMissingOptOut,
} from '../../../services/marketing/journeyEmailDraft.js';

describe('journey email child', () => {
  const offer = {
    id: 'offer-1',
    title: 'İnce Memed',
    userBrief: 'İnce Memed in the Kadıköy shop window.\nprice: 120 TL',
    tags: ['recipe:product_drop', 'ig_format:feed'],
  };
  const instagramCaption = 'UNIQUE_IG_CAPTION_ONLY stop scrolling';

  it('gives a product-drop offer an email child beside the Instagram post', () => {
    const email = journeyEmailCreateInput(offer);
    const children = [
      { channel: 'instagram', parent_content_id: offer.id, body: instagramCaption },
      { channel: email.channel, parent_content_id: email.parent_content_id, body: email.body },
    ];

    expect(children).toHaveLength(2);
    expect(children.every((child) => child.parent_content_id === offer.id)).toBe(true);
    expect(email.channel).toBe('email');
    expect(email.content_type).toBe('email');
    expect(email.title).toBe('İnce Memed');
    expect(email.body).toContain('İnce Memed');
    expect(email.body).toContain('120 TL');
    expect(email.body).toContain('unsubscribe');
    expect(email.body.split('\n').filter((line) => line.startsWith('Price:'))).toEqual(['Price: 120 TL']);
    expect(email.body).not.toContain(instagramCaption);
    expect(email.user_brief).toBe(offer.userBrief);
    expect(email.tags).toContain('recipe:product_drop');
    expect(journeyTemplateRefFromTags(email.tags)).toBe('offer-1:email');
  });

  it('copies the sheet price once and writes no price line when the field is empty', () => {
    const caption = 'UNIQUE_IG_CAPTION_ONLY stop scrolling';
    const priced = journeyEmailCreateInput({
      id: 'offer-price',
      title: 'Kürk Mantolu Madonna',
      userBrief: [
        'This week only, the old note said ₺7',
        'product: Kürk Mantolu Madonna',
        'price: ₺189',
        'claim: Bu hafta vitrinde',
        'window: 2026-11-14..2026-11-20',
      ].join('\n'),
      tags: ['recipe:product_drop'],
    });
    expect(priced.body).toContain('SUBJECT: Kürk Mantolu Madonna');
    expect(priced.body).toContain('PREVIEW: Bu hafta vitrinde');
    expect(priced.body).toContain('Product: Kürk Mantolu Madonna');
    expect(priced.body).toContain('Window: 2026-11-14..2026-11-20');
    expect(priced.body.split('\n').filter((line) => line.startsWith('Price:'))).toEqual(['Price: ₺189']);
    expect(priced.body).not.toContain('₺7');
    expect(priced.body).not.toContain(caption);
    expect(priced.body).toContain('Unsubscribe: {{unsubscribe_url}}');

    const empty = journeyEmailCreateInput({
      id: 'offer-empty',
      title: 'Gül aranjmanı',
      userBrief: 'A note that mentions ₺7 in passing.\nproduct: Gül aranjmanı',
      tags: ['recipe:product_drop'],
    });
    expect(empty.body.split('\n').some((line) => line.startsWith('Price:'))).toBe(false);
    expect(empty.body).toContain('PREVIEW: A note that mentions ₺7 in passing.');
    expect(empty.body).not.toContain(caption);
  });

  it('refuses a draft prompt that contains an email address or a phone number', () => {
    expect(journeyDraftPiiError('Reply to ada@shop.com for the drop.')).toContain('email address');
    expect(journeyDraftPiiError('Call +90 532 000 11 22 today.')).toContain('phone number');
    expect(journeyDraftPiiError('İnce Memed in the Kadıköy shop window. Price: 120 TL.')).toBeNull();
  });

  it('blocks email review without an opt-out and lets Instagram through', () => {
    expect(emailOptOutBlocksReview('email', 'Buy İnce Memed today.')).toBe(true);
    expect(reviewBlockedByMissingOptOut('email', 'Buy İnce Memed today.')).toContain('unsubscribe');
    expect(emailOptOutBlocksReview('email', 'Unsubscribe: {{unsubscribe_url}}')).toBe(false);
    expect(emailOptOutBlocksReview('newsletter', 'Buy the novel today.')).toBe(true);
    expect(emailOptOutBlocksReview('instagram', instagramCaption)).toBe(false);
    expect(reviewBlockedByMissingOptOut('instagram', instagramCaption)).toBeNull();
  });
});

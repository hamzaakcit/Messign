import { describe, expect, it } from 'vitest';
import { calendarChip } from '@/pages/marketing/lib/calendarChip';

describe('calendar chip', () => {
  it('shows an Instagram thumb and format badge', () => {
    const chip = calendarChip({
      channel: 'instagram',
      title: 'Window still',
      image_url: 'https://cdn.example.com/book.jpg',
      tags: ['ig_format:story'],
    });
    expect(chip).toEqual({
      kind: 'instagram',
      title: 'Window still',
      thumb: 'https://cdn.example.com/book.jpg',
      format: 'story',
    });
  });

  it('shows the email subject and does not treat it as a network post', () => {
    const chip = calendarChip({
      channel: 'email',
      title: 'Fallback title',
      body: 'SUBJECT: İnce Memed is in the window\n\nUnsubscribe: {{unsubscribe_url}}',
    });
    expect(chip).toEqual({ kind: 'email', subject: 'İnce Memed is in the window' });
  });
});

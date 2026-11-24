import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InstagramStudio } from '@/pages/marketing/components/instagram/InstagramStudio';
import { offerChildStatusLine } from '@/pages/marketing/lib/offerChildStatus';

const STORYBOARD = `
[IMAGE_PROMPT]
Bookstore window at dusk, the novel centered
[/IMAGE_PROMPT]
[STORYBOARD]
hook: Stop on the cover
shot: The novel in the window
on_screen: This week
shot: A page turning
on_screen: Yaşar Kemal
shot: The shop at dusk
on_screen: Kadıköy
caption: İnce Memed is in the window.
audio: Quiet street, no voice
[/STORYBOARD]
`;

describe('offer children and reel reload', () => {
  it('keeps Instagram in draft when the email is approved', () => {
    expect(offerChildStatusLine([
      { channel: 'email', status: 'approved' },
      { channel: 'instagram', status: 'draft' },
    ])).toBe('Instagram draft · Email approved');
  });

  it('shows the storyboard shots after the draft is reloaded', () => {
    render(
      <InstagramStudio
        content={{
          id: 'ig-reel',
          body: STORYBOARD,
          image_url: 'https://cdn.example/cover.jpg',
          status: 'draft',
          tags: ['ig_format:reel'],
        }}
      />,
    );
    const board = screen.getByTestId('reel-storyboard');
    expect(board).toHaveTextContent('The novel in the window');
    expect(board).toHaveTextContent('A page turning');
    expect(board).toHaveTextContent('The shop at dusk');
    expect(board).toHaveTextContent('Bookstore window at dusk');
  });
});

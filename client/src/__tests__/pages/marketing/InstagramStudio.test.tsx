import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InstagramStudio } from '@/pages/marketing/components/instagram/InstagramStudio';

describe('InstagramStudio', () => {
  it('shows carousel controls when more than one slide exists', () => {
    render(
      <InstagramStudio
        content={{
          id: 'ig-1',
          body: 'A caption long enough to preview',
          status: 'draft',
          image_url: 'https://cdn.example/a.png',
          carousel_images: [
            { index: 0, image_url: 'https://cdn.example/a.png', prompt: 'cover' },
            { index: 1, image_url: 'https://cdn.example/b.png', prompt: 'detail' },
          ],
        }}
      />,
    );
    expect(screen.getByTestId('instagram-studio')).toBeInTheDocument();
    expect(screen.getByTitle('Next slide')).toBeInTheDocument();
  });

  it('forwards regenerate to the parent handler', () => {
    const onRegenerateImage = vi.fn();
    render(
      <InstagramStudio
        content={{
          id: 'ig-1',
          title: 'Spring drop',
          body: 'Caption',
          image_prompt: 'A bookstore window in warm light, no people',
          status: 'draft',
        }}
        onRegenerateImage={onRegenerateImage}
      />,
    );
    fireEvent.click(screen.getByText('Regenerate image'));
    fireEvent.click(screen.getByText('Generate with Nano Banana 2'));
    expect(onRegenerateImage).toHaveBeenCalledWith(
      'A bookstore window in warm light, no people',
      'photoreal',
      0,
      { mock: false },
    );
  });

  it('is the Instagram surface in the content detail panel', () => {
    const pipeline = readFileSync(
      resolve('src/pages/marketing/components/ContentDetailPanel.tsx'),
      'utf8',
    );
    expect(pipeline).toContain('<InstagramStudio');
    expect(pipeline).toContain('regenerateContentImage');
  });
});

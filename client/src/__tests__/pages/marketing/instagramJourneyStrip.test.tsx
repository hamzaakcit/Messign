import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InstagramJourneyStrip } from '@/pages/marketing/components/instagram/InstagramJourneyStrip';

describe('InstagramJourneyStrip', () => {
  it('does not promise that Lucy is writing a caption nobody started', () => {
    render(<InstagramJourneyStrip phase="writing" />);
    expect(screen.getByTestId('instagram-journey')).toHaveTextContent('No caption yet. Open the offer and press Write caption.');
    expect(screen.queryByText(/Lucy is writing/)).not.toBeInTheDocument();
  });
});

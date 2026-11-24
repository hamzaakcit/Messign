import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarketingComposerChannelButtons } from '@/pages/marketing/components/MarketingComposerChannelButtons';
import { MARKETING_COMPOSER_QUICK_ACTIONS } from '@/pages/marketing/components/marketingDoraQuickActions';

describe('MarketingComposerChannelButtons', () => {
  it('renders Instagram plus one control per composer template (comfortable)', () => {
    render(
      <MarketingComposerChannelButtons
        isLoading={false}
        onOpenInstagram={vi.fn()}
        onOpenChannelModal={vi.fn()}
        variant="comfortable"
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1 + MARKETING_COMPOSER_QUICK_ACTIONS.length);
    expect(screen.getByRole('button', { name: /^Instagram/i })).toBeTruthy();
  });

  it('offers no template for the frozen channels', () => {
    render(
      <MarketingComposerChannelButtons
        isLoading={false}
        onOpenInstagram={vi.fn()}
        onOpenChannelModal={vi.fn()}
        variant="comfortable"
      />,
    );
    for (const name of [/^LinkedIn/i, /^X\b/i, /^Blog/i, /^Ads/i, /^Metrics/i]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('opens email modal for Email · Newsletter depth and other email_* templates', () => {
    const onChannel = vi.fn();
    render(
      <MarketingComposerChannelButtons
        isLoading={false}
        onOpenInstagram={vi.fn()}
        onOpenChannelModal={onChannel}
        variant="comfortable"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Newsletter depth/i }));
    expect(onChannel).toHaveBeenCalledWith('email');
  });

  it('compact variant exposes the same number of actions', () => {
    render(
      <MarketingComposerChannelButtons
        isLoading={false}
        onOpenInstagram={vi.fn()}
        onOpenChannelModal={vi.fn()}
        variant="compact"
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1 + MARKETING_COMPOSER_QUICK_ACTIONS.length);
  });
});

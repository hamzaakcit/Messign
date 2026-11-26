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
    expect(screen.getAllByRole('button')).toHaveLength(2 + MARKETING_COMPOSER_QUICK_ACTIONS.length);
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

  it('has one Email tile, not one per layout, and it opens the email form', () => {
    const onChannel = vi.fn();
    render(
      <MarketingComposerChannelButtons
        isLoading={false}
        onOpenInstagram={vi.fn()}
        onOpenChannelModal={onChannel}
        variant="comfortable"
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /^Email/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^WhatsApp/i })).toBeTruthy();
    for (const name of [/Newsletter/i, /Flash/i, /Event invite/i]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    fireEvent.click(screen.getByRole('button', { name: /^Email/i }));
    expect(onChannel).toHaveBeenCalledWith('email');
    fireEvent.click(screen.getByRole('button', { name: /^WhatsApp/i }));
    expect(onChannel).toHaveBeenCalledWith('whatsapp');
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
    expect(screen.getAllByRole('button')).toHaveLength(2 + MARKETING_COMPOSER_QUICK_ACTIONS.length);
  });
});

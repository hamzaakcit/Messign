import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { HelpDrawer } from '@/components/ui/HelpDrawer';
import { HELP } from '@/lib/helpContent';
import { useHelpDrawer } from '@/stores/helpDrawerStore';

afterEach(() => act(() => useHelpDrawer.getState().close()));

describe('InfoTooltip', () => {
  it('is a labelled button that opens on keyboard focus and closes on Escape', () => {
    render(<InfoTooltip helpId="shopContentSetup" />);
    const button = screen.getByRole('button', { name: 'About Content setup' });
    fireEvent.focus(button);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent(HELP.shopContentSetup.tip);
    expect(button).toHaveAttribute('aria-describedby', tip.id);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('a tap toggles it open and closed', () => {
    render(<InfoTooltip helpId="emailApplyAiDraft" />);
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button, { pointerType: 'touch' });
    fireEvent.focus(button);
    fireEvent.click(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.pointerDown(button, { pointerType: 'touch' });
    fireEvent.click(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('a mouse click after hover keeps it open', () => {
    render(<InfoTooltip helpId="emailUseTemplate" />);
    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button.parentElement!);
    fireEvent.pointerDown(button, { pointerType: 'mouse' });
    fireEvent.focus(button);
    fireEvent.click(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('shows no "Learn more" when the entry has no body', () => {
    render(<InfoTooltip helpId="shopContentSetup" />);
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.queryByRole('button', { name: 'Learn more' })).toBeNull();
  });

  it('"Learn more" opens the help drawer with the longer text', () => {
    render(
      <>
        <InfoTooltip helpId="emailBuilderEdits" />
        <HelpDrawer />
      </>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'About Edits in the builder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn more' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
    const drawer = screen.getByTestId('help-drawer');
    expect(drawer).toHaveTextContent('Changes you make in the email builder are kept in the saved design.');
    expect(drawer.querySelectorAll('p')).toHaveLength(2);
  });

  it('still accepts plain content for existing callers', () => {
    render(<InfoTooltip content="A task in this column is waiting." aria-label="Definition: Waiting" />);
    fireEvent.focus(screen.getByRole('button', { name: 'Definition: Waiting' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('A task in this column is waiting.');
  });
});

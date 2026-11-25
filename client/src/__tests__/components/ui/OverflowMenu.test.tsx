import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OverflowMenu } from '@/components/ui/OverflowMenu';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';

describe('OverflowMenu', () => {
  it('opens a menu, runs the chosen item and closes', () => {
    const open = vi.fn();
    render(<OverflowMenu items={[{ label: 'Open email', onSelect: open }, { label: 'Draft', onSelect: vi.fn() }]} />);
    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open email' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves with arrow keys and closes on Escape', () => {
    render(<OverflowMenu items={[{ label: 'One', onSelect: vi.fn() }, { label: 'Two', onSelect: vi.fn() }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Two' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveFocus();
  });

  it('renders nothing without items', () => {
    const { container } = render(<OverflowMenu items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('inside a slide-over, the first Escape closes the menu and the second closes the panel', () => {
    const onClose = vi.fn();
    render(
      <SlideOverPanel isOpen onClose={onClose} title="Offer">
        <OverflowMenu items={[{ label: 'Open email', onSelect: vi.fn() }]} />
      </SlideOverPanel>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

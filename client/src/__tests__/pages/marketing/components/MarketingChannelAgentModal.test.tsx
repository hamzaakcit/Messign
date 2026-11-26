import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MarketingChannelAgentModal } from '@/pages/marketing/components/MarketingChannelAgentModal';

function open() {
  const onSend = vi.fn();
  const onClose = vi.fn();
  render(<MarketingChannelAgentModal channel="email" isOpen onClose={onClose} onSend={onSend} />);
  fireEvent.change(screen.getByLabelText(/^Audience/), { target: { value: 'Teachers who shop with us' } });
  fireEvent.change(screen.getByLabelText(/^Offer/), { target: { value: 'Daisy bouquets for Teachers Day' } });
  return { onSend, onClose };
}

describe('the email brief', () => {
  it('is titled plainly, without the internal VA2 name', () => {
    open();
    expect(screen.getByRole('heading', { name: 'Email brief' })).toBeInTheDocument();
    expect(screen.queryByText(/VA2/)).not.toBeInTheDocument();
  });

  it('asks for a layout, standard first, with a hint for the chosen one', () => {
    open();
    const layout = screen.getByLabelText('Layout') as HTMLSelectElement;
    expect([...layout.options].map((o) => o.text)).toEqual(['Standard', 'Newsletter', 'Flash sale', 'Event invite']);
    expect(layout.value).toBe('standard');
    expect(screen.getByText(/A hero, one picture-and-text block and a footer/)).toBeInTheDocument();
    fireEvent.change(layout, { target: { value: 'event' } });
    expect(screen.getByText(/Date and time, what happens, and a sign-up button/)).toBeInTheDocument();
  });

  it('sends the request with the chosen layout, so the choice changes what Lucy builds', () => {
    const { onSend, onClose } = open();
    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'flash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Lucy' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    const message = onSend.mock.calls[0]?.[0] as string;
    expect(message).toContain('**flash sale**');
    expect(message).toContain('Teachers who shop with us');
    expect(onClose).toHaveBeenCalled();
  });

  it('sends no layout goal for the standard layout', () => {
    const { onSend } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Send to Lucy' }));
    expect(onSend.mock.calls[0]?.[0]).not.toContain('Goal:');
  });
});

describe('the WhatsApp brief', () => {
  it('asks for a short template and does not offer an email layout', () => {
    const onSend = vi.fn();
    render(<MarketingChannelAgentModal channel="whatsapp" isOpen onClose={vi.fn()} onSend={onSend} />);
    expect(screen.getByRole('heading', { name: 'WhatsApp brief' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Layout')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Audience/), { target: { value: 'People who left a bouquet in the cart' } });
    fireEvent.change(screen.getByLabelText(/^Offer/), { target: { value: 'The bouquet is still held until tonight' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Lucy' }));
    const message = onSend.mock.calls[0]?.[0] as string;
    expect(message).toContain('Channel: WhatsApp');
    expect(message).toContain('STOP');
    expect(message).not.toContain('Design Manifest');
  });
});

import { render, screen } from '@testing-library/react';
import { LoginFalPaperPlanePanel } from '@/components/login/LoginFalPaperPlanePanel';

describe('LoginFalPaperPlanePanel', () => {
  it('renders Dora and Lucy crew hero (no center plane)', () => {
    render(<LoginFalPaperPlanePanel />);
    expect(screen.getByTestId('login-crew-hero')).toBeInTheDocument();
    expect(screen.queryByTestId('login-paper-plane')).not.toBeInTheDocument();
  });
});

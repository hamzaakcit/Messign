import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';

vi.mock('@/stores/authStore', () => {
  const state = {
    user: null,
    isAuthenticated: false,
    mustChangePassword: false,
    _hasHydrated: true,
    accessToken: null,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    clearError: vi.fn(),
    updateUser: vi.fn(),
  };
  const useAuthStore = Object.assign(
    (selector?: (value: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state, setState: vi.fn() },
  );
  return { useAuthStore };
});

vi.mock('@/lib/socket', () => ({
  connectSocket: vi.fn(),
  getSocket: vi.fn(() => ({ on: vi.fn(), off: vi.fn() })),
}));

describe('public routes', () => {
  it('renders the marketing homepage at /', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: /Every message/i })).toBeInTheDocument();
    expect(screen.queryByTestId('login-email')).not.toBeInTheDocument();
  });

  it('keeps login on /login', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByTestId('login-email');
    expect(screen.getByTestId('login-email')).toBeInTheDocument();
    expect(screen.queryByTestId('site-home')).not.toBeInTheDocument();
  });
});

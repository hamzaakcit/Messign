import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';

const { login, getState, clearError } = vi.hoisted(() => {
  const loginFn = vi.fn();
  const getStateFn = vi.fn(() => ({
    isAuthenticated: false,
    mustChangePassword: false,
  }));
  const clearErrorFn = vi.fn();
  return { login: loginFn, getState: getStateFn, clearError: clearErrorFn };
});

vi.mock('@/stores/authStore', () => {
  function useAuthStore(): {
    login: typeof login;
    isLoading: boolean;
    error: null;
    loginError: null;
    clearError: typeof clearError;
  } {
    return {
      login,
      isLoading: false,
      error: null,
      loginError: null,
      clearError,
    };
  }
  useAuthStore.getState = getState;
  return { useAuthStore };
});

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getState.mockReturnValue({ isAuthenticated: false, mustChangePassword: false });
  });

  it('does not call login when email is not @messign.com', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'a@gmail.com' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(screen.getByText(/Only Messign company accounts/i)).toBeInTheDocument();
    });
    expect(login).not.toHaveBeenCalled();
  });

  it('calls login with trimmed email and password for valid @messign.com input', async () => {
    login.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: '  alex.chen@messign.com  ' },
    });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'test123' } });
    fireEvent.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('alex.chen@messign.com', 'test123', false);
    });
  });
});

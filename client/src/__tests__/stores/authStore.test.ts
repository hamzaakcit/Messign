import { vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  authAPI: {
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  },
  API_ORIGIN: '',
  assertNotHtmlApiResponse: vi.fn(),
}));

vi.mock('@/lib/authToken', () => ({
  getAccessToken: vi.fn(() => null),
  setAccessToken: vi.fn(),
}));

import { useAuthStore } from '@/stores/authStore';

const initialState = useAuthStore.getState();

afterEach(() => {
  useAuthStore.setState(initialState, true);
});

describe('authStore', () => {
  it('starts with no user and isAuthenticated false', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isAdmin).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(state.error).toBeNull();
  });

  it('login() sets user and isAuthenticated via authAPI', async () => {
    const { authAPI } = await import('@/lib/api');
    const fakeUser = {
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      role: 'admin',
    };
    (authAPI.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        accessToken: 'tok123',
        expiresIn: 900,
        user: fakeUser,
        mustChangePassword: false,
      },
    });

    await useAuthStore.getState().login('a@b.com', 'pass');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toMatchObject({ id: 'u1', email: 'a@b.com' });
    expect(state.accessToken).toBe('tok123');
    expect(state.isAdmin).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('logout() clears user and isAuthenticated', async () => {
    useAuthStore.setState({
      user: { id: 'u1', name: 'Alice' } as any,
      accessToken: 'tok',
      isAuthenticated: true,
      isAdmin: true,
    });

    const { authAPI } = await import('@/lib/api');
    (authAPI.logout as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(state.isAdmin).toBe(false);
  });

  it('preserves state shape after operations', () => {
    const state = useAuthStore.getState();
    const expectedKeys = [
      'user',
      'accessToken',
      'expiresAt',
      'mustChangePassword',
      'isAuthenticated',
      'isAdmin',
      'isLoading',
      'error',
      'loginError',
      '_hasHydrated',
      'login',
      'logout',
      'refreshAccessToken',
      'updateUser',
      'setMustChangePassword',
      'clearError',
    ];

    for (const key of expectedKeys) {
      expect(state).toHaveProperty(key);
    }
  });

  it('updateUser merges partial updates into existing user', () => {
    useAuthStore.setState({
      user: {
        id: 'u1',
        name: 'Alice',
        email: 'a@b.com',
        role: 'employee',
      } as any,
      isAuthenticated: true,
    });

    useAuthStore.getState().updateUser({ name: 'Alice Updated' });

    const state = useAuthStore.getState();
    expect(state.user?.name).toBe('Alice Updated');
    expect(state.user?.email).toBe('a@b.com');
  });

  it('clearError resets error and loginError to null', () => {
    useAuthStore.setState({
      error: 'something broke',
      loginError: { message: 'bad creds' },
    });

    useAuthStore.getState().clearError();

    const state = useAuthStore.getState();
    expect(state.error).toBeNull();
    expect(state.loginError).toBeNull();
  });
});

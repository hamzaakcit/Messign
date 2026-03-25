import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersistStorage, StateStorage, StorageValue } from 'zustand/middleware';
import type { User } from '@/types';
import { authAPI } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { registerAccessTokenReader, setAccessToken } from '@/lib/authToken';

const AUTH_PERSIST_NAME = 'messign-auth';

/** When true, auth snapshot lives in sessionStorage (cleared when the tab/window is closed). When false, localStorage survives restarts. */
let authUseSessionStorage = false;

const authStateStorage: StateStorage = {
  getItem: (name) => {
    try {
      const fromSession = sessionStorage.getItem(name);
      if (fromSession != null) {
        authUseSessionStorage = true;
        return fromSession;
      }
      const fromLocal = localStorage.getItem(name);
      if (fromLocal != null) {
        authUseSessionStorage = false;
        return fromLocal;
      }
    } catch (e) {
      console.warn('[auth] Storage read blocked or failed.', e);
    }
    return null;
  },
  setItem: (name, value) => {
    try {
      if (authUseSessionStorage) {
        localStorage.removeItem(name);
        sessionStorage.setItem(name, value);
      } else {
        sessionStorage.removeItem(name);
        localStorage.setItem(name, value);
      }
    } catch (e) {
      console.warn('[auth] Storage write blocked or failed.', e);
    }
  },
  removeItem: (name) => {
    try {
      sessionStorage.removeItem(name);
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

/** Shape of `partialize` output — must match `PersistStorage` generic. */
interface AuthPersistedSlice {
  user: User | null;
  accessToken: string | null;
  expiresAt: number | null;
  mustChangePassword: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

/**
 * zustand's createJSONStorage JSON.parse throws on corrupt data; persist then never sets
 * hasHydrated — App.tsx shows "Loading…" forever. Parse safely and drop bad snapshots.
 */
function createSafeAuthPersistStorage(): PersistStorage<AuthPersistedSlice> {
  return {
    getItem: (name) => {
      try {
        const raw = authStateStorage.getItem(name) as string | null;
        if (raw == null) return null;
        return JSON.parse(raw) as StorageValue<AuthPersistedSlice>;
      } catch {
        console.warn('[auth] Invalid persisted session JSON; clearing.');
        try {
          authStateStorage.removeItem(name);
        } catch {
          /* ignore */
        }
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        authStateStorage.setItem(name, JSON.stringify(value));
      } catch (e) {
        /** QuotaExceeded or blocked storage must not reject zustand's hydrate chain (would leave persist.hasHydrated false). */
        console.warn('[auth] Could not write persisted session (storage full or blocked).', e);
      }
    },
    removeItem: (name) => {
      authStateStorage.removeItem(name);
    },
  };
}

export interface LoginError {
  code?: string;
  message: string;
  remainingAttempts?: number;
  lockedUntil?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  expiresAt: number | null;
  mustChangePassword: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  loginError: LoginError | null;
  _hasHydrated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
  updateUser: (updates: Partial<User>) => void;
  setMustChangePassword: (value: boolean) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      expiresAt: null,
      mustChangePassword: false,
      isAuthenticated: false,
      isAdmin: false,
      isLoading: false,
      error: null,
      loginError: null,
      _hasHydrated: false,

      login: async (email: string, password: string, rememberMe = true) => {
        try {
          set({ isLoading: true, error: null, loginError: null });
          const res = await authAPI.login(email, password);
          const data = (res as { success?: boolean; data?: unknown; error?: LoginError }).data;
          const err = (res as { success?: boolean; error?: LoginError }).error;
          if (err) {
            set({
              loginError: err,
              error: err.message,
              isLoading: false,
            });
            return;
          }
          if (!data || typeof data !== 'object') {
            set({ error: 'Invalid response', isLoading: false });
            return;
          }
          const d = data as {
            accessToken: string;
            expiresIn: number;
            user: User;
            mustChangePassword: boolean;
          };
          const expiresAt = Date.now() + (d.expiresIn ?? 900) * 1000;
          authUseSessionStorage = !rememberMe;
          sessionStorage.removeItem(AUTH_PERSIST_NAME);
          localStorage.removeItem(AUTH_PERSIST_NAME);
          setAccessToken(d.accessToken);
          set({
            user: d.user,
            accessToken: d.accessToken,
            expiresAt,
            mustChangePassword: d.mustChangePassword ?? false,
            isAuthenticated: true,
            isAdmin: d.user?.role === 'admin',
            isLoading: false,
            error: null,
            loginError: null,
            _hasHydrated: true,
          });
          if (d.user?.id) connectSocket(d.user.id);
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Sign in failed. Try again.',
            isLoading: false,
          });
        }
      },

      logout: async () => {
        try {
          await authAPI.logout();
        } catch {
          // ignore
        }
        setAccessToken(null);
        disconnectSocket();
        set({
          user: null,
          accessToken: null,
          expiresAt: null,
          mustChangePassword: false,
          isAuthenticated: false,
          isAdmin: false,
        });
      },

      refreshAccessToken: async () => {
        try {
          const res = await authAPI.refresh();
          const data = (res as { success?: boolean; data?: { accessToken: string; expiresIn: number } }).data;
          if (!data) return false;
          const expiresAt = Date.now() + (data.expiresIn ?? 900) * 1000;
          setAccessToken(data.accessToken);
          set({
            accessToken: data.accessToken,
            expiresAt,
          });
          return true;
        } catch {
          return false;
        }
      },

      updateUser: (updates) => {
        const { user } = get();
        if (user) {
          const next = { ...user, ...updates };
          set({ user: next, isAdmin: next.role === 'admin' });
        }
      },

      setMustChangePassword: (value) => set({ mustChangePassword: value }),

      clearError: () => set({ error: null, loginError: null }),
    }),
    {
      name: AUTH_PERSIST_NAME,
      storage: createSafeAuthPersistStorage(),
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        expiresAt: s.expiresAt,
        mustChangePassword: s.mustChangePassword,
        isAuthenticated: s.isAuthenticated,
        isAdmin: s.isAdmin,
      }),
      merge: (persistedState, currentState) => {
        try {
          const persisted = persistedState as Partial<AuthState> | undefined;
          const current = currentState as AuthState;
          if (!persisted) return current;
          const merged = { ...current, ...persisted };
          if (current.isAuthenticated && current.accessToken) {
            merged.user = current.user;
            merged.accessToken = current.accessToken;
            merged.expiresAt = current.expiresAt;
            merged.isAuthenticated = true;
            merged.isAdmin = current.isAdmin;
            merged.mustChangePassword = current.mustChangePassword;
          }
          return merged;
        } catch (e) {
          console.warn('[auth] Rehydrate merge failed; using default state.', e);
          return currentState as AuthState;
        }
      },
      /**
       * Runs after rehydrate attempt (success or failure). On failure, zustand does NOT set
       * persist.hasHydrated() — App must use `_hasHydrated` here so the shell is not stuck on "Loading…".
       */
      onRehydrateStorage: () => (_state, error) => {
        useAuthStore.setState({ _hasHydrated: true });
        if (error) {
          console.warn('[auth] Persist rehydration failed; clearing session.', error);
          setAccessToken(null);
          useAuthStore.setState({
            user: null,
            accessToken: null,
            expiresAt: null,
            isAuthenticated: false,
            isAdmin: false,
            mustChangePassword: false,
          });
          return;
        }
        const { isAuthenticated, user, accessToken } = useAuthStore.getState();
        if ((isAuthenticated || accessToken) && !user) {
          setAccessToken(null);
          useAuthStore.setState({
            user: null,
            accessToken: null,
            expiresAt: null,
            isAuthenticated: false,
            isAdmin: false,
            mustChangePassword: false,
          });
        }
      },
    }
  )
);

/** Keep in-memory Bearer (used by api.ts fetch) in sync with persisted store — avoids stale rehydrate overwriting a fresh login token. */
registerAccessTokenReader(() => useAuthStore.getState().accessToken);
setAccessToken(useAuthStore.getState().accessToken);
useAuthStore.subscribe((state) => {
  setAccessToken(state.accessToken);
});
